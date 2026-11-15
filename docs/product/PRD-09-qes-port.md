# PRD-09 — Port to Quality Engineering Skills

| Field | Value |
|---|---|
| Status | Approved |
| Owner | Sid (SME) |
| Release | v1.2 |
| Milestone | v1.2 · M8 QES port |
| ID prefix | `QES` |
| Specs referenced | `docs/RUBRIC.md`, `docs/SCORECARD.md`; in the QES repo: `CONTRIBUTING.md`, `docs/DEFINITION_OF_DONE.md`, `skills/README.md`, `skills/supplier-scar`, `packages/quality-core/src/quality_core/sqe` |
| Last updated | 2026-11-08 |

## 1. Problem

The qualification rubric and engine are useful beyond this demo. Quality Engineering Skills (QES) is a released, tested catalog of quality-engineering skills backed by deterministic engines on an MCP server. It has supplier SCAR and vendor rating (`quality_core.sqe`, `/supplier-scar`) but no supplier qualification. Porting the engine there turns a demo into a reusable tool and shows the same method holds under a stricter repo's gates.

## 2. What QES requires (read from the QES repo, 2026-11-08)

- Python, a uv workspace monorepo. Engines go in `packages/quality-core` and are exposed as tools in `packages/quality-mcp`. Skills (`skills/<name>/SKILL.md`) hold the reasoning only; every number comes from an engine.
- Gates: `ruff`, `mypy`, `pip-audit`, **100% line and branch coverage** on new modules and on `quality-mcp`, green governance tests, and a `CHANGELOG.md` entry, all in the same PR. Branches come off `origin/test`.
- Every constant and threshold is cited in the domain's `ASSUMPTIONS_LOG.md` and `CITATIONS.tsv` against the licensed manual. A threshold with no standards basis is labeled `is_heuristic: true`.
- Missing data is undecided, never zero (`INDETERMINATE`), and a positively-weighted undecided dimension suppresses the composite.
- New domains are proposed first as a Task Issue in QES.

## 3. Goals and non-goals

**Goals**
- G1: A `/supplier-qualification` skill on a new `quality_core.supqual` engine that gives the same output as this repo's JS engine on all 8 reference extractions.
- G2: The scorecard additions QES lacks (escape rate, repeat NC rate, SCAR aging) added to `quality_core.sqe`, not as a parallel scorecard.
- G3: QES CI green, and tagged here as `v1.2`.

**Non-goals**
- NG1: A second vendor scorecard. QES already has `calculate_vendor_scorecard`, so this repo's composite is not ported as a competing one.
- NG2: Porting the web workbench. QES renders with its own canvas tools.
- NG3: Porting the agent or the eval. The skill is the QES-native replacement for `agent/SKILL.md`.

## 4. Requirements

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| QES-FR-01 | Open a QES Task Issue proposing the `supqual` domain and the `sqe` additions before any code | Must | issue link |
| QES-FR-02 | `quality_core.supqual` must implement `RUBRIC.md` v1 (criteria, value types, knockouts, decision, routing, gaps, RFI items, audit focus) as data-driven Python | Must | QES tests |
| QES-FR-03 | A golden test must run all 8 reference extractions through the Python engine and match this repo's JS engine output field for field | Must | golden test |
| QES-FR-04 | A `quality-mcp` tool `evaluate_supplier_qualification` must expose the engine, with every threshold in its payload labeled with its basis (`AIAG` or `is_heuristic: true`) | Must | QES tests |
| QES-FR-05 | `skills/supplier-qualification/SKILL.md` must follow `skills/_template`, extract evidence in the PRD-04 schema, and route all scoring through the tool | Must | QES governance tests |
| QES-FR-06 | `quality_core.sqe` must gain escape rate, repeat NC rate and SCAR aging per `SCORECARD.md`, as optional scorecard dimensions | Should | QES tests |
| QES-FR-07 | `ASSUMPTIONS_LOG.md` and `CITATIONS.tsv` must cover every threshold. The Cpk and Gage R&R bars cite the AIAG manuals; everything else is logged as a heuristic | Must | QES governance tests |
| QES-NFR-01 | All QES gates must be green in the port PR | Must | QES CI |

## 5. Constraints this puts on v1.0 (recorded in PRD-01 / PRD-02)

| Constraint | Where recorded |
|---|---|
| Engine is pure, imports no DOM, and outputs plain JSON, so the port can be golden-tested against it | QUAL-NFR-01/02, PRD-02 §5 |
| Rubric lives as data (`app/rubric.js`), so it translates to Python tables | QUAL-NFR-03 |
| Thresholds carry a basis: AIAG practice for Cpk and Gage R&R, project heuristic for the rest | `RUBRIC.md` "Basis of thresholds", PRD-02 §5 |
| A null scorecard metric makes the composite Unrated, not reweighted | `SCORECARD.md`, SCORE-FR-05 |
| The extraction schema is the skill's output format | PRD-04 §5 |

## 6. Acceptance criteria

- [ ] QES-AC-01: The QES Task Issue is accepted. *(proves QES-FR-01)*
- [ ] QES-AC-02: The golden test passes for all 8 suppliers. *(proves QES-FR-02, -03, G1)*
- [ ] QES-AC-03: The QES PR is merged into QES `test` with CI green. *(proves QES-FR-04…-07, QES-NFR-01, G2, G3)*
- [ ] QES-AC-04: `v1.2` is tagged in this repo, and its release notes link the QES PR. *(proves G3)*

## 7. Open questions

| # | Question | Owner | Resolution |
|---|---|---|---|
| 1 | The roadmap planned a separate `supplier-scorecard` skill (M8.3). QES `supplier-scar` already does vendor rating. Should we drop M8.3 and extend `sqe` instead? | Sid | **Recommended: yes.** Refine M8.3 in #14 into "extend `quality_core.sqe`" |
| 2 | Is the p-chart run rule already covered by QES `spc-control-charts`? | Sid | Check in M8.1. If so, reuse it and don't port the rule |

## 8. Out of scope

| Item | Picked up by |
|---|---|
| Excel export for qualification | A QES follow-up, if wanted |
| Workbench port | Not planned |

## 9. Changelog

| Date | Change |
|---|---|
| 2026-11-08 | First draft, from a read of the QES repo at `v1.1.1`. |
