import { Guild, VoiceState } from 'discord.js';
import { joinVoiceChannel, VoiceConnection, VoiceConnectionStatus, getVoiceConnection } from '@discordjs/voice';
import { ConfigRepository } from '../repositories/config-repository';
import { logger } from '../lib/logger';
import { isReadyForChannel, monitorVoiceConnection } from '../lib/voice-connection';

const DELAY_SOUNDBOARD = 500; // Delay in milliseconds before sending the soundboard sound after joining the VC

const repo = new ConfigRepository();

function isUsableConnection(connection: VoiceConnection | undefined, channelId: string): boolean {
  return connection?.joinConfig.channelId === channelId
    && connection.state.status !== VoiceConnectionStatus.Destroyed
    && connection.state.status !== VoiceConnectionStatus.Disconnected;
}

async function createConnection(guild: Guild, channelId: string): Promise<VoiceConnection | undefined> {
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (channel && channel.isVoiceBased()) {
    const botMember = guild.members.me || await guild.members.fetch(guild.client.user.id);
    const permissions = channel.permissionsFor(botMember);
    if (!permissions?.has('Connect')) {
      logger.error(`[Voice] FAILED: Bot lacks CONNECT permission for channel ${channel.name}`);
      return undefined;
    }
  }

  const connection = joinVoiceChannel({
    channelId,
    guildId: guild.id,
    adapterCreator: (methods) => guild.voiceAdapterCreator(methods),
    selfDeaf: false,
    selfMute: false,
  });
  monitorVoiceConnection(connection);
  logger.log(`[Voice] Connecting to VC...`);
  return connection;
}

async function recreateConnection(guild: Guild, channelId: string, reason: string): Promise<VoiceConnection | undefined> {
  const existingConnection = getVoiceConnection(guild.id);
  if (existingConnection) {
    logger.warn(`[Voice] Destroying connection for guild ${guild.id} before recovery: ${reason}`);
    existingConnection.destroy();
  }

  return createConnection(guild, channelId);
}

export async function handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
  // ユーザーの移動ではない場合（ミュートなど）は無視
  if (oldState.channelId === newState.channelId) return;
  const guild = newState.guild;
  const config = repo.getConfig(guild.id);
  if (!config || !config.vc_id) return;

  // 他のBotのイベントは無視する。ただし自身の切断は、接続状態の調査に必要なので記録する。
  if (newState.member?.user.bot) {
    if (newState.member.id === newState.client.user.id
      && oldState.channelId === config.vc_id
      && newState.channelId !== config.vc_id) {
      logger.warn(
        `[Voice] Bot was removed from target VC (new channel: ${newState.channelId ?? 'none'}).`,
      );

      // Discord removed or moved the Bot. The old VoiceConnection can otherwise
      // remain Ready locally and prevent later user joins from creating a new one.
      const oldChannel = oldState.channel;
      const hasHumanMembers = oldChannel?.members.some(member => !member.user.bot) ?? false;
      const staleConnection = getVoiceConnection(guild.id);
      staleConnection?.destroy();
      if (hasHumanMembers) {
        const recoveredConnection = await createConnection(guild, config.vc_id);
        if (!recoveredConnection) return;
        recoveredConnection.once(VoiceConnectionStatus.Ready, () => {
          logger.log(`[Voice] Recovered connection to target VC after Bot removal.`);
        });
      }
    }
    return;
  }

  // ===== LEAVE LOGIC (退出時の処理) =====
  if (oldState.channelId === config.vc_id) {
    try {
      const channel = await guild.channels.fetch(oldState.channelId).catch(() => null);
      if (channel && channel.isVoiceBased()) {
        // Bot以外のメンバーが残っているか確認
        const humanMembers = channel.members.filter(m => !m.user.bot);
        if (humanMembers.size === 0) {
          const connection = getVoiceConnection(guild.id);
          if (connection) {
            logger.log(`[Voice] Everyone left ${channel.name}. Destroying connection.`);
            connection.destroy();
          }
        }
      }
    } catch (error) {
      logger.error(`[Voice] Error during leave logic:`, error);
    }
  }

  // ===== JOIN LOGIC (入室時の処理) =====
  if (newState.channelId === config.vc_id) {
    const targetChannelId = config.vc_id;
    logger.log(`[Voice] User ${newState.member?.user.tag} joined target VC. Proceeding to play sound.`);
    
    let soundId = "2"; // Default Airhorn
    let sourceGuildId: string | undefined = undefined;

    if (config.soundboard_id) {
      const soundName = config.soundboard_id.toLowerCase();
      try {
        const defaultSounds: Record<string, string> = {
          "quack": "1",
          "airhorn": "2",
          "cricket": "3",
          "golf clap": "4",
          "sad horn": "5",
          "ba dum tss": "7"
        };

        if (defaultSounds[soundName]) {
          soundId = defaultSounds[soundName];
          sourceGuildId = undefined;
        } else {
          const sounds = await guild.soundboardSounds.fetch();
          const sound = sounds.find(s => s.name.toLowerCase() === soundName);
          if (sound) {
            soundId = sound.soundId;
            sourceGuildId = guild.id;
          } else {
            logger.warn(`[Voice] Soundboard sound "${soundName}" not found. Falling back to Airhorn.`);
          }
        }
      } catch (error) {
        logger.error(`[Voice] Failed to fetch soundboard sounds:`, error);
      }
    }

    const playSound = async (retryAfterRecovery = true) => {
      logger.log(`[Voice] Sending soundboard sound (ID: ${soundId})...`);
      try {
        // TODO: discord.jsがサウンドボード送信APIに正式対応したらanyを外す
        await (guild.client as any).rest.post(`/channels/${newState.channelId}/send-soundboard-sound`, {
          body: {
            sound_id: soundId,
            source_guild_id: sourceGuildId
          }
        });
        logger.log(`[Voice] Soundboard sound sent successfully!`);
      } catch (error) {
        logger.error(`[Voice] Failed to send soundboard sound:`, error);
        const errorCode = typeof error === 'object' && error !== null && 'code' in error
          ? error.code
          : undefined;
        if (retryAfterRecovery && errorCode === 50168) {
          logger.warn('[Voice] Discord reports that the Bot is absent from the VC; recreating the connection.');
          const recoveredConnection = await recreateConnection(
            guild,
            targetChannelId,
            'soundboard API returned 50168',
          );
          if (recoveredConnection) {
            recoveredConnection.once(VoiceConnectionStatus.Ready, () => {
              void playSound(false);
            });
          }
        }
      }
    };

    const scheduleSound = () => {
      setTimeout(() => {
        const activeConnection = getVoiceConnection(guild.id);
        const botVoiceChannelId = guild.members.me?.voice.channelId;
        if (!isReadyForChannel(activeConnection, targetChannelId)
          || botVoiceChannelId !== targetChannelId) {
          logger.warn(
            `[Voice] Skipping soundboard playback because the bot is not connected to the target VC (connection: ${activeConnection?.state.status ?? 'none'}, bot channel: ${botVoiceChannelId ?? 'none'}).`,
          );
          // @discordjs/voice can temporarily report Ready after Discord has already
          // removed the Bot. Discard that stale connection so the next join recreates it.
          void recreateConnection(
            guild,
            targetChannelId,
            'local voice state did not match the target channel',
          ).then(recoveredConnection => {
            recoveredConnection?.once(VoiceConnectionStatus.Ready, scheduleSound);
          });
          return;
        }
        void playSound();
      }, DELAY_SOUNDBOARD);
    };

    try {
      let connection = getVoiceConnection(guild.id);
      const botVoiceChannelId = guild.members.me?.voice.channelId;
      
      // A second user can join while the first connection is still Signalling or
      // Connecting. Do not destroy that healthy in-flight connection.
      if (connection && !isUsableConnection(connection, newState.channelId)) {
        logger.warn(`[Voice] Discarding stale connection for guild ${guild.id} (status: ${connection.state.status}, bot channel: ${botVoiceChannelId ?? 'unknown'}).`);
        connection.destroy();
        connection = undefined;
      }

      // Botがまだ対象のVCに接続済みでない場合は入室する
      if (!connection) {
        connection = await createConnection(guild, newState.channelId);
        if (!connection) return;
        connection.once(VoiceConnectionStatus.Ready, () => {
          logger.log(`[Voice] Connection Ready!`);
          // wait for a short delay to ensure the connection is stable before sending the sound
          scheduleSound();
        });
        
      } else if (connection.state.status === VoiceConnectionStatus.Ready) {
        // 既にVCにいる場合はそのまま鳴らす
        // wait for a short delay to ensure the connection is stable before sending the sound
        scheduleSound();
      }

    } catch (error) {
      logger.error('Error in VoiceStateUpdate join logic:', error);
    }
  }
}
