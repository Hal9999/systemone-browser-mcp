import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Page } from 'playwright';
import { captureSystemOneImage } from '../src/screenshots.ts';

test('model screenshots are opt-in, in-memory PNGs independent of artifact recording', async () => {
  const old = process.env.SYSTEMONE_SEND_SCREENSHOT;
  const oldArtifacts = process.env.SCREENSHOTS_ENABLED;
  let calls = 0;
  const png = Buffer.from([137, 80, 78, 71]);
  const page = { screenshot: async (options: any) => {
    calls++;
    assert.equal(options.type, 'png');
    assert.equal(options.fullPage, false);
    assert.ok(!('path' in options));
    return png;
  } } as unknown as Page;
  try {
    delete process.env.SYSTEMONE_SEND_SCREENSHOT;
    assert.equal(await captureSystemOneImage(page), undefined);
    assert.equal(calls, 0);
    process.env.SYSTEMONE_SEND_SCREENSHOT = 'true';
    process.env.SCREENSHOTS_ENABLED = 'false';
    assert.equal(await captureSystemOneImage(page), png.toString('base64'));
    assert.equal(calls, 1);
    await assert.rejects(captureSystemOneImage({ screenshot: async () => { throw new Error('capture failed'); } } as unknown as Page), /capture failed/);
  } finally {
    if (old === undefined) delete process.env.SYSTEMONE_SEND_SCREENSHOT; else process.env.SYSTEMONE_SEND_SCREENSHOT = old;
    if (oldArtifacts === undefined) delete process.env.SCREENSHOTS_ENABLED; else process.env.SCREENSHOTS_ENABLED = oldArtifacts;
  }
});
