import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Page } from 'playwright';
import { log } from './logger.ts';

// Independent of artifact recording: no file is created for model input.
export async function captureSystemOneImage(page: Page): Promise<string | undefined> {
  if (process.env.SYSTEMONE_SEND_SCREENSHOT !== 'true') return undefined;
  const png = await page.screenshot({ type: 'png', fullPage: false, timeout: 5000, animations: 'disabled' });
  log('debug', 'systemone.screenshot_captured', { format: 'png', bytes: png.length });
  return png.toString('base64');
}

export function createScreenshots(jobId: string, startedAt = new Date()) {
  const enabled = process.env.SCREENSHOTS_ENABLED === 'true';
  const timeZone = process.env.ARTIFACTS_TIMEZONE ?? 'UTC';
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(startedAt);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const folder = `${values.year}_${values.month}_${values.day}_${values.hour}_${values.minute}_${values.second}_${jobId}`;
  const directory = join(resolve(process.env.ARTIFACTS_DIR ?? '/app/artifacts'), folder);
  const files: string[] = [];
  let sequence = 0;
  return {
    files,
    async capture(page: Page | undefined, label: string) {
      if (!enabled || !page || page.isClosed()) return;
      const filename = `${String(++sequence).padStart(3, '0')}-${label.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
      let stage = 'directory';
      try {
        await mkdir(directory, { recursive: true });
        stage = 'capture';
        await page.screenshot({ path: join(directory, filename), fullPage: false, timeout: 5000, animations: 'disabled' });
        files.push(join(folder, filename));
        log('info', 'screenshot.saved', { file: join(folder, filename) });
      } catch (error) {
        const fsError = error as NodeJS.ErrnoException;
        const code = typeof fsError?.code === 'string' ? fsError.code : undefined;
        log('warn', 'screenshot.failed', {
          file: join(folder, filename), directory, stage, code,
          syscall: fsError?.syscall,
          errorType: error instanceof Error ? error.name : 'UnknownError',
          hint: code === 'EACCES' || code === 'EPERM'
            ? 'Artifacts directory is not writable by container user node. Check bind mount and host permissions.'
            : stage === 'capture' ? 'Check page state and screenshot timeout.' : 'Check artifacts directory and bind mount.'
        });
      }
    }
  };
}
