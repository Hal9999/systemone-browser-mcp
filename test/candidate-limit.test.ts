import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectCandidate } from '../src/jev-model.ts';

const questions = (count: number) => ({ action: { type: 'choice', instructions: 'Click Market',
  criteria: Object.fromEntries(Array.from({length: count}, (_, i) => [`CLICK:${i}`, `Button ${i}`])) } });
test('each round carries exactly the previous top eight and final round includes alternatives', async () => {
  const batches: string[][] = [];
  const result = await selectCandidate(questions(53), 26, async subset => {
    const keys = Object.keys(subset.action.criteria);
    batches.push(keys);
    const probabilities = Object.fromEntries(keys.map(key => [key, (Number(key.split(':')[1]) + 1) / 100]));
    return { answers: { action: { type: 'choice', choice: keys.at(-1), probabilities } } };
  });
  assert.deepEqual(batches.map(keys => keys.length), [26, 26, 17]);
  assert.deepEqual(batches[1].slice(0, 8), Array.from({length:8}, (_, i) => `CLICK:${25-i}`));
  assert.deepEqual(batches[2].slice(0, 8), Array.from({length:8}, (_, i) => `CLICK:${43-i}`));
  assert.equal(new Set(batches.flat()).size, 53);
  assert.equal(result.answers.action.choice, 'CLICK:52');
});
test('small sets use one request and a one-candidate remainder retains eight alternatives', async () => {
  for (const [count, expected] of [[10, [10]], [27, [26, 9]]] as const) {
    const sizes: number[] = [];
    await selectCandidate(questions(count), 26, async subset => {
      const keys = Object.keys(subset.action.criteria); sizes.push(keys.length);
      return {answers: {action: {type:'choice', choice:keys[0], probabilities:Object.fromEntries(keys.map(key => [key, 1/keys.length]))}}};
    });
    assert.deepEqual(sizes, expected);
  }
});
test('rejects invalid group decisions, truncation and missing ranking probabilities', async () => {
  await assert.rejects(selectCandidate(questions(30), 26, async () => ({
    answers: {action: {type:'choice', choice:'invented'}}
  })), /outside the candidate group/);
  await assert.rejects(selectCandidate(questions(30), 26, async () => ({usage:{truncated:true}})), /truncated/);
  await assert.rejects(selectCandidate(questions(30), 26, async () => ({
    answers:{action:{type:'choice',choice:'CLICK:0'}}
  })), /probabilities/);
});
