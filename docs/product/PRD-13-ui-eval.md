# PRD-13 — Workbench: Eval view

| Field | Value |
|---|---|
| Status | Approved |
| Owner | Sid (SME) |
| Release | v1.0 |
| Milestone | v1.0 · M5 Workbench UI |
| ID prefix | `UIE` |
| Specs referenced | PRD-04 §5 (eval definitions), AGENT-FR-07…10, `docs/EVAL.md` (#36), `docs/product/DESIGN-SPEC.md` |
| Last updated | 2026-11-13 |

## 1. Problem

The agent reads documents. A panel will ask how often it gets them right. The answer is the measured eval: catch rate, false alarms, decision agreement, citation accuracy and hold-out traps. Today it lives in a Markdown report. The demo should end on that proof, inside the product, with every miss one click from its document.

## 2. Users and jobs

| Persona | Job to be done | How this view helps |
|---|---|---|
| Interview panel | Decide whether to trust the agent | Headline numbers from blind runs, every miss with its document |
| Senior SQE | Know what a human reviewer still has to catch | The miss and partial list, with reasons |

**User stories**
- US1: As a panelist, I open Eval and see the catch rate on worlds 101–104, false alarms and decision agreement from the first complete run.
- US2: As a panelist, I click a miss and see the supplier document the agent got wrong.
- US3: As a panelist, I see every run, including re-tests and the Opus comparison, not only the best one.

## 3. Goals and non-goals

**Goals**
- G1: The numbers on screen are exactly the numbers `eval.mjs` produced for the published runs.
- G2: Every miss and partial is listed and links to its document.

**Non-goals**
- NG1: Running the eval in the browser.
- NG2: Placeholder or example numbers. Before the first run, the view says no run is published.

## 4. Requirements

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| UIE-FR-01 | The view must read `data/eval.json`, the committed output of `node agent/eval.mjs --json` for every published run (AGENT-FR-08), and render from it only. No number is typed into the page | Must | review + manual check |
| UIE-FR-02 | The headline must show, for the first complete run on `claude-sonnet-5-5`: the catch rate pooled over worlds 101–104, the false-alarm rate on clean items, decision agreement and citation accuracy. Each shows its counts (e.g. "94% · 34 of 36") and its PRD-04 target with PASS, FAIL or INCOMPLETE | Must | manual check |
| UIE-FR-03 | A per-world table must show worlds 101–104 with catches, partials, misses, false alarms and decision agreement. The demo world and Sid's hold-out traps (#75) each get their own row, outside the pooled headline (AGENT-FR-10) | Must | manual check |
| UIE-FR-04 | A run list must show every published run (model, date, skill git SHA, worlds) in the order run, including the Opus comparison and any re-test on worlds 105–108. The headline never switches to a later or better run (AGENT-FR-09) | Must | manual check |
| UIE-FR-05 | The miss list must show every miss, partial and false alarm of the selected run: world, supplier, criterion, expected state and value, found state and value. The written reason for each lives in `docs/EVAL.md`, and the list links there | Must | manual check |
| UIE-FR-06 | Activating a miss must open that world's packet in the citation viewer (PRD-05 UIQ-FR-09) at the answer key's cited section; a miss with no expected citation opens the packet's file list. Only a `world` + `supplier` pair present as a miss in `data/eval.json` opens; any other pair in the hash shows "Not found" (issue 163). The viewer shows numbers rounded to 3 decimals (PRD-05 UIQ-FR-09), so it is a rounded copy of the file | Must | manual check |
| UIE-FR-07 | With no `data/eval.json`, the view must read "No published run yet", explain the method in two sentences, and show no numbers | Must | manual check |
| UIE-FR-08 | The view must link to `docs/EVAL.md` for the full write-up | Must | manual check |

## 5. Interfaces

| Input | Shape |
|---|---|
| `data/eval.json` | `{ runs: [ <eval.mjs --json output> ... ] }`, one entry per published run, oldest first |
| World packets | `data/worlds/<n>/packets/<id>/*.md`, fetched on demand by the citation viewer |

| Hash | Effect |
|---|---|
| `#view=eval` | Eval, first run |
| `#view=eval&run=<n>` | Eval, that run selected for the miss list |
| `#view=eval&run=<n>&world=<w>&supplier=<id>&doc=<file>&sec=<s>` | That miss's packet file open in the citation viewer at the cited section; without `doc`/`sec`, the packet's file list (issue 111) |

## 6. Acceptance criteria

- [ ] UIE-AC-01: Every number on the view matches `eval.mjs --json` for the same run. A test diffs the rendered values against the file. *(proves UIE-FR-01, -02, G1)*
- [ ] UIE-AC-02: The demo world and the hold-out traps appear in their own rows, outside the headline. *(proves UIE-FR-03)*
- [ ] UIE-AC-03: With two runs published, the headline stays on the first and the list shows both. *(proves UIE-FR-04)*
- [ ] UIE-AC-04: Each miss opens its packet section in the citation viewer. *(proves UIE-FR-05, -06, G2)*
- [ ] UIE-AC-05: With `data/eval.json` absent, the empty state shows and no number appears. *(proves UIE-FR-07)*

## 7. Open questions

| # | Question | Owner | Resolution |
|---|---|---|---|
| 1 | Show placeholder numbers before M4 runs? | Sid | No: "No published run yet" (2026-11-11, E2) |
| 2 | Which run is the headline? | Sid | The first complete Sonnet run; every later run listed (E3, AGENT-FR-09) |

## 8. Out of scope

| Item | Picked up by |
|---|---|
| Running the eval or re-scoring in the browser | Unscheduled |

## 9. Changelog

| Date | Change |
|---|---|
| 2026-11-17 | Issue 163: UIE-FR-06 opens only a pair that is a miss in `data/eval.json`; any other typed pair shows "Not found" (decision 242). The viewer now shows a rounded copy of a packet number (3 decimals) whose Eval row's Found cell still shows the raw value (decisions 240, 241). Acceptance boxes unchanged. |
| 2026-11-14 | `data/eval.json` and `docs/EVAL.md` now exist (issue 36), so the view shows the published runs and its EVAL.md link resolves. No requirement changes; the acceptance boxes stay as written. |
| 2026-11-13 | Issue 111 built UIE-FR-01…08 (decisions 137–144). §5 adds the miss-link hash (`world` + `supplier`, DESIGN-SPEC 4.2). Miss rows in `eval.mjs --json` now carry the answer key's `expected_citation` (PRD-04), so the view links the key's section without reading the answer key. The headline is the first complete Sonnet run, else the first Sonnet run shown INCOMPLETE; decision agreement and citation accuracy have no PRD-04 target and say "no target". `data/eval.json` and `docs/EVAL.md` do not exist yet (#36): the shipped view shows "No published run yet" and its EVAL.md link 404s until then. Tests use hand-made reports built by the real `buildReport` (`app/eval.testkit.js`). The acceptance boxes stay as written. |
| 2026-11-11 | First draft (#76), from the eval decisions (2026-11-09) and Sid's section 4 decisions. |
