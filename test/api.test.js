import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createResearchRouter } from '../src/research/routes.js';
import { MemoryLedger } from '../src/research/memory.js';
import { proactiveEnabled, dataDirectory } from '../src/config.js';

test('protected researcher API validates input and supports an evidence/clarification/export/delete cycle', async t => {
  const app = express();
  app.use(express.json());
  app.use('/api/research', createResearchRouter({ ledger: new MemoryLedger(), token: 'test-only-token' }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/research`;
  async function request(url, method = 'GET', body) {
    return fetch(base + url, { method, headers: { authorization: 'Bearer test-only-token', 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  assert.equal((await fetch(base + '/participants/alice/memories')).status, 401);
  assert.equal((await request('/runs', 'POST', { participantId: 'alice', budget: -1 })).status, 400);
  const runResponse = await request('/runs', 'POST', { participantId: 'alice', budget: 1 });
  assert.equal(runResponse.status, 201);
  const run = await runResponse.json();
  const decisionResponse = await request(`/runs/${run.id}/decisions`, 'POST', { slot: 'depth', at: '2026-01-02T12:00:00Z', impact: 1, recurrence: 1, urgent: true });
  const decision = await decisionResponse.json();
  assert.equal(decisionResponse.status, 201);
  assert.equal(decision.action, 'clarify');
  const response = await request(`/runs/${run.id}/decisions/${decision.id}/clarification`, 'POST', { value: 'concise', text: 'Please be concise from now on', observedAt: '2026-01-02T12:00:00Z', validFrom: '2026-01-02T12:00:00Z' });
  assert.equal(response.status, 201);
  const memories = await (await request('/participants/alice/memories')).json();
  assert.equal(memories.observations[0].source.ref, decision.id);
  assert.equal((await (await request('/participants/bob/memories')).json()).observations.length, 0);
  assert.equal((await (await request(`/runs/${run.id}`)).json()).questionsAsked, 1);
  assert.equal((await request('/participants/alice', 'DELETE')).status, 204);
  assert.equal((await request(`/runs/${run.id}`)).status, 404);
  assert.equal((await (await request('/participants/alice/memories')).json()).observations.length, 0);
});

test('research mode suppresses automatic messages even when proactive is enabled', () => {
  const old = { mode: process.env.ASUNA_RESEARCH_MODE, proactive: process.env.ASUNA_PROACTIVE_ENABLED, dir: process.env.ASUNA_DATA_DIR };
  try {
    process.env.ASUNA_RESEARCH_MODE = 'true';
    process.env.ASUNA_PROACTIVE_ENABLED = 'true';
    delete process.env.ASUNA_DATA_DIR;
    assert.equal(proactiveEnabled(), false);
    assert.equal(dataDirectory(), path.resolve('data/research'));
    process.env.ASUNA_RESEARCH_MODE = 'false';
    process.env.ASUNA_PROACTIVE_ENABLED = 'false';
    assert.equal(proactiveEnabled(), false);
    process.env.ASUNA_PROACTIVE_ENABLED = 'true';
    assert.equal(proactiveEnabled(), true);
  } finally {
    for (const [key, value] of Object.entries({ ASUNA_RESEARCH_MODE: old.mode, ASUNA_PROACTIVE_ENABLED: old.proactive, ASUNA_DATA_DIR: old.dir })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('research API fails closed when the researcher token is unconfigured', async t => {
  const app = express();
  app.use(createResearchRouter());
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/participants/alice/memories`);
  assert.equal(response.status, 503);
});

test('the real server starts without a model key and suppresses sync-triggered outbound messages', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asuna-server-'));
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/index.js', import.meta.url))], {
    cwd: dir,
    env: { ...process.env, GEMINI_API_KEY: '', ASUNA_RESEARCH_MODE: 'true', ASUNA_DATA_DIR: dir, RESEARCH_API_TOKEN: 'test-only-token', PORT: '0', BOT_URL: 'http://127.0.0.1:1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const output = [];
  const base = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server startup timed out: ${output.join('')}`)), 10000);
    child.stdout.on('data', chunk => {
      output.push(String(chunk));
      const match = output.join('').match(/running on http:\/\/0\.0\.0\.0:(\d+)/);
      if (match) { clearTimeout(timeout); resolve(`http://127.0.0.1:${match[1]}`); }
    });
    child.stderr.on('data', chunk => output.push(String(chunk)));
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${output.join('')}`)); });
  });
  assert.equal((await fetch(base + '/api/health')).status, 200);
  const response = await fetch(base + '/api/history/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 'synthetic', items: Array.from({ length: 5 }, (_, i) => ({ title: 'TypeError exception debug', url: `https://example.test/${i}`, lastVisitTime: i + 1 })) }) });
  assert.equal(response.status, 200);
  assert.ok(!output.join('').includes('Cron jobs initialized'));
  assert.ok(!output.join('').includes('[Proactive]'));
  assert.equal((await fetch(base + '/api/research/participants/synthetic/memories')).status, 401);
  const malformed = await fetch(base + '/api/research/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' });
  assert.equal(malformed.status, 400);
});
