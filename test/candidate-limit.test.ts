import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectCandidate } from '../src/jev-model.ts';

test('candidate tournament offers every action within limits and compares winners without executing', async () => {
  const criteria = Object.fromEntries(Array.from({length: 53}, (_, i) => [`CLICK:${i}`, `Button ${i}`]));
  const questions = { action: { type: 'choice', instructions: 'Click Market', criteria } };
  const batches: string[][] = [];
  const result = await selectCandidate(questions, 26, async subset => {
    const keys = Object.keys(subset.action.criteria);
    batches.push(keys);
    assert.ok(keys.length >= 2 && keys.length <= 26);
    const choice = keys.includes('CLICK:40') ? 'CLICK:40' : keys[0];
    return { answers: { action: { type: 'choice', choice, probabilities: {[choice]: 0.8} } } };
  });
  assert.equal(result.answers.action.choice, 'CLICK:40');
  assert.ok(batches[0].includes('CLICK:0'));
  assert.ok(batches[1].includes('CLICK:51'));
  assert.deepEqual(batches[2], ['CLICK:0', 'CLICK:40', 'CLICK:52']);
  await assert.rejects(selectCandidate(questions, 26, async () => ({
    answers: {action: {type: 'choice', choice: 'invented'}}
  })), /outside the candidate group/);
  await assert.rejects(selectCandidate(questions, 26, async () => ({usage: {truncated: true}})), /truncated/);
});
