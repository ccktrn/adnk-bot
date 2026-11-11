import { execFile } from 'child_process';
import { promisify } from 'util';
import { MusicManager } from './music-player';
import { logger } from './logger';

const YT_DLP_PATH = '/usr/local/bin/yt-dlp';
const UPDATE_INTERVAL_MS = 12 * 60 * 60 * 1000;
const UPDATE_TIMEOUT_MS = 2 * 60 * 1000;
const execFilePromise = promisify(execFile);

let updateInProgress = false;
let updateTimer: ReturnType<typeof setInterval> | null = null;

function getStderr(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('stderr' in error)) return '';
  return String(error.stderr).trim();
}

export function isYtDlpUpdateInProgress(): boolean {
  return updateInProgress;
}

async function getYtDlpVersion(): Promise<string> {
  const { stdout } = await execFilePromise(YT_DLP_PATH, ['--version']);
  return stdout.trim();
}

export async function updateYtDlpIfIdle(): Promise<void> {
  if (updateInProgress) return;

  if (MusicManager.hasActivePlayback()) {
    logger.debug('[yt-dlp] Update deferred because music playback or a queue is active.');
    return;
  }

  // 新しい音楽操作を止めてから、もう一度キュー状態を確認する。
  updateInProgress = true;
  try {
    if (MusicManager.hasActivePlayback()) {
      logger.debug('[yt-dlp] Update deferred because music playback started.');
      return;
    }

    const previousVersion = await getYtDlpVersion();
    logger.log(`[yt-dlp] Checking for updates (current version: ${previousVersion}).`);

    const { stdout, stderr } = await execFilePromise(YT_DLP_PATH, ['-U'], {
      timeout: UPDATE_TIMEOUT_MS,
      maxBuffer: 256 * 1024,
    });
    const output = `${stdout}${stderr}`.trim();
    const currentVersion = await getYtDlpVersion();

    if (currentVersion === previousVersion) {
      logger.log(`[yt-dlp] Already up to date (${currentVersion}).`);
    } else {
      logger.log(`[yt-dlp] Updated ${previousVersion} -> ${currentVersion}.`);
    }
    if (output) logger.debug(`[yt-dlp update] ${output}`);
  } catch (error) {
    logger.error('[yt-dlp] Update check failed:', error);
    const stderr = getStderr(error);
    if (stderr) logger.error(`[yt-dlp update stderr] ${stderr}`);
  } finally {
    updateInProgress = false;
  }
}

export function startYtDlpUpdater(): void {
  if (updateTimer) return;

  void updateYtDlpIfIdle();
  updateTimer = setInterval(() => {
    void updateYtDlpIfIdle();
  }, UPDATE_INTERVAL_MS);
}
