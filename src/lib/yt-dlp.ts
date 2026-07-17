import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger';
const execPromise = promisify(exec);

export async function getVideoInfo(url: string) {
  // -j outputs JSON, -f bestaudio gets the best audio format
  // 追加: 403 Forbidden対策としてキャッシュをクリア
  const { stdout } = await execPromise(`yt-dlp -j -f "bestaudio" --rm-cache-dir "${url}"`);
  const info = JSON.parse(stdout);
  return {
    title: info.title || 'Unknown Title',
    url: url,
    streamUrl: info.url
  };
}

export function getAudioStream(url: string) {
  const ytDlpProcess = spawn('/usr/local/bin/yt-dlp', [
    '-f', 'bestaudio',
    '--rm-cache-dir', // 403対策
    '-o', '-', // 出力を標準出力に向ける
    '-q', // 進行状況などを非表示
    '--no-warnings',
    url
  ], {
    shell: true // shell経由で確実に見つける
  });

  ytDlpProcess.on('error', (err) => {
    logger.error(`[yt-dlp spawn error]`, err);
  });

  ytDlpProcess.stderr.on('data', (data) => {
    logger.error(`[yt-dlp stderr] ${data.toString()}`);
  });
  
  ytDlpProcess.on('close', (code) => {
    if (code !== 0) logger.warn(`[yt-dlp] Process exited with code ${code}`);
  });

  return ytDlpProcess.stdout;
}
