import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Page } from 'playwright';
import { observe, StaleObservationError } from '../src/jev-browser.ts';

test('text execution tolerates unrelated updates but rejects changed fields and forms', async () => {
  const target = { id: '1', operation: 'TYPE_TEXT' as const, label: 'Search', value: '', role: 'input' };
  const node = { isConnected: true, getBoundingClientRect: () => ({ x: 0, y: 0, width: 20, height: 20 }), contains: () => true };
  const data = { url: 'https://test.invalid/', title: 'Test', text: 'Before', targets: [target], scrollUp: false, scrollDown: false };
  const original = { data, nodes: [node], signature: 'before', formState: 'unchanged', links: [null] };
  let current = { ...original, signature: 'after', data: { ...data, text: 'Updated banner' } };
  let filled = '';
  const state = { original, read: () => current };
  const handle = {
    evaluate: async (fn: Function) => fn(state),
    evaluateHandle: async (fn: Function, arg: unknown) => {
      const result = fn(state, arg);
      return { asElement: () => result && ({ fill: async (text: string) => { filled = text; } }), dispose: async () => {} };
    },
    dispose: async () => {},
  };
  const page = { waitForFunction: async () => ({ dispose: async () => {} }), evaluateHandle: async () => handle } as unknown as Page;
  const globals = globalThis as unknown as Record<string, unknown>;
  const oldDocument = globals.document;
  const oldLabel = globals.HTMLLabelElement;
  globals.HTMLLabelElement = class {};
  globals.document = { elementFromPoint: () => node };
  try {
    const snapshot = await observe(page);
    await assert.rejects(snapshot.assertFresh(), StaleObservationError);
    await snapshot.execute('TYPE_TEXT', target, 'microfono USB', new AbortController().signal);
    assert.equal(filled, 'microfono USB');
    current = { ...current, formState: 'changed' };
    await assert.rejects(snapshot.execute('TYPE_TEXT', target, 'other', new AbortController().signal), StaleObservationError);
    current = { ...current, formState: 'unchanged', data: { ...data, targets: [{ ...target, value: 'user edit' }] } };
    await assert.rejects(snapshot.execute('TYPE_TEXT', target, 'other', new AbortController().signal), StaleObservationError);
    assert.equal(filled, 'microfono USB');
    await snapshot.dispose();
  } finally {
    if (oldDocument === undefined) delete globals.document; else globals.document = oldDocument;
    if (oldLabel === undefined) delete globals.HTMLLabelElement; else globals.HTMLLabelElement = oldLabel;
  }
});
