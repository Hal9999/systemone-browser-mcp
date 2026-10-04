import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { createScreenshots } from '../src/screenshots.ts';
test('screenshots are opt-in; failures do not abort and successful files are listed', async () => {
  const oldEnabled = process.env.SCREENSHOTS_ENABLED;
  const oldDirectory = process.env.ARTIFACTS_DIR;
  const oldTimezone = process.env.ARTIFACTS_TIMEZONE;
  const root = await mkdtemp(join(tmpdir(), 'screenshots-'));
  try {
    process.env.ARTIFACTS_DIR = root;
    process.env.ARTIFACTS_TIMEZONE = 'Europe/Rome';
    process.env.SCREENSHOTS_ENABLED = 'false';
    let calls = 0;
    const page = { isClosed: () => false, screenshot: async () => { calls++; } } as unknown as Page;
    await createScreenshots('disabled').capture(page, 'initial');
    assert.equal(calls, 0);
    process.env.SCREENSHOTS_ENABLED = 'true';
    const capture = createScreenshots('job', new Date('2026-10-04T17:11:51Z'));
    await capture.capture(page, 'initial');
    assert.deepEqual(capture.files, [join('2026_10_04_19_11_51_job', '001-initial.png')]);
    await capture.capture({ isClosed: () => false, screenshot: async () => { throw new Error('failure'); } } as unknown as Page, 'final');
    assert.equal(capture.files.length, 1);
  } finally {
    if (oldEnabled === undefined) delete process.env.SCREENSHOTS_ENABLED; else process.env.SCREENSHOTS_ENABLED = oldEnabled;
    if (oldDirectory === undefined) delete process.env.ARTIFACTS_DIR; else process.env.ARTIFACTS_DIR = oldDirectory;
    if (oldTimezone === undefined) delete process.env.ARTIFACTS_TIMEZONE; else process.env.ARTIFACTS_TIMEZONE = oldTimezone;
    await rm(root, { recursive: true, force: true });
  }
});
