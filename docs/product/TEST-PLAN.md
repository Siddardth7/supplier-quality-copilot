# TEST-PLAN — Test & acceptance plan

| Field | Value |
|---|---|
| Status | Approved |
| Owner | Sid (SME) |
| Release | v1.0 (covers v1.1 and v1.2 requirements too) |
| Milestone | v1.0 · M1 Product docs |
| Specs referenced | every PRD in `docs/product/` |
| Last updated | 2026-11-13 |

## 1. Test levels

| Level | What it proves | Where | How it runs |
|---|---|---|---|
| **L1 Engine unit** | Every rubric and scorecard rule, edge and error case | `app/*.test.js` | `node --test` |
| **L2 Parity** | `app/rubric.js` matches the `RUBRIC.md` and `SCORECARD.md` tables | `app/parity.test.js` | `node --test` |
| **L3 Dataset** | Answer key valid; reference extractions give the expected decisions; generator deterministic; ACT stories hold | `data/*.test.mjs` | `node --test` |
| **L4 Agent** | Schema validator, eval math, blind-run audit, draft consistency | `agent/*.test.mjs` + `agent/stage.mjs --audit` | `node --test` + run logs |
| **L5 UI manual** | PRD-05 / PRD-06 behaviors and the DESIGN-SPEC a11y checklist, at 1280 px and 390 px | `docs/product/TEST-PLAN.md` §4 | by hand, results ticked in the PR |
| **L6 Release** | PRD-07 ship checklist | release PR | by hand + `scripts/scrub.mjs` |
| **Review** | Requirements that are about code shape (pure, no deps, tokens only) | every PR | reviewer agent + Sid |

`node --test` with no arguments, run from the repo root, picks up every `*.test.js` / `*.test.mjs` file. It must pass on every PR into `test`.

### Rules for tests

- Each new test must be shown to fail when the logic it covers is broken (the `/ship` tester's mutation check).
- Expected numbers in tests come from the docs, never from running the code and copying the output.
- Story and decision tests read the real data files; unit tests use small hand-made inputs written in the test.

## 2. Definition of done (per issue)

1. The requirement IDs in the issue are implemented, and their tests (or manual checks) are in the PR.
2. `node --test` passes.
3. Doc and code agree; if a rule changed, the doc changed in the same PR.
4. The reviewer verdict is SHIP.
5. The PR says `Closes #N` and lists the requirement IDs it delivers.

## 3. Traceability matrix

Every FR / NFR in PRD-00…13 and DESIGN-SPEC (196 live requirements; 2 dropped rows kept struck). "Issue" is the M2–M8 issue that delivers it; #14 refines these.

| ID | Doc | Priority | Verified by | Issue |
|---|---|---|---|---|
| `OVR-FR-01` | PRD-00 | Must | PRD-05 acceptance | #37–#43, #77 |
| `OVR-FR-02` | PRD-00 | Must | PRD-06 acceptance | #44, #45 |
| `OVR-FR-03` | PRD-00 | Must | PRD-05/06/10–13 acceptance | #38 |
| `OVR-FR-04` | PRD-00 | Must | PRD-01/02 tests + review | #15–#23 |
| `OVR-FR-05` | PRD-00 | Must | PRD-04 schema validator | #32 |
| `OVR-FR-06` | PRD-00 | Must | PRD-04 eval + `docs/EVAL.md` | #33–#36 |
| `OVR-FR-07` | PRD-00 | Must | PRD-05/06/08 acceptance | #43, #55 |
| `OVR-FR-08` | PRD-00 | Must | PRD-10 acceptance + unit test (`app/today.test.js`) | #107 |
| `OVR-FR-09` | PRD-00 | Must | PRD-11 acceptance | #108 |
| `OVR-FR-10` | PRD-00 | Must | PRD-12 acceptance | #109, #110, #78 |
| `OVR-FR-11` | PRD-00 | Must | PRD-13 acceptance | #111 |
| `OVR-FR-12` | PRD-00 | Must | PRD-05 / PRD-10 acceptance | #112 |
| `OVR-NFR-01` | PRD-00 | Must | PRD-07 ship checklist | #47, #48 |
| `OVR-NFR-02` | PRD-00 | Must | PRD-07 scrub audit | #48 |
| `OVR-NFR-03` | PRD-00 | Must | Review + PRD-07 | #49 |
| `OVR-NFR-04` | PRD-00 | Must | PRD-03 test | #67, #74 |
| `OVR-NFR-05` | PRD-00 | Must | DESIGN-SPEC checklist | #46 |
| `OVR-NFR-06` | PRD-00 | Must | Reviewer gate on every PR | every PR (reviewer gate) |
| `QUAL-FR-01` | PRD-01 | Must | unit test (every criterion, every band) | #16 |
| `QUAL-FR-02` | PRD-01 | Must | unit test | #16 |
| `QUAL-FR-03` | PRD-01 | Must | unit test | #16, #17 |
| `QUAL-FR-04` | PRD-01 | Must | unit test per edge | #16 |
| `QUAL-FR-05` | PRD-01 | Must | unit test | #17 |
| `QUAL-FR-06` | PRD-01 | Must | unit test | #17 |
| `QUAL-FR-07` | PRD-01 | Must | unit test | #17 |
| `QUAL-FR-08` | PRD-01 | Must | unit test + reference-extraction test | #18 |
| `QUAL-FR-09` | PRD-01 | Must | unit test | #19 |
| `QUAL-FR-10` | PRD-01 | Must | unit test | #19 |
| `QUAL-FR-11` | PRD-01 | Must | unit test | #19 |
| `QUAL-FR-12` | PRD-01 | Must | unit test | #16 |
| `QUAL-FR-13` | PRD-01 | Must | unit test | #23 |
| `QUAL-FR-14` | PRD-01 | Must | unit test | #15, #17 |
| `QUAL-FR-15` | PRD-01 | Must | unit test | #23 |
| `QUAL-NFR-01` | PRD-01 | Must | review + determinism test | #23 |
| `QUAL-NFR-02` | PRD-01 | Must | review | #23 |
| `QUAL-NFR-03` | PRD-01 | Must | parity test | #15 |
| `QUAL-NFR-04` | PRD-01 | Must | unit test | #15 |
| `QUAL-NFR-05` | PRD-01 | Must | integrity test + scale test | #15 |
| `SCORE-FR-01` | PRD-02 | Must | unit test | #20 |
| `SCORE-FR-02` | PRD-02 | Must | unit test | #20 |
| `SCORE-FR-03` | PRD-02 | Must | unit test per metric, including each empty case | #20 |
| `SCORE-FR-04` | PRD-02 | Must | unit test per edge | #20 |
| `SCORE-FR-05` | PRD-02 | Must | unit test | #21 |
| `SCORE-FR-06` | PRD-02 | Must | unit test | #22 |
| `SCORE-FR-07` | PRD-02 | Must | unit test | #21, #22 |
| `SCORE-FR-08` | PRD-02 | Must (v1.1 SCAR drafting needs it) | unit test | #20 |
| `SCORE-FR-09` | PRD-02 | Must | story tests (M3) | #70 |
| `SCORE-FR-10` | PRD-02 | Must | unit test | #15, #21 |
| `SCORE-NFR-01` | PRD-02 | Must | review + determinism test | #23 |
| `SCORE-NFR-02` | PRD-02 | Must | parity test | #15 |
| `DATA-FR-01` | PRD-03 | Must | fact check + Sid's read-through | #72, #73 |
| `DATA-FR-02` | PRD-03 | — | ~~dropped~~ → DATA-FR-11 | — |
| `DATA-FR-03` | PRD-03 | — | ~~dropped~~ → DATA-FR-10 | — |
| `DATA-FR-04` | PRD-03 | Must | validator test | #71 |
| `DATA-FR-05` | PRD-03 | Must | decision test | #71, #74 |
| `DATA-FR-06` | PRD-03 | Must | determinism test | #67, #74 |
| `DATA-FR-07` | PRD-03 | Must | story tests | #70, #74 |
| `DATA-FR-08` | PRD-03 | Must | test | #68 |
| `DATA-FR-09` | PRD-03 | Must | recompute test | #69, #70 |
| `DATA-FR-10` | PRD-03 | Must | lock test | #71 |
| `DATA-FR-11` | PRD-03 | Must | fact check | #72, #73 |
| `DATA-FR-12` | PRD-03 | Must | run log | #74 |
| `DATA-FR-13` | PRD-03 | Should | review | #75 |
| `DATA-NFR-01` | PRD-03 | Must | grep test + naming audit | #72, #73 |
| `DATA-NFR-02` | PRD-03 | Must | review | #67 |
| `AGENT-FR-01` | PRD-04 | Must | validator on every output | #31 |
| `AGENT-FR-02` | PRD-04 | Must | validator | #32 |
| `AGENT-FR-03` | PRD-04 | Must | validator | #32 |
| `AGENT-FR-04` | PRD-04 | Must | draft consistency check | #35 |
| `AGENT-FR-05` | PRD-04 | Must | draft consistency check | #35 |
| `AGENT-FR-06` | PRD-04 | Must | run log audit | #33 |
| `AGENT-FR-07` | PRD-04 | Must | unit test on a hand-made extraction | #34 |
| `AGENT-FR-08` | PRD-04 | Must | review | #36 |
| `AGENT-FR-09` | PRD-04 | Must | review | #36 |
| `AGENT-FR-10` | PRD-04 | Must | review | #33, #36 |
| `AGENT-FR-11` | PRD-04 | Must | unit test | #34 |
| `AGENT-FR-12` | PRD-04 | Must | draft consistency check | #35 |
| `AGENT-NFR-01` | PRD-04 | Must | review | #32–#35 |
| `UIQ-FR-01` | PRD-05 | Must | manual check + review | #37 |
| `UIQ-FR-02` | PRD-05 | Must | manual check | #39 |
| `UIQ-FR-03` | PRD-05 | Must | manual check | #39 |
| `UIQ-FR-04` | PRD-05 | Must | manual check | #40 |
| `UIQ-FR-05` | PRD-05 | Must | manual check (SUP-01, SUP-06) | #40 |
| `UIQ-FR-06` | PRD-05 | Must | manual check | #40 |
| `UIQ-FR-07` | PRD-05 | Must | manual check | #41 |
| `UIQ-FR-08` | PRD-05 | Must | manual check | #41 |
| `UIQ-FR-09` | PRD-05 | Must | manual check | #42 |
| `UIQ-FR-10` | PRD-05 | Must | manual check | #43 |
| `UIQ-FR-11` | PRD-05 | Must | manual check | #38 |
| `UIQ-FR-12` | PRD-05 | Must | manual check per case | #37 |
| `UIQ-FR-13` | PRD-05 | Must | manual check | #37, #47 |
| `UIQ-NFR-01` | PRD-05 | Must | review | #42 |
| `UIQ-NFR-02` | PRD-05 | Should | manual check | #37 |
| `UIQ-NFR-03` | PRD-05 | Must | unit test | #172 |
| `UIQ-FR-14` | PRD-05 | Must | manual check | #40 |
| `UIQ-FR-15` | PRD-05 | Must | unit test (fills the form) + manual check | #77 |
| `UIQ-FR-16` | PRD-05 | Must | manual check (incl. a private window) | #77 |
| `UIQ-FR-17` | PRD-05 | Must | manual check | #77 |
| `UIQ-FR-18` | PRD-05 | Must | manual check | #112 |
| `UIQ-FR-19` | PRD-05 | Must | manual check | #41 |
| `UIQ-FR-20` | PRD-05 | Must | manual check | #40 |
| `UIQ-FR-21` | PRD-05 | Must | unit test + manual check | #172 |
| `UIQ-FR-22` | PRD-05 | Must | unit test | #172 |
| `UIQ-FR-23` | PRD-05 | Must | unit test + manual check | #172 |
| `UIQ-FR-24` | PRD-05 | Must | unit test + manual check | #172 |
| `UIM-FR-01` | PRD-06 | Must | manual check + review | #37 |
| `UIM-FR-02` | PRD-06 | Must | manual check | #44 |
| `UIM-FR-03` | PRD-06 | Must | manual check | #44 |
| `UIM-FR-04` | PRD-06 | Must | manual check | #44 |
| `UIM-FR-05` | PRD-06 | Must | manual check | #44 |
| `UIM-FR-06` | PRD-06 | Must | manual check (ACT-02, ACT-03) | #45 |
| `UIM-FR-07` | PRD-06 | Must | manual check | #45 |
| `UIM-FR-08` | PRD-06 | Must | manual check | #45 |
| `UIM-FR-09` | PRD-06 | Must | manual check | #45 |
| `UIM-FR-10` | PRD-06 | Must | manual check (ACT-05) | #44 |
| `UIM-FR-11` | PRD-06 | Must | manual check | #38, #45 |
| `UIM-FR-12` | PRD-06 | Must | manual check | #37 |
| `UIM-FR-13` | PRD-06 | Should | review | #44 |
| `UIM-FR-14` | PRD-06 | Must | manual check + unit test (`app/today.test.js`) | #107 |
| `DS-FR-01` | DESIGN-SPEC | Must | review (grep for hex values in `app/`) | #37 (then every M5 PR) |
| `DS-FR-02` | DESIGN-SPEC | Must | review | #37 (then every M5 PR) |
| `DS-FR-03` | DESIGN-SPEC | Must | review | #37 (then every M5 PR) |
| `DS-FR-04` | DESIGN-SPEC | Must | manual check at each width | #46 |
| `DS-FR-05` | DESIGN-SPEC | Must | review | #37 (then every M5 PR) |
| `DS-FR-06` | DESIGN-SPEC | Must | manual check | #37 |
| `DS-FR-07` | DESIGN-SPEC | Must | manual check + unit test of the parser | #38 |
| `DS-NFR-01` | DESIGN-SPEC | Must | a11y checklist (§9) | #46 |
| `DS-NFR-02` | DESIGN-SPEC | Must | review | #37 (then every M5 PR) |
| `DS-NFR-03` | DESIGN-SPEC | Must | review | #37 (then every M5 PR) |
| `DS-FR-08` | DESIGN-SPEC | Must | unit test (`app/theme.test.js`, `app/shell.test.js`) + manual check | #178 |
| `DS-FR-09` | DESIGN-SPEC | Must | unit test (`app/coolant.test.js`, `app/shell.test.js`) + manual check | #178 |
| `DS-NFR-04` | DESIGN-SPEC | Must | unit test (`app/shell.test.js`) + manual check | #178 |
| `SHIP-FR-01` | PRD-07 | Must | script output in the release PR | #48 |
| `SHIP-FR-02` | PRD-07 | Must | checklist | #49 |
| `SHIP-FR-03` | PRD-07 | Must | live link check | #49 |
| `SHIP-FR-04` | PRD-07 | Must | checklist | #50 |
| `SHIP-FR-05` | PRD-07 | Must | timed dry run | #51 |
| `SHIP-FR-06` | PRD-07 | Must | print preview fits one page | #52 |
| `SHIP-FR-07` | PRD-07 | Must | release page | #53 |
| `SHIP-NFR-01` | PRD-07 | Must | checklist | #47 |
| `SCAR-FR-01` | PRD-08 | Must | unit test | #54 |
| `SCAR-FR-02` | PRD-08 | Must | story test | #54 |
| `SCAR-FR-03` | PRD-08 | Must | unit test | #54 |
| `SCAR-FR-04` | PRD-08 | Must | unit test | #54 |
| `SCAR-FR-05` | PRD-08 | Must | unit test (section equals template) | #54 |
| `SCAR-FR-06` | PRD-08 | Must | unit test (ACT-05) | #54 |
| `SCAR-FR-07` | PRD-08 | Must | unit test | #54 |
| `SCAR-FR-08` | PRD-08 | Must | manual check | #55 |
| `SCAR-NFR-01` | PRD-08 | Must | review | #54 |
| `QES-FR-01` | PRD-09 | Must | issue link | #57 |
| `QES-FR-02` | PRD-09 | Must | QES tests | #58 |
| `QES-FR-03` | PRD-09 | Must | golden test | #58 |
| `QES-FR-04` | PRD-09 | Must | QES tests | #58 |
| `QES-FR-05` | PRD-09 | Must | QES governance tests | #58 |
| `QES-FR-06` | PRD-09 | Should | QES tests | #59 |
| `QES-FR-07` | PRD-09 | Must | QES governance tests | #58, #59 |
| `QES-NFR-01` | PRD-09 | Must | QES CI | #60 |
| `UIT-FR-01` | PRD-10 | Must | manual check + unit test (`app/today.test.js`) | #107 |
| `UIT-FR-02` | PRD-10 | Must | manual check + unit test (`app/today.test.js`) | #107 |
| `UIT-FR-03` | PRD-10 | Must | manual check + unit test (`app/today.test.js`) | #107 |
| `UIT-FR-04` | PRD-10 | Must | manual check + unit test (`app/today.test.js`) | #107 |
| `UIT-FR-05` | PRD-10 | Must | manual check + unit test (`app/today.test.js`) | #107 |
| `UIT-FR-06` | PRD-10 | Must | manual check + unit test (`app/today.test.js`) | #107 |
| `UIT-FR-07` | PRD-10 | Must | manual check + unit test (`app/today.test.js`) | #107 |
| `UIT-FR-08` | PRD-10 | Must | manual check + unit test (`app/today.test.js`) | #107 |
| `UIC-FR-01` | PRD-11 | Must | manual check | #108 |
| `UIC-FR-02` | PRD-11 | Must | manual check | #108 |
| `UIC-FR-03` | PRD-11 | Must | manual check | #108 |
| `UIC-FR-04` | PRD-11 | Must | manual check | #108 |
| `UIC-FR-05` | PRD-11 | Must | manual check | #108 |
| `UIC-FR-06` | PRD-11 | Must | manual check at each width | #108 |
| `UIC-FR-07` | PRD-11 | Must | manual check | #108 |
| `UIC-FR-08` | PRD-11 | Must | review | #108 |
| `UIC-FR-09` | PRD-11 | Must | manual check | #108 |
| `UIC-FR-10` | PRD-11 | Must | manual check | #108 |
| `UIS-FR-01` | PRD-12 | Must | manual check | #109 |
| `UIS-FR-02` | PRD-12 | Must | manual check + unit test of the normalization | #109 |
| `UIS-FR-03` | PRD-12 | Must | manual check + review | #109 |
| `UIS-FR-04` | PRD-12 | Must | manual check | #109 |
| `UIS-FR-05` | PRD-12 | Must | manual check | #109 |
| `UIS-FR-06` | PRD-12 | Must | manual check (incl. a private window) | #109 |
| `UIS-FR-07` | PRD-12 | Must | manual check | #109 |
| `UIS-FR-08` | PRD-12 | Must | manual check | #109 |
| `UIS-FR-09` | PRD-12 | Must | manual check | #109 |
| `UIS-FR-10` | PRD-12 | Must | manual check | #109 |
| `UIS-FR-11` | PRD-12 | Must | manual check | #110 |
| `UIS-FR-12` | PRD-12 | Must | manual check + unit tests (#78) | #78 |
| `UIS-FR-13` | PRD-12 | Must | unit test (#78) | #78 |
| `UIS-FR-14` | PRD-12 | Must | manual check | #78 |
| `UIS-NFR-01` | PRD-12 | Must | review + unit tests (#78) | #78 |
| `UIE-FR-01` | PRD-13 | Must | review + manual check | #111 |
| `UIE-FR-02` | PRD-13 | Must | manual check | #111 |
| `UIE-FR-03` | PRD-13 | Must | manual check | #111 |
| `UIE-FR-04` | PRD-13 | Must | manual check | #111 |
| `UIE-FR-05` | PRD-13 | Must | manual check | #111 |
| `UIE-FR-06` | PRD-13 | Must | manual check | #111 |
| `UIE-FR-07` | PRD-13 | Must | manual check | #111 |
| `UIE-FR-08` | PRD-13 | Must | manual check | #111 |

### Findings for #14 (issue refinement)

- ~~`data/suppliers.json` has no issue~~: built by the world runner (#74).
- #59 changes scope under PRD-09: extend QES `quality_core.sqe` instead of building a separate `supplier-scorecard` skill.
- #44 also carries the open-SCAR list (UIM-FR-10) and the v1.1 slot (UIM-FR-13).
- #21 now also covers the `metric_bad` alert type and Unrated handling.

## 4. UI manual checklist (L5)

Run at 1280 px and 390 px, with keyboard only and then with VoiceOver. Tick it in the M5 PRs, and fully again in #46.

**Header and routing (every view)**
- [x] Six tabs, Today first; the app opens on Today with no hash. (DS-FR-06, UIT-FR-01) Ticked 2026-11-13 for issue 46 (headless Chrome, 1280 and 390 px, keyboard; VoiceOver stays with Sid): seed-24 world, fresh load with no hash shows Today and the tabs read Today, Qualify, Compare, Monitor, Standards, Eval.
- [x] The policy chip names the active policy in cyan (reference) or amber (custom); *Viewing as* defaults to Senior and survives a reload via the hash. (DS-FR-06, OVR-FR-12) Ticked 2026-11-13 for issue 46 (headless Chrome, 1280 and 390 px, keyboard; VoiceOver stays with Sid): the chip reads "Policy: Stark Reference v1" in cyan, and one keyboard slider step turns it amber "Untitled v1 Unsaved changes"; Senior is checked by default and `role=junior` keeps Junior checked after a reload.
- [x] Every hash in DESIGN-SPEC §4.2 opens its screen from a fresh load; a bad value falls back to the view's default. (DS-FR-07) Ticked 2026-11-13 for issue 46 (headless Chrome, 1280 and 390 px, keyboard; VoiceOver stays with Sid): 19 fresh loads: every §4.2 example (`view`, `role`, a `p1.` policy token as "Shared, not saved", `supplier`, `tab`, `doc`/`sec`, `filter`, `new`, `part`, `active`, `month` focusing M18, `sheet`, `run`, `world` with an Eval packet) and the bare `#supplier=SUP-07` open their screen; `view=bogus` falls back to Today, a bad `tab` and `month=99` are dropped from the URL, and an unknown `part` shows Not found.

**Today**
- [x] *Needs you* as Senior lists every candidate; as Junior only the Junior-routed ones. (UIT-FR-02, -06) Ticked 2026-11-12 for #107 (headless Chrome, seed-24 world, 1280 and 390 px, keyboard; VoiceOver stays with #46): Senior lists all 9 scored in Qualify's order; Junior lists only SUP-04, equal to Qualify's "You can sign" cards; the header role switch re-renders without a reload. Policy half verified live 2026-11-12 for issue 109 (headless Chrome, `near` fixture world: seed 24 with SUP-07 at 85.1 APPROVED): Reliability 5→3 in Standards moves Today's By decision tiles from C 1 / A 5 to C 2 / A 4 with no reload, and tiers 90/75/55 move By grade from C 1 / B 2 to C 2 / B 1 (PRD-10 UIT-AC-05; decisions 94, 121).
- [x] *Escalate this week* matches Monitor's flags and order; ACT-01 is absent. (UIT-FR-03) Ticked 2026-11-12 for #107 (headless Chrome, seed-24 world, 1280 and 390 px, keyboard; VoiceOver stays with #46): ACT-06, ACT-05, ACT-02, ACT-04, the same IDs and order as Monitor's ESCALATE badges; ACT-01 absent.
- [x] Counts match Qualify and Monitor; items open their home view and Back returns. (UIT-FR-04, -05) Ticked 2026-11-12 for #107 (headless Chrome, seed-24 world, 1280 and 390 px, keyboard; VoiceOver stays with #46): decision and routing tiles equal Qualify's pills (3/1/5, 1/8) and grade tiles equal Monitor's tier column (0/1/1/2/2); scroll-first mouse clicks and 390 px taps open the Qualify and Monitor detail with `role` and `policy` kept, and Back returns to Today with focus on main.
- [x] Empty and error states show their messages. (UIT-FR-07, -08) Ticked 2026-11-12 for #107 (headless Chrome, seed-24 world, 1280 and 390 px, keyboard; VoiceOver stays with #46): no extractions gives "Nothing needs you today." and "9 not scored"; Junior with no junior-routed items gives the empty string; no flagged actives gives "No escalations this month."; a history.csv 404 shows Escalate's error only, and a suppliers.json 404 shows both; no exceptions.

**Qualify**
- [x] The queue shows every candidate in severity order; each filter pill count is correct. (UIQ-FR-02, -03) Ticked 2026-11-13 for issue 46 (headless Chrome, seed-93 world from `node scripts/dev-world.mjs --seed 93`, 1280 and 390 px, keyboard; VoiceOver stays with Sid): the 9 cards read SUP-01, SUP-03, SUP-05, SUP-08 (NOT APPROVED), SUP-06, SUP-07 (CONDITIONAL), SUP-02, SUP-04, SUP-09 (APPROVED), equal to the engine's decisions ordered by ID; the pills read All 9, Junior 1, Senior 8, NOT APPROVED 4, CONDITIONAL 2, APPROVED 3, and Enter on each one shows that many cards, moves `aria-pressed` and sets `filter`; ArrowDown walks the cards.
- [x] `#view=qualify&supplier=SUP-07`: CONDITIONAL, Senior SQE, reasons "CONDITIONAL; High-risk commodity", "Scored with" names the policy, and the sheet link opens Standards. (UIQ-FR-04, -20) Ticked 2026-11-13 for issue 46 (headless Chrome, seed-93 world from `node scripts/dev-world.mjs --seed 93`; the seed-24 `near` fixture has SUP-07 APPROVED 85.1, so it can't show this row, 1280 and 390 px, keyboard; VoiceOver stays with Sid): a fresh load shows CONDITIONAL 84.4, Signs "Senior SQE" with "CONDITIONAL; High-risk commodity", Problems 7 + 0 info (the engine's counts) and "Scored with: Stark Reference v1"; Enter on "Stark requirement sheet ↗" opens `#view=standards&role=senior&sheet=SI-CP-0007` on "NPI liquid-cooling cold plate" with "← Policy editor".
- [x] SUP-01 shows the failed-knockout banner; SUP-06 shows the assumed-knockout banner. (UIQ-FR-05) Ticked 2026-11-13 for issue 46 (headless Chrome, seed-93 world from `node scripts/dev-world.mjs --seed 93`, 1280 and 390 px, keyboard; VoiceOver stays with Sid): SUP-01's `role=alert` banner reads "★ ✗ Failed … 4.material_cert. Forces NOT APPROVED." and SUP-06's lists 1.cert_current and 4.workmanship_620 as "★ ~ Assumed (claimed, not proven) … Blocks APPROVED.", the engine's failed and assumed lists in order; both sit above the headline values and the sub-tabs.
- [x] Sub-tabs open on Problems; Categories, All requirements and Drafts each render; `tab` is in the hash. (UIQ-FR-14) Ticked 2026-11-13 for issue 46 (headless Chrome, seed-93 world from `node scripts/dev-world.mjs --seed 93`, 1280 and 390 px, keyboard; VoiceOver stays with Sid): SUP-07 opens on Problems with no `tab` in the hash; ArrowRight moves selection and focus to Categories (9 bars), All requirements (9 categories) and Drafts (draft text), each setting `tab=<name>` and the panel's `aria-labelledby`; Home returns to Problems and drops `tab`.
- [x] Category bars match the engine; the problem list groups fail → assumed → missing → info. (UIQ-FR-06, -07) Ticked 2026-11-13 for issue 46 (headless Chrome, seed-93 world from `node scripts/dev-world.mjs --seed 93`, 1280 and 390 px, keyboard; VoiceOver stays with Sid): for SUP-07, SUP-06 and SUP-01 all 9 bars equal the engine's `score.toFixed(1) / weight`, with meter value and max equal to the engine's numbers; Problems groups equal the engine gaps by type in order: SUP-07 fail (2.ctq_cpk, 6.capacity_ratio, 6.lead_time) then assumed (4 rows); SUP-06 assumed (4); SUP-01 missing (5).
- [x] Criterion table is collapsed to gap categories; expanding shows every criterion; a Cpk ≥ 1.67 reads "excellent". (UIQ-FR-08, -19) Ticked 2026-11-13 for issue 46 (headless Chrome, seed-93 world from `node scripts/dev-world.mjs --seed 93`, 1280 and 390 px, keyboard; VoiceOver stays with Sid): SUP-01 and SUP-07 each open 5 of 9 categories, exactly those with an engine gap; Enter on each closed summary shows all 31 criteria in engine order; SUP-01's verified Cpk 1.94 reads "1.94 ✓ excellent" with score 3, and SUP-07's 1.17 has no label and scores 1.
- [x] Citation click opens the viewer on the cited section; Escape closes it and returns focus. (UIQ-FR-09) Ticked 2026-11-13 for issue 46 (headless Chrome, 1280 and 390 px, keyboard; VoiceOver stays with Sid): in the default dev world (the one with packets), Enter on SUP-01's first visible citation opens the dialog with focus inside and the `[data-cited]` section in view; Tab stays in the dialog; Escape closes it and focus is back on the same link. The keyboard-only demo run repeats the open, Tab and Escape on SUP-07 in the seed-24 world.
- [x] RFI and audit plan show the draft label; Copy works and announces "Copied". (UIQ-FR-10) Ticked 2026-11-13 for issue 46 (headless Chrome, 1280 and 390 px, keyboard; VoiceOver stays with Sid): SUP-07's Drafts tab shows "Agent draft — review before sending" over both panels; Enter on Copy (clipboard permission granted) writes "Copied" in the panel's status line.
- [x] Viewing as Junior, only Junior-routed cards read "You can sign". (UIQ-FR-18) Ticked 2026-11-13 for issue 46 (headless Chrome, seed-93 world from `node scripts/dev-world.mjs --seed 93`, 1280 and 390 px, keyboard; VoiceOver stays with Sid): ArrowRight on *Viewing as* selects Junior (`role=junior`); only SUP-04, the one Junior-routed candidate, reads "You can sign" and the other 8 read "Senior signs"; as Senior no card has a tag; the detail line reads "Needs a senior SQE" on SUP-07 and "You may sign this" on SUP-04.
- [x] + New supplier: the SUP-07 worked example entered by hand gives 82.6, CONDITIONAL, Senior; it joins the queue tagged Entered by hand; reload keeps it; a private window still scores. (UIQ-FR-15…-17) Ticked 2026-11-13 for issue 77 (headless Chrome, shipped `data/`, 1280 and 390 px, keyboard only; VoiceOver stays with #46): all 33 cold-plate rows filled with Tab and typing alone give 82.6, CONDITIONAL, Senior SQE "CONDITIONAL; High-risk commodity", the engine's gaps, RFI items and audit focus; a bad number or date shows the engine's message on its row and a proven row without "where I found it" pauses the score, and Save is refused with focus on that field; Save lands on NEW-01 with the Entered by hand tag in Qualify, Today and Compare; reload keeps it; a shared approve-80 policy rescores it APPROVED; the Drafts tab shows the engine lists with no email or Copy; Export → in-page Delete (Escape cancels) → Import through the file chooser restores a deep-equal record, a second import becomes NEW-02 and a bad file is refused. Blocked storage was checked by injection, not in a private window (Chrome incognito allows localStorage): with a throwing `localStorage` getter, "Can't save in this browser" shows on the entry, the score is still 82.6 and NEW-01 stays for the session. With the sticky headline strip, no focused control is fully hidden under it on Tab or Shift+Tab across the form (1280/1100/800 px, blank, paused and filled; WCAG 2.4.11); no page-level horizontal scroll at 390 px.
- [ ] Upload packet: the Brand Corporation sample (Use the sample packet, the file picker with the ten `.md` files, and a drop at 1280 px) in + New supplier for SI-CP-0007 reads to 30 proven, 2 claimed, 1 missing with no Check flags and gives 90.5, CONDITIONAL (assumed leak-test knockout), Senior; filled rows ask Replace / Keep my rows (Escape keeps); a refused file (wrong name, empty, over 64 KB, not UTF-8) is listed with its reason; Save, reload, Export → Delete → Import keep the packet; at 1280 and 390 px, keyboard only (Upload packet by Enter/Space, focus on the summary, flagged rows reachable), with blocked storage (scores, "Can't save in this browser") and offline after the precache update. (UIQ-FR-21…-23)
- [ ] A citation on the saved sample supplier opens the uploaded page in the viewer with the cited section highlighted (path `uploaded packet/<doc>`); a hand-entered record with no packet still behaves as before. (UIQ-FR-24)
- [x] Hash deep links, Back and Forward restore state. (UIQ-FR-11) Ticked 2026-11-13 for issue 46 (headless Chrome, seed-93 world from `node scripts/dev-world.mjs --seed 93`, 1280 and 390 px, keyboard; VoiceOver stays with Sid): a keyboard path (CONDITIONAL pill, SUP-07 card, Categories, Problems, citation, Escape) makes 6 history entries; 6 Backs and 6 Forwards each restore the recorded hash, filter, selected card, sub-tab and viewer open/closed, and a fresh load of each of the 6 hashes gives the same state (the `doc`/`sec` hash opens the viewer).
- [x] Each error state in UIQ-FR-12 shows its message. Ticked 2026-11-13 for issue 46 (headless Chrome, the `qa46-nosup` world and a seed-93 copy with SUP-02's extraction removed, an unknown state in SUP-03's and SUP-01's msa.md removed, 1280 and 390 px, keyboard; VoiceOver stays with Sid): no suppliers.json shows COULD NOT LOAD `dev-data/qa46-nosup/suppliers.json` HTTP 404; `supplier=SUP-99` shows "Not found: supplier SUP-99" beside the 9-card queue; SUP-02 shows "Not extracted: …/extracted/SUP-02.json: HTTP 404" with no score; SUP-03 shows `Engine error: …/SUP-03.json: 1.cert_current: unknown state "bogus"`; citing msa.md shows FILE NOT IN PACKET; certificates.md answered with HTTP 500 (CDP Fetch) shows COULD NOT LOAD with its path.
- [x] The synthetic badge is visible. (UIQ-FR-13) Ticked 2026-11-13 for issue 47 (headless Chrome 157, 1280 and 390 px, print PDFs with backgrounds disabled; VoiceOver stays with #46): all six views retain the badge at the top and bottom, show the footer and have no document horizontal overflow. Qualify and Eval citation viewers keep their badge/disclaimer through ready, missing, loading and HTTP 500 states. All six view printouts and the open viewer contain both required phrases; closed/inactive content is absent.

**Compare**
- [x] Cold-plate part: SUP-09 then SUP-07 (with conditions, RFI items listed), SUP-01 below with its knockout named. (UIC-FR-02…-05) Ticked 2026-11-12 for issue 108 (headless Chrome, 1280 and 390 px, keyboard; VoiceOver stays with #46): in the seed-24 world with SUP-01's Cpk set below the knockout floor, the order is SUP-09 (APPROVED 100.0), SUP-07 (CONDITIONAL 85.4, with conditions, RFI 1.cert_current, 1.internal_audit, 2.control_plan), then SUP-01 under NOT ACCEPTABLE reading "Knockout failed: Lowest Cpk across the part's CTQs"; seed 101 names the same knockout for SUP-07. Open in Qualify opens the detail with `role` and `policy` kept, and Back returns.
- [x] A single-bidder part shows its message; no winner is marked; the Sourcing line is present. (UIC-FR-07, -08) Ticked 2026-11-12 for issue 108 (headless Chrome, 1280 and 390 px, keyboard; VoiceOver stays with #46): the pcba pill (and `#view=compare&part=si-pc-0004`) shows "Only one bidder for this part" with its column; no rank words, highlight or `aria-current` in any column in any world; the Sourcing line shows in every state, including the suppliers.json 404 panel and the all-unscored default `data/`.
- [x] Raising the APPROVED pass mark re-orders without a reload; columns stack at 390 px. (UIC-FR-06, -10) Issue 108 left this open: the policy flip is unit-tested only until issue 109 wires policy selection (decision 95). The 390 px half passed on 2026-11-12 for issue 108: columns stack (equal left, increasing top) and `scrollWidth - innerWidth` is 0 in every world; at 1280 px six acceptable bidders scroll inside the grid, not the page. Ticked 2026-11-12 for issue 109 (headless Chrome, `near` world, no reload): APPROVED 85.1 changes nothing; 85.2 moves SUP-07 APPROVED → CONDITIONAL and Compare re-orders from SUP-09, SUP-07, SUP-01 to SUP-09, SUP-01, SUP-07 (PRD-11 UIC-AC-03; decisions 95, 121).

**Monitor**
- [x] Tier table order follows UIM-FR-03 (Unrated first; ties by ID); Escalate flags and reasons are correct. (UIM-FR-02…-05) At seed 101 ACT-02 is not the creep story (#99); use a seed where it holds. Ticked 2026-11-13 for issue 46 (headless Chrome, seed-93 world from `node scripts/dev-world.mjs --seed 93`, where ACT-02 holds the creep story (active run7, DPPM Watch), and the `qa46-unrated` world, 1280 and 390 px, keyboard; VoiceOver stays with Sid): seed 93 reads ACT-06 D 35.0, ACT-05 C 55.0, ACT-02 B 70.0, ACT-04 B 80.0, ACT-01 A 100.0, ACT-03 A 100.0 (the A tie breaks by ID, both unflagged); `qa46-unrated` puts Unrated ACT-06 first; ESCALATE shows exactly where the tier is C/D or an alert is active, and each tooltip and spoken name equals the PRD rule built from the engine alerts, e.g. ACT-05 "Tier C; scar_aging; metric_bad (repeat_nc, scar_aging)", ACT-02 "run7; metric_bad (repeat_nc)"; metric cells show value, glyph and band word.
- [x] `#active=ACT-02`: the 7-point run is marked, `run7` is active, DPPM isn't Bad. (UIM-FR-06, -09) Ticked 2026-11-13 for issue 46 (headless Chrome, seed-93 world from `node scripts/dev-world.mjs --seed 93`, 1280 and 390 px, keyboard; VoiceOver stays with Sid): M12–M18 carry amber rings (7, matching the engine run) and "in a run above p̄" names; the alert list's first row is ACTIVE "7 in a row above p̄ M18"; DPPM reads 1,429 ~ Watch.
- [x] ACT-03: the M9 point is marked above the UCL. (UIM-FR-06) Ticked 2026-11-13 for issue 46 (headless Chrome, seed-93 world from `node scripts/dev-world.mjs --seed 93`, 1280 and 390 px, keyboard; VoiceOver stays with Sid): the only triangle mark sits on M9, whose name reads "p 0.0012, UCL 0.0000, above UCL"; the summary reads "Above UCL: M9".
- [x] Arrow keys walk the chart; "Show as table" shows the same numbers. (UIM-FR-07, -08) Ticked 2026-11-13 for issue 46 (headless Chrome, 1280 and 390 px, keyboard; VoiceOver stays with Sid): on ACT-02 two ArrowLeft presses move focus from M18 to M16; Show as table has 18 rows whose n and p equal the 18 point labels.
- [x] Alert list: active first, then past newest first; ucl and run7 rows jump to their point; Back restores. (UIM-FR-09, -11) Ticked 2026-11-13 for issue 46 (headless Chrome, seed-93 world from `node scripts/dev-world.mjs --seed 93`, 1280 and 390 px, keyboard; VoiceOver stays with Sid): ACT-02's 19 alerts list the 2 active ones first, then past ones M17 down to M1; only the run7 and ucl rows are links; Enter on ACT-02's run7 row and ACT-03's ucl row focuses M18 / M9 with `aria-current` and adds `month`; Back drops `month` and the selection, and Forward brings it back.
- [x] Escalate reasons visible in the alerts panel (#46 L3). (UIM-FR-04) Ticked 2026-11-13 for issue 46 (headless Chrome, 1280 and 390 px, keyboard; VoiceOver stays with Sid): ACT-02's alerts panel shows "▲ ESCALATE run7; metric_bad (repeat_nc)" as visible text, equal to the table badge's tooltip (decision 174).
- [x] `#view=monitor&active=ACT-03&month=9` opens with M9 focused. (UIM-FR-11) Ticked 2026-11-13 for issue 46 (headless Chrome, 1280 and 390 px, keyboard; VoiceOver stays with Sid): a fresh load focuses the M9 point, which carries `aria-current`.
- [x] The chart is readable at 390 px: it scrolls inside the panel, the page does not. (UIM-FR-06, DS-NFR-01) Ticked 2026-11-13 for issue 46 (headless Chrome, 1280 and 390 px, keyboard; VoiceOver stays with Sid): at 390 px the plot keeps 600 px and its scroller has 292 px to scroll while the page has none; the p̄ label reads clearly over the line and dots on ACT-02, -05 and -06 (decision 176).
- [x] ACT-05 lists open SCARs with ages over 60 days marked. (UIM-FR-10) Ticked 2026-11-13 for issue 46 (headless Chrome, 1280 and 390 px, keyboard; VoiceOver stays with Sid): ACT-05 lists five SCARs; the 201, 112 and 77 day rows carry "Over 60 days" and `data-alert`, the 42 and 31 day rows do not, and each SCAR ID is a row header.
- [x] Each error state in UIM-FR-12 shows its message. Ticked 2026-11-13 for issue 46 (headless Chrome, seed-93 copies with history.csv removed and with a 12-column row 5, 1280 and 390 px, keyboard; VoiceOver stays with Sid): no history.csv shows COULD NOT LOAD `dev-data/r2-nohist/history.csv` HTTP 404; the bad row shows its path and "row 5: expected 11 columns, got 12"; `active=ACT-99` shows "Not found" above the 6-row tier table.

- [x] Monitor's escalations appear in Today; the detail links back to Today; Draft SCAR is disabled with "Arrives in v1.1". (UIM-FR-13, -14) Ticked 2026-11-13 for issue 46 (headless Chrome, seed-93 world from `node scripts/dev-world.mjs --seed 93`, 1280 and 390 px, keyboard; VoiceOver stays with Sid): Today's *Escalate this week* lists ACT-06, ACT-05, ACT-02, ACT-04, Monitor's flagged rows in order; Enter on ACT-06 opens its detail, whose Draft SCAR button is disabled and described by "Arrives in v1.1"; Enter on "← Today" returns to Today.
- [x] A changed tier cut-off re-grades the table without a reload. (UIM-FR-01) Ticked 2026-11-13 for issue 46 (headless Chrome, seed-93 world from `node scripts/dev-world.mjs --seed 93`, 1280 and 390 px, keyboard; VoiceOver stays with Sid): typing 71 into Standards' Tier B lower bound shows "0 candidate changes, 1 grade change" (ACT-02), and the Monitor tab then reads ACT-02 C (still after ACT-05, C 55.0, by composite), with "Tier C; run7; metric_bad (repeat_nc)"; a page marker set before the edit is still there, so no reload.

**Standards**
- [x] Moving a category's importance rescores Qualify, Compare and Today live; the impact panel lists each change as old → new. (UIS-FR-02, -05, -10) Ticked 2026-11-12 for issue 109 (headless Chrome, 1280/1100/1099/760/759/390 px, keyboard; VoiceOver stays with #46): in the `near` world (seed 24 with SUP-07 at 85.1 APPROVED), Reliability 5→3 by keyboard turns the chip amber "Untitled v1 Unsaved changes" and the impact panel reads "1 candidate change, 0 grade changes" with SUP-07 APPROVED → CONDITIONAL; Today's By decision goes from C 1 / A 5 to C 2 / A 4; Compare's cold-plate order goes from SUP-09, SUP-07, SUP-01 to SUP-09, SUP-01, SUP-07; the Qualify card goes from APPROVED 85.1 to CONDITIONAL 84.4. No reload.
- [x] Pass marks and knockout switches validate; an invalid value shows the engine's error on its input. (UIS-FR-03, -05) Ticked 2026-11-12 for issue 109 (headless Chrome, 1280/1100/1099/760/759/390 px, keyboard; VoiceOver stays with #46): Approve 90 with Conditional 95 shows `policy.qualification.conditional: expected a number >= 0 and < approve (90), got 95` under CONDITIONAL with `aria-invalid` and `role=alert`, focus and caret kept, and the views stay on the last valid policy; blank and "abc" show `expected a number 0-100, got ""` / `"abc"`; 101 is refused; switching off the `1.cert_scope` knockout moves SUP-01 CONDITIONAL → APPROVED.
- [x] Save, reload, version bump; Share link opens as "Shared, not saved"; Export → delete → Import round-trips; a private window shows "Can't save in this browser". (UIS-FR-06…-09) Ticked 2026-11-12 for issue 109 (headless Chrome, 1280/1100/1099/760/759/390 px, keyboard; VoiceOver stays with #46): "Cold-plate team" saves as v1 (amber), survives a reload, then v2 and v3 on later saves (same id `policy-1`); the share link opened in a separate Chrome profile shows "Policy: Cold-plate team v4 Shared, not saved" with `sqc:policies` still null; Export → inline delete (focus on Cancel, Escape cancels) → Import restores a deep-equal policy; an edited file with weights summing to 99 is refused with "Import refused: policy.qualification.weights: sum is 99, expected 100 (±0.01)". Blocked storage was checked by injection, not in a private window (Chrome incognito allows localStorage): with a throwing `localStorage` getter, and separately a throwing `setItem`, Save shows "Can't save in this browser", the policy still applies for the session, and a reload returns to the reference.
- [x] Every built-in sheet opens by deep link, view-only. (UIS-FR-11) Ticked 2026-11-13 for issue 110 (headless Chrome, 1280/1100/1099/760/759/390 px, keyboard; VoiceOver stays with #46): with the shipped `data/`, Standards lists all 8 sheets (SI-CM-0008 through SI-SM-0010; sheet_metal loads from its active supplier). Each `#view=standards&sheet=<part>` opened on a full page load shows the part name, the six header facts in order, 3 CTQ rows and every test. The sheet has no input, select, textarea, button or contenteditable, and no editor fields anywhere on the page; the impact panel stays. The cold plate shows `≤ 0.000001 mbar·L/s` unrounded. Qualify's "Stark requirement sheet ↗" (SUP-07, `near` world) and Compare's sheet link (SI-PC-0004) land on the open sheet with `role=junior` and the shared policy kept. `SI-XX-0099` shows "Not found", and data delayed 1.5 s shows "Loading data…" first, never "Not found". "← Policy editor" and the checked policy row close the sheet with the draft and "Unsaved changes" kept, and focus returns to the current sheet link or the checked policy radio. No page-level horizontal scroll at any width. At 759 px and below the "Requirement sheet" select replaces the list and keeps focus.
- [x] An uploaded sheet is tagged Uploaded and says its limits apply to hand-entered suppliers only. (UIS-FR-14) Ticked 2026-11-13 for issue 78 (actual headless Chrome 157, 1280 px and 390 px): JSON upload corrected to SI-UP-0001 and demand 2300, saved into the existing list/viewer with Uploaded and the hand-entered-only notice; reload retained it; exact JSON export → inline delete → import restored a deep-equal sheet. The viewer stayed view-only, impact stayed unchanged, no page-level overflow. A throwing localStorage getter and quota-failing setItem each kept the upload for the session with "Can't save in this browser" and lost it on reload. No scoring/hand-entry wiring. Re-run 2026-11-13 for issue 78 lead review at both widths: corrected CSV demand persists as numeric 2300; BOM-prefixed JSON/CSV/Markdown save; hostile part name remains literal text without an image or script execution.
- [x] Upload preview, correction and the refusal messages work per #78. (UIS-FR-12, -13) Ticked 2026-11-13 for issue 78 (actual headless Chrome 157, 1280 px and 390 px): selected real JSON, CSV and Markdown files and saved their parsed previews; duplicate part number refused, invalid demand abc corrected to 2300; missing Leak test limit named and repaired through full JSON correction; an unknown test stayed visible in Unmatched content and Save required review acknowledgment. PDF selection showed "PDF upload is planned for v2.0" per Sid's decision, with no parser invoked. Delete Cancel/Escape and confirmation checked. Keyboard Escape checked; VoiceOver remains with issue 46. Unit tests deep-round-trip all 8 sheets through all 3 supported formats. Re-run 2026-11-13 for issue 78 lead review at 1280/390 px, including CSV text demand "2,300" → 2300 and BOM-prefixed files in all three formats.

**Eval**
- [x] With no `data/eval.json`: "No published run yet", no numbers. (UIE-FR-07) Ticked 2026-11-13 for issue 111 (headless Chrome, 1280/1100/1099/760/759/390 px, keyboard; VoiceOver stays with #46): the shipped `data/` (no `eval.json`) shows "No published run yet", the two method sentences and the EVAL.md link, with no digit in the Eval text and no alert; with every data file delayed 1.5 s "Loading data…" shows first and the empty state never flashes before the load; an `eval.json` answering HTTP 500, invalid JSON or a run without `groups` is an error panel naming the file (announced once), never the empty state and never a rate. No page-level horizontal scroll at any width.
- [x] With a run: headline, per-world table, the demo and hold-out rows apart, the run list and the miss list all match `eval.mjs --json`. (UIE-FR-01…-05) Ticked 2026-11-13 for issue 111 (headless Chrome, 1280/1100/1099/760/759/390 px, keyboard; VoiceOver stays with #46) on `app/eval.testkit.js` fixtures built with the real `buildReport`/`renderJson`, not a published run (#36): one run shows "Caught 20.0% 4 of 20 target ≥ 90% FAIL" and the other three stats from the file, 4 world rows then demo world 93 and hold-out traps apart below the divider, 1 run and 26 miss rows; with three runs the list reads Run 1 · Sonnet, Run 2 · Opus comparison, Run 3 · Re-test, and clicking run 2 or 3 moves `aria-current` and the miss list while the headline and per-world text stay identical; `run=999` falls back to run 1 with a status line; an incomplete first Sonnet run shows INCOMPLETE on every verdict, "world(s) 103, 104" and no PASS or FAIL. A miss opens its packet file at the answer key's section in the viewer (world, supplier, `[data-cited]`), a miss with no citation opens the ten-file list, and Close or Escape returns focus to the miss row. `.stats` goes 4/2/1 columns and the tables scroll inside their panels. Value-by-value equality with the file is also unit-tested in `app/eval.test.js`.
- [ ] A miss opens its packet section in the citation viewer; the EVAL.md link works. (UIE-FR-06, -08)

**Coolant Loop theme (issue 178; DS-FR-08, DS-FR-09, DS-NFR-03, DS-NFR-04), at 1280 and 390 px, both themes unless stated**
- [ ] Each of the six views (Today, Qualify with queue / detail / knockout banner / drafts, Compare, Monitor with p-chart and tooltip, Standards with policy editor and sheet upload / preview, Eval): no text over a bare blob except headings and captions; tables crisp; no horizontal scroll at 390 px.
- [ ] + New supplier steps 1 and 2: the sticky live strip stays legible while fields scroll under it; packet panel and sample-packet flow; inputs have a visible border.
- [ ] Citation viewer opens, packet text readable, Close and Escape work, backdrop scrim visible.
- [ ] p-chart: dots, UCL, run rings, amber triangles, tooltip and "Show as table" readable.
- [ ] Theme toggle: Tab, Enter and Space work; the screen reader reads "Light mode, toggle button, pressed / not pressed"; 44 px tall at 390 px; the choice survives a reload; with storage blocked it still flips and the next load follows the OS; no flash of the wrong theme on a hard reload with an explicit choice; an OS scheme change with no explicit choice flips page, button and particles.
- [ ] Reduced motion (OS setting or devtools emulation): blobs static, no particles, no live-dot pulse; turning it off restarts the particles without a reload.
- [ ] Hide the tab for 10 s and return: no jump; CPU idle while hidden.
- [ ] Offline: load once online, go offline, reload: the themed page renders and the canvas runs; the installed-app window background matches `--bg`.
- [ ] Print preview of Today and of an open packet: dark ink on white in both themes, no blobs or canvas, headings solid.
- [ ] Zoom 200 % and forced colours: headings readable, focus ring visible.
- [ ] Smoothness: 60 fps feel while scrolling at 1280 px with blobs and particles on.

**Every view:** the DESIGN-SPEC §9 checklist. Headless half passed 2026-11-13 for issue 46: focus visible, targets ≥ 24 px, contrast, 390/320 px overflow, 200% zoom (1280 px at 200% = a 640 px viewport), reduced motion; VoiceOver stays with Sid.

## 5. Changelog

| Date | Change |
|---|---|
| 2026-11-20 | Issue 178 Coolant Loop theme: matrix rows DS-FR-08 (theme toggle), DS-FR-09 (blob and particle backdrop), DS-NFR-04 (composited contrast, both themes) (196 live); DS-NFR-03 now covers all animation. Eleven open L5 boxes for the two themes, reduced motion, pause when hidden, offline, print and smoothness. |
| 2026-11-20 | Issue 172, partial L5 run (Playwright Chromium, local server, boxes stay open): 1280 px, Enter on Upload packet opens the picker; ten sample files + two wrong-name files read to "Read 9 files: 30 proven, 2 claimed, 1 missing." with focus on the summary, both refusals listed with reasons, 0 Check flags, 90.5 CONDITIONAL Senior SQE; Use the sample packet on filled rows asks Replace (focused), Escape keeps the rows, Replace re-reads; Save → NEW-01 tagged Entered by hand in Qualify, Today and Compare; reload keeps it; the reliability_report.md §1.1 citation opens the uploaded page with §1.1 highlighted; no horizontal scroll. 390 px keyboard only: name, part, Continue, sample by Enter, focus on the summary, no horizontal scroll, drop hint hidden. Not run: drag and drop, Export → Delete → Import in the browser, blocked storage, offline, a record with no packet. |
| 2026-11-19 | Issue 172 packet upload: matrix rows UIQ-FR-21…24 and UIQ-NFR-03 (193 live). Two open L5 Qualify boxes (sample packet end to end at 1280 and 390 px incl. keyboard-only, blocked storage and offline; viewer on the uploaded page). Reader accuracy is `scripts/reader-accuracy.mjs` (UIQ-AC-13). |
| 2026-11-13 | Issue 46 round 2: the 16 remaining Qualify and Monitor L5 rows assigned to #46 are ticked from a headless run at 1280 and 390 px, keyboard-driven, in the seed-93 dev world (SUP-01 failed and SUP-06 assumed knockouts, SUP-07 CONDITIONAL Senior, ACT-02 creep story) plus error-state copies of it; VoiceOver stays with Sid. |
| 2026-11-13 | Issue 46: accessibility and responsive pass. L5 rows ticked from a headless run at 1280, 390 and 320 px (DS-NFR-01, DS-NFR-03, DS-FR-04, OVR-NFR-05); VoiceOver stays with Sid; the Eval EVAL.md row stays open for issue 36. Rows the run did not exercise end to end stay open. |
| 2026-11-13 | Issue 47 lead-review recheck: ticked the L5 synthetic-badge row after actual Chrome checks on all six views at 1280/390 px, viewer states and seven print PDFs. Added root scroll padding and a backward-keyboard probe for OVR-NFR-05; PR quotes the measured counts. PRD acceptance boxes unchanged. |
| 2026-11-13 | Issue 77: UIQ-FR-15…17 implemented, unit tests in `app/manual.test.js` and `app/entry.test.js`. The §4 Qualify "+ New supplier" L5 box is ticked after the tester's keyboard-only, file-picker and blocked-storage checks at 1280 and 390 px, and the focus-not-obscured fix to the sticky live panel. |
| 2026-11-13 | Issue 111: the first two L5 Eval boxes are verified live in headless Chrome on testkit fixtures (UIE-FR-01…-07, also unit-tested in `app/eval.test.js`); the third stays open for #36, because `docs/EVAL.md` 404s until that issue writes it (the miss → packet half passed). |
| 2026-11-13 | Issue 110: the L5 Standards sheet row is split (decision 136): the built-in half (UIS-FR-11) is issue 110's, the Uploaded half (UIS-FR-14) a new open row for #78. UIS-FR-11 is also verified by unit tests in `app/standards.test.js`. |
| 2026-11-12 | Issue 109: UIS-FR-01…10 are also verified by unit tests in `app/standards.test.js`. |
| 2026-11-12 | Issue 109: the three L5 Standards policy boxes, the third L5 Compare box and the Today policy half are verified live in headless Chrome (decisions 94, 95, 121); the sheet boxes stay open for issue 110 and #78. |
| 2026-11-12 | #108: UIC-FR-01…10 are also verified by unit tests in `app/compare.test.js`; the policy half of UIC-FR-10 / UIC-AC-03 is unit-tested only until issue 109 wires policy selection (decision 95), so the third L5 Compare box stays open for its live half. |
| 2026-11-12 | #107: UIT-FR-01…08, UIM-FR-14 and OVR-FR-08 are also verified by unit tests in `app/today.test.js`. |
| 2026-11-12 | #107: the four L5 Today boxes are ticked from a headless run at 1280 and 390 px (VoiceOver stays with #46). |
| 2026-11-11 | #37: `UIQ-FR-13` also maps to #37 (the app shell renders the synthetic badge and the fan-made footer; #47 re-verifies them at both widths). |
| 2026-11-11 | #76: UI views from the approved walk-through. OVR-FR-08…12, UIQ-FR-14…20, UIM-FR-14, DS-FR-06, -07 and new PRD-10…13 (UIT, UIC, UIS, UIE): 56 requirements, 188 live. New rows map to the M5 issues split out by #76 (#107–#112). L5 checklist covers all six views. |
| 2026-11-11 | Added AGENT-FR-12, RFI email signature (#35). |
| 2026-11-09 | Policy (QUAL-FR-14, -15, SCORE-FR-10), simulated world (DATA-FR-08…13; FR-02, -03 dropped; M3 rows remapped to M3b #66–#75), five-world eval (AGENT-FR-10, -11). |
| 2026-11-09 | Added QUAL-NFR-05 (122 requirements). |
| 2026-11-08 | First draft: test levels, definition of done, generated traceability matrix (121 requirements, 0 unmapped), UI manual checklist. |
