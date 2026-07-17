import { AudioPlayer, AudioPlayerStatus, createAudioPlayer, createAudioResource, getVoiceConnection, VoiceConnection } from '@discordjs/voice';
import { logger } from './logger';
import { GuildTextBasedChannel, VoiceBasedChannel } from 'discord.js';
import { getAudioStream } from './yt-dlp';

export interface Song {
  title: string;
  url: string;
  streamUrl: string;
  requestedBy: string;
}

export class GuildQueue {
  public textChannel: GuildTextBasedChannel | null = null;
  public voiceChannel: VoiceBasedChannel | null = null;
  public connection: VoiceConnection | null = null;
  public player: AudioPlayer;
  public songs: Song[] = [];
  public isPlaying = false;
  private guildId: string;

  constructor(guildId: string) {
    this.guildId = guildId;
    this.player = createAudioPlayer();
    
    this.player.on(AudioPlayerStatus.Idle, () => {
      this.songs.shift(); // 終わった曲を削除
      if (this.songs.length > 0) {
        this.playNext();
      } else {
        this.isPlaying = false;
        if (this.textChannel) {
          this.textChannel.send('🎶 キューの再生がすべて終了しました。');
        }
      }
    });

    this.player.on('error', error => {
      logger.error(`[Music] AudioPlayer error:`, error);
      this.songs.shift();
      if (this.songs.length > 0) {
        this.playNext();
      } else {
        this.isPlaying = false;
      }
    });
  }

  public async playNext() {
    if (this.songs.length === 0) {
      this.isPlaying = false;
      return;
    }

    const currentSong = this.songs[0];
    try {
      this.isPlaying = true;
      logger.log(`[Music] Playing stream for ${currentSong.url}`);
      
      const stream = getAudioStream(currentSong.url);
      const resource = createAudioResource(stream);

      this.player.play(resource);
      
      // botのVoiceConnectionを取得して、Playerをサブスクライブさせる
      if (!this.connection) {
        this.connection = getVoiceConnection(this.guildId) || null;
      }
      if (this.connection) {
        this.connection.subscribe(this.player);
      }

      if (this.textChannel) {
        this.textChannel.send(`🎶 再生開始: **${currentSong.title}** (リクエスト: ${currentSong.requestedBy})`);
      }
    } catch (error) {
      logger.error(`[Music] Playback error for ${currentSong.url}:`, error);
      if (this.textChannel) {
        this.textChannel.send(`⚠️ 楽曲の再生中にエラーが発生しました: ${currentSong.title}`);
      }
      this.songs.shift();
      this.playNext();
    }
  }

  public stop() {
    this.songs = [];
    this.player.stop();
    this.isPlaying = false;
  }

  public skip() {
    this.player.stop(); // StopするとIdleイベントが発火し、自動的に次の曲が再生される
  }
}

export class MusicManager {
  private static queues = new Map<string, GuildQueue>();

  public static getQueue(guildId: string): GuildQueue {
    if (!this.queues.has(guildId)) {
      this.queues.set(guildId, new GuildQueue(guildId));
    }
    return this.queues.get(guildId)!;
  }

  public static deleteQueue(guildId: string) {
    const queue = this.queues.get(guildId);
    if (queue) {
      queue.stop();
      this.queues.delete(guildId);
    }
  }
}
