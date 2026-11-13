import { execFile, spawn } from 'child_process';
import { Readable } from 'stream';
import { promisify } from 'util';
import { logger } from './logger';
const execFilePromise = promisify(execFile);

const AUDIO_NORMALIZATION_FILTER = 'loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=-1.0dB';

export interface AudioStream {
  output: Readable;
  stop: () => void;
}

export async function getVideoInfo(url: string) {
  // -j outputs JSON, -f bestaudio gets the best audio format
  // 追加: 403 Forbidden対策としてキャッシュをクリア
  const { stdout } = await execFilePromise('/usr/local/bin/yt-dlp', [
    '-j',
    '-f', 'bestaudio',
    '--rm-cache-dir',
    '--',
    url,
  ]);
  const info = JSON.parse(stdout);
  return {
    title: info.title || 'Unknown Title',
    url: url,
    streamUrl: info.url
  };
}

export function getAudioStream(url: string): AudioStream {
  const ytDlpProcess = spawn('/usr/local/bin/yt-dlp', [
    '-f', 'bestaudio',
    '--rm-cache-dir', // 403対策
    '-o', '-', // 出力を標準出力に向ける
    '-q', // 進行状況などを非表示
    '--no-warnings',
    '--',
    url,
  ]);

  const ffmpegProcess = spawn('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'warning',
    '-i', 'pipe:0',
    '-map', '0:a:0',
    '-vn',
    '-af', AUDIO_NORMALIZATION_FILTER,
    '-ar', '48000',
    '-ac', '2',
    '-f', 's16le',
    'pipe:1',
  ]);
  let intentionallyStopped = false;

  ytDlpProcess.stdout.pipe(ffmpegProcess.stdin);

  const stopYtDlpProcess = () => {
    ytDlpProcess.stdout.unpipe(ffmpegProcess.stdin);
    if (!ytDlpProcess.killed) ytDlpProcess.kill();
  };

  ytDlpProcess.on('error', (err) => {
    logger.error(`[yt-dlp spawn error]`, err);
  });

  ffmpegProcess.on('error', (err) => {
    logger.error(`[ffmpeg spawn error]`, err);
  });

  ffmpegProcess.stdin.on('error', (err) => {
    if (!intentionallyStopped) {
      logger.warn(`[ffmpeg stdin error]`, err);
    }
  });

  let stderr = '';
  ytDlpProcess.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  ytDlpProcess.on('close', (code) => {
    if (intentionallyStopped) return;

    const output = stderr.trim();
    const outputPipeClosed = /unable to write data: \[Errno 32\] Broken pipe/.test(output);

    if (outputPipeClosed) {
      // stop/skip により Discord 側が音声ストリームを閉じた場合の通常終了。
      logger.debug('[yt-dlp] Audio output pipe closed.');
      return;
    }

    if (output) logger.error(`[yt-dlp stderr] ${output}`);
    if (code !== null && code !== 0) logger.warn(`[yt-dlp] Process exited with code ${code}`);
  });

  let ffmpegStderr = '';
  ffmpegProcess.stderr.on('data', (data) => {
    ffmpegStderr += data.toString();
  });

  ffmpegProcess.on('close', (code) => {
    if (intentionallyStopped) return;

    const output = ffmpegStderr.trim();
    if (code !== 0) {
      if (output) logger.error(`[ffmpeg stderr] ${output}`);
      logger.warn(`[ffmpeg] Process exited with ${code === null ? 'a signal' : `code ${code}`}`);
      intentionallyStopped = true;
      stopYtDlpProcess();
    } else if (output) {
      logger.debug(`[ffmpeg] ${output}`);
    }
  });

  return {
    output: ffmpegProcess.stdout,
    stop: () => {
      intentionallyStopped = true;
      stopYtDlpProcess();
      if (!ffmpegProcess.killed) ffmpegProcess.kill();
    },
  };
}
