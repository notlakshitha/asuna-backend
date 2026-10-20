// Transparent fixture authoring. These are development examples, never a held-out benchmark.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const time = day => `2026-01-${String(day).padStart(2, '0')}T12:00:00.000Z`;
function observation(id, value, options = {}) {
  const { day = 1, type = 'user_statement', ...extra } = options;
  return { type: 'observation', observation: {
    id, slot: 'explanation_depth', value, scope: 'global', observedAt: time(day), validFrom: time(day),
    source: { type, ref: `synthetic:${id}`, text: `Synthetic declaration of explanation depth: ${value}` }, ...extra,
  } };
}
function query(day, acceptedValues, options = {}) {
  const { response, ...extra } = options;
  return { type: 'query', query: {
    slot: 'explanation_depth', scope: 'global', at: time(day), impact: 0.9, recurrence: 0.9, urgent: true, ...extra,
  }, acceptedValues, ...(response ? { clarification: {
    value: response, observedAt: time(day), validFrom: time(day), text: `Synthetic user answer: ${response}`,
  } } : {}) };
}
const cases = [
  { id: 'stable', category: 'stable', steps: [observation('s1', 'concise'), query(2, ['concise']), query(3, ['concise'])] },
  { id: 'temporary', category: 'temporary', steps: [observation('t1', 'concise'), observation('t2', 'detailed', { day: 2, scope: 'math', validTo: time(3) }), query(2, ['detailed'], { scope: 'math' }), query(3, ['concise'], { scope: 'math' })] },
  { id: 'scoped', category: 'scope', steps: [observation('c1', 'concise'), observation('c2', 'detailed', { scope: 'math' }), query(2, ['detailed'], { scope: 'math' }), query(2, ['concise'], { scope: 'coding' })] },
  { id: 'explicit-change', category: 'update', steps: [observation('u1', 'concise'), observation('u2', 'detailed', { day: 3, supersedes: ['u1'] }), query(4, ['detailed']), query(4, ['concise'], { at: time(2), knownAt: time(4) })] },
  { id: 'delayed-past', category: 'out-of-order', steps: [observation('p1', 'detailed', { day: 3 }), observation('p2', 'concise', { day: 4, validFrom: time(1), validTo: time(3) }), query(5, ['detailed']), query(5, ['concise'], { at: time(2), knownAt: time(5) })] },
  { id: 'urgent-conflict', category: 'conflict', steps: [observation('f1', 'concise'), observation('f2', 'detailed', { day: 2 }), query(3, ['detailed'], { response: 'detailed' }), query(4, ['detailed'])] },
  { id: 'browser-is-not-preference', category: 'inference', steps: [observation('b1', 'detailed', { type: 'browser_observation' }), query(2, [null], { impact: 0.1, recurrence: 0.1 })] },
  { id: 'low-impact-before-important', category: 'budget', steps: [observation('l1', 'concise', { type: 'browser_observation' }), query(2, ['concise'], { impact: 0.1, recurrence: 0.1, response: 'concise' }), observation('l2', 'detailed', { day: 3, slot: 'feedback_style', type: 'browser_observation' }), query(4, ['detailed'], { slot: 'feedback_style', response: 'detailed' }), query(5, ['detailed'], { slot: 'feedback_style' })] },
  { id: 'deferred-reflection', category: 'timing', steps: [observation('d1', 'concise', { type: 'browser_observation' }), query(2, [null], { urgent: false }), query(3, ['detailed'], { phase: 'reflection', response: 'detailed' }), query(4, ['detailed'])] },
  { id: 'declined-question', category: 'unanswered', steps: [observation('n1', 'concise'), observation('n2', 'detailed', { day: 2 }), query(3, [null]), query(4, [null])] },
  { id: 'missing-important', category: 'missing', steps: [query(1, ['concise'], { response: 'concise' }), query(2, ['concise'])] },
  { id: 'future-plan', category: 'future', steps: [observation('v1', 'concise', { validTo: time(5) }), observation('v2', 'detailed', { day: 2, validFrom: time(5) }), query(3, ['concise']), query(6, ['detailed'])] },
  // Counterexamples: hand-supplied priority estimates can be wrong, and deferral can hurt.
  { id: 'important-one-off', category: 'priority-failure', steps: [query(1, ['detailed'], { impact: 1, recurrence: 0.1, response: 'detailed' })] },
  { id: 'misclassified-urgency', category: 'timing-failure', steps: [query(1, ['concise'], { urgent: false, response: 'concise' })] },
  { id: 'incorrect-known-preference', category: 'unobserved-change', steps: [observation('k1', 'concise'), query(2, ['detailed'], { response: 'detailed' })] },
];
fs.writeFileSync(fileURLToPath(new URL('development.json', import.meta.url)), JSON.stringify(cases, null, 2) + '\n');
