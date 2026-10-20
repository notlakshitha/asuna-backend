# Proposed study: clarification under limited user attention

Status: prospective protocol draft. No study participants recruited, no preregistration submitted, no claim of novel or superior performance. The committed implementation is the structured-event diagnostic stage.

## Question and contribution to investigate

Can selecting and scheduling clarification of personal memories reduce downstream personalization errors at a matched interaction burden?

The candidate contribution is longitudinal allocation of clarification opportunities between immediate assistance and a daily reflection. Bitemporal storage, provenance, and asking about uncertainty are existing ideas, not standalone novelty claims.

Nearest work to audit in full, including code and protocols:

| Work | Established overlap | Required comparison |
| --- | --- | --- |
| [PAHF](https://arxiv.org/abs/2602.16173) | Memory with pre-action clarification and post-action feedback | Reproduce/adapt the feedback loop, compare cumulative burden and scheduling |
| [TANGLE](https://arxiv.org/abs/2608.13921) | Genuine conflicts, clarification seeking, oracle versus pipeline tracks | Evaluate preserved conflicts and downstream decisions; do not claim conflict recognition as new |
| [Memory Commitment Benchmark](https://arxiv.org/abs/2608.19564) | Remember/verify/ask boundary and tool-call behavior | Test actual calls and memory writes, not only verbal intentions |
| [CAPTURE](https://arxiv.org/abs/2609.02265) | Preference drift, authenticity, uncertainty-triggered clarification | Check whether limited-budget longitudinal scheduling is already addressed |
| [TOKI](https://arxiv.org/abs/2606.06240) and [TSM](https://arxiv.org/abs/2601.07468) | Bitemporal conflict resolution and semantic validity | Temporal correctness regression cases and appropriate published baselines |
| [LongMemEval](https://arxiv.org/abs/2410.10813) | Recall, temporal reasoning, knowledge updates, abstention | Secondary external memory evaluation using its official protocol |

Gate 1: complete a full-text novelty matrix. If nearest work already evaluates the proposed scheduling contribution, change the research question before expanding the implementation. This draft is not evidence that the gap is open.

## Hypotheses to freeze before held-out evaluation

- H1: A selective clarification policy reduces answerable-task errors relative to a strong uncertainty-triggered policy at matched realized question burden.
- H2: Deferring selected nonurgent questions to a daily reflection reduces perceived interruption burden without a practically meaningful loss in assistance quality.
- H3: Explicit scope and validity tracking reduce incorrect durable updates relative to a flat recency-based memory implementation.

The current six policies isolate H1/H2 within one shared memory core. H3 still requires separate memory baselines; it cannot be inferred from those policy comparisons. The current priority product is a transparent starting heuristic and may be rejected. Include high-impact one-off tasks and mistaken urgency estimates when testing it.

## Data plan

1. Development pilot: around 50 histories of 10–20 sessions across learning and project assistance. Begin from independently specified user states, scope, update timing, and task outcomes. Add permanent changes, temporary exceptions, corrections, delayed disclosures, repeated evidence, and insufficient evidence.
2. Independently authored evaluation: use disjoint user profiles, scenario families, paraphrase styles, and temporal-change patterns. Keep answer keys and clarification response generation outside policy inputs. Human reviewers check whether each question can actually resolve the uncertainty. Report disagreements and adjudication.
3. Natural-language pipeline track: replace structured observations with conversational inputs. Freeze extractor prompt/model/version and validate source links. Compare with curated structured memory to localize extraction errors.
4. External check: run official LongMemEval evaluation with a documented adapter. Report official scores separately from structured-event diagnostics. Do not exclude abstention items without a separate explicit report.

Do not let the same generator both write all scenarios and serve as the only evaluator. Include user refusal, partial answers, response delay, unnecessary clarification, unknown changes, and genuinely unanswerable tasks. Current fixture labels, priority inputs and simple canonical string answers are author-supplied and unsuitable for generalization claims.

## Comparisons and measurements

Freeze one primary outcome: answerable-task personalization error at a prespecified realized clarification burden. Report success-versus-question curves, coverage, false assertions, and missed or deferred tasks alongside it. Compare per-history outcomes; repeated turns and deterministic seeds are not independent participants.

Required baselines include never ask, conflict trigger, uncertainty trigger, random selection calibrated to comparable burden, immediate-only scheduling, and the strongest relevant published approach that can be reproduced. Add full-history prompting and flat recency memory for the natural-language memory comparison. Use equal model families, evidence access, context budgets, and token accounting. Log deviations and do not relabel an approximation as a published implementation.

Required measures beyond the current evaluator: erroneous durable writes, recovery turns after preference changes, unnecessary repeated questions, model extraction failures, clarification usefulness, user answer time, p50/p95 latency, and input/output tokens. Use an independent blinded rubric for natural-language recommendations; audit a sample with human raters and report agreement. Do not use model personality self-report as a proxy for user benefit.

Use paired history-level analysis and history-clustered bootstrap confidence intervals. Choose sample size using pilot variability and the smallest practically relevant difference, not a desired significance result. Select one primary contrast, document secondary analyses, lock thresholds/configuration before test access, and disclose any post-hoc changes. Curves must show realized burden, not merely equal maximum allowances.

## Human pilot

After the offline and novelty gates pass, conduct an 8–12-adult, two-week feasibility pilot subject to applicable institutional review. Use learning/project tasks and voluntary check-ins. Compare the strongest baseline and candidate policy with counterbalanced conditions, matched tasks, and separated memories. Treat carryover and novelty effects as limitations. This size supports feasibility observations, not broad efficacy or relationship claims.

The study client still needs clarification display, postpone/decline feedback, correction controls, consent/withdrawal flows, and time-on-question instrumentation. Never use the current arbitrary-user-ID legacy routes as participant authentication. No automatic external messages should be enabled for the pilot without the explicit study communication protocol.

The participant should see the evidence behind a proposed memory, be able to correct it, and delete their research records. Separate the consent/contact identity mapping from pseudonymous research IDs. Do not publish raw browsing or conversations by default. Define export, backup retention and deletion procedures before recruitment.

## Milestones and decision gates

| Stage | Deliverable | Gate |
| --- | --- | --- |
| Implemented foundation | Structured ledger, six policies, 15 diagnostic histories, reproducible CLI, protected API, tests and CI definition | All regression checks pass; no performance claim |
| Weeks 1–2 | Full-text novelty matrix and expanded pilot cases | A distinct, falsifiable contribution survives literature review |
| Weeks 3–4 | Natural-language extractor, source checking, published/simple baselines | Errors can be attributed to extraction, resolution or policy |
| Weeks 5–6 | Pilot power/budget analysis and locked evaluation plan | No test-set-driven threshold changes |
| Weeks 7–8 | Independent held-out evaluation, ablations and second-model replication | Benefit survives burden matching and family shift |
| Weeks 9–12+ | Study client, reviewed pilot, analysis, paper and artifact release | Claims match actual evidence; recruitment can extend schedule |

Stop a method-superiority claim if a simple baseline matches it, improvement disappears under matched actual burden, or gains depend on author-provided perfect priority estimates. A useful failure analysis or evaluation resource remains possible, but does not automatically justify a novel-method paper.

## Scope and limitations

The current architecture is a research foundation, not a clinical or psychological model. Mood inference from browsing, activation steering, QLoRA training, autonomous companion relationships, and wellbeing optimization are outside this first study. The existing product can keep evolving, but those features must not confound the policy comparison.

A publishable artifact would be independently validated evaluation histories, reproducible and competitive baselines, and a measured explanation of when immediate versus deferred clarification helps. Citation potential comes from that reuse value; it cannot be promised from the architecture name.
