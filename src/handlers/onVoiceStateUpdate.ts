import { VoiceState } from 'discord.js';
import { joinVoiceChannel, VoiceConnectionStatus, getVoiceConnection } from '@discordjs/voice';
import { ConfigRepository } from '../repositories/config-repository';
import { logger } from '../lib/logger';
import { isReadyForChannel, monitorVoiceConnection } from '../lib/voice-connection';

const DELAY_SOUNDBOARD = 500; // Delay in milliseconds before sending the soundboard sound after joining the VC

const repo = new ConfigRepository();

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

    const playSound = async () => {
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
          activeConnection?.destroy();
          return;
        }
        void playSound();
      }, DELAY_SOUNDBOARD);
    };

    try {
      let connection = getVoiceConnection(guild.id);
      const botVoiceChannelId = guild.members.me?.voice.channelId;
      
      // 接続オブジェクトが残っていても、ReadyでなければDiscord上ではVCにいない。
      // 壊れた接続を再利用せず破棄して、新しい接続を作る。
      if (connection && (!isReadyForChannel(connection, newState.channelId)
        || botVoiceChannelId !== newState.channelId)) {
        logger.warn(`[Voice] Discarding stale connection for guild ${guild.id} (status: ${connection.state.status}, bot channel: ${botVoiceChannelId ?? 'unknown'}).`);
        connection.destroy();
        connection = undefined;
      }

      // Botがまだ対象のVCに接続済みでない場合は入室する
      if (!connection) {
        const channel = await guild.channels.fetch(newState.channelId).catch(() => null);
        if (channel && channel.isVoiceBased()) {
          const botMember = guild.members.me || await guild.members.fetch(newState.client.user.id);
          const permissions = channel.permissionsFor(botMember);
          if (!permissions?.has('Connect')) {
            logger.error(`[Voice] FAILED: Bot lacks CONNECT permission for channel ${channel.name}`);
            return;
          }
        }

        connection = joinVoiceChannel({
          channelId: newState.channelId,
          guildId: guild.id,
          adapterCreator: (methods) => guild.voiceAdapterCreator(methods),
          selfDeaf: false,
          selfMute: false,
        });
        monitorVoiceConnection(connection);
        
        logger.log(`[Voice] Connecting to VC...`);
        connection.once(VoiceConnectionStatus.Ready, () => {
          logger.log(`[Voice] Connection Ready!`);
          // wait for a short delay to ensure the connection is stable before sending the sound
          scheduleSound();
        });
        
      } else {
        // 既にVCにいる場合はそのまま鳴らす
        // wait for a short delay to ensure the connection is stable before sending the sound
        scheduleSound();
      }

    } catch (error) {
      logger.error('Error in VoiceStateUpdate join logic:', error);
    }
  }
}
