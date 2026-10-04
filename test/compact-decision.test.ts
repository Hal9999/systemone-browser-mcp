import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildActions, buildQuestions, buildDecisionState, parseDecision } from '../src/jev-model.ts';
import type { Observation } from '../src/jev-browser.ts';

test('compact classifier payload preserves action identity and control state without duplicate targets', () => {
  const observation: Observation = {
    url: 'https://www.subito.it/?utm_campaign=tracking', title: 'Subito', text: 'Market Tutta Italia',
    targets: [
      { id: '15', operation: 'CLICK', label: 'Market', value: '', role: 'button' },
      { id: '19', operation: 'TYPE_TEXT', label: 'Tutta Italia', value: 'Tutta Italia', role: 'combobox', expanded: 'false' },
      { id: '20', operation: 'CLICK', label: 'Learn more', value: '', role: 'a', href: 'https://example.org/help?utm_campaign=tracking#section' },
      { id: '21', operation: 'CLICK', label: 'Selected', value: '', role: 'radio', checked: 'true' },
    ], scrollUp: false, scrollDown: true,
  };
  const actions = buildActions(observation);
  const questions = buildQuestions(observation, 'Click Market', actions);
  assert.equal(typeof questions.action.instructions, 'string');
  assert.ok(Object.values(questions.action.criteria).every(value => typeof value === 'string'));
  assert.equal(questions.action.criteria['CLICK:15'], 'Click button: Market');
  assert.match(questions.action.criteria['TYPE_TEXT:19'], /current: Tutta Italia.*expanded: false/);
  assert.equal(questions.action.criteria['CLICK:20'], 'Click link: Learn more [to: example.org/help]');
  assert.ok(!('CLICK:21' in questions.action.criteria));
  const state = buildDecisionState(observation, []);
  assert.ok(!('targets' in state));
  assert.ok(!JSON.stringify({state, questions}).includes('utm_campaign'));
  const result = parseDecision({answers: {action: {type: 'choice', choice: 'CLICK:15'}}}, questions, observation, actions);
  assert.equal(result.target, observation.targets[0]);
  assert.throws(() => parseDecision({answers: {action: {type: 'choice', choice: 'CLICK:99'}}}, questions, observation, actions));
  assert.equal(observation.targets[2].href, 'https://example.org/help?utm_campaign=tracking#section');
});
