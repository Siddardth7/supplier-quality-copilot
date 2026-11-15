# PRD-03 — Synthetic dataset

| Field | Value |
|---|---|
| Status | Approved |
| Owner | Sid (SME) |
| Release | v1.0 |
| Milestone | v1.0 · M3b Simulated world (was M3 Dataset) |
| ID prefix | `DATA` |
| Specs referenced | `docs/SIMULATION.md` (simulator, worlds, answer key; #66), `docs/DATASET.md` (names, archetype targets, packet style), `docs/RUBRIC.md`, `docs/SCORECARD.md` |
| Last updated | 2026-11-09 |

## 1. Problem

The product can't be shown or measured on real supplier data: it's confidential, and nobody knows its true gaps. A demo needs packets that read like real ones, with gaps that are known in advance, so the agent's catch rate is a number, and history with known trends, so the alerts can be checked.

Hand-planting the gaps and then finding them is circular: the same author writes the test and the answer. So the supplier base is **simulated**: problems come out of seeded processes, a different model (Codex) writes the documents from the simulated facts, and the answer key comes from the engine and is locked before any extraction.

## 2. Users and jobs

| Persona | Job to be done | How this feature helps |
|---|---|---|
| Interview panel | Judge whether the tool works | Every world's answer key is hash-locked before any run, and four worlds were never filtered |
| Agent eval (PRD-04) | Score the agent | An answer key with expected states, values and scores |
| Engine tests (PRD-01/02) | Prove the rules on realistic input | Reference extractions and a history file with designed stories |

## 3. Goals and non-goals

**Goals**
- ~~G1: 25 planted gaps, each with criterion ID, expected state, value and score.~~ Replaced by G5.
- G2: Each candidate supplier lands on an expected decision and routing that the PRD-01 rules produce, covering all three decisions and both routings.
- G3: Six active-supplier stories that each produce their expected alerts. *(PRD-00 G6)*
- G4: Reproducible: every world comes from a seed. *(OVR-NFR-04)*
- G5: Five simulated worlds (demo world + eval worlds 101–104), each with an engine-built answer key locked before extraction. *(PRD-00 G4)*

**Non-goals**
- NG1: PDF, image or spreadsheet packets (PRD-00 NG1).
- NG2: Realistic volume. Nine candidates and six active suppliers per world are enough to show every rule.
- NG3: A Low-risk candidate. Low risk only changes routing, which SUP-04 (Medium) already shows.

## 4. Requirements

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| DATA-FR-01 | Each world's packets must follow the `DATASET.md` style, with numbered sections for citation; the demo world's are copied to `data/suppliers/SUP-01…09/` | Must | fact check + Sid's read-through |
| DATA-FR-02 | ~~Each of the 25 planted gaps must be findable from its packet alone~~ → DATA-FR-11 | — | — |
| DATA-FR-03 | ~~Answer key = the 25 gap-matrix rows~~ → DATA-FR-10 | — | — |
| DATA-FR-04 | Each world must have a reference extraction per candidate, derived from its answer key, in the PRD-04 format | Must | validator test |
| DATA-FR-05 | In the demo world, the engine on each reference extraction must give the decision and routing of that candidate's `DATASET.md` row | Must | decision test |
| DATA-FR-06 | `node sim/run.mjs --seed <n>` must build a whole world; the same seed must give byte-identical files, except the Codex-written packets, whose prompts and output hashes are logged | Must | determinism test |
| DATA-FR-07 | The demo world's history must satisfy every story in `SCORECARD.md` | Must | story tests |
| DATA-FR-08 | Stark Industries must have a requirement sheet per commodity (part number, CTQs, a limit for every profile test, demand, need-by lead time); each limit is labeled standard or heuristic | Must | test (#68) |
| DATA-FR-09 | Every criterion value must come from a simulated measurement or trait draw; Cpk and %GRR are computed from simulated samples | Must | recompute test (#69) |
| DATA-FR-10 | Each world's `answer_key.json` must be built by the engine from the facts, and its SHA-256 committed before any extraction of that world | Must | lock test (#71) |
| DATA-FR-11 | Packets must be written by Codex in an isolated folder that holds only the brief; a deterministic fact check must confirm every fact is stated (or absent) as the facts file says | Must | fact check (#73) |
| DATA-FR-12 | Eval worlds 101–104 must be built as-is, never filtered or re-rolled; only the demo world is selected, by simulation outputs alone | Must | run log (#74) |
| DATA-FR-13 | Sid's hold-out traps must live in a separate answer key, added after the worlds are built and before extraction | Should | review (#75) |
| DATA-NFR-01 | All names must follow the `DATASET.md` naming rules, and every packet file must carry the synthetic banner | Must | grep test + naming audit |
| DATA-NFR-02 | The simulator must use only Node built-ins; the only external tool is the Codex CLI for packet writing | Must | review |

## 5. Interfaces

| Path | Produced by | Consumed by |
|---|---|---|
| `data/requirements/<commodity>.json` / `.md` | #68 | simulator, packets (as the RFQ), Standards view |
| `data/worlds/<n>/…` (facts, packets, history, answer key + hash, fact check, logs) | `sim/run.mjs` (#74) | eval (PRD-04) |
| `data/suppliers/<id>/*.md` | demo world copy | agent (PRD-04), citation viewer (PRD-05) |
| `data/answer_key.json` | demo world copy | decision tests |
| `data/history.csv` | demo world copy | scorecard engine (PRD-02) |
| `data/suppliers.json` | demo world copy | app: id, display name, commodity key, part per supplier, plus `as_of` |

Exact layouts and schemas: `docs/SIMULATION.md`.

`suppliers.json` shape:

```json
{
  "as_of": "2026-11-01",
  "candidates": [ { "id": "SUP-07", "name": "Oscorp", "commodity": "cold_plate", "part": "Cold plate, NPI" } ],
  "active": [ { "id": "ACT-02", "name": "…", "commodity": "pcba", "part": "…" } ]
}
```

## 6. Acceptance criteria

- [ ] ~~DATA-AC-01: 25-row answer key matches the gap matrix~~ → DATA-AC-07.
- [ ] DATA-AC-02: The decision test reproduces the decision and routing of every row of the `DATASET.md` queue table from the demo world's reference extractions. *(proves DATA-FR-04, -05, G2)*
- [ ] DATA-AC-03: Sid reads the demo-world packets and can cite each gap's section without the answer key. *(proves DATA-FR-01)*
- [ ] DATA-AC-04: Two builds of the same seed with packet writing skipped give the same SHA-256 for every file. *(proves DATA-FR-06, G4)*
- [ ] DATA-AC-05: All six story tests pass on the demo world. *(proves DATA-FR-07, G3)*
- [ ] DATA-AC-06: Every packet file starts with the synthetic banner, and the naming audit is recorded in the PR. *(proves DATA-NFR-01)*
- [ ] DATA-AC-07: All five worlds are built, every fact check is clean, and every `answer_key.sha256` was committed before the first extraction (git log order). *(proves DATA-FR-08…12, G5)*

## 7. Open questions

| # | Question | Owner | Resolution |
|---|---|---|---|
| 1 | Should nice-to-have misses count toward the catch rate? | Sid | v1.0: yes, as `info` rows. They test whether the agent reads the full commodity table |
| 2 | Hard-code story shapes, or search seeds until the simulation fits? | Sid | 2026-11-09: search seeds for the demo world only (archetypes make it likely); eval worlds are never searched |

## 8. Out of scope

| Item | Picked up by |
|---|---|
| Live supplier data feeds | v2.0 Live |
| SCAR records beyond the dates in `history.csv` | v1.1 (PRD-08) |

## 9. Changelog

| Date | Change |
|---|---|
| 2026-11-09 | Simulated world replaces the 25 planted gaps: DATA-FR-08…13, DATA-AC-07, G5; FR-02, FR-03, AC-01 struck; SUP-09 Horizon Labs added; milestone M3b. |
| 2026-11-09 | Marvel supplier names and Stark Industries as buyer (`DATASET.md` naming table). |
| 2026-11-08 | First draft. `DATASET.md` v1 alongside it: 25-gap matrix, expected totals, decisions and routing per supplier, naming rules, packet style, reference extractions, 18-month generator rules. |
