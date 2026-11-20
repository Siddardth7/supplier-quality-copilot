# Synthetic Dataset Spec v1

Everything is fictional. **Since 2026-11-09 the data comes from a seeded simulation** (decision log, `docs/ROADMAP.md`; spec `docs/SIMULATION.md`, written in #66). The candidate stories and expected decisions below are the **archetype targets** the demo world must hit. The hand-planted gap matrix is kept struck through for history. Product requirements are in [PRD-03](product/PRD-03-dataset.md). Criterion IDs and scoring are in [RUBRIC.md](RUBRIC.md); metrics and stories for active suppliers are in [SCORECARD.md](SCORECARD.md).

## Naming rules

- The buyer is **Stark Industries**. Packets are addressed to Stark Industries Supplier Quality. Suppliers carry Marvel comic-book company names, chosen so the name hints at the story (table below).
- Staff in packets may be Marvel characters (e.g. Pepper Potts signs for Stark). Never a real person.
- No real company, product, program or person names anywhere in packets, history or extractions. A Marvel name that is also a real supplier of that commodity is not used. No real certificate numbers or registrar names; use `REG-` placeholders.
- Every packet file starts with the line `> Synthetic document for a demo. Fictional supplier.`
- `as_of` for the whole dataset is **2026-11-01**.

| ID | Name | Commodity | Why the name fits |
|---|---|---|---|
| SUP-01 | Frost Technotics | `cold_plate` | A cold company, strong shop, one miss |
| SUP-02 | Wakanda Design Group | `quick_disconnect` | The only source of vibranium, so sole source |
| SUP-03 | Hammer Industries | `power_module` | Justin Hammer's tech never quite works |
| SUP-04 | Pym Technologies | `pcba` | Precision at small scale; the clean case |
| SUP-05 | Cross Technological Enterprises | `machined_part` | Good parts, paperwork lapsed |
| SUP-06 | Stane International | `optics_cable` | Big claims, little proof |
| SUP-07 | Oscorp | `cold_plate` | Ambitious NPI that can't meet the ramp |
| SUP-08 | Roxxon | `contract_mfg` | Huge conglomerate with a control gap |
| SUP-09 | Horizon Labs | `cold_plate` | Parker's lab: the cold-plate bidder that gets it right |
| ACT-01 | Damage Control | — | Cleans up everyone else's mess; stable |
| ACT-02 | Alchemax | — | Quietly drifting |
| ACT-03 | Rand Enterprises | — | One bad lot |
| ACT-04 | Timely Industries | — | Good parts, never on time |
| ACT-05 | A.I.M. (Advanced Idea Mechanics) | — | The same failure keeps coming back |
| ACT-06 | Trask Industries | — | Defects get loose in the field |

Active suppliers' commodities are set in `data/suppliers.json`.

The Brand Corporation sample under `data/samples/brand-corporation/` is a demo upload for + New supplier (issue 172), not a candidate in the queue; it is derived from the SUP-07 packet, and its planned mix and expected result are in its README.

## Qualification queue: 9 candidate suppliers

Each lives at `data/suppliers/<id>/` as a packet of markdown "documents".

| ID | Commodity key | Risk | Story | Target total (hand) | Shipped total (engine) | Decision | Routing (reasons) |
|---|---|---|---|---|---|---|---|
| SUP-01 | `cold_plate` | High | Strong shop, one miss | 97.5 | **84.5** | NOT APPROVED | Senior (NOT APPROVED; High-risk commodity) |
| SUP-02 | `quick_disconnect` | High | Sole source, good docs | 92.1 | **97.8** | APPROVED | Senior (High-risk commodity; Sole source) |
| SUP-03 | `power_module` | High | Capability problems | 90.4 | **68.4** | NOT APPROVED | Senior (NOT APPROVED; High-risk commodity) |
| SUP-04 | `pcba` | Medium | Clean control case | 100.0 | **100.0** | APPROVED | **Junior** (APPROVED, Medium risk, second source confirmed) |
| SUP-05 | `machined_part` | Medium | Cert expired last month | 96.0 | **97.0** | NOT APPROVED | Senior (NOT APPROVED) |
| SUP-06 | `optics_cable` | Medium | Thin packet, mostly claims | 86.5 | **91.1** | CONDITIONAL (assumed knockout) | Senior (CONDITIONAL) |
| SUP-07 | `cold_plate` | High | Capacity can't meet ramp | 82.6 | **84.4** | CONDITIONAL | Senior (CONDITIONAL; High-risk commodity) |
| SUP-08 | `contract_mfg` | High | Big CM, ESD gap | 95.8 | **95.8** | NOT APPROVED | Senior (NOT APPROVED; High-risk commodity) |
| SUP-09 | `cold_plate` | High | Third cold-plate bidder, clean | 100.0 | **100.0** | APPROVED | Senior (High-risk commodity) |

Totals are computed by hand from `RUBRIC.md` under the Stark Reference v1 policy, with every criterion not in the gap matrix `verified` at score 3, and `9.second_source` verified `true` except for SUP-02. In the simulated world these are targets: `sim/run.mjs --find-demo` picks the first seed whose demo-world answer key lands every candidate on its row's decision and routing (totals may differ). The shipped demo world (seed 93) lands every decision and routing target; its engine totals are the **Shipped total** column, and those are the numbers the app, README and DEMO.md show. SUP-06 routes Senior for `CONDITIONAL; Second source unconfirmed`. SUP-01, SUP-07 and SUP-09 bid for the same Stark part, so Compare shows two acceptable bidders (SUP-09 APPROVED, SUP-07 CONDITIONAL) and SUP-01 below as NOT APPROVED.

## ~~Planted gaps: 25~~ (superseded 2026-11-09)

Replaced by the simulated world: each world's `answer_key.json` comes from the engine run on the simulated facts and is hash-locked before extraction (`docs/SIMULATION.md`). The matrix below is kept for history and as a menu of gap kinds the archetypes should produce.

Every planted gap is a row in `data/answer_key.json`. `info` gaps are nice-to-have evidence and carry no score.

| # | Supplier | Criterion | Expected state | Expected value | Score | Kind | How it is planted |
|---|---|---|---|---|---|---|---|
| 1 | SUP-01 | `4.leak_test` ★ | missing | null | 0 | missing | Reliability report covers burst and cleanliness, never mentions leak testing |
| 2 | SUP-02 | `9.second_source` | verified | false | 1 | fail | Cover letter: "the only qualified source of this coupling" |
| 3 | SUP-02 | `4.sample_size` | verified | false | 0 | fail | Cycle-life test run on n = 3 with no rationale |
| 4 | SUP-02 | `7.pcn_notice` | verified | 60 | 1 | fail | PCN policy states 60 days |
| 5 | SUP-03 | `2.ctq_cpk` ★ | verified | 0.94 | 0 | fail | Output-voltage ripple Cpk 0.94, in an appendix table |
| 6 | SUP-03 | `3.grr` ★ | verified | 24 | 1 | fail | Gage R&R 24% of tolerance |
| 7 | SUP-03 | `2.spc` | assumed | null | 1 | assumed | "SPC is applied where appropriate" |
| 8 | SUP-03 | `4.halt` | missing | null | — | info | No HALT report |
| 9 | SUP-05 | `1.cert_current` ★ | verified | 2026-10-15 | 0 | fail | Certificate shows expiry 2026-10-15 |
| 10 | SUP-05 | `4.fai` ★ | verified | 0.9 | 2 | fail | FAI covers 18 of 20 characteristics |
| 11 | SUP-06 | `1.internal_audit` | assumed | null | 1 | assumed | "We audit ourselves regularly" |
| 12 | SUP-06 | `2.pfmea` | assumed | null | 1 | assumed | "A PFMEA is maintained" |
| 13 | SUP-06 | `2.spc` | assumed | null | 1 | assumed | "Processes are statistically controlled" |
| 14 | SUP-06 | `4.workmanship_620` ★ | assumed | null | 1 | assumed | "Built to IPC/WHMA-A-620", no inspection record |
| 15 | SUP-06 | `7.pcn_notice` | missing | null | 0 | missing | PCN policy has no notice period |
| 16 | SUP-07 | `2.ctq_cpk` ★ | verified | 1.12 | 1 | fail | Flatness Cpk 1.12 |
| 17 | SUP-07 | `2.spc` | assumed | null | 1 | assumed | "SPC will be implemented at production launch" |
| 18 | SUP-07 | `6.capacity_ratio` | verified | 0.85 | 1 | fail | Capacity 1,700/wk against 2,000/wk peak forecast |
| 19 | SUP-07 | `6.lead_time` | verified | false | 0 | fail | Quoted 16 weeks against a 12-week need |
| 20 | SUP-07 | `6.ramp_plan` | assumed | null | 1 | assumed | "Ramp plan to follow" |
| 21 | SUP-07 | `8.subtier_named` | missing | null | 0 | missing | Quality manual §7.4 says plating is outsourced, names no one |
| 22 | SUP-07 | `8.subtier_certs` | missing | null | 0 | missing | No sub-tier certificates |
| 23 | SUP-07 | `4.thermal_cycling` | missing | null | — | info | No thermal-cycling data |
| 24 | SUP-08 | `4.esd_program` ★ | verified | false | 0 | fail | Process audit lists an open major finding on ESD control |
| 25 | SUP-08 | `4.fpy_data` ★ | verified | 3 | 1 | fail | FPY table covers 3 months |

By supplier: SUP-01 1 · SUP-02 3 · SUP-03 4 · SUP-04 0 · SUP-05 2 · SUP-06 5 · SUP-07 8 · SUP-08 2. By kind: 12 fail · 7 assumed · 4 missing (scored) · 2 info.

### ~~`data/answer_key.json`~~ (format now set by `docs/SIMULATION.md`)

```json
[
  { "n": 16, "supplier_id": "SUP-07", "criterion_id": "2.ctq_cpk", "expected_state": "verified",
    "expected_value": 1.12, "expected_score": 1, "kind": "fail" }
]
```

`expected_score` is `null` for `info` rows. The validator (M3) checks that every row's criterion applies to the supplier's commodity and that `expected_score` equals the engine's score for that state and value.

### ~~`data/reference/<id>.json`~~ (now derived from the answer key)

A hand-written, correct extraction per supplier: every criterion that applies, in the PRD-04 extraction format. It is the input for the decision tests, and the eval uses it to detect false positives. Its gaps must equal the answer key's rows for that supplier.

## Packet style

- Files per supplier, picked to fit the story: `cover_letter.md`, `quality_manual.md`, `certificates.md`, `pfmea.md`, `control_plan.md`, `capability_study.md`, `msa.md`, `reliability_report.md`, `capacity.md`, `subtier.md`, `pcn_policy.md`.
- Numbered sections (`## 1`, `### 7.4`) so every citation can be written `file §section`.
- Written the way suppliers write: marketing tone in the cover letter, vague claims ("where appropriate", "regularly"), and some evidence only in an appendix table.
- Packets are written by Codex from the simulated facts (#72) and checked by the fact check (#73).
- Each gap is findable from the packet alone: the evidence (or its absence) is in a specific section, and a careful reader could cite it.
- At least two passing items per supplier sit in appendices, so the agent can't score well by reading only the first page.
- No gap depends on knowledge outside the packet, except `as_of` and the rubric.

## Active suppliers: 6, 18 months of history

The history simulator (#70) writes `data/worlds/<n>/history.csv` (schema in [SCORECARD.md](SCORECARD.md)); the demo world's copy is `data/history.csv`.

- Seeded PRNG (`sim/rng.mjs`, no dependency). The same seed must give byte-identical output.
- Rows sorted by `date`, then `supplier_id`, then `part_no`. Unix line endings, no trailing spaces.
- 4–12 lots per supplier per month, each 200–2,000 parts. Failure-mode codes from a fixed list (`FM-LEAK`, `FM-PLATING`, `FM-FLATNESS`, `FM-SOLDER`, `FM-LABEL`, `FM-DAMAGE`).
- The stories and their must-hold / must-not-hold outcomes are in [SCORECARD.md](SCORECARD.md#active-supplier-stories). The demo world is the first seed whose history meets every story; stories are not hard-coded.

## Agent output format

`data/extracted/<id>.json`. The schema is owned by [PRD-04](product/PRD-04-agent.md). The engine scores only from `state` and `value`; the agent never writes a score.
