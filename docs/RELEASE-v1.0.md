# Release notes: v1.0

| Field | Value |
|---|---|
| Release | v1.0 MVP |
| Milestones | M1, M2, M3b, M4, M5, M6 (M3 was superseded by M3b) |
| Product requirements | [PRD-07](product/PRD-07-ship.md) SHIP-FR-07 |
| Last updated | 2026-11-20 |

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

## Patch releases

### v1.0.3 (2026-11-20)

- **Coolant Loop theme on every view** (#178, PR #179):
  - Dark (default): deep blue-black, drifting coolant light, particles flowing along sine "pipes", frosted-glass panels.
  - Light: pale ice, white glass, deeper accents that pass AA on white.
- **Light / Dark toggle** in the header (☀). It follows the system setting until you choose. The choice is remembered and still works with storage blocked, and it is applied before first paint, so the page never flashes the wrong theme.
- **Readability:**
  - Every text and UI colour pair passes WCAG 2.2 AA in both themes, measured against the moving background behind it (`app/shell.test.js`).
  - Tables, forms, the sticky score strip and Monitor's figures sit on near-opaque panels.
  - The packet viewer and the chart tooltip are fully opaque.
- **Motion:** *reduce motion* stops all animation. Particles pause in hidden tabs and are capped at 110 (50 on phones).
- No new dependencies. Offline copies re-cache on the next visit (`sw.js` VERSION v1.0.3).
- Known: the README screenshot and demo GIF still show the earlier navy design.

### v1.0.2 (2026-11-20)

- **Upload packet in + New supplier** (#172, PR #175). After the name and a Stark part, the engineer uploads the
  supplier's packet (`.md` files, the file picker, drag and drop, or **Use the sample packet**). A rules-based reader
  in the browser, with no AI and no dependencies, fills the checklist: a recorded result means Proven, prose means
  Claimed, no section means Missing. Anything it cannot read, or evidence that contradicts itself, stays Claimed with
  a visible *Check:* line. Every row stays editable before Save, the engine is still the only scorer, and citations
  open the supplier's own uploaded pages.
- **Measured:** on every shipped packet with an answer key (worlds 93 and 101 to 104, 45 packets, 1440 rows), the
  reader agrees on state, value and citation 1440/1440, and the engine's total, decision, knockouts and routing agree
  45/45 (`scripts/reader-accuracy.mjs`, pinned by a test).
- **Demo packet:** `data/samples/brand-corporation/`, a new fictional cold-plate bidder for SI-CP-0007: 90.5,
  CONDITIONAL, Senior SQE (the leak test is only claimed).
- **Known limitation:** the reader reads only packets in this project's format. Real PDFs, scans, spreadsheets and
  free-form packets are planned in [AI-READER-PLAN.md](AI-READER-PLAN.md) (#173, PR #174): assisted mapping without
  AI, and an optional AI reader that proposes evidence the page then verifies.
- Offline copies re-cache on the next visit (`sw.js` VERSION v1.0.2).

### v1.0.1 (2026-11-18)

- Installable desktop app with offline mode (#169), plain-language labels and viewer fixes (PR #167, #168, #170).

## Ship checklist

The checklist and its evidence are in the release pull request (`test → main`), per SHIP-AC-01. The live-link items
and the tag are ticked there after the merge.
