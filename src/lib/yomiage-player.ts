import { Readable } from 'stream';
import { AudioPlayerStatus, VoiceConnection, createAudioPlayer, createAudioResource } from '@discordjs/voice';
import { logger } from './logger';
import { synthesizeVoicevox } from './voicevox-client';

const MAX_QUEUE_LENGTH = 10;

type SpeechJob = { text: string; speakerId: number; speedScale: number; connection: VoiceConnection };

class GuildYomiageQueue {
  private readonly player = createAudioPlayer();
  private readonly jobs: SpeechJob[] = [];
  private speaking = false;
  private voiceChannelId: string | null = null;
  private generation = 0;

  constructor() {
    this.player.on(AudioPlayerStatus.Idle, () => { void this.playNext(); });
    this.player.on('error', error => {
      logger.error('[Yomiage] AudioPlayer error:', error);
    });
  }

  public enqueue(job: SpeechJob) {
    if (this.jobs.length >= MAX_QUEUE_LENGTH) return false;
    this.jobs.push(job);
    this.voiceChannelId = job.connection.joinConfig.channelId;
    if (!this.speaking) void this.playNext();
    return true;
  }

  public stop() {
    this.generation += 1;
    this.jobs.length = 0;
    this.speaking = false;
    this.player.stop();
  }

  public isActive() { return this.speaking || this.jobs.length > 0; }
  public isForVoiceChannel(channelId: string) { return this.voiceChannelId === channelId; }

  private async playNext() {
    const job = this.jobs.shift();
    if (!job) { this.speaking = false; return; }
    this.speaking = true;
    const generation = this.generation;
    try {
      const audio = await synthesizeVoicevox(job.text, job.speakerId, job.speedScale);
      if (generation !== this.generation) return;
      job.connection.subscribe(this.player);
      this.player.play(createAudioResource(Readable.from(audio)));
    } catch (error) {
      if (generation !== this.generation) return;
      logger.error('[Yomiage] Synthesis failed:', error);
      void this.playNext();
    }
  }
}

export class YomiageManager {
  private static queues = new Map<string, GuildYomiageQueue>();
  public static enqueue(guildId: string, job: SpeechJob) {
    if (!this.queues.has(guildId)) this.queues.set(guildId, new GuildYomiageQueue());
    return this.queues.get(guildId)!.enqueue(job);
  }
  public static stop(guildId: string) { this.queues.get(guildId)?.stop(); }
  public static hasActive(guildId: string) { return this.queues.get(guildId)?.isActive() ?? false; }
  public static stopForVoiceChannel(guildId: string, channelId: string) {
    const queue = this.queues.get(guildId);
    if (queue?.isForVoiceChannel(channelId)) queue.stop();
  }
}
