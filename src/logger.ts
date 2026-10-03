import { AsyncLocalStorage } from 'node:async_hooks';
export const logContext = new AsyncLocalStorage<{ jobId: string }>();
export function log(level: 'debug' | 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown> = {}) {
  const ranks = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };
  const configured = process.env.LOG_LEVEL ?? 'info';
  const threshold = ranks[configured as keyof typeof ranks] ?? ranks.info;
  if (ranks[level] < threshold) return;
  process.stderr.write(JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...logContext.getStore(), ...fields }) + '\n');
}
export function endpointAddress(value: string) {
  try { const url = new URL(value); return `${url.protocol}//${url.host}${url.pathname}`; } catch { return 'invalid_url'; }
}
