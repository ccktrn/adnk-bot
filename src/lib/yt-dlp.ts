import { ChildProcessWithoutNullStreams, execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger';
const execFilePromise = promisify(execFile);

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

export function getAudioStream(url: string): ChildProcessWithoutNullStreams {
  const ytDlpProcess = spawn('/usr/local/bin/yt-dlp', [
    '-f', 'bestaudio',
    '--rm-cache-dir', // 403対策
    '-o', '-', // 出力を標準出力に向ける
    '-q', // 進行状況などを非表示
    '--no-warnings',
    '--',
    url,
  ]);

  ytDlpProcess.on('error', (err) => {
    logger.error(`[yt-dlp spawn error]`, err);
  });

  let stderr = '';
  ytDlpProcess.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  ytDlpProcess.on('close', (code) => {
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

  return ytDlpProcess;
}
