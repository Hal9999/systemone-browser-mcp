import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJevPolicy } from '../src/jev-model.ts';
import type { Observation } from '../src/jev-browser.ts';

test('external endpoints retain configuration and SystemOne payload logs are debug-only', async () => {
  const savedEnv = { ...process.env };
  const savedFetch = globalThis.fetch;
  const savedWrite = process.stderr.write;
  const logs: string[] = [];
  const calls: { url: string; body: any; headers: any }[] = [];
  const observation: Observation = { url: 'https://example.org', title: 'Test', text: 'Search',
    targets: [{ id: '1', operation: 'TYPE_TEXT', label: 'Search', value: '' }],
    scrollUp: false, scrollDown: false };
  let status = 200;
  try {
    Object.assign(process.env, { SYSTEMONE_URL: 'http://decision.test/v1/systemone',
      SYSTEMONE_API_KEY: 'decision-secret', SYSTEMONE_MODEL: 'external-model',
      OPENAI_BASE_URL: 'http://text.test/v1', OPENAI_API_KEY: 'text-secret',
      TEXT_MODEL: 'text-model', LOG_LEVEL: 'debug' });
    delete process.env.SYSTEMONE_MAX_LEN;
    delete process.env.SYSTEMONE_HEAD_MAX_LEN;
    process.stderr.write = ((chunk: any) => { logs.push(String(chunk)); return true; }) as typeof process.stderr.write;
    globalThis.fetch = (async (url: any, init: any) => {
      calls.push({ url: String(url), body: JSON.parse(init.body), headers: init.headers });
      return new Response(JSON.stringify(String(url).endsWith('/systemone')
        ? status === 200 ? { answers: { action: { type: 'choice', choice: 'TYPE_TEXT:1' } } }
          : { detail: { message: 'Context exceeded' } }
        : { choices: [{ message: { content: '{"text":"microfono usb"}' } }] }),
        { status, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;
    const policy = createJevPolicy();
    await policy.choose(observation, 'Search microfono usb', [], new AbortController().signal);
    const debug = logs.map(line => JSON.parse(line)).filter(line => ['systemone.request', 'systemone.response'].includes(line.event));
    assert.equal(debug.length, 2);
    assert.equal(debug[0].requestId, debug[1].requestId);
    assert.equal(debug[0].body.model, 'external-model');
    assert.equal(debug[1].status, 200);
    assert.equal(calls[0].headers.Authorization, 'Bearer decision-secret');
    assert.ok(!('max_len' in calls[0].body));
    assert.ok(!logs.join('').includes('decision-secret'));
    logs.length = 0;
    assert.equal(await policy.text(observation, 'Search microfono usb', observation.targets[0], [], new AbortController().signal), 'microfono usb');
    assert.equal(calls.at(-1)?.url, 'http://text.test/v1/chat/completions');
    assert.equal(calls.at(-1)?.headers.Authorization, 'Bearer text-secret');
    assert.ok(!logs.join('').includes('systemone.request'));
    logs.length = 0;
    status = 422;
    await assert.rejects(policy.choose(observation, 'Search', [], new AbortController().signal), /Context exceeded/);
    assert.ok(logs.map(line => JSON.parse(line)).some(line => line.event === 'systemone.response' && line.status === 422));
    logs.length = 0;
    status = 200;
    process.env.LOG_LEVEL = 'info';
    await policy.choose(observation, 'Search', [], new AbortController().signal);
    assert.ok(!logs.join('').includes('systemone.request'));
    assert.ok(!logs.join('').includes('systemone.response'));
  } finally {
    globalThis.fetch = savedFetch;
    process.stderr.write = savedWrite;
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
  }
});
