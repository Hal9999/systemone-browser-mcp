import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuestions, parseDecision, parseText } from '../src/jev-model.ts';
import type { Observation } from '../src/jev-browser.ts';
const observation: Observation = { url: 'https://example.org', title: 'Test', text: 'Result', targets: [{ id: '1', operation: 'CLICK', label: 'Result', value: '' }], scrollUp: false, scrollDown: false };
test('maps the verified SystemOne response format to offered target', () => {
  const result = parseDecision({ answers: { action: { type: 'choice', choice: 'CLICK:1', probabilities: { 'CLICK:1': 0.9 } } }, truncated: false }, buildQuestions(observation, 'Open result'), observation);
  assert.equal(result.target?.id, '1'); assert.equal(result.probability, 0.9);
});
test('rejects invented actions and truncated decisions', () => {
  assert.throws(() => parseDecision({ answers: { action: { type: 'choice', choice: 'CLICK:999' } } }, buildQuestions(observation, 'Open result'), observation));
  assert.throws(() => parseDecision({ truncated: true }, buildQuestions(observation, 'Open result'), observation));
});
test('text helper rejects null or extra fields', () => {
  assert.equal(parseText('{"text":"query"}'), 'query');
  assert.throws(() => parseText('{"text":null}'));
  assert.throws(() => parseText('{"text":"query","action":"submit"}'));
});
