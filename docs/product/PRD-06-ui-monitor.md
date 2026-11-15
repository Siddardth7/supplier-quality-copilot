# PRD-06 — Workbench: Monitor view

| Field | Value |
|---|---|
| Status | Approved |
| Owner | Sid (SME) |
| Release | v1.0 (v1.1 adds "Draft SCAR") |
| Milestone | v1.0 · M5 Workbench UI |
| ID prefix | `UIM` |
| Specs referenced | `docs/SCORECARD.md`, PRD-02 output shape, `docs/product/DESIGN-SPEC.md`, PRD-10 (Today), PRD-12 (active policy) |
| Last updated | 2026-11-12 |

## 1. Problem

A monthly table shows where each supplier is now, but not where it's heading. The senior SQE needs one screen that answers "who do I escalate this week?" and shows the chart behind each answer, so a trend alert is believed rather than argued with.

## 2. Users and jobs

| Persona | Job to be done | How this view helps |
|---|---|---|
| Senior SQE | Pick this week's escalations | Suppliers ranked worst first, with an Escalate flag and its reason |
| Q&R director | See tier D suppliers and why | Tier, the metric that drove it, and the chart |
| Interview panel | See the run rule fire before DPPM looks bad | ACT-02's chart with the 7-point run highlighted, next to its DPPM cell that isn't Bad |

**User stories**
- US1: As a senior, I open Monitor and see every active supplier's tier, five metrics and active alerts on one table.
- US2: As a senior, I open ACT-02 and see the p-chart with p̄, the UCL and the run that triggered the alert.
- US3: As a presenter, I link straight to ACT-02's chart.

## 3. Goals and non-goals

**Goals**
- G1: Demo step 5 runs from this view alone.
- G2: Every alert type in PRD-02 has a visible representation.
- G3: The chart is usable by keyboard and screen reader, with a table alternative.

**Non-goals**
- NG1: Changing time ranges or the baseline. The frame is fixed by `SCORECARD.md`.
- NG2: Drilling down into individual lots.
- NG3: SCAR drafting (v1.1, PRD-08).

## 4. Requirements

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| UIM-FR-01 | The app must load `data/history.csv`, run the scorecard engine with `as_of` and the active policy (PRD-12: metric weights, Good/Watch/Bad limits, tier cut-offs), and render from its output only. A policy change re-grades the view without a reload | Must | manual check + review |
| UIM-FR-02 | The **tier table** must have one row per active supplier: ID, name, M18 composite, tier, the five M18 metric values with their band, active alert count and the Escalate flag | Must | manual check |
| UIM-FR-03 | Rows must sort by tier (Unrated first, then D, C, B, A), then composite ascending, then ID. Unrated rows show "Unrated" and the null metric. Ties on composite break by ID, so a tier A supplier with composite 100 sorts by ID | Must | manual check |
| UIM-FR-04 | **Escalate** must show when the tier is C or D or any alert is active. Its tooltip and accessible name give the reasons, e.g. "Tier C; scar_aging". Reasons: `Tier <C\|D>` first, then each distinct active alert type in engine order; `metric_bad` lists its metrics, e.g. `Tier C; scar_aging; metric_bad (repeat_nc, scar_aging)` | Must | manual check |
| UIM-FR-05 | Metric cells must show value and band (good / watch / bad) by text and color together. A `null` metric shows "—" with "no receipts" as its accessible name | Must | manual check |
| UIM-FR-06 | The **p-chart** must plot M1–M18 with the baseline shaded, a p̄ line and a per-month UCL step line; points above the UCL and points in an active or past `run7` run are marked in the alert color with a distinct shape | Must | manual check (ACT-02, ACT-03) |
| UIM-FR-07 | Each chart point must be focusable; focus or hover shows month, n, p and UCL. Arrow keys move between points | Must | manual check |
| UIM-FR-08 | A "Show as table" toggle must show the chart data as a table | Must | manual check |
| UIM-FR-09 | The **alert list** must show active alerts first, then past alerts newest first, each with type label, month and detail. Selecting an alert focuses its chart point | Must | manual check |
| UIM-FR-10 | The supplier detail must list open SCARs at M18 with ID, opened date and age, with ages over 60 days marked | Must | manual check (ACT-05) |
| UIM-FR-11 | Hash (DESIGN-SPEC §4.2): `#view=monitor&active=<id>` opens a supplier; `&month=<n>` focuses a chart point. Back and forward restore state | Must | manual check |
| UIM-FR-12 | Error states: a failed CSV fetch or a parse error shows the message and row; an unknown ID shows "Not found" and the table | Must | manual check |
| UIM-FR-13 | The detail must show a disabled **Draft SCAR** button with the line "Arrives in v1.1", in the place v1.1 fills, so v1.1 needs no layout change | Should | review |
| UIM-FR-14 | Every supplier flagged Escalate must also appear in Today's *Escalate this week* (PRD-10 UIT-FR-03), and the Monitor detail must link back to Today | Must | manual check |

**Alert representation**

| Type | Label | Chart | List |
|---|---|---|---|
| `ucl` | Above UCL | Point marked (alert color, triangle) | yes |
| `run7` | 7 in a row above p̄ | The run's points marked (alert color, ring) | yes |
| `tier_drop` | Tier drop | — | yes, "B → C" |
| `scar_aging` | SCAR > 60 days | — | yes, plus the SCAR row marked |
| `metric_bad` | `<metric>` bad | — | yes, plus the metric cell |

`ucl` and `run7` rows select their point; the other three types have no chart mark. A point that is both above the UCL and in a run shows both marks, the ring around the triangle. The Escalate reasons (UIM-FR-04) also show as visible text at the top of the alert list.

## 5. Interfaces

| Input | Shape |
|---|---|
| `data/history.csv` | `SCORECARD.md` |
| `data/suppliers.json` (`active`) | PRD-03 §5 |
| Engine | `scorecard(rows, { as_of })` (PRD-02 §5) |

| Hash key | Example | Effect |
|---|---|---|
| `active` | `#view=monitor&active=ACT-02` | Monitor view, supplier detail open |
| `month` | `&month=18` | Plus that chart point focused |
| `view` | `#view=monitor` | Monitor view, table only |

Monitor is one of the six header tabs (DESIGN-SPEC §4.1).

## 6. Acceptance criteria

- [ ] UIM-AC-01: Demo step 5: `#active=ACT-02` shows the run of 7 marked on the chart, an active `run7` alert, and a DPPM cell that isn't Bad. *(proves UIM-FR-06, -09, -11, G1)*
- [ ] UIM-AC-02: Every alert type in the representation table appears for at least one story supplier. *(proves G2)*
- [ ] UIM-AC-03: The table ranks the stories per UIM-FR-03, with ACT-01 unflagged and in the last rows (A tier, composite ascending, then ID). *(proves UIM-FR-02…-04)*
- [ ] UIM-AC-04: The chart can be operated by keyboard alone, and "Show as table" exposes the same numbers. *(proves UIM-FR-07, -08, G3)*
- [ ] UIM-AC-05: Each error state is triggered by hand and shows its message. *(proves UIM-FR-12)*

## 7. Open questions

| # | Question | Owner | Resolution |
|---|---|---|---|
| 1 | What should "Escalate" mean? | Sid | v1.0: tier C/D or any active alert. Tier D additionally means "to the director" (`SCORECARD.md`) |
| 2 | Draw the chart with SVG or canvas? | Sid | SVG: focusable points and accessible names without extra work |
| 3 | Monitor ↔ Qualify link for a supplier that is both active and bidding? (W7) | Sid | v2.0. No demo supplier is both, so v1.0 links Monitor ↔ Today and every escalation lands in Today (2026-11-11, M1) |

## 8. Out of scope

| Item | Picked up by |
|---|---|
| "Draft SCAR" button and panel | v1.1 (PRD-08) |
| Per-metric trend sparklines | Unscheduled |
| Monitor ↔ Qualify cross-link for a supplier that is both active and bidding | v2.0 |

## 9. Changelog

| Date | Change |
|---|---|
| 2026-11-12 | #107: Today imports the escalation flags and order via `monitorModel` (UIM-FR-14). No requirement text change. |
| 2026-11-12 | #45: UIM-FR-06 a point both above the UCL and in a run shows both marks (ring around triangle). UIM-FR-07 each point has a 24 px hit area (the chart scrolls inside its panel below 760 px) and Home / End go to the first / last plotted point. UIM-FR-09 only `ucl` and `run7` rows link to their point; the Escalate reasons show as text in the alerts panel. UIM-FR-11 `month` focuses the point, or that month's row in table mode. "Show as table" is local state, not a hash key. |
| 2026-11-12 | #44: Escalate reasons format (UIM-FR-04); composite ties break by ID, so ACT-03 (A, 100.0) sorts after ACT-01 and UIM-AC-03 no longer says "ACT-01 last" (UIM-FR-03). |
| 2026-11-11 | #76: the active policy grades the view (UIM-FR-01); escalations feed Today and the detail links back (UIM-FR-14, W7); the Draft SCAR slot is a disabled button (UIM-FR-13); hash keys move under `#view=`. |
| 2026-11-08 | First draft. |
