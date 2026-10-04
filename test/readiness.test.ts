import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Page } from 'playwright';
import { waitForPageReady } from '../src/jev-browser.ts';

test('readiness waits for load, busy controls and stability after a late change', async () => {
  const envNames = ['PAGE_READY_MIN_MS', 'PAGE_READY_STABLE_MS', 'PAGE_READY_TIMEOUT_MS'];
  const oldEnv = envNames.map(name => process.env[name]);
  const globals = globalThis as unknown as Record<string, unknown>;
  const names = ['document', 'location', 'innerHeight', 'innerWidth'];
  const oldGlobals = names.map(name => globals[name]);
  const started = performance.now();
  const element = {
    tagName: 'INPUT', value: '', disabled: false,
    get textContent() { return performance.now() - started < 300 ? 'Loading control' : 'Search'; },
    getAttribute: () => null,
    checkVisibility: () => true,
    getBoundingClientRect: () => ({ width: 20, height: 20, top: 0, bottom: 20, left: 0, right: 20 }),
  };
  let disposed = false;
  try {
    process.env.PAGE_READY_MIN_MS = '100';
    process.env.PAGE_READY_STABLE_MS = '150';
    process.env.PAGE_READY_TIMEOUT_MS = '2000';
    globals.document = {
      get readyState() { return performance.now() - started < 100 ? 'loading' : 'complete'; },
      body: { innerText: 'Search' }, title: 'Test',
      querySelectorAll: (selector: string) => selector.includes('aria-busy') ? (performance.now() - started < 200 ? [element] : []) : [element],
    };
    globals.location = { href: 'https://test.invalid/' };
    globals.innerHeight = globals.innerWidth = 100;
    const page = { waitForFunction: async (fn: Function, config: unknown) => {
      assert.equal(await fn(config), true);
      return { dispose: async () => { disposed = true; } };
    } } as unknown as Page;
    await waitForPageReady(page);
    assert.ok(performance.now() - started >= 450, 'must settle after the late control update');
    assert.equal(disposed, true);
    await assert.rejects(waitForPageReady(page, AbortSignal.abort()), { name: 'AbortError' });
  } finally {
    envNames.forEach((name, i) => { if (oldEnv[i] === undefined) delete process.env[name]; else process.env[name] = oldEnv[i]; });
    names.forEach((name, i) => { if (oldGlobals[i] === undefined) delete globals[name]; else globals[name] = oldGlobals[i]; });
  }
});
