import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MemoryLedger } from '../src/research/memory.js';
import { createRun, decide, clarify } from '../src/research/policy.js';
import { evaluate } from '../research/evaluate.js';

const time = day => `2026-01-${String(day).padStart(2, '0')}T12:00:00.000Z`;
const fact = (id, value, extra = {}) => ({ id, value, slot: 'depth', observedAt: time(1), source: { type: 'user_statement', ref: id, text: `I prefer ${value}` }, ...extra });
const query = (extra = {}) => ({ slot: 'depth', at: time(3), impact: 0.9, recurrence: 0.9, urgent: true, ...extra });
function setup(policy = 'impact', budget = 1) {
  const ledger = new MemoryLedger();
  ledger.append('alice', fact('a', 'short'));
  ledger.append('alice', fact('b', 'long', { observedAt: time(2) }));
  const run = createRun(ledger, { participantId: 'alice', policy, budget });
  return { ledger, run };
}

test('memory is isolated by participant, including prototype-like identifiers', () => {
  const ledger = new MemoryLedger();
  ledger.append('alice', fact('a', 'short'));
  assert.equal(ledger.resolve('bob', query()).state, 'missing');
  assert.deepEqual(ledger.observations('__proto__'), []);
  ledger.append('__proto__', fact('a', 'long'));
  assert.equal(ledger.resolve('__proto__', query()).value, 'long');
  assert.equal(ledger.resolve('alice', query()).value, 'short');
});

test('late disclosures do not replace a current state with a historical fact', () => {
  const ledger = new MemoryLedger();
  ledger.append('alice', fact('now', 'long', { observedAt: time(3) }));
  ledger.append('alice', fact('past', 'short', { observedAt: time(4), validFrom: time(1), validTo: time(3) }));
  assert.equal(ledger.resolve('alice', query({ at: time(5) })).value, 'long');
  assert.equal(ledger.resolve('alice', query({ at: time(2), knownAt: time(5) })).value, 'short');
  assert.equal(ledger.resolve('alice', query({ at: time(2), knownAt: time(2) })).state, 'missing');
});

test('temporary scoped preferences expire back to the global default', () => {
  const ledger = new MemoryLedger();
  ledger.append('alice', fact('global', 'short'));
  ledger.append('alice', fact('math', 'long', { scope: 'math', validTo: time(3) }));
  assert.equal(ledger.resolve('alice', query({ at: time(2), scope: 'math' })).value, 'long');
  assert.equal(ledger.resolve('alice', query({ at: time(3), scope: 'math' })).value, 'short');
  assert.equal(ledger.resolve('alice', query({ scope: 'coding' })).value, 'short');
});

test('a scoped tentative observation cannot silently override an explicit default', () => {
  const ledger = new MemoryLedger();
  ledger.append('alice', fact('global', 'short'));
  ledger.append('alice', fact('browser', 'long', { scope: 'math', source: { type: 'browser_observation', ref: 'visit:1', text: 'Viewed a long tutorial' } }));
  // Uncertainty must be visible rather than asserting the observed browsing as a preference.
  assert.equal(ledger.resolve('alice', query({ scope: 'math' })).state, 'uncertain');
  assert.equal(ledger.resolve('alice', query({ scope: 'coding' })).value, 'short');
});

test('contradictions are retained; explicit corrections preserve historical answers', () => {
  const { ledger } = setup();
  assert.equal(ledger.resolve('alice', query()).state, 'conflict');
  ledger.append('alice', fact('correction', 'long', { observedAt: time(3), supersedes: ['a', 'b'] }));
  assert.equal(ledger.resolve('alice', query()).value, 'long');
  assert.equal(ledger.resolve('alice', query({ at: time(1), knownAt: time(3) })).value, 'short');
  assert.equal(ledger.observations('alice').length, 3);
});

test('future plans do not become current facts before their validity begins', () => {
  const ledger = new MemoryLedger();
  ledger.append('alice', fact('a', 'short', { validTo: time(5) }));
  ledger.append('alice', fact('b', 'long', { observedAt: time(2), validFrom: time(5) }));
  assert.equal(ledger.resolve('alice', query()).value, 'short');
  assert.equal(ledger.resolve('alice', query({ at: time(6) })).value, 'long');
});

test('browser evidence stays tentative even if the caller supplies asserted status', () => {
  const ledger = new MemoryLedger();
  ledger.append('alice', fact('b', 'long', { status: 'asserted', source: { type: 'browser_observation', ref: 'b', text: 'Visited long tutorials' } }));
  const memory = ledger.resolve('alice', query());
  assert.equal(memory.state, 'uncertain');
  assert.equal(memory.value, null);
});

test('uncertain user statements can be stored tentatively without inventing a confirmed preference', () => {
  const ledger = new MemoryLedger();
  ledger.append('alice', fact('maybe', 'long', { status: 'tentative' }));
  assert.equal(ledger.resolve('alice', query()).state, 'uncertain');
  assert.throws(() => ledger.append('alice', fact('invalid', 'long', { status: 'verified-by-magic' })));
});

test('malformed times, reversed validity, duplicate IDs and invalid supersession are rejected', () => {
  const ledger = new MemoryLedger();
  assert.throws(() => ledger.append('alice', fact('a', 'short', { observedAt: 'yesterday' })));
  assert.throws(() => ledger.append('alice', fact('a', 'short', { validTo: time(1) })));
  ledger.append('alice', fact('a', 'short'));
  assert.throws(() => ledger.append('alice', fact('a', 'long')));
  assert.throws(() => ledger.append('alice', fact('b', 'long', { supersedes: ['unknown'] })));
  assert.throws(() => ledger.append('bob', fact('b', 'long', { supersedes: ['a'] })));
  assert.throws(() => ledger.append('alice', fact('b', 'long', { slot: 'other', supersedes: ['a'] })));
});

test('issued questions consume budget; repeated pending questions do not', () => {
  const { ledger, run } = setup();
  const first = decide(ledger, run.id, query());
  assert.equal(first.action, 'clarify');
  assert.equal(decide(ledger, run.id, query()).action, 'defer');
  assert.equal(decide(ledger, run.id, query({ slot: 'other' })).action, 'abstain');
  assert.equal(ledger.data.runs[run.id].questionsAsked, 1);
});

test('nonurgent questions defer without spending budget and can be asked during reflection', () => {
  const { ledger, run } = setup();
  assert.equal(decide(ledger, run.id, query({ urgent: false })).action, 'defer');
  assert.equal(ledger.data.runs[run.id].questionsAsked, 0);
  assert.equal(decide(ledger, run.id, query({ urgent: false, phase: 'reflection' })).action, 'clarify');
});

test('clarification resolves the scoped conflict and is not requested again', () => {
  const { ledger, run } = setup();
  const decision = decide(ledger, run.id, query());
  clarify(ledger, run.id, decision.id, { value: 'long', text: 'Long explanations from now on', observedAt: time(3), validFrom: time(3) });
  assert.equal(decide(ledger, run.id, query({ at: time(4) })).action, 'use');
  assert.equal(ledger.resolve('alice', query()).value, 'long');
  assert.throws(() => clarify(ledger, run.id, decision.id, {}));
});

test('unknown timing in a clarification is not silently treated as permanent', () => {
  const { ledger, run } = setup();
  const decision = decide(ledger, run.id, query());
  assert.throws(() => clarify(ledger, run.id, decision.id, { value: 'long', text: 'Long', observedAt: time(3) }), /validFrom/);
  assert.throws(() => clarify(ledger, run.id, decision.id, { value: 'long', text: 'Long', observedAt: time(2), validFrom: time(2) }), /precede/);
});

test('invalid policies, budgets and metadata fail before spending a question', () => {
  const { ledger, run } = setup();
  assert.throws(() => createRun(ledger, { participantId: 'alice', budget: -1 }));
  assert.throws(() => createRun(ledger, { participantId: 'alice', policy: 'oracle' }));
  assert.throws(() => decide(ledger, run.id, query({ recurrence: 3 })));
  assert.throws(() => decide(ledger, run.id, query({ urgent: 'true' })));
  assert.equal(ledger.data.runs[run.id].questionsAsked, 0);
});

test('persistent evidence and budgets survive restart; participant deletion removes run traces', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asuna-ledger-'));
  try {
    const filePath = path.join(dir, 'ledger.json');
    const ledger = new MemoryLedger({ filePath });
    ledger.append('alice', fact('a', 'short'));
    const run = createRun(ledger, { participantId: 'alice' });
    decide(ledger, run.id, query({ slot: 'unknown' }));
    const restored = new MemoryLedger({ filePath });
    assert.equal(restored.resolve('alice', query()).value, 'short');
    assert.equal(restored.data.runs[run.id].questionsAsked, 1);
    restored.deleteParticipant('alice');
    const deleted = new MemoryLedger({ filePath });
    assert.deepEqual(deleted.observations('alice'), []);
    assert.equal(deleted.data.runs[run.id], undefined);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('replays are deterministic, respect budgets, and count unanswered answerable tasks as errors', () => {
  const cases = JSON.parse(fs.readFileSync(new URL('../research/fixtures/development.json', import.meta.url), 'utf8'));
  const config = { policies: ['never', 'impact', 'random'], budgets: [0, 1], seeds: [11, 12] };
  const first = evaluate(cases, config);
  assert.deepEqual(first.rows, evaluate(cases, config).rows);
  assert.deepEqual(first.summary, evaluate(cases, config).summary);
  for (const scenario of cases) for (const policy of config.policies) for (const budget of config.budgets) for (const seed of config.seeds) {
    const rows = first.rows.filter(r => r.scenario === scenario.id && r.policy === policy && r.budget === budget && r.seed === seed);
    assert.ok(rows.filter(row => row.questionIssued).length <= budget);
  }
  assert.ok(first.summary.some(row => row.personalizationError > 0));
  assert.ok(first.rows.some(row => row.answerable && row.answer === null && !row.correct));
});

test('changing hidden labels does not change policy decisions', () => {
  const cases = JSON.parse(fs.readFileSync(new URL('../research/fixtures/development.json', import.meta.url), 'utf8'));
  const changed = structuredClone(cases);
  for (const scenario of changed) for (const step of scenario.steps) if (step.type === 'query') step.acceptedValues = ['secret-label'];
  const config = { policies: ['impact'], budgets: [1], seeds: [42] };
  const visible = rows => rows.map(({ correct, answerable, falseAssertion, ...row }) => row);
  assert.deepEqual(visible(evaluate(cases, config).rows), visible(evaluate(changed, config).rows));
});

test('an unlabelled or empty dataset is rejected rather than scored as success', () => {
  assert.throws(() => evaluate([]));
  assert.throws(() => evaluate([{ id: 'bad', steps: [{ type: 'query', query: query() }] }]));
});
