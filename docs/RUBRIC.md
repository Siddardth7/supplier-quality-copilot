# Qualification Rubric v1

The single source of truth for the scoring engine. If the engine and this doc disagree, fix one of them in the same commit. Product requirements for the engine are in [PRD-01](product/PRD-01-qualification-engine.md).

## Scoring model

- Each **criterion** has a stable ID (`<category>.<slug>`, e.g. `2.ctq_cpk`), a value type and a scoring rule (tables below). It scores **0–3**.
- Every criterion carries an **evidence state** from extraction:

| State | Meaning | Score |
|---|---|---|
| `verified` | Evidence found; `value` and `citation` present | The criterion's rule applied to `value` |
| `assumed` | Supplier claims it, no proof | `min(1, rule(value))`, or 1 when `value` is null |
| `missing` | Nothing found | 0 |

- A criterion the extraction leaves out counts as `missing`.
- **Category score** = sum(criterion scores) / (3 × number of criteria) × category weight.
- **Total** = sum of the unrounded category scores, then rounded to 1 decimal (half up). The rounded total is what is shown and what the decision thresholds compare against. Category scores are shown to 1 decimal, so the displayed categories may not add up exactly to the total.
- A **knockout** (★) is a must-pass criterion. A knockout at score 0 **fails** and forces `NOT APPROVED` regardless of the total. A knockout in state `assumed` with no value or a passing claimed value scores 1, so it does not fail, but it blocks `APPROVED`; a claimed failing value scores 0 and fails (see Decision).
- **Nice-to-have** evidence (category 4) is reported but not scored. It never changes the total or the decision.

### Value types

| Type | `value` | Rule unless the criterion says otherwise |
|---|---|---|
| `bool` | `true` / `false` | `true` = 3, `false` = 0 |
| `number` | a number in the stated unit | the criterion's bands |
| `date` | `YYYY-MM-DD` | `value ≥ as_of` = 3, else 0. `as_of` is the evaluation date passed to the engine |
| `enum` | one of the listed strings | the criterion's mapping |

**Band edges.** Bands are written with explicit comparison signs. An edge value belongs to the band whose sign includes it: Cpk = 1.33 scores 3, Cpk = 1.00 scores 1, Gage R&R = 10% scores 3, Gage R&R = 30% scores 1.

**Basis of thresholds.** The Cpk ≥ 1.33 bar and the Gage R&R 10% / 30% bands follow common AIAG practice (PPAP initial process studies and the MSA manual). Every other band, weight, cut-off and routing rule is this project's own engineering heuristic, not a requirement of any standard. The v1.2 port must label them that way (PRD-09).

Display only, no score change: the UI labels a verified Cpk ≥ 1.67 "excellent" (UIQ-FR-19).

### Value bounds

A `number` value that cannot exist is refused with an error naming the criterion (`<id>: expected a number >= 0, got -1`), the same way a non-finite number is. Bounds are inclusive and checked before the bands, for `verified` values and for `assumed` claims. They are physical limits, not scoring edges, and are this project's domain sense, not a requirement of a standard. A `missing` item carries no value and is not checked. Dates, booleans and enums keep their own checks.

| ID | Min | Max | Why |
|---|---|---|---|
| `2.ctq_cpk` | none | none | Cpk is negative when the process mean is outside the limits |
| `3.grr` | 0 | none | % of tolerance; can exceed 100 |
| `4.fai` | 0 | 1 | a share, 0–1 |
| `4.fpy_data` | 0 | none | months |
| `5.records_retention` | 0 | none | years |
| `6.capacity_ratio` | 0 | none | a ratio of non-negative quantities |
| `7.pcn_notice` | 0 | none | days |

## Categories and weights

| # | Category | Weight |
|---|---|---|
| 1 | Quality system | 15 |
| 2 | Process control | 15 |
| 3 | Measurement | 10 |
| 4 | Reliability & validation | 15 |
| 5 | Traceability | 10 |
| 6 | Capacity & ramp | 10 |
| 7 | Change control | 8 |
| 8 | Sub-tier management | 7 |
| 9 | Supply risk | 10 |

Weights sum to 100. One global rubric for every commodity (PRD-00 NG7). Only category 4's criteria change with the commodity.

## Criteria

| ID | Cat | ★ | Type | Requirement | Scoring rule |
|---|---|---|---|---|---|
| `1.cert_current` | 1 | ★ | date | Expiry date of the quality-system certificate | expiry ≥ `as_of` = 3 · expiry < `as_of` = 0 |
| `1.cert_scope` | 1 | ★ | bool | Cert is ISO 9001, AS9100 or IATF 16949, and its scope covers the process that makes this part | bool |
| `1.internal_audit` | 1 | | bool | Internal audit program in place | bool |
| `1.capa` | 1 | | bool | Documented CAPA process | bool |
| `1.calibration` | 1 | | bool | Calibration program covering production gauges | bool |
| `2.pfmea` | 2 | | bool | Current PFMEA for this part | bool |
| `2.control_plan` | 2 | | bool | Control plan covers every CTQ | bool |
| `2.ctq_cpk` | 2 | ★ | number | Lowest Cpk across the part's CTQs | ≥ 1.33 = 3 · 1.00 ≤ x < 1.33 = 1 · < 1.00 = 0 |
| `2.spc` | 2 | | bool | SPC in use on CTQs | bool |
| `3.grr` | 3 | ★ | number | Highest Gage R&R across CTQ gauges, % of tolerance | ≤ 10 = 3 · 10 < x ≤ 30 = 1 · > 30 = 0 |
| `3.inspection_method` | 3 | | bool | Inspection method suited to the tolerance (CMM, AOI, X-ray) | bool |
| `4.<test>` | 4 | ★ | per test | Each commodity-required test (table below) present and passing | per test, below |
| `4.method_criteria` | 4 | | bool | Test methods and acceptance criteria stated for the required tests | bool |
| `4.sample_size` | 4 | | bool | Sample sizes for the required tests justified (statistical basis or a cited standard) | bool |
| `5.lot_trace` | 5 | ★ High risk only | bool | Lot or serial traceability to raw material | bool. A knockout only when the commodity's risk class is High |
| `5.records_retention` | 5 | | number | Quality-record retention, years | ≥ 10 = 3 · 5 ≤ x < 10 = 1 · < 5 = 0 |
| `5.nc_segregation` | 5 | | bool | Nonconforming material identified and segregated | bool |
| `6.capacity_ratio` | 6 | | number | Demonstrated capacity ÷ forecast peak demand | ≥ 1.2 = 3 · 1.0 ≤ x < 1.2 = 2 · 0.8 ≤ x < 1.0 = 1 · < 0.8 = 0 |
| `6.lead_time` | 6 | | bool | Quoted lead time meets the need date | bool |
| `6.ramp_plan` | 6 | | bool | Ramp plan with dates and added capacity | bool |
| `7.pcn_notice` | 7 | | number | PCN notice period, days | ≥ 90 = 3 · 30 ≤ x < 90 = 1 · < 30 = 0 |
| `7.change_approval` | 7 | | bool | No process, site or sub-tier change without customer approval | bool |
| `8.subtier_named` | 8 | | bool | Critical sub-tier suppliers named | bool |
| `8.flowdown` | 8 | | bool | Requirements flowed down to sub-tier | bool |
| `8.subtier_certs` | 8 | | bool | Certificates on file for the critical sub-tier | bool |
| `9.second_source` | 9 | | bool | A second qualified source exists for this part | `true` = 3 · `false` = 1 (sole source caps at 1) |
| `9.region_risk` | 9 | | enum | Risk of the manufacturing site's region | `low` = 3 · `medium` = 2 · `high` = 1 |
| `9.financial_health` | 9 | | enum | Financial health indicator | `healthy` = 3 · `watch` = 1 · `distressed` = 0 |

Criterion IDs are never reused. A criterion in the extraction that doesn't apply to the supplier's commodity (e.g. `4.burn_in` for a cold plate) is ignored and reported as a warning.

## Commodity reliability requirements (category 4)

Category 4 is built from two tables, so it grows by adding rows, never by changing code:

1. The **test catalog** defines every reliability test once: its ID, what passing means, its value type and its scoring rule.
2. **Commodity profiles** list, for each commodity, which catalog tests are required (★ knockout) and which are nice to have (not scored).

A test can be required for one commodity and nice to have for another (`4.thermal_cycling` is required for `power_module`, nice to have for `cold_plate`). There is no limit on how many tests a commodity has.

### Test catalog

Unless stated, a test is `bool`: `true` = report present and the result meets **Stark's limit on the part's requirement sheet** (`data/requirements/<commodity>.json`), not the supplier's own acceptance criterion, `false` = report present and failing. A test with no report is `missing`, so a required test with no report fails the knockout. The standards named are typical references, not requirements of this rubric.

| ID | Test | Passes when | Type and rule |
|---|---|---|---|
| `4.leak_test` | Leak test | Helium leak rate at or below the stated spec | bool |
| `4.burst_pressure` | Burst / proof pressure | Holds the stated multiple of max operating pressure | bool |
| `4.cleanliness` | Internal cleanliness | Particle count within the stated limit (ISO 16232 style) | bool |
| `4.material_cert` | Material certificate | Cert traceable to the lot and matching the drawing material | bool |
| `4.thermal_cycling` | Thermal cycling / HTOL | Passes the stated cycles or hours with no failure | bool |
| `4.coolant_compat` | Coolant compatibility | Wetted materials shown compatible with the system coolant | bool |
| `4.cycle_life` | Connect / disconnect cycle life | Meets the rated cycle count with leak test still passing | bool |
| `4.pressure_drop` | Pressure drop | Within spec at rated flow | bool |
| `4.spill_volume` | Spill on disconnect | Within spec | bool |
| `4.burn_in` | Burn-in | Burn-in run at stated conditions, fallout within limit | bool |
| `4.efficiency` | Efficiency vs load | Meets the efficiency curve across the load range | bool |
| `4.halt` | HALT | Margins to operating and destruct limits reported | bool |
| `4.derating` | Component derating | Derating analysis against a stated policy | bool |
| `4.ipc610_class` | Workmanship, IPC-A-610 | Built and inspected to the class on the drawing | bool |
| `4.aoi_xray` | AOI and BGA X-ray | AOI on every board and X-ray on BGAs, results within criteria | bool |
| `4.ict_fct` | In-circuit / functional test | Coverage stated and every shipped board passes | bool |
| `4.ionic_contam` | Ionic contamination | Within the stated limit | bool |
| `4.msl` | Moisture sensitivity handling | J-STD-033 controls in place | bool |
| `4.conformal_coat` | Conformal coating | Thickness and coverage inspected | bool |
| `4.fai` | First article inspection | Share of drawing characteristics covered, 0–1 | number: 1.0 = 3 · 0.9 ≤ x < 1.0 = 2 · 0.5 ≤ x < 0.9 = 1 · < 0.5 = 0 |
| `4.cmm_report` | CMM report | Flatness and every CTQ dimension measured and in tolerance | bool |
| `4.surface_finish` | Surface finish | Ra measured and within the drawing | bool |
| `4.insertion_loss` | Insertion / return loss | Within spec on every channel | bool |
| `4.workmanship_620` | Workmanship, IPC/WHMA-A-620 | Built and inspected to the class on the drawing | bool |
| `4.bend_flex` | Bend / flex | Passes the stated cycles with loss still in spec | bool |
| `4.coating_thickness` | Coating thickness | Within the drawing range | bool |
| `4.salt_spray` | Salt spray | Passes the stated hours (ASTM B117 style) | bool |
| `4.process_audit` | Process audit | Audit done, no open major finding | bool |
| `4.esd_program` | ESD control program | Program in place (ANSI/ESD S20.20 style), no open major finding | bool |
| `4.fpy_data` | First-pass yield data | Months of FPY data available | number: ≥ 6 = 3 · 3 ≤ x < 6 = 1 · < 3 = 0 |
| `4.mes_trace` | MES traceability | Serial-level build records in an MES | bool |
| `4.training_records` | Operator training records | Records current for the stations building this part | bool |

### Commodity profiles

| Commodity key | Commodity | Risk class | Required (★) | Nice to have (not scored) |
|---|---|---|---|---|
| `cold_plate` | Cold plate / coolant manifold | High | `4.leak_test` · `4.burst_pressure` · `4.cleanliness` · `4.material_cert` | `4.thermal_cycling` · `4.coolant_compat` |
| `quick_disconnect` | Quick-disconnect coupling | High | `4.leak_test` · `4.cycle_life` · `4.pressure_drop` | `4.spill_volume` |
| `power_module` | Power conversion module | High | `4.burn_in` · `4.thermal_cycling` · `4.efficiency` | `4.halt` · `4.derating` |
| `pcba` | High-layer PCBA | Medium | `4.ipc610_class` · `4.aoi_xray` · `4.ict_fct` · `4.ionic_contam` | `4.msl` · `4.conformal_coat` |
| `machined_part` | Precision machined part | Medium | `4.fai` · `4.cmm_report` · `4.material_cert` | `4.surface_finish` |
| `optics_cable` | Optics / cable assembly | Medium | `4.insertion_loss` · `4.workmanship_620` | `4.bend_flex` |
| `sheet_metal` | Rack sheet metal | Low | `4.fai` · `4.coating_thickness` | `4.salt_spray` |
| `contract_mfg` | Contract manufacturer (system build) | High | `4.process_audit` · `4.esd_program` · `4.fpy_data` · `4.mes_trace` | `4.training_records` |

### Adding a test or a commodity

The engine, the UI and the agent all read these two tables (`app/rubric.js`, QUAL-NFR-05). Adding a test or commodity is a data change:

1. **Reuse first.** If the catalog already has the test, use its ID. One test, one ID, across every commodity.
2. **Add the catalog row.** New ID `4.<slug>` (lowercase, never reused), what passing means, and the value type. Use `bool` unless the evidence is a quantity; then give bands with explicit edges, like `4.fai`. Note the basis: a cited standard, or project heuristic.
3. **Add it to a profile.** Put the ID in the commodity's Required or Nice-to-have column. A new commodity needs a key, a name, a risk class and at least one required test.
4. **Mirror it in `app/rubric.js`** in the same commit. The parity test fails until doc and data agree.
5. **Run `node --test`.** The integrity tests check that IDs are unique, every profile ID is in the catalog, no test is both required and nice to have for one commodity, and every rule is valid for its type.
6. **Check the dataset.** If a dataset supplier has that commodity, its expected totals and decisions change. Update `DATASET.md` and the reference extraction in the same PR.
7. **Log it.** Add a line to this doc's changelog and bump the minor version (v1 → v1.1).

Nothing else changes. Only a test that needs a new value type (not bool, number, date or enum) is an engine change, and that goes through `/ship`.

Each required test's share of the category 4 weight shrinks as tests are added, but that doesn't weaken it: a required test at 0 still forces NOT APPROVED.

## Decision and routing

| Result | Rule (on the rounded total) |
|---|---|
| **APPROVED** | Total ≥ 85, no knockout fails, and no knockout is `assumed` |
| **CONDITIONAL** | No knockout fails, and either 70 ≤ total < 85, or total ≥ 85 with a knockout `assumed`. Approve with a corrective plan and due dates |
| **NOT APPROVED** | Total < 70, or any knockout fails. On-site audit required before re-submission |

**Sole source** means `9.second_source` is anything other than `verified` with `true`.

**Who signs off:**
- **Junior SQE**: result is APPROVED **and** risk class is Low or Medium **and** not sole source.
- **Senior SQE**: everything else.

The routing reason lists every rule that sent it to a senior, in this order: `NOT APPROVED` or `CONDITIONAL` · `High-risk commodity` · `Sole source` (when `9.second_source` is `verified` `false`) or `Second source unconfirmed` (when it is `missing`, or `assumed` with any value). A junior routing has the reason `APPROVED, <risk> risk, second source confirmed`.

## Team scoring policy

The weights, pass marks and knockouts above are the **Stark Reference v1** policy. A team can save its own policy in the app; the engine takes the policy as an input and every result names the policy that scored it. Everything else in this rubric (criteria, value types, bands, routing) is fixed.

| Parameter | Stark Reference v1 | Rule |
|---|---|---|
| `weights` | the Categories table | one number per category, each ≥ 0, summing to 100 (±0.01). The app sets them from a 1–5 importance rating per category, normalized to 100; the reference keeps its exact points until a rating is changed |
| `approve` | 85 | 0–100 |
| `conditional` | 70 | 0 ≤ `conditional` < `approve` |
| `knockouts_off` | `[]` | knockout criterion IDs (★) whose knockout is switched off. A switched-off knockout still scores; it just can't force NOT APPROVED or cap at CONDITIONAL |

A policy also carries `id` (non-empty string), `version` (integer ≥ 1) and `name` (non-empty string); the engine rejects a policy without them.

```json
{ "id": "stark-reference", "version": 1, "name": "Stark Reference v1",
  "qualification": { "weights": { "1": 15, "2": 15, "3": 10, "4": 15, "5": 10, "6": 10, "7": 8, "8": 7, "9": 10 },
                     "approve": 85, "conditional": 70, "knockouts_off": [] },
  "scorecard": { "…": "see SCORECARD.md" } }
```

A saved policy gets a new `version` on every change. Policies live in the browser in v1.0 (save, share by link, export/import); team-wide storage is v2.0. A policy saved from the app may also carry `qualification.ratings`, the 1–5 importance per category that produced its `weights`; the engine ignores it and scores from `weights` alone.

## Outputs per supplier

1. **Score breakdown** by category, with every criterion's score, evidence state, value and citation (`file §section`).
2. **Gap list**: every scored criterion below 3, typed as
   - `fail`: `verified`, and the evidence shows it falls short
   - `assumed`: claimed without proof
   - `missing`: no evidence

   Nice-to-have evidence that is not `verified` (`missing` or `assumed`) is listed separately as `info`.
3. **RFI items**: the `missing` and `assumed` gaps, which are things the supplier can send. `fail` gaps need corrective action, not information, so they aren't in the RFI. Nice-to-have items aren't requested.
4. **Audit focus**: up to 3 gaps, picked in this order: knockouts first, then lowest score, then higher category weight, then order in the criteria table. A supplier with no gaps has no audit focus.
5. **Routing** and its reason.

## Worked example: SUP-07

SUP-07 is a cold plate (`cold_plate`, High risk). Every criterion not listed here is `verified` and scores 3. Its certificate expires after `as_of`, so `1.cert_current` scores 3.

| ID | State | Value | Score |
|---|---|---|---|
| `2.ctq_cpk` | verified | 1.12 (flatness) | 1 |
| `2.spc` | assumed | null | 1 |
| `6.capacity_ratio` | verified | 0.85 | 1 |
| `6.lead_time` | verified | false | 0 |
| `6.ramp_plan` | assumed | null | 1 |
| `8.subtier_named` | missing | null | 0 |
| `8.subtier_certs` | missing | null | 0 |

Nice to have (not scored): `4.thermal_cycling` is `missing`, `4.coolant_compat` is `verified`.

| Cat | Criteria | Sum / max | Score |
|---|---|---|---|
| 1 | 5 | 15 / 15 | 15.0 |
| 2 | 4 | 8 / 12 | 10.0 |
| 3 | 2 | 6 / 6 | 10.0 |
| 4 | 6 (4 required + 2) | 18 / 18 | 15.0 |
| 5 | 3 | 9 / 9 | 10.0 |
| 6 | 3 | 2 / 9 | 2.2 |
| 7 | 2 | 6 / 6 | 8.0 |
| 8 | 3 | 3 / 9 | 2.3 |
| 9 | 3 | 9 / 9 | 10.0 |
| | | **Total** | **82.6** (82.5556 unrounded) |

- **Knockouts:** none fail (`2.ctq_cpk` scores 1) and none are assumed.
- **Decision:** CONDITIONAL, because 70 ≤ 82.6 < 85.
- **Not the shipped packet:** this is a hand-written reference extraction that tests the engine (`app/evaluate.test.js`). The simulated SUP-07 packet in `data/` has a different gap mix and scores **84.4** CONDITIONAL (`docs/DATASET.md`).
- **Routing:** Senior SQE, for the reasons `CONDITIONAL` and `High-risk commodity`.
- **Gaps:** 3 fails (`2.ctq_cpk`, `6.capacity_ratio`, `6.lead_time`), 2 assumed (`2.spc`, `6.ramp_plan`) and 2 missing (`8.subtier_named`, `8.subtier_certs`), plus `4.thermal_cycling` as `info`.
- **RFI items:** `2.spc`, `6.ramp_plan`, `8.subtier_named`, `8.subtier_certs`.
- **Audit focus:** `2.ctq_cpk` (a knockout), then `6.lead_time` (score 0, weight 10), then `8.subtier_named` (score 0, weight 7, comes before `8.subtier_certs` in the table).

## Open questions for the panel (good conversation starters)

- Do they weight categories by commodity, or use one global rubric?
- What is their junior delegation threshold today?
- Do reliability engineers own the category 4 acceptance, or does the SQE?
- Would they approve on a supplier's claim for a knockout item? (This rubric caps it at CONDITIONAL.)

## Changelog

| Date | Change |
|---|---|
| 2026-11-17 | Value bounds: a number below its minimum (or 4.fai above 1) is refused with an error naming the criterion, as a non-finite number already is (issue 161, audit B1). No scores change on data/ or worlds 93, 101-104. |
| 2026-11-12 | Team scoring policy: a saved policy may carry `qualification.ratings` (1–5 per category) beside `weights`; the engine ignores it (issue 109). No scores change. |
| 2026-11-12 | Basis of thresholds: the UI labels a verified Cpk ≥ 1.67 "excellent", display only (UIQ-FR-19, #41). No scores change. |
| 2026-11-10 | Team scoring policy: a policy must carry `id` (non-empty string), `version` (integer ≥ 1) and `name` (non-empty string); the engine rejects one without them (#23). No scores change. |
| 2026-11-09 | Gap list: every nice-to-have test that is not `verified` (`missing` or `assumed`) is `info`, listed separately from the gaps (Sid, #19). No scores change. |
| 2026-11-09 | Routing reason: an `assumed` second source, any value, is 'Second source unconfirmed'; only `verified` `false` is 'Sole source' (Sid). No scores or routes change. |
| 2026-11-09 | An `assumed` knockout is scored `min(1, rule(value))`: with no value or a passing claimed value it scores 1 (blocks APPROVED, does not fail); a claimed failing value (e.g. Cpk 0.9) scores 0 and fails. Scores of `verified` and `missing` items are unchanged. |
| 2026-11-09 | Team scoring policy: weights, pass marks and knockout switches are policy inputs with Stark Reference v1 defaults. Required tests are judged against Stark's requirement-sheet limit. No scores change under the reference policy. |
| 2026-11-09 | Category 4 split into a test catalog and commodity profiles, with the procedure for adding a test or commodity. No scores change. |
| 2026-11-08 | v1: criterion IDs, value types, band edges, per-commodity category 4, SUP-07 worked example. |
