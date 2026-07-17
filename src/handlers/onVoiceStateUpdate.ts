import { VoiceState } from 'discord.js';
import { joinVoiceChannel, VoiceConnectionStatus, getVoiceConnection } from '@discordjs/voice';
import { ConfigRepository } from '../repositories/config-repository';
import { logger } from '../lib/logger';

const DELAY_SOUNDBOARD = 500; // Delay in milliseconds before sending the soundboard sound after joining the VC

const repo = new ConfigRepository();

export async function handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
  // ユーザーの移動ではない場合（ミュートなど）は無視
  if (oldState.channelId === newState.channelId) return;
  // Bot自身のイベントは無視
  if (newState.member?.user.bot) return;

  const guild = newState.guild;
  const config = repo.getConfig(guild.id);
  if (!config || !config.vc_id) return;

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

    try {
      let connection = getVoiceConnection(guild.id);
      
      // Botがまだ対象のVCにいない場合は入室する
      if (!connection || connection.joinConfig.channelId !== newState.channelId) {
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
        
        logger.log(`[Voice] Connecting to VC...`);
        connection.once(VoiceConnectionStatus.Ready, () => {
          logger.log(`[Voice] Connection Ready!`);
          // wait for a short delay to ensure the connection is stable before sending the sound
          setTimeout(() => {
            playSound();
          }, DELAY_SOUNDBOARD);
        });
        
      } else {
        // 既にVCにいる場合はそのまま鳴らす
        // wait for a short delay to ensure the connection is stable before sending the sound
        setTimeout(() => {
          playSound();
        }, DELAY_SOUNDBOARD);
      }

    } catch (error) {
      logger.error('Error in VoiceStateUpdate join logic:', error);
    }
  }
}
