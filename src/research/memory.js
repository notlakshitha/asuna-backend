import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export class ValidationError extends Error {}

export function text(value, name, max = 2000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new ValidationError(`${name} must be a nonempty string of at most ${max} characters`);
  }
  return value.trim();
}

function timestamp(value, name) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new ValidationError(`${name} must be an ISO timestamp with a timezone`);
  }
  return new Date(value).toISOString();
}

export function normalizeObservation(input) {
  if (!input || typeof input !== 'object') throw new ValidationError('Observation required');
  const observedAt = timestamp(input.observedAt, 'observedAt');
  const validFrom = timestamp(input.validFrom ?? observedAt, 'validFrom');
  const validTo = input.validTo == null ? null : timestamp(input.validTo, 'validTo');
  if (validTo && validTo <= validFrom) throw new ValidationError('validTo must follow validFrom');
  const source = input.source;
  if (!source || !['user_statement', 'browser_observation', 'clarification'].includes(source.type)) {
    throw new ValidationError('source.type must be user_statement, browser_observation, or clarification');
  }
  if (input.supersedes !== undefined && (!Array.isArray(input.supersedes) || input.supersedes.length > 100)) {
    throw new ValidationError('supersedes must be an array of up to 100 observation IDs');
  }
  if (input.status !== undefined && !['tentative', 'asserted'].includes(input.status)) {
    throw new ValidationError('status must be tentative or asserted');
  }
  return {
    id: input.id === undefined ? randomUUID() : text(input.id, 'id', 200),
    slot: text(input.slot, 'slot', 200),
    scope: text(input.scope ?? 'global', 'scope', 200),
    value: text(input.value, 'value'),
    observedAt, validFrom, validTo,
    // Browsing evidence is never promoted to a declared preference automatically.
    status: source.type === 'browser_observation' ? 'tentative' : (input.status ?? 'asserted'),
    source: { type: source.type, ref: text(source.ref, 'source.ref', 500), text: text(source.text, 'source.text', 10000) },
    supersedes: (input.supersedes ?? []).map(id => text(id, 'supersedes ID', 200)),
  };
}

/** Both event time (at) and knowledge time (knownAt) are explicit. No latest-write-wins rule. */
export function resolveMemory(observations, { slot, scope = 'global', at, knownAt = at }) {
  text(slot, 'slot', 200);
  text(scope, 'scope', 200);
  at = timestamp(at, 'at');
  knownAt = timestamp(knownAt, 'knownAt');
  let eligible = observations.filter(o => o.slot === slot && o.observedAt <= knownAt && o.validFrom <= at && (!o.validTo || at < o.validTo));
  // A scoped observation may override a global default only within that scope.
  const scoped = eligible.filter(o => o.scope === scope);
  eligible = scope !== 'global' && scoped.length ? scoped : eligible.filter(o => o.scope === 'global');
  const superseded = new Set(eligible.filter(o => o.status === 'asserted').flatMap(o => o.supersedes));
  const evidence = eligible.filter(o => !superseded.has(o.id));
  const asserted = evidence.filter(o => o.status === 'asserted');
  const candidates = asserted.length ? asserted : evidence;
  const values = [...new Set(candidates.map(o => o.value))];
  const state = !values.length ? 'missing' : !asserted.length ? 'uncertain' : values.length > 1 ? 'conflict' : 'known';
  return { state, value: state === 'known' ? values[0] : null, values, evidence: structuredClone(evidence) };
}

/** Single-process persistence. The evaluator uses the same class without a file. */
export class MemoryLedger {
  constructor({ filePath } = {}) {
    this.filePath = filePath;
    this.data = { version: 1, participants: {}, runs: {} };
    if (filePath && fs.existsSync(filePath)) {
      const loaded = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (loaded.version !== 1 || !loaded.participants || !loaded.runs) throw new Error('Unsupported research ledger');
      this.data = loaded;
    }
  }

  save() {
    if (!this.filePath) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
  }

  observations(participantId) {
    text(participantId, 'participantId', 200);
    return Object.hasOwn(this.data.participants, participantId) ? structuredClone(this.data.participants[participantId]) : [];
  }

  append(participantId, input) {
    text(participantId, 'participantId', 200);
    const observation = normalizeObservation(input);
    const existing = this.observations(participantId);
    if (existing.some(o => o.id === observation.id)) throw new ValidationError('Duplicate observation ID');
    for (const id of observation.supersedes) {
      const prior = existing.find(o => o.id === id);
      if (!prior || prior.slot !== observation.slot || prior.scope !== observation.scope || prior.observedAt > observation.observedAt) {
        throw new ValidationError('Supersedes must reference an earlier observation in the same participant, slot, and scope');
      }
    }
    Object.defineProperty(this.data.participants, participantId, { value: [...existing, observation], enumerable: true, writable: true, configurable: true });
    this.save();
    return structuredClone(observation);
  }

  resolve(participantId, query) {
    return resolveMemory(this.observations(participantId), query);
  }

  deleteParticipant(participantId) {
    delete this.data.participants[text(participantId, 'participantId', 200)];
    for (const [id, run] of Object.entries(this.data.runs)) {
      if (run.participantId === participantId) delete this.data.runs[id];
    }
    this.save();
  }
}
