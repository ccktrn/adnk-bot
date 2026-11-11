import { ChildProcessWithoutNullStreams } from 'child_process';
import { AudioPlayer, AudioPlayerStatus, createAudioPlayer, createAudioResource, getVoiceConnection, VoiceConnection, VoiceConnectionStatus } from '@discordjs/voice';
import { logger } from './logger';
import { GuildTextBasedChannel, VoiceBasedChannel } from 'discord.js';
import { getAudioStream } from './yt-dlp';

const VOICE_READY_TIMEOUT_MS = 30_000;

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
  private loopEnabled = false;
  private loopSongs: Song[] = [];
  private currentStreamProcess: ChildProcessWithoutNullStreams | null = null;
  private suppressNextIdle = false;
  private guildId: string;

  constructor(guildId: string) {
    this.guildId = guildId;
    this.player = createAudioPlayer();
    
    this.player.on(AudioPlayerStatus.Idle, () => {
      if (this.suppressNextIdle) {
        this.suppressNextIdle = false;
        return;
      }
      this.finishCurrentSong();
    });

    this.player.on('error', error => {
      logger.error(`[Music] AudioPlayer error:`, error);
      // @discordjs/voice はエラー後に Idle へ遷移するため、曲送りは Idle 側に集約する。
      this.stopCurrentStream();
    });
  }

  private finishCurrentSong() {
    this.songs.shift();

    if (this.songs.length === 0 && this.loopEnabled) {
      this.songs = this.loopSongs.map(song => ({ ...song }));
    }

    if (this.songs.length > 0) {
      void this.playNext();
      return;
    }

    this.isPlaying = false;
    if (this.textChannel) {
      this.textChannel.send('🎶 キューの再生がすべて終了しました。');
    }
  }

  private clearQueueAfterVoiceConnectionFailure() {
    if (this.isPlaying || this.songs.length === 0) return;

    logger.warn('[Music] Voice connection did not become ready; clearing the queued songs.');
    this.stop();
    if (this.textChannel) {
      this.textChannel.send('⚠️ ボイスチャンネルへ接続できなかったため、再生キューをクリアしました。');
    }
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

      // 以前の接続を保持せず、曲ごとに現在のVoiceConnectionを取得する。
      const activeConnection = getVoiceConnection(this.guildId);
      if (!activeConnection || activeConnection.state.status !== VoiceConnectionStatus.Ready) {
        this.connection = activeConnection || null;
        this.isPlaying = false;
        logger.warn('[Music] Voice connection is not ready; keeping the queue until it reconnects.');
        activeConnection?.once(VoiceConnectionStatus.Ready, () => {
          if (!this.isPlaying && this.songs.length > 0) {
            logger.log('[Music] Voice connection is ready; resuming the queue.');
            void this.playNext();
          }
        });
        setTimeout(() => {
          if (this.connection === (activeConnection ?? null)
            && (!activeConnection || activeConnection.state.status !== VoiceConnectionStatus.Ready)) {
            this.clearQueueAfterVoiceConnectionFailure();
          }
        }, VOICE_READY_TIMEOUT_MS);
        return;
      }
      this.connection = activeConnection;
      this.connection.subscribe(this.player);

      const streamProcess = getAudioStream(currentSong.url);
      this.currentStreamProcess = streamProcess;
      streamProcess.once('close', () => {
        if (this.currentStreamProcess === streamProcess) {
          this.currentStreamProcess = null;
        }
      });

      const resource = createAudioResource(streamProcess.stdout);
      this.player.play(resource);

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
    this.loopEnabled = false;
    this.loopSongs = [];
    this.stopCurrentStream();
    this.suppressNextIdle = true;
    if (!this.player.stop()) {
      this.suppressNextIdle = false;
    }
    this.isPlaying = false;
  }

  public skip() {
    this.stopCurrentStream();
    this.player.stop(); // StopするとIdleイベントが発火し、自動的に次の曲が再生される
  }

  private stopCurrentStream() {
    if (this.currentStreamProcess && !this.currentStreamProcess.killed) {
      this.currentStreamProcess.kill();
    }
    this.currentStreamProcess = null;
  }

  public toggleLoop(): 'enabled' | 'disabled' | 'empty' {
    if (this.loopEnabled) {
      this.loopEnabled = false;
      this.loopSongs = [];
      return 'disabled';
    }

    if (this.songs.length === 0) return 'empty';

    this.loopSongs = this.songs.map(song => ({ ...song }));
    this.loopEnabled = true;
    return 'enabled';
  }

  public isLoopEnabled() {
    return this.loopEnabled;
  }

  public hasActivePlayback(): boolean {
    return this.isPlaying || this.currentStreamProcess !== null || this.songs.length > 0;
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

  public static hasActivePlayback(): boolean {
    return Array.from(this.queues.values()).some(queue => queue.hasActivePlayback());
  }
}
