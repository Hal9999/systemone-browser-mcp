import { AsyncLocalStorage } from 'node:async_hooks';
import { inspect } from 'node:util';
export const logContext = new AsyncLocalStorage<{ jobId: string }>();
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const colors: Record<LogLevel, number> = { debug: 36, info: 32, warn: 33, error: 31 };

export function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
  const ranks = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };
  const configured = process.env.LOG_LEVEL ?? 'info';
  const threshold = ranks[configured as keyof typeof ranks] ?? ranks.info;
  if (ranks[level] < threshold) return;
  const timestamp = new Date().toISOString();
  const details = { ...logContext.getStore(), ...fields };
  if (process.env.LOG_FORMAT !== 'pretty') {
    process.stderr.write(JSON.stringify({ timestamp, level, event, ...details }) + '\n');
    return;
  }
  const setting = process.env.LOG_COLOR ?? 'auto';
  const colored = setting === 'always' || (setting !== 'never' && process.env.NO_COLOR === undefined && !!process.stderr.isTTY);
  const paint = (code: number, value: string) => colored ? `\x1b[${code}m${value}\x1b[0m` : value;
  const heading = `${paint(90, timestamp)} ${paint(colors[level], level.toUpperCase().padEnd(5))} ${paint(1, event)}`;
  const entries = Object.entries(details);
  const small = entries.filter(([, value]) => value !== undefined && (value === null || typeof value !== 'object'));
  const large = entries.filter(([, value]) => value !== null && typeof value === 'object');
  const inline = small.map(([key, value]) => `${key}=${inspect(value, { colors: colored, breakLength: Infinity })}`).join(' ');
  let line = heading + (inline ? ' ' + inline : '');
  for (const [key, value] of large) {
    line += '\n' + paint(90, `  ${key}:`) + '\n' + inspect(value, {
      colors: colored, depth: null, compact: false, breakLength: 100,
      maxArrayLength: null, maxStringLength: null,
    }).split('\n').map(part => '    ' + part).join('\n');
  }
  process.stderr.write(line + '\n');
}
export function endpointAddress(value: string) {
  try { const url = new URL(value); return `${url.protocol}//${url.host}${url.pathname}`; } catch { return 'invalid_url'; }
}
