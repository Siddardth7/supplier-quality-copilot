# PRD-10 — Workbench: Today view

| Field | Value |
|---|---|
| Status | Approved |
| Owner | Sid (SME) |
| Release | v1.0 |
| Milestone | v1.0 · M5 Workbench UI |
| ID prefix | `UIT` |
| Specs referenced | `docs/product/DESIGN-SPEC.md`, PRD-05 (Qualify), PRD-06 (Monitor), PRD-01 and PRD-02 output shapes |
| Last updated | 2026-11-12 |

## 1. Problem

The SQE team has two queues: new suppliers waiting for sign-off and active suppliers drifting out of spec. Each lives in its own tab. Nobody should have to open both tabs to learn what needs attention. The real-world goal is one shared quality dashboard (ROADMAP 2026-11-09). In v1.0 that is a landing page built from the same engine output as the tabs.

## 2. Users and jobs

| Persona | Job to be done | How this view helps |
|---|---|---|
| Junior SQE | Start the day on what they may sign | *Needs you* lists only qualifications routed to Junior when viewing as Junior |
| Senior SQE | See sign-offs and escalations together | *Needs you* plus *Escalate this week* on one screen |
| Interview panel | Understand the product in ten seconds | The intro line and the counts frame every other tab |

**User stories**
- US1: As a senior, I open the app and see which qualifications need my sign-off and which active suppliers to escalate, worst first.
- US2: As a junior, I switch *Viewing as* to Junior and *Needs you* shrinks to what I may sign.
- US3: As either, I click an item and land on its evidence in Qualify or on its chart in Monitor.

## 3. Goals and non-goals

**Goals**
- G1: Every active alert and every pending qualification reaches Today. Nothing needs both tabs.
- G2: Every number comes from the engine (OVR-FR-04).

**Non-goals**
- NG1: A live calendar or "this week" computed from the clock. Data is a monthly snapshot at a fixed `as_of`. Daily feeds are v2.0.
- NG2: Assigning, snoozing or closing items. Today reads; it doesn't record work.

## 4. Requirements

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| UIT-FR-01 | The app must open on Today when the hash names no view. Today shows a short intro line (the product in one sentence) and the snapshot date: "as of 2026-11-01 · M18", from `as_of` | Must | manual check + unit test (`app/today.test.js`) |
| UIT-FR-02 | **Needs you** must list every candidate, including hand-entered ones (PRD-05 UIQ-FR-16), whose routing matches the current *Viewing as* role (Senior sees Junior and Senior items). Each item shows ID, name, part, decision and score, and a NOT APPROVED item adds its reason (the same text as the Qualify card, PRD-05 UIQ-FR-02), ordered NOT APPROVED → CONDITIONAL → APPROVED, then by ID. Unscored candidates are not listed (they have no routing); the *Needs you* panel notes how many are not scored | Must | manual check + unit test (`app/today.test.js`) |
| UIT-FR-03 | **Escalate this week** must list every active supplier PRD-06 flags Escalate (grade C/D or an active alert), with grade, composite and the alert reasons in plain words (PRD-06 UIM-FR-04 Escalation reasons), in PRD-06's table order (UIM-FR-03) | Must | manual check + unit test (`app/today.test.js`) |
| UIT-FR-04 | **Queue counts** must show candidates by decision (NOT APPROVED, CONDITIONAL, APPROVED) and by routing (Junior, Senior), and active suppliers by grade (Unrated, D, C, B, A). Counts cover every candidate and every active supplier regardless of *Viewing as* | Must | manual check + unit test (`app/today.test.js`) |
| UIT-FR-05 | Activating a *Needs you* item must open Qualify on that supplier (`#view=qualify&supplier=<id>`); an *Escalate* item must open Monitor on that supplier (`#view=monitor&active=<id>`). Back returns to Today | Must | manual check + unit test (`app/today.test.js`) |
| UIT-FR-06 | Today must follow the active policy and role from the header: changing either re-renders the lists and counts | Must | manual check + unit test (`app/today.test.js`) |
| UIT-FR-07 | Empty state: when *Needs you* has no items it reads "Nothing needs you today."; when *Escalate* has none it reads "No escalations this month." The counts still show | Must | manual check + unit test (`app/today.test.js`) |
| UIT-FR-08 | A failed load of either data source shows that section's error (path and message) and still renders the other section | Must | manual check + unit test (`app/today.test.js`) |

## 5. Interfaces

| Input | Shape |
|---|---|
| Qualify engine results | `evaluate(...)` per candidate (PRD-01 §5), the same results Qualify renders |
| Monitor engine results | `scorecard(rows, { as_of, policy })` (PRD-02 §5) |
| Header state | active policy, *Viewing as* role (DESIGN-SPEC §4.1) |

| Hash | Effect |
|---|---|
| `#` or `#view=today` | Today |
| `#view=today&role=junior` | Today, viewing as Junior |

## 6. Acceptance criteria

- [ ] UIT-AC-01: With no hash, the app opens on Today showing the three sections and the snapshot date. *(proves UIT-FR-01, -04)*
- [ ] UIT-AC-02: Viewing as Senior, *Needs you* lists every candidate; as Junior, only the Junior-routed ones (SUP-04 in the demo world). *(proves UIT-FR-02, -06)*
- [ ] UIT-AC-03: *Escalate this week* lists exactly the suppliers Monitor flags, in Monitor's order, and ACT-01 is absent. *(proves UIT-FR-03)*
- [ ] UIT-AC-04: Clicking an item in each list lands on its supplier in the right tab, and Back returns to Today. *(proves UIT-FR-05)*
- [ ] UIT-AC-05: Switching to a policy that changes a decision or a grade updates Today without a reload. *(proves UIT-FR-06)*
- [ ] UIT-AC-06: Each empty and error state is triggered by hand and shows its message. *(proves UIT-FR-07, -08)*

## 7. Open questions

| # | Question | Owner | Resolution |
|---|---|---|---|
| 1 | What does Today show? | Sid | Needs you, Escalate this week, queue counts (2026-11-11, T1) |
| 2 | "This week" with monthly data? | Sid | Label the snapshot "as of 2026-11-01 · M18"; no live calendar (T2) |

## 8. Out of scope

| Item | Picked up by |
|---|---|
| Daily feeds, a live "this week" | v2.0 Live |
| Assigning or closing triage items | Unscheduled |

## 9. Changelog

| Date | Change |
|---|---|
| 2026-11-17 | Issue 162 plain-language labels: UIT-FR-02 adds the NOT APPROVED reason line (decision 230); UIT-FR-03 reasons are plain words from PRD-06 (decision 233). Acceptance boxes unchanged. |
| 2026-11-12 | Issue 109: UIT-AC-05 verified live (TEST-PLAN L5 Today, decisions 94, 121); the box stays as written like the others. |
| 2026-11-12 | #107: UIT-FR-02 unscored candidates are not listed, only counted in a note (decision 88); UIT-FR-04 counts ignore *Viewing as* (decision 89). Verified by adds `app/today.test.js`. |
| 2026-11-11 | First draft (#76), from the approved walk-through (W5, W7) and Sid's section 1 decisions. |
