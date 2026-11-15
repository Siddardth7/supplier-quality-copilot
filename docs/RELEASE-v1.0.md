# Release notes: v1.0

| Field | Value |
|---|---|
| Release | v1.0 MVP |
| Milestones | M1, M2, M3b, M4, M5, M6 (M3 was superseded by M3b) |
| Product requirements | [PRD-07](product/PRD-07-ship.md) SHIP-FR-07 |
| Last updated | 2026-11-14 |

All data is synthetic. The buyer is Stark Industries and the suppliers carry Marvel comic-book company names; this
project is fan-made and not affiliated with Marvel.

## What v1.0 is

A static web app, with no backend and no build, that qualifies new suppliers and monitors approved ones. An agent
extracts evidence with citations from a supplier's packet, a deterministic engine scores it, a fixed rule names who
may sign, and a person decides. Six views: Today, Qualify, Compare, Monitor, Standards, Eval.

## Measured result

First Sonnet run (`claude-sonnet-5-5`, skill `af74a03`) on four unseen simulated worlds (101–104, pooled), answer
keys locked by hash before the run, published as measured:

| Measure | Result | Target | Verdict |
|---|---|---|---|
| Catch (planted gaps found) | 71/73 (97.3%) | ≥ 90% | PASS |
| False alarm (clean rows flagged) | 108/1079 (10.0%) | ≤ 5% | FAIL |
| Decision agreement | 30/36 (83.3%) | none | - |
| Citation match | 35/35 (100.0%) | none | - |

A separate Opus comparison run caught 73/73 with 0 false alarms. Every miss and false alarm is in
[EVAL.md](EVAL.md).

## Delivered, by milestone

The requirement IDs are each PRD's v1.0 scope. Where a requirement was changed or deferred, the PRD's own changelog
records it.

| Milestone | Delivered | Requirement IDs | Issues |
|---|---|---|---|
| M1 Product docs | PRDs, design spec, test plan, roadmap | OVR-FR-01…12, OVR-NFR-01…06 | #1–#14 |
| M2 Engine | `app/rubric.js`, `app/engine.js`: qualification scoring, knockouts, decision, routing with reasons, monthly scorecard, tiers, p-chart run rules; policy as data | QUAL-FR-01…15, QUAL-NFR-01…05, SCORE-FR-01…10, SCORE-NFR-01…02 | #15–#23 |
| M3b Simulated world | Seeded supplier simulation, Stark requirement sheets for 8 commodities, packets written by a different model, fact check, hash-locked answer keys; demo world plus eval worlds 101–104 | DATA-FR-01…13, DATA-NFR-01…02 | #66–#75 |
| M4 Agent | Extraction skill (state, value, citation), validator, RFI and audit-plan drafts, blind run, eval harness, `docs/EVAL.md` | AGENT-FR-01…12, AGENT-NFR-01 | #31–#36 |
| M5 Workbench UI | Today, Qualify (queue, detail, citation viewer, drafts), Compare, Monitor (tier table, p-chart, alerts), Standards (policy editor, impact, requirement sheets), Eval; Junior/Senior role switch; + New supplier by hand; sheet upload; accessibility and 390 px pass; synthetic-data labels | UIQ-FR-01…20, UIQ-NFR-01…02, UIM-FR-01…14, UIT-FR-01…08, UIC-FR-01…10, UIS-FR-01…14, UIS-NFR-01, UIE-FR-01…08, DS-FR-01…07, DS-NFR-01…03 | #37–#47, #76–#78, #107–#112 |
| M6 Ship | Scrub script, README, demo script, one-page handout, this release | SHIP-FR-01, -04, -05, -06, -07, SHIP-NFR-01 at release; SHIP-FR-02 and -03 (public repo, Pages) follow the merge to `main` | #48–#53 |

## Known limits

- The false-alarm target is missed (10.0% against ≤ 5%). All 108 are rows the key marks `verified` and the agent
  marked `assumed`.
- Hold-out traps were not run.
- Agent output is precomputed; the app does not call a model.
- `node --test` is verified on macOS arm64 with Node 26, which is what CI runs.
- Deferred to later releases: Draft SCAR (v1.1, PRD-08), the Quality Engineering Skills port (v1.2, PRD-09), showing
  an uploaded sheet's own part in Qualify detail, Today and Compare (#141), PDF sheet upload and employee logins
  (v2.0).

## Ship checklist

The checklist and its evidence are in the release pull request (`test → main`), per SHIP-AC-01. The live-link items
and the tag are ticked there after the merge.
