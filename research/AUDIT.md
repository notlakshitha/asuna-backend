# Repository assessment and implementation scope

Reviewed on 2026-10-21: `notlakshitha/asuna-backend` and `notlakshitha/asuna-mobile`. The original backend is an Express application with Gemini-based diary generation, inferred browsing memories stored as JSON vectors, history/interest/magazine endpoints, and two automatic proactive-message paths. The mobile application is Expo/React Native and consumes these APIs plus a separately hosted WhatsApp bot API.

## Findings addressed

| Finding in the reviewed code | Change | Verification |
| --- | --- | --- |
| Vector lookup, count and text deduplication were global, despite user-specific history | Partition vector operations and all backend callers by userId; keep untagged legacy records in default only | User-isolation, duplicate, persistence and legacy-compatibility tests |
| No research protocol, experimental policies or replay evaluation | Add prospective protocol, six policy variants, structured-event evaluator and versioned development fixtures | Determinism, label-isolation and budget tests |
| No source-backed preference state or temporal conflict handling | Add separate participant memory ledger with source text/ref, scope, knowledge time, validity, tentative evidence and explicit supersession | Delayed disclosures, historical answers, temporary/future scope, conflict and correction tests |
| History sync and cron could call the WhatsApp bot automatically | Add research mode and shared proactive gate; skip cron setup in research mode | Real server sync test plus configuration regression |
| Experiment runs could load normal application files | Default research data directory is separate; offline evaluation uses in-memory stores only | Temporary-directory server test and lazy vector initialization |
| Recall prompt called vector similarity confidence and asked for perfect memory | Label similarity correctly and instruct the generator to acknowledge insufficient/conflicting inferred evidence | Code review; live Gemini behavior is not empirically validated here |
| Daily extraction labelled a recent-history slice with today's date | Filter actual UTC dates before extraction; insertion count reflects actual new memories | Code review; no live provider invocation |
| Dotenv configuration ran after dependency evaluation | Use dotenv side-effect import first | Startup integration test; no deployment configuration changed |

## Deliberate limits

The researcher ledger is not silently wired into mobile chat. No mobile UI or separate WhatsApp bot implementation was changed. Product integration needs a study client and an independently evaluated natural-language extractor before claiming end-to-end companion behavior.

The new API is token-protected for researchers; original application endpoints still accept their legacy userId parameters and are not suitable participant authentication. Existing untagged vector ownership is unknowable beyond the default-namespace compatibility assumption. Existing repository-tracked data and dependencies were not copied into research fixtures or reports.

The offline diagnostic uses 15 author-written structured histories, 28 queries, six policies, four budget settings and three seeds by default. It is a regression environment, not a held-out benchmark or evidence of superiority. Priority estimates are supplied, the heuristic is untrained, all policies share a conservative resolver, and the protocol names the missing published baselines and validation gates.

The ledger supports one Node process and atomic JSON file replacement. It is not a transactional multiworker database. Data inspection/deletion applies to research records, not previously exported reports, backups, or legacy product data. Research mode disables automatic messaging; manually invoking legacy AI endpoints can still contact Gemini.

## Research decision

Develop the limited-attention clarification question using this foundation. Audit nearest work before asserting novelty, collect independently reviewed evaluation histories, add the natural-language pipeline, and compare at matched realized question burden. Avoid expanding into emotion inference or personality steering until those components have separate measurable hypotheses.

The DevRelay Community Wisdom tools were unavailable in this session. No developer-community consensus is claimed; the study protocol cites primary research instead.
