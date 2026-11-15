# Documentation index

Docs are the spec. Code that disagrees with an **Approved** doc is a bug. If a doc needs to change, change it in the same commit as the code.

## Conventions

**Two kinds of doc**
- **PRDs** (`docs/product/`) say *what* a feature must do and *how we know it does*. They follow [`_TEMPLATE.md`](product/_TEMPLATE.md).
- **Specs** (`docs/*.md`) hold the exact rules, numbers and schemas a PRD points to. Numbers live in exactly one place, the spec, and PRDs link to them instead of copying.

**Status lifecycle**: `Draft` → `In review` → `Approved`. Only Approved docs can generate milestone issues (see #14). Changing an Approved doc means bumping it back to `In review` and adding a changelog line.

**Requirement IDs**: `<PREFIX>-<KIND>-<nn>`, where KIND is one of:
- `FR`: functional requirement
- `NFR`: non-functional requirement (performance, accessibility, reproducibility, policy)
- `AC`: acceptance criterion; each one cites the FR/NFR IDs it proves

IDs never get reused or renumbered. A dropped requirement is struck through and stays in the table.

**Traceability**: requirement → milestone issue → test or evidence, tracked in [`TEST-PLAN.md`](product/TEST-PLAN.md). Commits and issues cite requirement IDs.

## Product docs

| Doc | Prefix | Release | Milestone | Issue | Status |
|---|---|---|---|---|---|
| [PRD-00 Product overview](product/PRD-00-overview.md) | `OVR` | v1.0 | M1 | #2 | Approved (updated in #76) |
| [PRD-01 Qualification scoring engine](product/PRD-01-qualification-engine.md) | `QUAL` | v1.0 | M2 | #3 | Approved |
| [PRD-02 Supplier scorecard & alerts](product/PRD-02-scorecard.md) | `SCORE` | v1.0 | M2 | #4 | Approved |
| [PRD-03 Synthetic dataset](product/PRD-03-dataset.md) | `DATA` | v1.0 | M3b | #5 | Approved |
| [PRD-04 Evidence extraction agent & eval](product/PRD-04-agent.md) | `AGENT` | v1.0 | M4 | #6 | Approved |
| [PRD-05 Workbench: Qualify view](product/PRD-05-ui-qualify.md) | `UIQ` | v1.0 | M5 | #7 | Approved (updated in #76) |
| [PRD-06 Workbench: Monitor view](product/PRD-06-ui-monitor.md) | `UIM` | v1.0 | M5 | #8 | Approved (updated in #76) |
| [DESIGN-SPEC UI design contract](product/DESIGN-SPEC.md) | `DS` | v1.0 | M5 | #9 | Approved (updated in #76) |
| [PRD-10 Workbench: Today view](product/PRD-10-ui-today.md) | `UIT` | v1.0 | M5 | #76 | Approved |
| [PRD-11 Workbench: Compare view](product/PRD-11-ui-compare.md) | `UIC` | v1.0 | M5 | #76 | Approved |
| [PRD-12 Workbench: Standards view](product/PRD-12-ui-standards.md) | `UIS` | v1.0 | M5 | #76 | Approved |
| [PRD-13 Workbench: Eval view](product/PRD-13-ui-eval.md) | `UIE` | v1.0 | M5 | #76 | Approved |
| [PRD-07 Release & distribution](product/PRD-07-ship.md) | `SHIP` | v1.0 | M6 | #10 | Approved |
| [PRD-08 SCAR drafting](product/PRD-08-scar.md) | `SCAR` | v1.1 | M7 | #11 | Approved |
| [PRD-09 QES port](product/PRD-09-qes-port.md) | `QES` | v1.2 | M8 | #11 | Approved |
| [TEST-PLAN & traceability](product/TEST-PLAN.md) | — | all | M1 | #12 | Approved |

## Specs

| Spec | Used by | Status |
|---|---|---|
| [RUBRIC.md](RUBRIC.md) qualification rubric | PRD-01, PRD-03, PRD-04 | v1, reconciled in #3 |
| [SCORECARD.md](SCORECARD.md) scorecard math | PRD-02, PRD-03, PRD-06 | v1, reconciled in #4 |
| [DATASET.md](DATASET.md) synthetic dataset | PRD-03, PRD-04 | v1, simulated-world targets |
| [SIMULATION.md](SIMULATION.md) supplier simulation | PRD-03, PRD-04 | Draft |

## Project docs

| Doc | Purpose |
|---|---|
| [ROADMAP.md](ROADMAP.md) | Releases, milestones, workflow, decisions log (#13) |
| [DEMO.md](DEMO.md) | The 3-minute demo script (issue 51): a deep link, what to say and a time per step |
| [RELEASE-v1.0.md](RELEASE-v1.0.md) | v1.0 release notes: delivered requirement IDs per milestone, the measured result, known limits |
| [HANDOUT.md](HANDOUT.md) | One-page interview handout (issue 52). `node scripts/handout.mjs` prints it to [HANDOUT.pdf](HANDOUT.pdf) and fails unless it is one page |
| [EVAL.md](EVAL.md) | Published eval results (issue 36): catch rate, false alarms, every miss, run metadata |
| [BLIND-RUN.md](BLIND-RUN.md) | Runbook for the issue 33 blind extraction run: the runner's assignment, kit and collection |
| [DECISIONS-PENDING-REVIEW.md](DECISIONS-PENDING-REVIEW.md) | Product and look decisions Claude defaulted while shipping without Sid; for Sid to mark ✓ or ✗ |
| [IDEA.md](IDEA.md) | Superseded by PRD-00; pointer only |
