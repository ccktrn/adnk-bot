import { Readable } from 'stream';
import { AudioPlayerStatus, VoiceConnection, createAudioPlayer, createAudioResource } from '@discordjs/voice';
import { logger } from './logger';
import { synthesizeVoicevox } from './voicevox-client';

const MAX_QUEUE_LENGTH = 10;
const MAX_BLOCK_LENGTH = 50;
const MIN_PREFERRED_BLOCK_LENGTH = 20;

type SpeechJob = { text: string; speakerId: number; speedScale: number; connection: VoiceConnection; isLastBlock: boolean };
type EnqueueJob = Omit<SpeechJob, 'isLastBlock'>;
type PreloadedAudio = { job: SpeechJob; audio: Promise<Buffer>; abortController: AbortController };

function findLastBreak(characters: string[], breakCharacters: Set<string>): number | undefined {
  for (let index = characters.length - 1; index >= MIN_PREFERRED_BLOCK_LENGTH - 1; index -= 1) {
    if (breakCharacters.has(characters[index])) return index + 1;
  }
  return undefined;
}

function splitLongSpeechText(text: string): string[] {
  const remaining = Array.from(text);
  const blocks: string[] = [];
  const sentenceBreaks = new Set(['。', '！', '？', '!', '?']);
  const softBreaks = new Set(['、', '，', ',', ' ']);

  while (remaining.length > 0) {
    if (remaining.length <= MAX_BLOCK_LENGTH) {
      const block = remaining.splice(0).join('').trim();
      if (block) blocks.push(block);
      break;
    }

    const candidate = remaining.slice(0, MAX_BLOCK_LENGTH);
    const breakAt = findLastBreak(candidate, sentenceBreaks)
      ?? findLastBreak(candidate, softBreaks)
      ?? MAX_BLOCK_LENGTH;
    const block = remaining.splice(0, breakAt).join('').trim();
    if (!block) continue;
    blocks.push(/[。！？!?、，,]$/.test(block) ? block : `${block}、`);
  }

  return blocks;
}

function splitSpeechText(text: string): string[] {
  return text
    .split(/\r\n|[\n\r]/)
    .flatMap(line => splitLongSpeechText(line.trim()));
}

class GuildYomiageQueue {
  private readonly player = createAudioPlayer();
  private readonly jobs: SpeechJob[] = [];
  private queuedMessageCount = 0;
  private speaking = false;
  private voiceChannelId: string | null = null;
  private generation = 0;
  private currentSynthesisAbortController: AbortController | null = null;
  private preloadedAudio: PreloadedAudio | null = null;

  constructor() {
    this.player.on(AudioPlayerStatus.Idle, () => { void this.playNext(); });
    this.player.on('error', error => {
      logger.error('[Yomiage] AudioPlayer error:', error);
    });
  }

  public enqueue(job: EnqueueJob) {
    if (this.queuedMessageCount >= MAX_QUEUE_LENGTH) return false;

    const blocks = splitSpeechText(job.text);
    if (blocks.length === 0) return false;

    this.jobs.push(...blocks.map((text, index) => ({
      ...job,
      text,
      isLastBlock: index === blocks.length - 1,
    })));
    this.queuedMessageCount += 1;
    this.voiceChannelId = job.connection.joinConfig.channelId;
    if (!this.speaking) void this.playNext();
    return true;
  }

  public stop() {
    this.generation += 1;
    this.jobs.length = 0;
    this.queuedMessageCount = 0;
    this.speaking = false;
    this.currentSynthesisAbortController?.abort();
    this.currentSynthesisAbortController = null;
    this.preloadedAudio?.abortController.abort();
    this.preloadedAudio = null;
    this.player.stop();
  }

  public isActive() { return this.speaking || this.jobs.length > 0; }
  public isForVoiceChannel(channelId: string) { return this.voiceChannelId === channelId; }

  private preload(job: SpeechJob) {
    if (this.preloadedAudio?.job === job) return;

    this.preloadedAudio?.abortController.abort();
    const abortController = new AbortController();
    const audio = synthesizeVoicevox(job.text, job.speakerId, job.speedScale, abortController.signal);
    audio.catch(() => undefined);
    this.preloadedAudio = { job, audio, abortController };
  }

  private async playNext() {
    const job = this.jobs.shift();
    if (!job) { this.speaking = false; return; }
    this.speaking = true;
    const generation = this.generation;
    const preloadedAudio = this.preloadedAudio?.job === job ? this.preloadedAudio : null;
    this.preloadedAudio = null;
    const abortController = preloadedAudio?.abortController ?? new AbortController();
    this.currentSynthesisAbortController = abortController;

    try {
      const audio = await (preloadedAudio?.audio ?? synthesizeVoicevox(job.text, job.speakerId, job.speedScale, abortController.signal));
      if (generation !== this.generation) return;
      job.connection.subscribe(this.player);
      this.player.play(createAudioResource(Readable.from(audio)));
      const nextJob = this.jobs[0];
      if (nextJob) this.preload(nextJob);
    } catch (error) {
      if (generation !== this.generation) return;
      logger.error('[Yomiage] Synthesis failed:', error);
      void this.playNext();
    } finally {
      if (generation === this.generation && job.isLastBlock) this.queuedMessageCount -= 1;
      if (this.currentSynthesisAbortController === abortController) {
        this.currentSynthesisAbortController = null;
      }
    }
  }
}

export class YomiageManager {
  private static queues = new Map<string, GuildYomiageQueue>();
  public static enqueue(guildId: string, job: EnqueueJob) {
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
