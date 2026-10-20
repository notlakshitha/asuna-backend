# Asuna research foundation

This is a reproducible development environment for personal-memory clarification policies. It is not a validated research result, a completed companion study, or a new benchmark leaderboard. The existing mobile app remains the product interface; the researcher API is an additional experiment lane.

## Run without credentials or personal data

Requires Node.js 20 or later and the root dependencies. From the repository root:

```sh
npm ci --ignore-scripts
npm test
npm run research:eval
```

The evaluator makes **zero external API calls**, does not start the server, reads no application browsing history or vectors, and sends no messages. It uses only the committed synthetic development fixture. No Gemini key, bot service, GPU, or new dependency is required.

```sh
npm run research:eval -- --budgets 0,1,3,5 --seeds 11,12,13 --output research/results/experiment-01
```

Use `--dataset path/to/scenarios.json` for a separately authored dataset. `npm run research:fixtures` regenerates the development JSON from its transparent authoring script. Do not regenerate or tune against a held-out dataset.

`research/ci-workflow.yml.example` contains the Node 20/22 GitHub Actions configuration. To enable it, copy it to `.github/workflows/research.yml` using a GitHub credential with workflow permission. The credential used for this change cannot install workflows, so CI is supplied as a template rather than registered automatically.

Outputs are ignored by Git:

| File | Contents |
| --- | --- |
| `manifest.json` | Dataset, source and lockfile hashes; Git revision and dirty state; runtime; seeds; policy configuration; declared limitations |
| `summary.json` | Success, answerable-task error, coverage, false assertions, issued and unanswered questions |
| `decisions.jsonl` | Per-scenario, per-query outcomes and supporting evidence IDs |
| `runtime.json` | Whole diagnostic wall time; not a model latency benchmark |

The six policies share the exact same memory implementation and evidence. `never` uses supported facts but never clarifies; `conflict` asks only on conflicting assertions; `uncertainty` asks on all unresolved states; `random` uses a seeded 50% eligibility draw; `impact` uses a declared priority heuristic with deferral; `immediate` removes deferral from that heuristic. Pending unanswered questions are not repeated.

`impact` asks when `impact * recurrence >= 0.35`; nonurgent eligible questions defer until a query marked `reflection`. This is an intentionally simple hypothesis to test, **not an estimate of expected information gain or a learned model**. Supplied impact, recurrence and urgency are structured experimental inputs. Counterexamples cover important one-off tasks, mistaken urgency, and unobserved preference drift. No method detects a change that was never disclosed when the stored evidence remains unambiguous.

Each budget applies to one complete scenario/history, not to every query. Clarification responses are provided by the synthetic environment only after a question is issued. Missing answers remain unanswered and still consume budget. Labels and response objects are never passed to the policy. UUIDs are replaced with deterministic clarification observation IDs during replay so scored traces reproduce exactly. The seeded random policy is not an exact realized-question-count match: inspect actual question counts before making comparisons.

`taskSuccess` includes correctly abstaining on explicitly unanswerable queries. `personalizationError` is the error rate on answerable queries and **counts abstention as failure**. `coverage` reports the fraction with a non-null answer. False assertion rate is over all queries. A zero false assertion rate can coexist with poor completion. The fixture deliberately contains an undisclosed drift case that defeats every policy.

There are 15 short, hand-authored development histories and 28 query opportunities. They are neither representative user samples nor held-out evidence. Repeated deterministic seeds do not create independent data. No confidence intervals, statistical significance, human burden estimates, or paper-comparable performance claims follow from these numbers. The track supplies structured memory directly; natural-language extraction, LLM reasoning, and response quality are not evaluated. Token usage is `null`, not a fabricated model measurement.

## Use the research API

Set these in a local `.env` (never commit tokens):

```env
ASUNA_RESEARCH_MODE=true
RESEARCH_API_TOKEN=replace-with-a-long-random-token
PORT=3848
```

Then `npm start`. Research mode:

- Stores application and research data in `data/research/` by default; `ASUNA_DATA_DIR` explicitly overrides that path.
- Does not register cron jobs.
- Suppresses automatic proactive messages in history sync even if proactive messaging is enabled separately.
- Enables the researcher API below. Without a configured token, it returns 503. Missing or incorrect bearer credentials return 401.

Legacy manual Gemini endpoints remain available and may call the external provider if invoked. Research mode is **not** an offline sandbox or local-model implementation. The preexisting legacy endpoints still have their original authentication model; keep experimental servers on a controlled network. The bearer token protects the new researcher endpoints only, and is a researcher credential, not participant authentication.

Every researcher request uses `Authorization: Bearer <RESEARCH_API_TOKEN>` and JSON bodies where applicable.

| Method | Path under `/api/research` | Action |
| --- | --- | --- |
| POST | `/participants/:id/memories` | Append a sourced observation |
| GET | `/participants/:id/memories` | Inspect/export research observations |
| DELETE | `/participants/:id` | Delete this participant's research observations and all their research runs |
| POST | `/runs` | Start a run with participantId, policy, budget and seed |
| GET | `/runs/:id` | Inspect/export policy settings, question count, decisions and evidence |
| POST | `/runs/:id/decisions` | Resolve a memory and choose use, clarify, defer, or abstain |
| POST | `/runs/:id/decisions/:decisionId/clarification` | Record a participant answer to an issued question |

Example observation:

```json
{
  "id": "session-01-turn-04",
  "slot": "explanation_depth",
  "scope": "mathematics",
  "value": "detailed",
  "observedAt": "2026-01-02T12:00:00Z",
  "validFrom": "2026-01-02T12:00:00Z",
  "validTo": "2026-01-03T00:00:00Z",
  "source": {
    "type": "user_statement",
    "ref": "session-01-turn-04",
    "text": "For today's mathematics session, please explain each step."
  }
}
```

Source types: `user_statement`, `browser_observation`, `clarification`. Browser observations always remain tentative. Text and reference are required; a reference is an audit pointer, not proof that a claim is true. Researchers must verify source correspondence. The API does not extract preferences from arbitrary text automatically.

Observation time and validity time are distinct. Resolutions filter both, use an exact requested scope before a global default, preserve overlapping contradictory values, and do not use latest-write-wins. `supersedes` explicitly links corrections within the same participant, slot and scope. Historic evidence remains inspectable. An omitted `validFrom` on an ordinary observation defaults to observation time; represent uncertain dates by leaving the assertion tentative rather than inventing dates. Clarification answers require explicit `validFrom`.

Example run and subsequent decision:

```json
{"participantId":"pilot-001","policy":"impact","budget":3,"seed":42}
```

```json
{
  "slot": "explanation_depth",
  "scope": "mathematics",
  "at": "2026-01-04T12:00:00Z",
  "knownAt": "2026-01-04T12:00:00Z",
  "phase": "now",
  "impact": 0.9,
  "recurrence": 0.8,
  "urgent": true
}
```

`at` asks what was valid at that event time; `knownAt` limits knowledge available when making the decision and defaults to `at`. A `clarify` action increments the budget and returns the question to the caller. A `defer` action consumes no question and sends no notification; the caller must later submit the relevant decision with `phase: "reflection"`. This is a policy API, not an autonomous scheduler.

Example answer to the returned clarification decision ID:

```json
{
  "value": "concise",
  "text": "Please use concise explanations from now on.",
  "observedAt": "2026-01-04T12:00:00Z",
  "validFrom": "2026-01-04T12:00:00Z"
}
```

Use a separate participant ID and memory snapshot for each experimental arm. Multiple runs for the same participant intentionally share that participant's ledger: they are not independent conditions. Deletion applies only to this research ledger and its run records, not legacy diary/history/vector data, exported reports, or filesystem backups. Storage is single-process JSON with atomic file replacement; multiple workers need a transactional database before concurrent deployment.

## Relationship to the existing app

The mobile app continues to use the existing diary, interests, magazine, and history APIs. Its WhatsApp chat is provided by a separate bot repository. This change does not silently reroute those features through the experimental policy. A future study client should consume the decision API, explicitly show clarification opportunities, and record accept/decline/timing feedback. See [PROTOCOL.md](PROTOCOL.md) for the research gates.

Legacy vector recall is now partitioned by `userId` in extraction, lookup, count and duplicate detection. Existing untagged vectors remain in the original `default` namespace for compatibility; ownership cannot be reconstructed retrospectively. Vectors with incompatible dimensions are skipped. Retrieval similarity is no longer presented as factual confidence, and memory generation counts actual insertions. Daily extraction now filters actual UTC observation dates rather than relabelling the latest 300 items as today.

The structured researcher ledger and legacy inferred-vector store remain separate. Browsing summaries are not suitable ground truth, and no automatic migration of inferred memories into asserted preferences occurs.
