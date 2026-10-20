import { createHash, randomUUID } from 'node:crypto';
import { text, ValidationError } from './memory.js';

export const POLICIES = ['never', 'conflict', 'uncertainty', 'random', 'impact', 'immediate'];

export function createRun(ledger, { participantId, policy = 'impact', budget = 3, seed = 42 }) {
  text(participantId, 'participantId', 200);
  if (!POLICIES.includes(policy)) throw new ValidationError(`policy must be one of ${POLICIES.join(', ')}`);
  if (!Number.isInteger(budget) || budget < 0 || budget > 100) throw new ValidationError('budget must be an integer from 0 to 100');
  if (!Number.isSafeInteger(seed)) throw new ValidationError('seed must be a safe integer');
  const run = { id: randomUUID(), participantId, policy, budget, seed, questionsAsked: 0, decisions: [] };
  ledger.data.runs[run.id] = run;
  ledger.save();
  return structuredClone(run);
}

function unit(value, name) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new ValidationError(`${name} must be between 0 and 1`);
  return value;
}

function getRun(ledger, id) {
  const run = ledger.data.runs[id];
  if (!run || typeof run !== 'object' || !Array.isArray(run.decisions)) throw new ValidationError('Unknown run');
  return run;
}

/** A declared heuristic, not a learned or calibrated probability of user benefit. */
export function decide(ledger, runId, input) {
  const run = getRun(ledger, runId);
  const query = {
    slot: input.slot, scope: input.scope ?? 'global', at: input.at, knownAt: input.knownAt ?? input.at,
    phase: input.phase ?? 'now', impact: unit(input.impact ?? 0.5, 'impact'),
    recurrence: unit(input.recurrence ?? 0.5, 'recurrence'), urgent: input.urgent ?? false,
  };
  if (!['now', 'reflection'].includes(query.phase)) throw new ValidationError('phase must be now or reflection');
  if (typeof query.urgent !== 'boolean') throw new ValidationError('urgent must be boolean');
  const memory = ledger.resolve(run.participantId, query);
  const priority = query.impact * query.recurrence;
  let action = 'abstain';
  let reason = 'No supported answer';
  const pending = run.decisions.find(d => d.action === 'clarify' && !d.resolved && d.query.slot === query.slot && d.query.scope === query.scope);
  if (memory.state === 'known') {
    action = 'use'; reason = 'Unambiguous asserted evidence';
  } else if (pending) {
    action = 'defer'; reason = 'An unanswered clarification already exists';
  } else if (run.policy === 'never') {
    reason = 'Never-clarify baseline';
  } else if (run.questionsAsked >= run.budget) {
    reason = 'Clarification budget exhausted';
  } else {
    let ask = false;
    if (run.policy === 'conflict') ask = memory.state === 'conflict';
    if (run.policy === 'uncertainty') ask = true;
    if (run.policy === 'random') {
      const hex = createHash('sha256').update(`${run.seed}:${run.decisions.length}`).digest('hex').slice(0, 8);
      ask = parseInt(hex, 16) / 0x100000000 < 0.5;
    }
    if (['impact', 'immediate'].includes(run.policy)) {
      ask = priority >= 0.35;
      if (ask && run.policy === 'impact' && !query.urgent && query.phase === 'now') {
        action = 'defer'; reason = 'Eligible for a later reflection; no question issued'; ask = false;
      }
    }
    if (ask) { action = 'clarify'; reason = 'Selected within the remaining budget'; run.questionsAsked++; }
  }
  const decision = {
    id: randomUUID(), query, action, reason, priority, memory,
    question: action === 'clarify' ? `For ${query.scope}, what should I use for ${query.slot}? Is this temporary or an ongoing preference?` : null,
    questionsAsked: run.questionsAsked, resolved: false,
  };
  run.decisions.push(decision);
  ledger.save();
  return structuredClone(decision);
}

export function clarify(ledger, runId, decisionId, input) {
  const run = getRun(ledger, runId);
  const decision = run.decisions.find(d => d.id === decisionId);
  if (!decision || decision.action !== 'clarify' || decision.resolved) throw new ValidationError('No unanswered clarification for this decision');
  // The participant supplies the validity window; never guess whether the answer is permanent.
  if (!input || input.validFrom === undefined) throw new ValidationError('Clarification requires validFrom');
  if (Date.parse(input.observedAt) < Date.parse(decision.query.knownAt)) throw new ValidationError('Clarification cannot precede the question');
  const observation = ledger.append(run.participantId, {
    id: input.id,
    slot: decision.query.slot, scope: decision.query.scope, value: input.value,
    observedAt: input.observedAt, validFrom: input.validFrom, validTo: input.validTo,
    source: { type: 'clarification', ref: decision.id, text: input.text },
    supersedes: decision.memory.evidence.filter(o => o.scope === decision.query.scope).map(o => o.id),
  });
  decision.resolved = true;
  decision.observationId = observation.id;
  ledger.save();
  return observation;
}
