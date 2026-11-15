# PRD-11 — Workbench: Compare view

| Field | Value |
|---|---|
| Status | Approved |
| Owner | Sid (SME) |
| Release | v1.0 |
| Milestone | v1.0 · M5 Workbench UI |
| ID prefix | `UIC` |
| Specs referenced | `docs/RUBRIC.md` (decision rule), PRD-01 output shape, PRD-05, `docs/product/DESIGN-SPEC.md` |
| Last updated | 2026-11-12 |

## 1. Problem

When several suppliers bid for the same Stark part, Quality's job is to say which of them are acceptable. Sourcing then picks among those on cost, lead time and capacity. Opening each bidder one at a time in Qualify hides the comparison.

## 2. Users and jobs

| Persona | Job to be done | How this view helps |
|---|---|---|
| Senior SQE | Tell Sourcing who is acceptable for a part | Acceptable bidders ranked, the rest listed with their reason |
| Sourcing (reader) | See who they may pick from | One screen per part; no winner declared |
| Interview panel | See decision D4 (compare bidders) | The cold-plate part with three bidders |

**User stories**
- US1: As a senior, I pick the cold-plate part and see which of its three bidders are acceptable and why the third is not.
- US2: As either, I change the policy in Standards and the ranking follows.

## 3. Goals and non-goals

**Goals**
- G1: For any part, the acceptable bidders and the reason each other bidder is not acceptable are on one screen.
- G2: Every number comes from the engine under the active policy (OVR-FR-04).

**Non-goals**
- NG1: Declaring a winner, or weighing cost and lead time against quality. Sourcing decides.
- NG2: Comparing suppliers across different parts.

## 4. Requirements

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| UIC-FR-01 | A part picker must list every Stark part that has at least one candidate (dataset or hand-entered), each with its bidder count. It opens on the part with the most bidders, then by part number | Must | manual check |
| UIC-FR-02 | **Acceptable** bidders are APPROVED and CONDITIONAL. They must be shown first, APPROVED before CONDITIONAL, each group by score descending under the active policy, then by ID | Must | manual check |
| UIC-FR-03 | A CONDITIONAL bidder must read "with conditions" and list its open RFI items (the engine's `rfi_items`) | Must | manual check |
| UIC-FR-04 | NOT APPROVED bidders must be listed below the acceptable ones with the reason: the failed knockout's requirement name, or "Below pass mark <conditional>" from the active policy | Must | manual check |
| UIC-FR-05 | Each bidder column must show decision badge, score, who signs (Junior / Senior), category bars as a percentage of each category's weight, the two biggest problems, and an **Open in Qualify ↗** link to `#view=qualify&supplier=<id>`. Hand-entered bidders carry the **Entered by hand** tag | Must | manual check |
| UIC-FR-06 | Up to three bidder columns sit side by side; more scroll horizontally inside the panel; at 390 px they stack | Must | manual check at each width |
| UIC-FR-07 | A part with one bidder must read "Only one bidder for this part" and show that bidder's column | Must | manual check |
| UIC-FR-08 | The view must show the line "Quality decides who is acceptable. Sourcing picks among them." and must not mark any bidder as the winner | Must | review |
| UIC-FR-09 | A **Stark requirement sheet ↗** link must open the part's sheet in Standards (`#view=standards&sheet=<part>`) | Must | manual check |
| UIC-FR-10 | Changing the active policy must re-rank without a reload | Must | manual check |

## 5. Interfaces

| Input | Shape |
|---|---|
| Candidates and their parts | `data/suppliers.json` (PRD-03 §5) and hand-entered suppliers (PRD-05 §5) |
| Engine results | `evaluate(...)` per candidate under the active policy (PRD-01 §5) |

| Hash | Effect |
|---|---|
| `#view=compare` | Compare, default part |
| `#view=compare&part=<part number>` | Compare on that part |

## 6. Acceptance criteria

- [ ] UIC-AC-01: The demo cold-plate part shows SUP-09 (APPROVED) first, SUP-07 (CONDITIONAL, with its RFI items) second, and SUP-01 below as NOT APPROVED with its failed knockout named. *(proves UIC-FR-02…-05)*
- [ ] UIC-AC-02: A single-bidder part shows the one-bidder message. *(proves UIC-FR-07)*
- [ ] UIC-AC-03: Raising the APPROVED pass mark in Standards moves a bidder from APPROVED to CONDITIONAL and re-orders the columns. *(proves UIC-FR-02, -10)*
- [ ] UIC-AC-04: At 390 px the columns stack with no horizontal page scroll. *(proves UIC-FR-06)*
- [ ] UIC-AC-05: No element marks a winner; the Sourcing line is present. *(proves UIC-FR-08)*

## 7. Open questions

| # | Question | Owner | Resolution |
|---|---|---|---|
| 1 | Rank bidders? (W3) | Sid | Yes, by score under the active policy (2026-11-09) |
| 2 | Is CONDITIONAL acceptable, and does pure score order apply? | Sid | Acceptable = APPROVED and CONDITIONAL; APPROVED first, then CONDITIONAL, each by score. A claimed knockout caps at CONDITIONAL even with a high score (2026-11-11, C2, C3) |

## 8. Out of scope

| Item | Picked up by |
|---|---|
| Cost, lead-time or capacity trade-offs | Sourcing; not this product |
| Cross-part comparison | Unscheduled |

## 9. Changelog

| Date | Change |
|---|---|
| 2026-11-12 | Issue 109: UIC-AC-03 verified live (TEST-PLAN L5 Compare, decisions 95, 121); the box stays as written like the others. |
| 2026-11-12 | #108 built; UIC-AC-03 live check waits for issue 109 (decision 95). Bidders are grouped by the requirement sheet's part number; unscored bidders are counted and listed in a NOT SCORED band, never ranked (decisions 96, 98). Unit tests in `app/compare.test.js`. The headless QA run verified UIC-AC-01, -02, -04 and -05 (TEST-PLAN L5 Compare); like the other PRDs, these boxes stay as written, and UIC-AC-03 stays open until issue 109. |
| 2026-11-11 | First draft (#76), from W3 and Sid's section 3 decisions. |
