import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { MemoryLedger, ValidationError, text } from './memory.js';
import { createRun, decide, clarify } from './policy.js';

/** Explicit, token-protected researcher API. No LLM calls or outbound messages. */
export function createResearchRouter({ ledger = new MemoryLedger(), token } = {}) {
  const router = Router();
  router.use((req, res, next) => {
    if (!token) return res.status(503).json({ error: 'RESEARCH_API_TOKEN must be configured' });
    const expected = Buffer.from(`Bearer ${token}`);
    const supplied = Buffer.from(req.get('authorization') ?? '');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      return res.status(401).json({ error: 'Research bearer token required' });
    }
    next();
  });

  function endpoint(handler) {
    return (req, res, next) => {
      try { handler(req, res); } catch (error) {
        if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
        next(error);
      }
    };
  }

  router.get('/participants/:participantId/memories', endpoint((req, res) => {
    res.json({ observations: ledger.observations(req.params.participantId) });
  }));
  router.post('/participants/:participantId/memories', endpoint((req, res) => {
    res.status(201).json(ledger.append(req.params.participantId, req.body));
  }));
  router.delete('/participants/:participantId', endpoint((req, res) => {
    ledger.deleteParticipant(req.params.participantId);
    res.status(204).end();
  }));
  router.post('/runs', endpoint((req, res) => {
    res.status(201).json(createRun(ledger, req.body ?? {}));
  }));
  router.get('/runs/:runId', endpoint((req, res) => {
    const id = text(req.params.runId, 'runId', 200);
    const run = Object.hasOwn(ledger.data.runs, id) ? ledger.data.runs[id] : null;
    if (!run) return res.status(404).json({ error: 'Unknown run' });
    res.json(run);
  }));
  router.post('/runs/:runId/decisions', endpoint((req, res) => {
    res.status(201).json(decide(ledger, req.params.runId, req.body ?? {}));
  }));
  router.post('/runs/:runId/decisions/:decisionId/clarification', endpoint((req, res) => {
    res.status(201).json(clarify(ledger, req.params.runId, req.params.decisionId, req.body));
  }));
  return router;
}
