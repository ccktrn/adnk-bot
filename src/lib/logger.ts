type LogLevel = 'LOG' | 'WARN' | 'ERROR' | 'DEBUG';

function formatMessage(level: LogLevel, ...args: any[]): string {
  const timestamp = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }); // タイムスタンプをわかりやすく
  
  const content = args.map(arg => {
    if (arg instanceof Error) {
      return arg.stack || arg.message;
    }
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2);
      } catch (e) {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');

  // カテゴリ・タイムスタンプの後に改行、内容の後に改行を入れて、1行空ける
  return `[${level}] ${timestamp}\n${content}\n`;
}

export const logger = {
  log: (...args: any[]) => console.log(formatMessage('LOG', ...args)),
  info: (...args: any[]) => console.log(formatMessage('LOG', ...args)),
  warn: (...args: any[]) => console.warn(formatMessage('WARN', ...args)),
  error: (...args: any[]) => console.error(formatMessage('ERROR', ...args)),
  debug: (...args: any[]) => console.debug(formatMessage('DEBUG', ...args)),
};
