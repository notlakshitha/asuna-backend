import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { MemoryLedger } from '../src/research/memory.js';
import { createRun, decide, clarify, POLICIES } from '../src/research/policy.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');

function validateCases(cases) {
  if (!Array.isArray(cases) || !cases.length) throw new Error('A nonempty scenario array is required');
  const ids = new Set();
  for (const scenario of cases) {
    if (typeof scenario.id !== 'string' || ids.has(scenario.id) || !Array.isArray(scenario.steps) || !scenario.steps.length) throw new Error('Invalid or duplicate scenario');
    ids.add(scenario.id);
    if (!scenario.steps.some(step => step.type === 'query')) throw new Error(`No queries in ${scenario.id}`);
    for (const step of scenario.steps) {
      if (!['observation', 'query'].includes(step.type)) throw new Error(`Invalid step in ${scenario.id}`);
      if (step.type === 'query' && (!Array.isArray(step.acceptedValues) || !step.acceptedValues.length || !step.acceptedValues.every(v => v === null || typeof v === 'string'))) {
        throw new Error(`Query in ${scenario.id} requires explicit acceptedValues (including null for abstention)`);
      }
    }
  }
}

/** Structured-event diagnostic track. Hidden labels and answers are never passed to decide(). */
export function evaluate(cases, { policies = POLICIES, budgets = [0, 1, 3, 5], seeds = [42] } = {}) {
  validateCases(cases);
  const rows = [];
  const started = performance.now();
  for (const policy of policies) for (const budget of budgets) for (const seed of seeds) for (const scenario of cases) {
    const ledger = new MemoryLedger();
    const run = createRun(ledger, { participantId: scenario.id, policy, budget, seed });
    let queryIndex = 0;
    let lastObservedAt = '';
    for (const step of scenario.steps) {
      if (step.type === 'observation') {
        if (lastObservedAt && Date.parse(step.observation.observedAt) < Date.parse(lastObservedAt)) throw new Error(`Nonchronological knowledge time in ${scenario.id}`);
        ledger.append(scenario.id, step.observation);
        lastObservedAt = step.observation.observedAt;
        continue;
      }
      const q = step.query;
      const knowledgeTime = q.knownAt ?? q.at;
      if (lastObservedAt && Date.parse(knowledgeTime) < Date.parse(lastObservedAt)) throw new Error(`Query precedes available observations in ${scenario.id}`);
      // Deliberately whitelist policy-visible inputs. acceptedValues and clarification stay in the environment.
      const decision = decide(ledger, run.id, {
        slot: q.slot, scope: q.scope, at: q.at, knownAt: q.knownAt,
        phase: q.phase, impact: q.impact, recurrence: q.recurrence, urgent: q.urgent,
      });
      let answer = decision.action === 'use' ? decision.memory.value : null;
      let clarificationDelivered = false;
      if (decision.action === 'clarify' && step.clarification) {
        if (Date.parse(step.clarification.observedAt) !== Date.parse(knowledgeTime)) throw new Error(`Clarification must occur at query knowledge time in ${scenario.id}`);
        clarify(ledger, run.id, decision.id, { ...step.clarification, id: `clarification:${queryIndex}` });
        answer = ledger.resolve(scenario.id, q).value;
        clarificationDelivered = true;
      }
      const answerable = !step.acceptedValues.includes(null);
      rows.push({
        scenario: scenario.id, category: scenario.category, policy, budget, seed, queryIndex: queryIndex++,
        action: decision.action, reason: decision.reason, priority: decision.priority,
        answer, correct: step.acceptedValues.includes(answer), answerable,
        falseAssertion: answer !== null && !step.acceptedValues.includes(answer),
        questionIssued: decision.action === 'clarify', clarificationDelivered,
        evidenceIds: decision.memory.evidence.map(o => o.id),
      });
      lastObservedAt = knowledgeTime;
    }
  }
  const summary = [];
  for (const policy of policies) for (const budget of budgets) {
    const group = rows.filter(row => row.policy === policy && row.budget === budget);
    const answerable = group.filter(row => row.answerable);
    summary.push({
      policy, budget, scenarios: cases.length, seeds: seeds.length, queries: group.length,
      taskSuccess: group.filter(row => row.correct).length / group.length,
      // Abstaining on an answerable task is an error, so silence cannot win this metric.
      personalizationError: answerable.length ? answerable.filter(row => !row.correct).length / answerable.length : null,
      coverage: group.filter(row => row.answer !== null).length / group.length,
      falseAssertionRate: group.filter(row => row.falseAssertion).length / group.length,
      questions: group.filter(row => row.questionIssued).length,
      unansweredQuestions: group.filter(row => row.questionIssued && !row.clarificationDelivered).length,
    });
  }
  return { summary, rows, elapsedMs: performance.now() - started };
}

function git(...args) {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return null; }
}

export function manifest(dataset, config, files = sourceFiles()) {
  return {
    schemaVersion: 1, createdAt: new Date().toISOString(), track: 'structured-event-diagnostic',
    claim: 'Development fixtures only; no held-out, natural-language, or human-study evidence.',
    datasetSha256: hash(dataset), sourceSha256: hash(files.map(file => `${file}\n${fs.readFileSync(path.join(root, file), 'utf8')}`).join('\n')),
    lockfileSha256: hash(fs.readFileSync(path.join(root, 'package-lock.json'))),
    gitCommit: git('rev-parse', 'HEAD'), gitDirty: git('status', '--porcelain') !== '',
    node: process.version, platform: process.platform, architecture: process.arch,
    model: null, provider: null, llmTokens: null, externalApiCalls: 0, config,
    priorityInputs: 'Supplied scenario metadata; not inferred or calibrated from natural language.',
  };
}

function sourceFiles() {
  return ['research/evaluate.js', 'src/research/memory.js', 'src/research/policy.js'];
}

function parseArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--dataset', '--output', '--budgets', '--seeds'].includes(args[i]) || !args[i + 1]) throw new Error('Usage: npm run research:eval -- [--dataset file] [--output directory] [--budgets 0,1,3,5] [--seeds 42,43,44]');
    result[args[i].slice(2)] = args[i + 1];
  }
  return result;
}

function integers(value, name) {
  const values = value.split(',').map(Number);
  if (!values.length || !values.every(Number.isSafeInteger) || new Set(values).size !== values.length) throw new Error(`${name} must be unique integers`);
  return values;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataset = fs.readFileSync(path.resolve(args.dataset || path.join(root, 'research/fixtures/development.json')), 'utf8');
  const config = { policies: POLICIES, budgets: integers(args.budgets || '0,1,3,5', 'budgets'), seeds: integers(args.seeds || '42,43,44', 'seeds') };
  const results = evaluate(JSON.parse(dataset), config);
  const output = path.resolve(args.output || path.join(root, 'research/results/latest'));
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest(dataset, config), null, 2));
  fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(results.summary, null, 2));
  fs.writeFileSync(path.join(output, 'decisions.jsonl'), results.rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  fs.writeFileSync(path.join(output, 'runtime.json'), JSON.stringify({ elapsedMs: results.elapsedMs }, null, 2));
  console.table(results.summary.map(row => ({ ...row, taskSuccess: row.taskSuccess.toFixed(3), personalizationError: row.personalizationError?.toFixed(3) ?? 'n/a', coverage: row.coverage.toFixed(3) })));
  console.log(`Development diagnostic only. Reports: ${output}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
