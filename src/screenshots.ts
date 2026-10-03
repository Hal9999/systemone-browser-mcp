import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Page } from 'playwright';
import { log } from './logger.ts';

export function createScreenshots(jobId: string) {
  const enabled = process.env.SCREENSHOTS_ENABLED === 'true';
  const directory = join(resolve(process.env.ARTIFACTS_DIR ?? '/app/artifacts'), jobId);
  const files: string[] = [];
  let sequence = 0;
  return {
    files,
    async capture(page: Page | undefined, label: string) {
      if (!enabled || !page || page.isClosed()) return;
      const filename = `${String(++sequence).padStart(3, '0')}-${label.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
      try {
        await mkdir(directory, { recursive: true });
        await page.screenshot({ path: join(directory, filename), fullPage: false, timeout: 5000, animations: 'disabled' });
        files.push(join(jobId, filename));
        log('info', 'screenshot.saved', { file: join(jobId, filename) });
      } catch (error) {
        log('warn', 'screenshot.failed', { file: join(jobId, filename), errorType: error instanceof Error ? error.name : 'UnknownError' });
      }
    }
  };
}
