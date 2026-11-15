# Supplier simulation spec

| Field | Value |
|---|---|
| Status | Draft |
| Release / milestone | v1.0 / M3b |
| Spec issue | #66 |
| Implemented by | #67–#75 |
| Product requirements | [PRD-03](product/PRD-03-dataset.md), [PRD-04 §5](product/PRD-04-agent.md#5-interfaces) |
| Last updated | 2026-11-13 |

## 1. Purpose and independence

Simulate Stark Industries' supplier base so qualification problems arise from seeded processes and disclosure behavior. Codex turns the simulated facts into supplier documents; the engine builds the answer key. A separate, fresh extraction session reads each packet. This replaces the historical planted-gap matrix in [DATASET.md](DATASET.md); it does not reproduce that matrix or its exact totals.

```text
archetypes + seed -> world sampler -> candidate simulation -> facts --+-> engine -> answer key + hash
                                 -> history simulation -> CSV ------+
facts + Stark requirement sheet -> brief -> isolated writer -> packet -> deterministic fact check
locked world + frozen extraction skill -> blind extraction -> hash check -> eval
```

[RUBRIC.md](RUBRIC.md) owns criteria, applicability, scoring, commodity risk, routing and the Stark Reference policy. [SCORECARD.md](SCORECARD.md) owns history columns, metrics, windows, alerts and ACT story assertions. [DATASET.md](DATASET.md) owns names and packet style. Approved product requirements take precedence over abbreviated issue descriptions. This spec supplies simulation parameters and interfaces, not replacement scoring rules.

**Numeric basis.** Every simulation range, distribution parameter, sample count, date fixture, search bound, retry limit and story-selection choice below is a **project heuristic**, not a standard requirement. `H` in tables means **heuristic** and applies to every numerical value in that row. Seed labels, schema versions and IDs are identifiers. Mathematical identities and type domains are definitions. Scoring thresholds remain in their owning specs, with their existing basis labels; a standard's name alone does not make a simulation limit standard-derived. The numerical choices here are Draft starting ranges, not evidence that a suitable demo seed has already been found.

### Access boundaries

| Stage | Allowed inputs | Excluded inputs |
|---|---|---|
| Simulator and answer-key builder | Archetypes, seed, requirement sheets, rubric data, engine, simulated facts and history | Extraction output; no feedback from reader success |
| Supplier writer | One supplier's `brief.md`, containing its permitted facts and Stark RFQ | `RUBRIC.md`, rubric data, engine, answer key, target decisions, other suppliers, repository instructions and earlier conversations |
| Blind extractor | Only `SKILL.md`, `RUBRIC.md`, and that supplier's `packet/`, as staged by PRD-04 §5 | Facts, briefs, answer key/hash, reference extractions, `DATASET.md`, this spec, PRDs, engine, other packets and earlier extractions |
| Eval | Completed extractions, frozen skill/run metadata, locked answer key, history results | No rewriting the original key to agree with the reader |

The writer is Codex; reader model/run choices belong to PRD-04. Use a fresh isolated session per supplier for both roles. Being in a temporary directory alone is not proof of read isolation: the runner must enforce the permitted inputs, and extraction path audits must pass. Writer retries receive only document-level failures translated into ordinary supplier language, never criterion IDs, scores or answer-key rows.

**Lock rule (#71).** The commit adding a world's `answer_key.sha256` must be merged into `test` before any blind extraction of that world. Record that commit and the frozen extraction skill's SHA in the run evidence. Hash the exact bytes of `answer_key.json` using SHA-256 (`node:crypto`); eval refuses a mismatch, including a one-byte edit. A feature-branch commit alone does not satisfy the lock. A changed key is a new lock requiring review before a new run; never replace an old run's evidence. Sid merges; the builder does not push to or merge `test` or `main`.

## 2. Seeds and reproducibility

| World | Seed policy | Use | Basis |
|---|---|---|---|
| Demo | First eligible seed passing all candidate targets and ACT story checks in the default search `--from 1 --to 20000` | App data and a separately reported demo eval | H |
| Eval | `101`, `102`, `103`, `104`, fixed before extraction | Headline evaluation; build as-is, never filter or re-roll | Seed identifiers |
| Fresh re-test | `105`, `106`, `107`, `108` | PRD-04 re-test after skill changes informed by results; report every run | Seed identifiers |

The demo seed is not assigned in #66. Reserve eval and re-test seeds from demo selection so the selected demo cannot also count as an unseen evaluation world. Log reserved-seed exclusions and every attempted seed's rejection reasons. Search uses only traits, simulated facts, history and engine results, with no writer invocation and no extraction. If the range has no match, report failure; do not patch facts, history rows or decisions. Revisions to Draft archetypes require review and cannot be selected using eval extraction performance.

`--find-demo` defaults to an upper bound of 20,000 (H) and evaluates the full eligible range with the cheap simulation steps, retaining the first seed that meets every target. Print per-supplier candidate-target and per-ACT-story hit counts and hit rates over that range, including the eligible-seed denominator. Tune any archetype whose hit rate is below about 0.3 (H diagnostic threshold), using simulation outputs only, never eval extraction results; rerun the range and retain the diagnostics for each reviewed revision. Finding an early match does not skip the remaining range diagnostics. ACT-02 is the known exception: its creep story is structurally limited to a few percent (about 4%, §5), below that threshold, and is accepted as a selected-seed story rather than tuned further.

`sim/rng.mjs` (#67) provides `makeRng(seed)` with `next()`, `uniform(a,b)`, `normal(mu,sd)`, `int(a,b)`, `pick(arr)`, `bernoulli(p)` and `poisson(lambda)`. Use a reproducible 32-bit PRNG such as mulberry32 and Box–Muller normal draws. `sim/` never uses `Math.random` or the current clock for generated data. World seeds are unsigned 32-bit integers; reject invalid seeds rather than silently choosing another.

`sim/seed.mjs` provides `subSeed(worldSeed, label)` using a stable string hash, such as FNV-1a of `${worldSeed}:${label}`. Each supplier has a stream keyed by its ID, so removing or adding another supplier cannot change its draws. `sim/world.mjs` exposes `sampleWorld(seed)` returning `{ seed, candidates: [{ id, name, commodity, archetype, target, traits }], active: [...] }`.

In `sim/archetypes.json`, each supplier has `{ id, name, commodity, archetype, target: { decision, routing }, traits }`. Active targets identify their SCORECARD story instead of inventing a qualification decision. Numeric `[min, max]` trait ranges are sampled uniformly; integers use inclusive integer draws. A scalar pins a trait, enums use a documented allowed-choice list, and probability maps contain probabilities, not numeric range arrays. Expand the defaults in §5 into each supplier's data entry. Trait sampling is distinct from later normal, Poisson, binomial and Bernoulli process draws.

The frozen #74 worlds use Node26.0.0 on ARM64 macOS, recorded in `.node-version` and `data/simulation/runtime.json`; CI uses ARM64 macOS with that Node release. Keep this runtime/platform fixed for bitwise reconstruction. Native floating-point Math can differ in the last bits across platforms; cross-platform canonicalization is not claimed and would require a separately reviewed numeric-format change. With fixed simulator code, runtime, archetypes, requirement sheets and policy, the same seed must give byte-identical simulator-owned outputs. Use stable field/array ordering, UTF-8, Unix line endings and no trailing spaces. Do not put wall-clock timestamps or elapsed durations in deterministic files. Codex prose is the exception: retain each exact prompt, model/version and output hash. A no-writer rebuild reuses the frozen packet/provenance artifacts and must not launch Codex; compare all deterministic files, including facts, history, suppliers, references and answer key. Report actual build runtime in the implementation PR.

## 3. Suppliers and Stark requirement sheets

### Supplier roster

Every world contains the following candidate and active IDs and exact display names. Candidate commodities and risk come from DATASET/RUBRIC; active commodity assignments below are Draft fixture choices (H), stored explicitly in `suppliers.json` as DATASET requires.

| ID | Display name | Commodity key | Candidate risk / active story |
|---|---|---|---|
| SUP-01 | Frost Technotics | `cold_plate` | High |
| SUP-02 | Wakanda Design Group | `quick_disconnect` | High |
| SUP-03 | Hammer Industries | `power_module` | High |
| SUP-04 | Pym Technologies | `pcba` | Medium |
| SUP-05 | Cross Technological Enterprises | `machined_part` | Medium |
| SUP-06 | Stane International | `optics_cable` | Medium |
| SUP-07 | Oscorp | `cold_plate` | High |
| SUP-08 | Roxxon | `contract_mfg` | High |
| SUP-09 | Horizon Labs | `cold_plate` | High; solid shop |
| ACT-01 | Damage Control | `sheet_metal` | Stable, excellent |
| ACT-02 | Alchemax | `pcba` | Reject rate creeping up |
| ACT-03 | Rand Enterprises | `machined_part` | One bad lot |
| ACT-04 | Timely Industries | `quick_disconnect` | Poor delivery |
| ACT-05 | A.I.M. (Advanced Idea Mechanics) | `cold_plate` | Repeat failure mode, old SCARs |
| ACT-06 | Trask Industries | `power_module` | Escapes to line and field |

SUP-01, SUP-07 and SUP-09 bid for the same Stark part and must receive the same part number, revision, CTQs, test limits, peak demand and need-by lead time. An archetype cannot change the buyer's limits. All other part numbers and descriptions are fictional too. Staff may be fictional Marvel characters; use `REG-` placeholders for registrar/certificate identifiers. Follow DATASET's full naming rules, including avoiding a Marvel name that is also a real supplier of the commodity. No real company or person is introduced into generated records.

### Requirement-sheet contract (#68)

Produce `data/requirements/<commodity>.json` and `.md` for every commodity in RUBRIC, including `sheet_metal` even though it has no candidate. Render with `sim/render-requirements.mjs`. Each sheet includes the header `Stark Industries — Supplier Quality. Synthetic document for a demo.` The JSON is the simulator's input; the Markdown RFQ is included in each relevant packet.

| JSON field | Meaning / unit |
|---|---|
| `header` | Required exact string: `Stark Industries — Supplier Quality. Synthetic document for a demo.` |
| `commodity` | Exact RUBRIC commodity key |
| `part_no`, `part_name`, `revision`, `drawing_no` | Fictional Stark part identity and controlled drawing revision |
| `ctqs[]` | 3–5 CTQs (H), each with nonempty text `name` and `unit`, finite numeric `nominal`, and both finite inclusive tolerance bounds, `lsl` and `usl`, with `lsl < nominal < usl`; every CTQ is two-sided in v1.0 |
| `tests` | Map keyed by every required and nice-to-have test ID in the profile; each entry describes measurable acceptance conditions, comparison direction, limit(s) and unit(s); one-sided limits are allowed for tests only |
| `peak_weekly_demand` | Positive integer parts/week (H; value reviewed in #68) |
| `need_by_weeks` | Positive lead time in weeks (H; value reviewed in #68) |
| `planning_basis` | Required `"heuristic"`; applies to peak demand and need-by lead time |
| `basis`, `standard` | Attach to each CTQ tolerance and each test limit: `basis: "heuristic"`, or `basis: "standard"` with the named standard and traceable provision; `standard` is omitted for heuristic limits |

All fields above are required except `standard`, which is conditional on `basis`. Identity fields are nonempty strings. `need_by_weeks` is a finite positive number. Each `tests[test_id]` has the following required fields:

| Test entry field | Contract |
|---|---|
| `name` | Nonempty human-readable test name |
| `required` | Boolean: true for the profile's required tests, false for nice-to-have tests |
| `value_type` | `"bool"` or `"number"`, matching the RUBRIC catalog output type; this is distinct from individual condition value types |
| `conditions` | Nonempty array of condition objects below, with at least one `kind: "acceptance"` |

| Condition field | Contract |
|---|---|
| `measure` | Required nonempty description of the measured result or setup parameter, including its scope |
| `kind` | Required `"setup"` or `"acceptance"`. Setup defines how the test is run (such as pressure, temperature, wavelength, load point, coolant or flow); it is not a supplier result to draw and score. Acceptance defines a result judged against the buyer's limit. Drawing callouts (material designation, inspection class) are setup; the matching "matches / built to / inspected to drawing" booleans are acceptance evidence. Completed endurance cycles are acceptance evidence; exposure settings and dwell/hold times are setup. |
| `operator` | Required `<=`, `>=`, `=`, or `between` |
| `value` | Required finite number for `<=` and `>=`; finite number, nonempty string or boolean for `=`; two-element array of finite numbers `[lower, upper]` with `lower < upper` for `between`. `between` includes both endpoints. |
| `unit` | Required nonempty unit string; use `boolean` for boolean values and `designation` or `class` for categorical values |
| `context` | Optional nonempty text describing the method, scope or relationship to other conditions |
| `basis` | Required `"heuristic"` or `"standard"` on every setup and acceptance condition |
| `standard` | Required nonempty string naming the standard and traceable provision when basis is `"standard"`; omitted for `"heuristic"` |

All acceptance conditions of a test must hold together under the stated setup. Setup values are retained as test conditions, rather than independently sampled supplier outcomes. All shipped #68 values are heuristic, including drawing material and inspection-class selections. Markdown distinguishes the two kinds and formats every number as plain decimal without grouping or exponent notation, expanding the shortest JavaScript representation without further rounding.

Multi-condition tests retain every condition, such as cycle count and leak performance after cycling. Categorical evidence such as drawing material, inspection class, traceability or an open major finding is represented explicitly, not forced into a dimensionally meaningless scalar. Numeric catalog outputs retain their rubric types: `4.fai` is coverage fraction and `4.fpy_data` is months of data. All required and nice-to-have tests need acceptance conditions, regardless of whether they affect the score.

Examples supplied by #68 are **heuristic** reference limits: helium leak ≤ 1×10⁻⁶ mbar·L/s, burst ≥ 3 times maximum operating pressure, coupling life ≥ 5,000 cycles, and ionic contamination ≤ 1.56 µg NaCl eq/cm². These are not universal requirements of the named standards. Actual limits, conditions and units are reviewed by Sid in #68; this Draft does not approve them.

## 4. Traits and simulated evidence

### Candidate traits (#69)

All ranges in this table are **H**. They are input domains, not the range of a sampled result: a finite study can yield a Cpk outside the trait range. Nested maps are ordinary trait data; each applicable criterion must have a driver, and no unapplied commodity test may appear in the facts.

| Trait | Unit and allowed range / choices | Meaning and use | Basis |
|---|---|---|---|
| `process_capability` | Dimensionless centered capability, 0.5–2.5 | Sets process sigma relative to each CTQ tolerance span; it is not the reported sample Cpk | H |
| `gauge_variation` | % of tolerance, 2–40 | Expected combined appraiser/repeatability variation; drives the crossed study, not its reported %GRR | H |
| `cert_expiry_offset_days` | Integer calendar days relative to `as_of`, −365…1,095 | True certificate expiry; negative means expired | H |
| `doc_discipline` | Probability, 0–1 | Probability that an item is disclosed with its evidence | H |
| `claim_tendency` | Conditional probability, 0–1 | If not documented, probability of a claim without evidence instead of omission | H |
| `burying` | Probability, 0–1 | Propensity to place documented evidence in a numbered appendix | H |
| `capacity_ratio` | Parts/week divided by buyer parts/week, 0.5–2.0 | Mean production capability before weekly variation | H |
| `lead_time_ratio` | Quoted weeks / need-by weeks, 0.5–2.0 | Drives a positive whole-week quotation; engine input is the resulting meets-date boolean | H |
| `test_margin` | Fraction of a positive buyer limit, −0.25…0.5 | Signed passing margin for quantitative test conditions; positive favors meeting Stark's limit | H |
| `boolean_probability.<criterion_id>` | Probability, 0–1 | Bernoulli driver for other bool criteria and qualitative test conditions, including `9.second_source`; explicit per-ID overrides allowed | H |
| `records_retention_years` | Integer years, 0–20 | Driver for `5.records_retention` | H |
| `pcn_notice_days` | Integer calendar days, 0–180 | Driver for `7.pcn_notice` | H |
| `fai_coverage` | Fraction of characteristics, 0–1 | Driver for `4.fai`, when applicable; preserve covered and total counts | H |
| `fpy_months` | Integer months, 0–18 | Driver for `4.fpy_data`, when applicable | H |
| `region_risk` | Unitless enum: `low`, `medium`, `high` | Allowed values for `9.region_risk`; choose from the archetype's allowed list | H |
| `financial_health` | Unitless enum: `healthy`, `watch`, `distressed` | Allowed values for `9.financial_health`; choose from the archetype's allowed list | H |

Every non-test bool in RUBRIC is covered: `1.cert_scope`, `1.internal_audit`, `1.capa`, `1.calibration`, `2.pfmea`, `2.control_plan`, `2.spc`, `3.inspection_method`, `4.method_criteria`, `4.sample_size`, `5.lot_trace`, `5.nc_segregation`, `6.ramp_plan`, `7.change_approval`, `8.subtier_named`, `8.flowdown`, `8.subtier_certs` and `9.second_source`. `6.lead_time` is computed from the quotation, not independently drawn. Test pass/fail comes from the simulated condition evidence; do not draw an unrelated pass flag that contradicts a measurement.

**Measurements and disclosure**

1. **Cpk:** draw 50 parts per CTQ (H) from `normal(nominal + shift, sigma)`. Every v1.0 CTQ supplies both `lsl` and `usl`, giving the positive tolerance span `T = USL − LSL`. Use `sigma = T / (6 × process_capability)` and a per-CTQ shift uniform over `−0.05T…0.05T` (H parameterization). Retain all observations, limits, shift, sigma, sample mean and sample standard deviation. Compute `min(USL − mean, mean − LSL) / (3 × s)` from the sample. `2.ctq_cpk` is the lowest CTQ result, with its CTQ name; do not clip a failing result or replace it with the input trait.
2. **Gage R&R:** simulate a crossed study for each CTQ gauge: 10 parts × 3 appraisers × 3 trials (H study design). Derive appraiser and repeatability variation from `gauge_variation`; a Draft H split gives equal variance to the two sources, with combined generating sigma `T × gauge_variation / 600`, where `T = USL − LSL` uses the CTQ's required two-sided bounds. Retain the entire study and its tolerance span. Compute %GRR of tolerance with the AIAG Average & Range method specified in #69, `6 × sigma_GRR / T × 100`; do not substitute percent of study variation or use the generating sigma as the estimate. The implementation must identify its method/constants. `3.grr` is the **highest** result across CTQ gauges, per RUBRIC. The estimator constants and provenance are specified below.
3. **Tests:** simulate each required and nice-to-have test against the commodity sheet. For a positive upper limit `L`, a quantitative draw has mean `L × (1 − test_margin)`; for a positive lower limit, `L × (1 + test_margin)` (H parameterization). Use normal noise with sigma `0.02 × L` (H), respecting the physical domain. Multi-condition, range and categorical tests retain the evidence needed for every acceptance condition; a zero limit requires its own dimensional model, not division by zero. Bool results are comparisons against Stark's conditions. Preserve the covered/total counts for FAI and months for FPY. Reporting/scoring bands remain RUBRIC's.
4. **Capacity and lead time:** simulate 8 weeks of nonnegative integer output (H). Weekly mean is `capacity_ratio × peak_weekly_demand`, with normal sigma 0.03 of that mean (H). The reported ratio is the sample mean divided by peak demand. Quoted weeks are the positive integer ceiling of `lead_time_ratio × need_by_weeks`; `6.lead_time` is whether this meets the buyer's need date. Retain weekly output and both lead times.
5. **Certificate and other facts:** expiry is `2026-11-01 + cert_expiry_offset_days`. Draw other values from their specified bool, integer, fraction or enum drivers. Retain the underlying supporting record, such as certificate scope, retention policy or notice period. A trait can be pinned, but an answer-key score or target decision cannot be substituted for a simulated fact.
6. **Disclosure:** first draw `bernoulli(doc_discipline)`. Success gives `verified`; otherwise `bernoulli(claim_tendency)` selects `assumed`, with the remaining outcome `missing`. Thus the probabilities are `d`, `(1−d)c`, `(1−d)(1−c)`. A failed true value can be documented; a claim is not proof. An assumed item stores its actual claim and any claimed value separately from its hidden true value. Missing items retain private truth but have no public value or citation. Do not choose disclosure by whether it would produce a desired gap.
7. **Placement:** choose numbered appendix locations using the supplier stream and `burying`. DATASET additionally requires at least two verified passing items per supplier in appendices (H placement requirement); reserve those placements from eligible evidence before drawing extra buried placements. This changes location only, never evidence state or truth. If there are insufficient eligible items, report the build failure. Appendix sections must still have numeric identifiers usable by the citation regex.

`facts/SUP-xx.json` stores every applicable core, required-test and nice-to-have criterion exactly once. It includes private truth even when the packet omits it; the writer receives only the permitted rendering instructions in its brief.

### Candidate simulator implementation contract (#69)

`sim/candidate.mjs` exports `simulateCandidate(candidate, requirementSheet, seed)`,
`simulateCandidates(seed)`, and `writeCandidateFacts(seed, outputDirectory)`. The first is
pure; the second reads the merged sheets and samples the world; the third writes only
candidate facts into the explicitly supplied directory. Run
`node sim/candidate.mjs --seed 101 --out .pipeline/world-101/facts` to write nine facts
and print one summary per supplier. This does not build packets, history or an answer key.
All inputs are validated before the writer creates outputs. Facts use full-precision
JSON numbers, two-space indentation and a final LF. Summaries alone round to four decimals.

Truth, disclosure and placement have distinct deterministic streams labeled by supplier
and criterion; CTQ streams also use the unique CTQ name. No target decision or score is
an input to truth generation. Numeric and enum traits already sampled by `sampleWorld`
are retained, not sampled a second time. The existing engine is used only to identify
full-credit verified items for appendix placement; no scores are stored in facts.
Insufficient eligible items fail explicitly without rerolling or altering disclosure.

**Verified GRR estimator.** AIAG *Measurement Systems Analysis*, Fourth Edition,
Chapter III, Section B, printed pp.116–120, Figure III-B16, supplies the Average & Range
calculation for the fixed 10-part × 3-appraiser × 3-trial design. `K1 = 0.5908` and
`K2 = 0.5231` estimate standard deviations, not six-sigma spreads. Let `Rbar` be the
mean of the 30 within-part/appraiser trial ranges and `Xdiff` the range of the three
appraiser grand means:

- `EV = Rbar × K1`.
- `AV_variance = (Xdiff × K2)² − EV² / (10 × 3)`;
  `AV = sqrt(max(0, AV_variance))` (negative radicand treatment, p.120).
- `sigma_GRR = sqrt(EV² + AV²)`; `%GRR = 600 × sigma_GRR / (USL − LSL)`.
  The percent-tolerance denominator is tolerance/6 (p.123), not total study variation.

Keep intermediate values at full precision (p.120, footnote 50). This estimator does
not estimate appraiser-by-part interaction (p.103). Retain a diagnostic `range_ucl =
2.58 × Rbar` and the part/appraiser indices exceeding it (p.118); do not discard or
resample observations. The diagnostic flags a study needing investigation; generated
studies are synthetic evidence, not a claim of completed MSA approval. An all-zero
study yields zero GRR; Cpk with zero sample standard deviation is rejected as undefined.

**Additional generation choices, all heuristic.** Gauge studies reuse the first ten
capability observations as part true values, one normal offset per appraiser, and
independent repeat noise per reading. Setup equalities and inequalities use the stated
value (a boundary for inequalities), and setup ranges use their midpoint. Setup is
retained, never drawn as supplier performance or included in the acceptance AND.

Each bool profile test draws **one** Bernoulli outcome using its `boolean_probability`.
All acceptance observations are conditioned on that outcome: all pass on success,
and all fail on failure (a deliberately fully correlated heuristic). Setup stays fixed.
The stored bool is still recomputed as the AND of the measured comparisons. This keeps
multi-condition and full-coverage tests at the specified test-level probability.

Positive one-sided numeric acceptance starts with §4's margin/noise draw. Reflect its
absolute distance from the limit toward the selected outcome, with minimum distance
0.001 × limit (one unit for integer quantities). Apply the physical domain afterward:
nonnegative quantities, fractions 0–1, percentages 0–100; cycles, months, counts and
particles are rounded to integers. The model is `limit_margin_normal_conditioned`.
Ranges start with a normal midpoint draw and sigma span / (6 × process_capability).
On success clamp to the inclusive bounds; on failure use the upper bound plus the
larger of the draw's distance from that bound and 0.01 × span, then apply the domain
(`range_normal_conditioned`). These conditional models support the shipped sheets.
Boolean observations match the expected value on success and invert it on failure,
including expected false (`test_outcome_compliance`). Zero-count limits produce zero
on success and 1–3 on failure; zero-percent corrosion produces zero or uniform 0.1–5
percent (`zero_limit_compliance`). Full coverage uses 100 records: all covered on
success, otherwise a uniform integer 0–99 covered (`coverage_conditioned`).
FAI uses 20 Bernoulli drawing characteristics with
`fai_coverage`; its actual covered/total fraction remains numeric. FPY retains the
sampled number of consecutive months ending October 2026, each with 100 units and
Bernoulli 0.98 first-pass outcomes; its rubric value remains the month count. Other
acceptance shapes fail descriptively, not silently. The ≥100 µm particle count is at
least the ≥500 µm count; measured proof pressure is derived from the observed pressure
ratio and setup operating pressure, not a separate draw. Ramp-plan records use a
November 1, 2026 milestone adding 20% of peak weekly demand, rounded up. These choices
are simulator fixtures, not published standard requirements.

**Retained evidence fields.** Every facts entry follows §6, including `claim` and
`claimed_value`. Assumed entries carry a fixed supplier-language assertion per topic and null claimed value. Assertions do not
mention absent evidence, use criterion IDs or copy rubric names/requirements, and contain
none of the words criterion, knockout, rubric, gap or score. They never depend on hidden truth. Verified and
missing entries have null claim fields. Missing entries keep private evidence but have
null file/section and false buried. Disclosed entries use stable unique numeric sections
`1.1…1.k` and appendix `9.1…9.k`, independently within each DATASET packet file.
Counters follow criterion order and count only entries disclosed in that file and
body/appendix group; missing items leave no numbering holes.

| Evidence | Retained fields |
|---|---|
| Cpk | `unit`, `lowest_ctq`, `ctqs[]`: drawing identity/bounds/basis, shift, generating sigma, model basis, all observations, n, mean, sample s (n−1), cpk |
| GRR | `unit`, `highest_ctq`, `gauges[]`: name/unit/bounds, part values, appraiser offsets, generating and component sigma, model basis, `readings[part][appraiser][trial]`, method/constants/reference, tolerance, ranges, average range, appraiser means and their range, EV, AV variance/AV, sigma_GRR, percent tolerance, range UCL and out-of-control indices (1-based) |
| Profile tests | `name`, `conditions[]` copies every requirement field plus `observed`, `model`, `model_basis`, and `passed` (null for setup); `accepted` is the acceptance AND. Coverage includes covered/total; FPY includes month/total/first_pass records; burst includes derived pressure value/unit/provenance |
| Capacity / lead time | Eight integer outputs, parts/week unit, peak demand, mean, model basis; quoted weeks, need-by weeks and unit |
| Certificate expiry | Fixed as_of, offset_days, expiry, fictional REG certificate and registrar identifiers |
| Other criteria | Synthetic record identity and result; applicable part/revision, coverage/method/rationale, ramp milestones or sub-tier/source references; scalar policies/assessments retain value and unit |

### Active-supplier traits (#70)

All ranges in this table are **H**. Probabilities are fractions, not percentages. Compound trait fields listed below have the same range rules as scalar traits.

`received_qty` stays a `[min, max]` range in the sampled world; #70 draws each lot from it.

| Trait | Unit and allowed range / choices | Meaning and use | Basis |
|---|---|---|---|
| `lots_per_month` | Poisson mean, 4–12 lots/month | Arrival intensity; actual lots must also satisfy DATASET's 4–12 bound | H |
| `received_qty` | Integer parts/lot, 200–2,000 | Uniform quantity draw for each lot | H |
| `quality_pattern.kind` | Unitless enum: `stable`, `creep`, `spike` | Shape of the underlying defect probability | H |
| `quality_pattern.base_rate` | Defective fraction, 0–0.02 | Baseline defect probability before noise | H |
| `quality_pattern.start_month` | Integer month index, 7–18 | First elevated month for `creep`; null for other patterns | H |
| `quality_pattern.monthly_increase` | Defective-fraction increment/month, 0–0.005 | Linear rise starting at `start_month`; zero for non-creep patterns | H |
| `quality_pattern.spike_month` | Integer month index, 7–18 | Affected month for `spike`; null otherwise | H |
| `quality_pattern.spike_rate` | Defective fraction, 0–0.2 | Defect probability for the affected lot; zero for non-spike patterns | H |
| `quality_pattern.noise_sd` | Standard deviation of defective fraction, 0–0.0001 | Monthly zero-mean normal noise; clamp the resulting probability to 0–1 | H |
| `detection` | Map of `incoming`, `line`, `field` probabilities, each 0–1 and summing to 1 | Where a rejecting lot's defects are recorded; `none` is derived for a clean lot | H |
| `failure_modes` | Unitless nonempty list drawn from `FM-LEAK`, `FM-PLATING`, `FM-FLATNESS`, `FM-SOLDER`, `FM-LABEL`, `FM-DAMAGE` | Allowed failure codes; not free-form real part/vendor names | H |
| `failure_pattern` | Unitless enum: `mixed`, `repeat` | Mixed uses uniform choice; repeat favors the first code in `failure_modes` | H |
| `repeat_probability` | Probability, 0–1 | For `repeat`, chance of the favored code; otherwise pick uniformly; zero for `mixed` | H |
| `on_time_rate` | Probability, 0–1 | Bernoulli probability of an on-time lot | H |
| `scar_trigger` | Integer rejected parts/lot, 0–2,000 | Open a SCAR when rejects **exceed** this threshold, or a failure mode repeats within the scorecard look-back, unless a SCAR for that mode is already open | H |
| `response_days` | Mean elapsed calendar days, 1–180 | Mean time from SCAR opening to simulated closure | H |
| `sd` | Standard deviation of response time, 0–30 calendar days | The `sd` in #70's `normal(response_days, sd)` closure draw | H |

Simulate M1 = 2025-05 through M18 = 2026-10, with `as_of = 2026-11-01` (H fixture). M1–M6 are baseline; M7–M18 are monitoring. Follow SCORECARD's definitions unchanged, including attribution of later-found defects to the lot's receipt month.

- Draw lot count from the Poisson distribution **conditioned on 4–12 lots**, preserving DATASET's explicit bound. This reconciles #70's unbounded Poisson description with the approved dataset contract; it is a model-level bound, not outcome-based re-rolling of worlds. Draw lot quantities uniformly from the supplier's range and dates within the calendar month.
- For `stable`, use the base probability plus noise. For `creep`, add `monthly_increase × (month − start_month + 1)` from the start month. For `spike`, select one lot in the spike month with the supplier stream and apply the spike probability there, with the baseline process on other lots. SCORECARD's ACT-03 story is **one bad lot**, narrower than #70's high-rate-month shorthand.
- Rejects per lot follow a binomial draw with that lot's quantity and probability; #70 permits a normal approximation. Keep integer rejects within the received quantity and handle zero probability exactly. Select detection and failure code only for rejecting lots. A repeat means an earlier NC with the same code for that supplier in the preceding 180 days (H window owned by SCORECARD), not merely a repeated string in an unordered file.
- Open a fictional SCAR on a qualifying lot. Generate a nonnegative whole-day closure delay from `normal(response_days, sd)`; if closure would occur after `as_of`, leave `scar_closed` empty. Do not close a slow response merely to satisfy a score. Reused SCAR IDs always carry identical opening/closure dates. Receipt, opening and closure dates must be chronological.
- Sort rows by `date`, `supplier_id`, `part_no`. Each row has one detection location and one failure code at most, exactly as SCORECARD requires. No extra columns are added for private simulation state.

### History simulator implementation contract (#70)

`sim/history.mjs` exports `simulateSupplierHistory(supplier, partNo, seed)` (pure,
for one sampled active supplier), `simulateHistory(seed)` (all six suppliers),
`renderHistory(rows)` (validated CSV text), and `writeHistory(seed, outputPath)`
(write that CSV and return its rows). The all-supplier entry point reads each commodity's
fictional `part_no` from its requirement sheet, relative to the module. It does not write
app data or select a final demo. Run:

```text
node sim/history.mjs --seed 101 --out .pipeline/world-101/history.csv
```

The CLI prints seed, supplier/month/lot counts and total rejected parts. Invalid inputs
fail before output directories are created. CSV uses exactly SCORECARD's columns,
canonical integers, empty cells for null values, UTF-8, LF and one final LF. The existing
engine's `parseHistory` validates rendered rows; unsafe unquoted CSV strings are rejected.
No extra private-state columns are emitted. The engine alone computes metrics and stories.

Generation uses a stream labeled `<supplier_id>:history`, distinct from trait sampling;
other suppliers' presence or ordering cannot change its draws. The following concrete
choices are **heuristic**, supplementing the rules above:

- Condition Poisson counts by rejecting draws outside 4–12, not by clamping them.
- Draw one noise term per month and one uniformly chosen affected lot in a spike month.
  Draw receipt days uniformly over the actual calendar month; duplicate dates are legal.
  A private generation index resolves equal-date ties and is removed from the output.
- Draw exact binomial counts using geometric waiting times between successes. For
  probabilities above 0.5 count failures instead; zero and one are exact endpoints.
  No normal approximation or forced nonzero reject is used.
- Pick a rejecting lot's detection location from its categorical probabilities. In a
  repeat pattern the favored first code is chosen with `repeat_probability`; otherwise
  choose uniformly from the complete code list, including the favored code.
- Process lots chronologically. A qualifying rejecting lot attaches to the supplier's SCAR
  already open for the same failure mode on the lot's receipt date (open = `scar_opened`
  on or before the receipt date and `scar_closed` empty or later than it; a closure on the
  receipt date counts as closed). It reuses that SCAR's ID, opening and closure dates, with
  no new closure draw. Otherwise, including a quantity-trigger lot with no open SCAR for
  its mode, it opens a new SCAR on its receipt date. Different modes keep separate SCARs,
  which may be open at the same time. IDs are `SCAR-<supplier_id>-<four-digit sequence>`,
  numbered per supplier from 0001 in order of opening (date, then generation order).
  This grouping rule is **heuristic** (#100).
  Earlier same-day NCs do not count as repeats and do not hide an eligible earlier day.
- Closure delay is `max(0, round(normal(response_days, sd)))` calendar days. A closure
  exactly on `as_of` is retained; a later closure is empty. Fixed Gregorian arithmetic
  handles month/year boundaries without a wall clock or timezone.

Small exported helpers (`dayNumber`, `addDays`, `drawLotCount`, `drawBinomial`,
`defectProbability`, `isRepeat`, `scarClosure`) expose these date/distribution/trigger
rules for boundary tests. Supplier validation enforces the trait domains and inactive
pattern fields before generation. Rendering preserves row order; `simulateHistory`
sorts by date, supplier ID and part number, preserving generation order for tied rows.

The history-only regression fixture is seed **24**, the first all-ACT match in an
ascending diagnostic search of seeds 1–24 with the #99 archetypes (§5) and the real
scorecard engine. It replaced #70's seed 2, which no longer passes ACT-02 after the
retune. It still passes all six stories after the #100 SCAR reuse and ACT-05
retune. This is not the combined demo seed: #74 must still search the full
eligible range, exclude reserved eval/re-test seeds, check candidate targets together
with all ACT stories, and retain full-range diagnostics. No history rows are edited to
meet a story, and eval worlds are generated without filtering.

## 5. Archetypes and demo targets

### Candidate archetypes

The **strong-shop defaults**, all **H**, are: `process_capability=[1.8,2.2]`, `gauge_variation=[3,6]`, `cert_expiry_offset_days=[180,730]`, `doc_discipline=1`, `claim_tendency=0`, `burying=[0.1,0.3]`, `capacity_ratio=[1.3,1.6]`, `lead_time_ratio=[0.5,0.8]`, `test_margin=[0.1,0.3]`, every applicable `boolean_probability=1`, `records_retention_years=[10,15]`, `pcn_notice_days=[90,120]`, `fai_coverage=1`, `fpy_months=[6,12]`, `region_risk=low`, `financial_health=healthy`. Every unit and global range is defined in §4. Each row below inherits these defaults and replaces only the listed fields; all row ranges are **H**.

| Supplier | Archetype | Demo target under Stark Reference v1 | Trait overrides (H) |
|---|---|---|---|
| SUP-01 Frost Technotics | Strong shop, sloppy on one required test | NOT APPROVED; Senior; a required test is missing | `doc_discipline=[0.85,0.9]`; `claim_tendency=0` |
| SUP-02 Wakanda Design Group | Excellent, sole source | APPROVED; Senior; High-risk commodity and Sole source | `boolean_probability.9.second_source=0` |
| SUP-03 Hammer Industries | Weak process capability | NOT APPROVED; Senior; lowest Cpk < 1.0 | `process_capability=[0.65,0.9]`; `gauge_variation=[18,26]`; `burying=[0.4,0.7]` |
| SUP-04 Pym Technologies | Clean, Medium risk, second source | APPROVED; Junior; second source verified true | Strong-shop defaults |
| SUP-05 Cross Technological Enterprises | Good shop, lapsed certificate | NOT APPROVED; Senior; certificate expired in the preceding month | `cert_expiry_offset_days=[-31,-1]` |
| SUP-06 Stane International | Talks more than it proves | CONDITIONAL; Senior; at least one assumed knockout and no failed knockout | `doc_discipline=[0.86,0.94]`; `claim_tendency=1` |
| SUP-07 Oscorp | Ambitious NPI, under capacity | CONDITIONAL; Senior; High risk and demonstrated capacity below peak demand | `process_capability=[1.3,1.4]`; `capacity_ratio=[0.8,0.9]`; `lead_time_ratio=[1.1,1.4]`; `doc_discipline=[0.85,0.9]`; `claim_tendency=1` |
| SUP-08 Roxxon | Big CM, ESD control gap | NOT APPROVED; Senior; ESD program has an open major finding | `boolean_probability.4.esd_program=0`; `fpy_months=[3,5]` |
| SUP-09 Horizon Labs | Solid shop | APPROVED; Senior; High-risk commodity | Strong-shop defaults |

All routes, including the ordered reason list, must agree with DATASET's queue table. Totals may differ from its historical hand-computed targets. The RUBRIC worked example remains an engine fixture, not an instruction to hard-code SUP-07's simulated results. Truth, disclosure and measured study outcomes still come from the seed; the demo search checks the resulting story. Eval suppliers may miss these targets and must still be retained.

**#74 retune (defaulted decision pending Sid review).** Only SUP-01 and SUP-07 traits changed. SUP-01 retains strong physical processes but has less reliable documentation, making required-test omission more likely. SUP-07 retains below-demand capacity and late lead time; its process range shifts upward to reduce accidental Cpk knockouts, while unproven claims prevent unwarranted approval. Targets, engine, history and story clauses are unchanged. Tuning excluded reserved seeds101–108; holdout501–1000 was not used to choose ranges.

| Range | SUP-01 decision/route before → after | SUP-07 decision/route before → after | Joint decisions/routes + ACT before → after |
|---|---|---|---|
|1–500,492eligible|100/492 (20.3%) →331/492 (67.3%)|90/492 (18.3%) →367/492 (74.6%)|0/492 →6/492|
|501–1000,500eligible|106/500 (21.2%) →335/500 (67.0%)|82/500 (16.4%) →376/500 (75.2%)|1/500 →8/500|

All other candidate hit counts are identical: SUP-02/03/04/05/08/09 all eligible seeds; SUP-06 214/492 and240/500. ACT hit counts are identical: tuning492/16/492/491/486/492 and holdout500/21/500/500/493/500 for ACT-01…06. Before retuning, SUP-01 was APPROVED392/492; only49/492 had a missing required test and none a physically failed required test. SUP-07 split NOT APPROVED202, CONDITIONAL90, APPROVED200;169 had Cpk knockouts and none total below70. Routes never missed. A tuning-only range sweep selected these traits before holdout measurement. No structural cap was found; ACT-02 remains the sole exception.

The runner also requires the candidate narrative itself (a missing required test for SUP-01, an assumed knockout for SUP-06, and a verified capacity shortfall for SUP-07). Under these stricter checks, tuning rates are SUP-01 49/492→207/492 (10.0%→42.1%), SUP-07 85/492→324/492 (17.3%→65.9%), and joint complete candidate narratives+ACT 0→4. Holdout rates are SUP-01 52/500→200/500 (10.4%→40.0%), SUP-07 81/500→337/500 (16.2%→67.4%), joint0→5. SUP-06 remains213/492 and240/500 under the stricter check; all other candidate and ACT counts remain identical. These stronger checks also clear the tuning threshold on holdout. Full1–20000 search selects93, with117complete matches out of19992eligible seeds. Detailed diagnostic files live in `data/simulation/`.

### Active archetypes

The active defaults, all **H**, are `lots_per_month=[6,10]`, `received_qty=[200,2000]`, `quality_pattern={kind: stable, base_rate: 0, start_month: null, monthly_increase: 0, spike_month: null, spike_rate: 0, noise_sd: 0}`, `detection={incoming: 1, line: 0, field: 0}`, the complete `failure_modes` list in §4, `failure_pattern=mixed`, `repeat_probability=0`, `on_time_rate=1`, `scar_trigger=5`, `response_days=[5,15]`, `sd=[1,3]`. The ranges below replace those defaults (ACT-02 also replaces `lots_per_month` and `received_qty`); pattern-inapplicable fields retain their null/zero defaults. Detection maps are pinned distributions, not independently drawn ranges.

| Supplier | Archetype | Trait overrides (all H) |
|---|---|---|
| ACT-01 Damage Control | Stable, excellent | Active defaults; zero generating defect probability |
| ACT-02 Alchemax | Gradual creep | `lots_per_month=[10,12]`; `received_qty=[1500,2000]`; `quality_pattern.kind=creep`, `base_rate=[0.0012,0.0012]`, `start_month=12`, `monthly_increase=[0.00006,0.00008]`, `noise_sd=[0,0]` |
| ACT-03 Rand Enterprises | One bad lot | `quality_pattern.kind=spike`, `spike_month=9`, `spike_rate=[0.02,0.06]` |
| ACT-04 Timely Industries | Good quality, poor delivery | `on_time_rate=[0.4,0.6]` |
| ACT-05 A.I.M. (Advanced Idea Mechanics) | Repeat mode, slow response | `quality_pattern.base_rate=[0.0008,0.0016]`; `failure_pattern=repeat`; `repeat_probability=[0.3,0.5]`; `scar_trigger=[1,3]`; `response_days=[180,180]`; `sd=[5,20]` |
| ACT-06 Trask Industries | Escapes to line and field | `quality_pattern.base_rate=[0.002,0.004]`; `detection={incoming: 0.3, line: 0.4, field: 0.3}`; `on_time_rate=[0.9,0.97]` |

**ACT-02 is a selected-seed story (#99, Sid decision 2026-11-11).** Its story passes in about 3.7% of seeds (37/1000 in seeds 1–1000 and again in 1001–2000), not a majority, and the sweep found no archetype inside the validator limits that comes close to one. Its values above were chosen by a simulation-only sweep (real engine, every story clause); pinning every lot at the 24,000 parts/month validator maximum scores about 4.6%, a marginal gain that was not taken. ACT-02 now receives about 11 lots of 1,500–2,000 boards, roughly 19,000 boards/month (about 9,000 before), at a 1,200 ppm incoming baseline. The extra volume only lets the creep step be set at a realistic ppm with zero shared noise; it does not lift the structural cap below. ACT-04's `on_time_rate` was lowered from `[0.6,0.8]` because a 3-month OTD window at 85% or better gives tier A. The demo search (§2) selects a seed where ACT-02 passes; story assertions are unchanged.

**ACT-05 retune with SCAR reuse (#100, Sid decision 2026-11-11).** Reusing the open SCAR alone dropped ACT-05 from 297/300 to 195/300 (seeds 1–300): a slow SCAR now carries every repeat until it closes, and the next one opens right after, so at M18 the only open SCAR is often under 60 days old. `repeat_probability` went from `[0.8,1]` to `[0.3,0.5]` and `response_days` from `[100,180]` to `[180,180]`. The favored mode is now about 40–58% of ACT-05 NCs instead of 83–100%. It is still the dominant mode, and repeat NC stays Bad because at about 5 NCs a month some code repeats within 180 days.

SCARs per supplier per world after #100 (mean over seeds 1–300, unique `scar_id`): ACT-01 0, ACT-02 101.4, ACT-03 1.0, ACT-04 0, ACT-05 14.9, ACT-06 90.4. Before #100 they were 0, 142.8, 1.0, 0, 90.9 and 122.1. ACT-02 and ACT-06 still open about five a month because their SCARs close in about 10 days, so the next repeat of a mode finds none open (accepted, Sid 2026-11-11).

The limit is structural. The p-chart UCL (p̄ + 3·sqrt(p̄(1−p̄)/n)) and the month-to-month counting noise both scale as sqrt(p̄/n). More volume or a higher base rate shrinks or grows both together, so the only free quantity is the creep step in sigma units, d = `monthly_increase` / sqrt(p̄/n). The creep is linear from M12, so M12 sits at +1d and M18 at +7d. A first `run7` at M18 needs M12–M18 all above p̄, which wants d ≥ about 1.5. No `ucl` through M18 needs 7d < 3. M11 also must not sit above p̄, and its true rate equals the baseline, so that clause alone is a coin flip. p̄ is also estimated from only M1–M6. An idealised Monte Carlo tops out near 9%, and the simulator measures 3.7–4.6% across the volume variants tried (seeds 1–2000), up to the 24,000 parts/month validator maximum. Lifting the cap needs a story or simulator change (for example a step-up shape), which is out of scope.

Measured passes per story, seeds generated through the CSV and scored by the real engine with the committed archetypes and the #100 SCAR reuse. Before #99, seeds 1–300 gave ACT-02 8, ACT-04 282 and all six 7. Seeds 1–1000 gave ACT-02 22, ACT-04 928 and all six 20. Before #100 (the #99 archetypes, one SCAR per qualifying lot), ACT-05 passed 297/300, 296/300, 984/1000 and 983/1000 in the four rows below, and all six passed 37/1000 in seeds 1001–2000. No other story count changed.

| Seeds | ACT-01 | ACT-02 | ACT-03 | ACT-04 | ACT-05 | ACT-06 | All six |
|---|---|---|---|---|---|---|---|
| 1–300 (tuning) | 300/300 | 8/300 | 300/300 | 299/300 | 296/300 | 300/300 | 8/300 |
| 301–600 (holdout) | 300/300 | 12/300 | 300/300 | 300/300 | 298/300 | 300/300 | 12/300 |
| 1–1000 | 1000/1000 | 37/1000 | 1000/1000 | 999/1000 | 987/1000 | 1000/1000 | 37/1000 |
| 1001–2000 (holdout) | 1000/1000 | 37/1000 | 1000/1000 | 998/1000 | 982/1000 | 1000/1000 | 35/1000 |

`sim/history.test.mjs` pins these as floors over seeds 1–200 (ACT-02 4, ACT-04 199, ACT-05 196, the rest 200). A lower count means generation or scoring changed.

The following assertions reproduce SCORECARD's ACT table. All numerical story settings and scorecard policy limits are **heuristic**; evaluate with the real engine and Stark Reference policy, without separate simulation-side scoring.

| ID | Must hold | Must not hold |
|---|---|---|
| ACT-01 | M18 tier A, all metrics Good | Any alert in M7–M18 |
| ACT-02 | `run7` in M18 (first time); M18 DPPM not Bad | `ucl` in M7–M18; `run7` before M18 |
| ACT-03 | `ucl` in M9 | `ucl` in any other month; M18 tier below B |
| ACT-04 | M18 tier B; `metric_bad` for OTD in M18; DPPM, escape, repeat NC Good | `ucl`, `run7` |
| ACT-05 | M18 tier C; DPPM Watch; repeat NC and SCAR aging Bad; `scar_aging` in M18 | None specified |
| ACT-06 | M18 tier C or D; `metric_bad` for escape rate in M18 | None specified |

#70 may explicitly skip engine-dependent story tests until M2 is merged, with a clear skip message. #71 and final world acceptance in #74 require the M2 engine (#15–#23); a skipped story test is not a completed world. The seed search must satisfy the entire candidate and ACT target set together.

## 6. Outputs, writing, fact check and acceptance

### Layout and runner (#74)

```text
data/requirements/<commodity>.json
data/requirements/<commodity>.md
data/worlds/<n>/
  facts/SUP-xx.json
  briefs/SUP-xx.md
  packets/SUP-xx/*.md
  reference/SUP-xx.json
  history.csv
  suppliers.json
  answer_key.json
  answer_key.sha256
  factcheck.json
  writer.json
  run.log
```

`briefs/` preserves the exact writer inputs; `reference/` materializes DATA-FR-04's extraction-per-candidate contract. Neither is under `packets/`, and neither is ever staged for the reader. Accepted writer briefs/prompts are retained with their hashes in `writer.json`; #73 owns records of failed writer attempts and their retry inputs in its failure log/report. The history file contains all active suppliers; candidate packets do not impersonate active-supplier histories.

| Command | Behavior |
|---|---|
| `node sim/run.mjs --seed <n>` | Sample, simulate, build the engine key/hash, write packets, fact-check, and retain all world artifacts; report failed stages |
| `node sim/run.mjs --find-demo --from 1 --to 20000` | Default bounds; cheap simulation/key/story search over the full eligible range, logging every attempted/rejected seed and per-supplier/per-story hit rates; select the first eligible match |
| `node sim/run.mjs --demo <n>` | Build the selected seed fully, require clean fact checks and story checks, then copy the demo to the app paths |

The app copies are exactly `data/suppliers/<id>/*.md`, `data/history.csv`, `data/suppliers.json` and `data/answer_key.json`, as PRD-03 §5 specifies. `data/extracted/<id>.json` is produced later by the blind run, never by copying reference extractions. Keep the authoritative hash in the world's directory. Eval always addresses the world directory, not the mutable app copies. Record the selected demo seed in the build evidence and preserve the original world.

### Artifact schemas

**`suppliers.json`** has only the PRD-03 §5 top-level fields: `as_of`, `candidates`, `active`. `as_of` is `2026-11-01`; each supplier entry is `{ id, name, commodity, part }`, with a human-readable fictional part description. Include all roster entries, not only suppliers with gaps. Candidate commodity keys match §3. The requirement sheet supplies the controlled part number; `part` is not a replacement for that identity.

**`facts/SUP-xx.json`**:

| Field | Contract |
|---|---|
| `supplier_id`, `commodity`, `seed` | Roster identity, commodity key, world seed |
| `criteria` | Object keyed by every applicable RUBRIC criterion ID, including nice-to-have |
| `criteria[id].true_value` | Actual simulated value of the criterion's bool/number/date/enum type, irrespective of disclosure |
| `criteria[id].disclosure` | `verified`, `assumed`, or `missing` |
| `criteria[id].buried` | Boolean location flag; false for missing evidence |
| `criteria[id].file`, `.section` | Planned packet basename and numeric section string for verified evidence or an assumed claim; both null for missing |
| `criteria[id].evidence` | Structured source observations and units: CTQ measurements/limits/statistics, full GRR studies, test measurements/conditions, weekly production, dates or supporting records, as applicable |
| `criteria[id].claim`, `.claimed_value` | For assumed items, exact public claim text and optional typed claimed value (otherwise null); never automatically expose `true_value` as the claim |

Retain sufficient evidence to recompute Cpk and GRR, including every contributing CTQ/gauge, and to check tests against the requirement sheet. Formatting for the brief must use explicit units and a deterministic decimal representation. Keep full calculation precision in source evidence and define the displayed representation consistently; do not round an input across a rubric band edge merely for presentation.

**`history.csv`** uses SCORECARD's exact header:

```text
date,supplier_id,part_no,received_qty,rejected_qty,on_time,defect_found_at,failure_mode_code,scar_id,scar_opened,scar_closed
```

One row is one receipt lot. Received quantity is a positive integer; rejects are an integer from zero through received quantity; `on_time` is `0` or `1`. `defect_found_at=none` and an empty failure code occur if and only if rejects are zero. A rejecting lot has `incoming`, `line` or `field` and a permitted code. A populated `scar_id` requires `scar_opened`; `scar_closed` is empty while open. All occurrences of a SCAR share dates. Validate every SCORECARD rule and report errors by row.

**`answer_key.json`** is an object, replacing DATASET's superseded gap-only array:

| Field | Contract |
|---|---|
| `seed`, `as_of`, `policy` | World identity, fixed fixture date, and engine-returned Stark Reference v1 identity |
| `candidates[]` | One entry per candidate: `supplier_id`, `commodity`, `criteria`, `evaluation`, `reference` |
| `candidates[].criteria[]` | One row for **every applicable criterion**, including clean and nice-to-have rows: `criterion_id`, `expected_state`, `expected_value`, `expected_score`, `expected_citation`, `note`, `scored`, `kind` |
| `candidates[].evaluation` | Complete `evaluate` result, including total, categories, decision, routing with ordered reasons, knockouts, gaps, nice-to-have, RFI items, audit focus and warnings |
| `candidates[].reference` | Complete `sqc-extraction/1` reference object matching PRD-04 §5; also written unchanged to `reference/<id>.json` |
| `scorecard` | Complete `scorecard(rows, { as_of, policy })` result, including months, metrics, tiers, p-chart, alerts, open SCARs and failure modes |

Build the reference input from disclosure: verified uses true value and evidence citation; assumed uses the actual claimed value or null and the claim citation; missing uses null value and null citation. Use `file.md §n.n` citations, satisfying `^[a-z0-9_]+\.md §[0-9]+(\.[0-9]+)*$`. Assumed notes quote the prescribed claim; missing notes identify the expected search scope. Follow PRD-04's note length and schema rules. Reference `run` metadata identifies deterministic simulation provenance, not a fabricated reader-model run. Populate reference drafts from engine RFI/audit outputs with PRD-04's required draft label and item order; no AI is needed for reference drafts.

Call `evaluate(reference, { as_of: "2026-11-01", policy: STARK_REFERENCE })` and the scorecard engine; do not implement another scorer. For assumed-knockout scoring, the answer key uses whatever the engine returns. `expected_score` is the engine score for scored criteria, null for all unscored nice-to-have rows. Scored rows below full credit carry the engine's `fail`, `assumed` or `missing` kind; clean rows have `kind: null`. Preserve criterion, kind and expected value when joining rows to the evaluation's gap list. Nice-to-have rows never change totals or routing; for eval, a non-verified nice-to-have row is `info`, per PRD-04 §5, and a verified one is clean. Keeping clean rows is necessary to measure false alarms.

`answer_key.sha256` contains the lowercase hexadecimal SHA-256 digest of the exact JSON bytes followed by a newline. Eval checks this against the committed artifact and lock ordering, not just an adjacent freshly rewritten hash. Catches, partials, misses, citation match and decision agreement follow PRD-04 §5 without new definitions. Its tolerances and accuracy targets are project heuristics, not standards limits. Report demo, hold-out, comparison and fresh-world runs separately from the headline eval worlds.

The shared `buildReferenceFields(reference, evaluation)` helper in `sim/answer-key.mjs` supplies identical deterministic drafts and criterion-row mappings to the simulator and hold-out overlay (issue 128). The answer-key builder API is `factsToReference(fact)`, `buildAnswerKey(seed, facts, historyRows)` and `writeAnswerKey(worldDirectory)` in `sim/answer-key.mjs`. Run `node sim/answer-key.mjs --world <directory>` after generating `facts/*.json` and `history.csv`. It validates the complete candidate and active-supplier rosters and inputs, and requires history CSV bytes to equal the deterministic history regenerated from the facts seed before writing `reference/<id>.json`, `answer_key.json` and `answer_key.sha256`; references cite planned packet locations and do not assert that packets already exist. Rebuilding the same inputs produces identical bytes.

The commit adding a world's `answer_key.sha256` must be merged into `test` before any blind extraction of that world runs. The builder creates artifacts; it does not establish that Git ordering. Checking an adjacent hash (including `agent/eval.mjs`'s `loadLockedKey`) proves byte integrity only. The blind-run/eval workflow must separately establish the committed lock and merge-before-extraction ordering.

**`writer.json`** records accepted publications only: the seed and, per supplier and accepted-publication attempt, the exact staged prompt/brief (or retained path plus hash), writer version, model ID, attempt index and SHA-256 per output file. Its attempt index counts accepted publications, not rejected writer calls; failed invocations or output-validation checks do not modify this file. #73’s retry loop owns failed-attempt prompts, failure details, and retry history in its retained failure log/report. **`factcheck.json`** records seed, overall `passed`/`failed` status, per-supplier attempts and structured failures (`rule`, criterion if applicable, file, section, detail). **`run.log`** records deterministic stage outcomes and demo-search seed/rejection evidence. Private reports may contain criterion IDs; sanitized retry briefs may not. Do not copy briefs, `last.txt`, logs or JSON sidecars into the supplier's packet.

### Packet writer (#72)

`sim/brief.mjs` compiles one supplier's permitted facts plus its requirement sheet into a plain-language `brief.md`. Voice follows `doc_discipline` (thorough, average or vague). The brief specifies the complete file set and numbered section locations. The cover letter introduces the supplier/part and includes only evidence sections assigned to `cover_letter.md`, including appendix sections when assigned there; it is not restricted to introductory prose. File names can follow DATASET's examples (`cover_letter.md`, `quality_manual.md`, `certificates.md`, `capability_study.md`, `msa.md`, `reliability_report.md`, `capacity.md`, `subtier.md`, `pcn_policy.md`) or the corresponding #72 names, provided facts, brief, files and citations agree.

For each disclosed fact, instruct the writer to state the evidence at its assigned location, or to repeat the prescribed claim without proof. For missing items, instruct omission throughout supplier-authored evidence without exposing the private measurement. Write the Stark requirement sheet into the packet as its own file, `rfq.md`, reserved for the buyer's requirements. All other packet files are supplier-authored. Every packet Markdown file, including `rfq.md`, begins with:

```text
> Synthetic document for a demo. Fictional supplier.
```

The compiler rejects criterion IDs, target scores/decisions and answer-key content in the brief. It also enforces #72's prohibited vocabulary (`criterion`, `knockout`, `rubric`, `gap`, `score`); do not insert that prohibition list verbatim into the generated brief. No real registrar or certificate number is permitted. Appendix headings retain numeric section IDs even when their human title says Appendix.

`sim/write-packet.mjs` stages only `brief.md` in `$TMPDIR/sqc-write/<seed>/<id>/` before each fresh writer invocation. The #72 invocation contract is:

```text
codex exec -C <stage> --skip-git-repo-check --ephemeral --ignore-rules -s workspace-write -o <stage>/last.txt "Read brief.md and write every file it lists, in this folder."
```

`compileBrief(fact, sheet, {name, doc_discipline})` in `sim/brief.mjs` projects only public disclosures into deterministic prose instructions and the exact rendered RFQ. `writeBrief(worldDirectory, supplierId)` writes `briefs/<id>.md`; its CLI is `node sim/brief.mjs --world <directory> --supplier SUP-01`. Planned evidence filenames and numeric sections come from the candidate simulator. The voice heuristic is thorough at document discipline ≥0.9, ordinary at ≥0.7, and brief/uneven otherwise; it never changes disclosure content.

`writePacket(worldDirectory, supplierId, {model})` requires an explicit model and runs on macOS with `/usr/bin/sandbox-exec`. Its CLI is `node sim/write-packet.mjs --world <directory> --supplier SUP-01 --model <model>`. The fresh CLI uses the invocation above with `-s danger-full-access` inside the external OS sandbox (nested macOS sandbox creation fails), and adds `--ignore-user-config`, `-c project_doc_max_bytes=0`, `--json`, and explicit `-m`. HOME and CODEX_HOME point to a fresh runtime directory outside the stage; only `auth.json` is copied from the invoking user's authentication directory. No prior configuration, skills, instructions, plugins, MCP settings, or session history are copied. Runtime credentials are removed after the attempt and never enter provenance or packets.

The OS wrapper applies to the CLI and all descendants. It denies reads under personal directories (`/Users`, `/Volumes`), temporary input locations (`/private/tmp`, `/tmp`, `/private/var/folders`), the repository, and the canonical world directory (including worlds stored elsewhere), except the chosen stage and fresh runtime directory. System/runtime files and filesystem metadata remain available. Writes are denied outside the stage, fresh runtime directory, and device endpoints. The outer sandbox enforces the boundary even though the inner CLI does not create a second sandbox. The subprocess stdin is explicitly closed so the CLI does not wait for piped input. Root/temporary ancestor instruction files are explicitly denied, and project-document loading is disabled. Before invoking the writer, the runner uses that same profile to prove that the staged brief can be read and the repository's `CLAUDE.md` and the chosen supplier's private facts file under the world directory cannot. Stale or symlinked stages are refused. The inventory immediately before the writer call must be exactly `brief.md`. This is enforced filesystem isolation for the repository/world inputs, rather than reliance on the working directory or `--ignore-rules` alone. The custom Codex named-profile probe was not used: it aborted on the installed CLI; the OS wrapper was verified directly.

The runner validates expected output inventory, regular files (no symlinks), synthetic banners, an exact one-to-one multiset of assigned numeric headings (no duplicates, extras, or headings from other files) and unchanged RFQ bytes before publishing a packet. Provenance is prepared in a temporary file before packet publication and atomically replaces `writer.json`; a failed final metadata replacement rolls back the newly published packet and preserves prior provenance. It records the actual CLI version and explicit successful model selection, prompt/brief hashes, isolation probes, invocation flags, and exact per-file hashes in `writer.json`. Existing frozen packets/stages are refused rather than silently overwritten. Semantic fact checking and the bounded retry protocol remain #73.

Record the actual CLI version/model and verify the isolation/flags during #72 implementation. Copy only the brief's expected output Markdown files into `packets/<id>/`; a wildcard that includes `brief.md` would leak the private instructions. Preserve exact text so hashes and citations remain meaningful. No packet is accepted solely because the writer says it is complete.

### Deterministic fact check and rewrite loop (#73)

`sim/factcheck.mjs` uses string/section checks and `sim/keywords.json`, with no AI judgment. At build time, check that keywords are unique per criterion within each commodity; any overlap between applicable criteria fails the build. The "appears nowhere" and "value absent" checks scan only supplier-authored files: every packet file except `rfq.md`. The required rules are:

| State / check | Required check |
|---|---|
| `verified` | The brief's formatted value appears in the stated file under the stated numbered section |
| `assumed` | The claim text appears in the stated section. If `claimed_value` is non-null, it appears there too. Hidden numeric/date `true_value` must not appear in supplier-authored files unless it equals `claimed_value` or is already mandated in another assigned topic; hidden booleans/enums are not independently scannable |
| `missing` | No scannable keyword for that criterion appears anywhere in supplier-authored files (all packet files except `rfq.md`); each keyword mandated by another assigned block is individually marked unscannable |
| All files | Exact first-line synthetic banner; numbered headings match the brief; no line from local `.scrub-terms`, if present, appears |

On failure, append the sanitized failure list to that supplier's brief and rerun the isolated writer, at most **3 retries** after the initial attempt (H retry limit from #73). Facts, requirement limits and the key remain unchanged. A still-failing supplier makes `factcheck.json` and the world failed; stop, retain the failures, and do not declare the world complete or silently substitute another eval seed. Hand-made tiny packet tests must demonstrate each rule passing and failing.

The implemented API is `validateKeywords(keywords, profiles)`, `checkPacket(fact, compiled, packetTexts, options)`, `checkWorld(worldDirectory, options)`, and `rewriteWorld(worldDirectory, options)` in `sim/factcheck.mjs`. Run `node sim/factcheck.mjs --world <directory>` to check every candidate and write `factcheck.json`; add `--rewrite --model <model>` only for explicit build-stage rewriting. A failed report gives a nonzero CLI exit. Missing packets are reported as missing, never treated as clean. All facts, identities, seeds and the full keyword catalog are validated before a writer call.

`keywords.json` lists human topic phrases and prescribed-claim vocabulary for every applicable row, including nice-to-have rows. Validation checks coverage, case-normalized duplicates and phrase containment/overlap within every commodity (including sheet metal), permitting reuse only between mutually inapplicable topics. Runtime matching is literal and case-insensitive, with flexible whitespace and alphanumeric boundaries; numeric results additionally cannot match inside longer decimal/signed/exponent tokens. Numbered sections end at the next Markdown heading of the same or higher level, with exact numeric identity (`1.1` differs from `1.10`). Numbered heading inventories must equal the brief's assigned multiset. The local `.scrub-terms` file is optional; nonblank lines are literal, case-insensitive forbidden substrings, checked in every file including RFQ. Reports identify the location without repeating the local secret term.

The checker computes required supplier text once from assigned section topics and evidence lines, stopping before the omission list and RFQ. A hidden boolean or categorical enum cannot be distinguished from an ordinary word used for another topic, so its hidden-result scan is recorded as `unscannable`. Hidden numeric/date values already present in the required supplier text are also recorded as unscannable rather than forbidden. Numeric/date results not mandated there remain subject to the supplier-wide hidden-result scan. Missing-topic keywords use the same collision guard individually: a colliding keyword is recorded as unscannable, while all noncolliding synonyms still scan the packet. Neither omission instructions nor buyer RFQ can justify skipping a scan. Unscannable entries are metadata, not passes or failures of that particular scan; they persist in check/rewrite attempt records and do not trigger model retries. The verified-value and exact-claim/claimed-value checks still apply. RFQ remains excluded from missing-topic/hidden-result searches but checked for exact bytes, banner and local forbidden terms.

An existing clean packet causes zero writer calls. Otherwise the rewrite flow permits at most four calls (one initial call plus three retries), counts invocation/structural failures, and stops before later suppliers when one supplier exhausts its calls. `factcheck.json` preserves the initial existing-packet check as attempt 0 and every writer attempt, including failures. Before each attempt it retains the exact intended brief and hash under `factcheck-attempts/<id>/attempt-<n>/`; rejected packets and staged output are retained there too. Later suppliers remain explicitly `not_checked` on early stop. Writer failure entries use a fixed public-safe description, while the private attempt record separately retains `error` as `String(error.message ?? error)` truncated to 500 characters for diagnosis. This diagnostic may contain private input and must not be published as supplier text or passed to `sanitizeFailures`; retries receive only the fixed failure entries and allowlisted actions. No failed run is declared complete.

Retries regenerate the original brief and append only fixed public correction actions plus validated public filenames/numeric sections; private failure detail, row IDs, hidden results, key content and local secret terms never enter this feedback. `writeBrief`/`writePacket` accept structured `feedback` and `briefAttempt` (1–4); attempts use new `briefs/<id>.attempt-<n>.md` paths and refuse to overwrite them. Prior accepted provenance references remain intact. Each call gets a fresh owned temporary root, retains the same OS read/write isolation and stage-only-brief invariant, and archives only that supplier's rejected packet/stage. `writer.json` continues to record accepted publications only; `factcheck.json` and the retained attempt paths own failure history.

A string check demonstrates textual consistency, not independent technical validation of a study.

### Hold-out traps (#75)

After a world's original key is locked, Sid may add **3–5 manual edits** (H) to packet files before that world's blind run, such as deleting evidence or replacing a result with a vague claim. These edits are outside the generator and hidden from the build/reader sessions.

1. Record each edit privately in `holdout.json`, an array of `{ supplier_id, criterion, expected_state, expected_value, file, section }`. Keep it **outside the repository** until the blind run is finished. The expected entries exist before extraction; publication happens afterward. Do not regenerate the packet over the edits or pass the private list to the writer's rewrite loop.
2. Run the blind protocol on the edited packets. Preserve the original locked `answer_key.json` and `.sha256`. The pre-edit fact check remains evidence about the generated packet, not a claim that the edited packet still equals its original facts.
3. After the completed run, Sid commits `holdout.json`. `scripts/apply-holdout.mjs` validates the supplier, applicable criterion and packet file, then merges the expected entries into a **copy**, `answer_key.holdout.json`. Deleted-section edits still name the original file/section as edit provenance; a missing expected state yields a null extraction value/citation.
4. Score hold-out results separately and publish their own row. The overlay never overwrites or rehashes the original key; retain the identities of edited rows so they are not passed off as untouched simulation evidence. Test a valid merge and rejection of an unknown criterion or file.

This reconciles DATA-FR-13's pre-extraction private expectations with #75's post-run publication. The builder must not create example traps in real worlds or inspect Sid's private list before the run.

**Applying the published list (#75).** First confirm that the original key/hash commit was merged into `test` before extraction (§1 lock rule). Sid edits the chosen world's `packets/<supplier_id>/` files, keeps the original file for a deleted-section edit, and privately records expectations before extraction. Preserve the exact edited packet bytes used by the run and its staged-input hashes. Do not run `--no-writer` packet validation or the rewrite loop on edited packets as if they were the original generated world. After the entire blind run is complete, Sid publishes the list as `data/worlds/<n>/holdout.json`, then runs:

```sh
node scripts/apply-holdout.mjs --world data/worlds/<n> --holdout data/worlds/<n>/holdout.json
```

The CLI verifies the original adjacent key hash, then re-reads and compares the parsed key with its initial snapshot before writing; replacing both the key and its hash during processing is refused. It exclusively creates `answer_key.holdout.json`; it refuses an existing overlay. It does not establish Git merge ordering, run extraction, modify packets, publish the list, or rewrite `answer_key.json` / `answer_key.sha256`. Review/commit the published list and overlay after the run. A failed validation writes no overlay.

Both the overlay tool and eval use `validateHoldout` in `agent/holdout.mjs` and the same regular-file packet inventory (issue 128). Every entry requires exactly the six fields above. `supplier_id` must identify a candidate in the original key; `criterion` must apply to that supplier's commodity and have a row in that supplier's original locked key. An applicable criterion absent from the locked key is refused by both overlay and eval. Duplicate supplier/criterion pairs are rejected. States and typed values follow PRD-04 §5: `verified` needs a value, `assumed` accepts a typed claimed value or `null`, and `missing` needs `null`. `file` is an existing regular supplier-authored Markdown basename (no paths, symlinks or buyer `rfq.md`); `section` is a string numbered like `2` or `2.1`. A deleted section need not still exist. The procedure's 3–5 edits is guidance (H), not a hard-coded array-length limit.

The overlay copies world identity and scorecard, patches expectations in affected candidate references, and refreshes their expected scores, gap kinds, evaluations and deterministic draft lists using the engine and Stark Reference policy. Its reference notes identify edit provenance rather than inventing literal supplier quotations. Missing expectations have null values/citations while the top-level `holdout` array retains the original six-field file/section provenance. `source_answer_key_sha256` identifies the exact original lock; it is not a replacement lock. Untouched candidates retain their original content.

`agent/eval.mjs` continues to load the original locked key plus the published `holdout.json`, excludes edited supplier/criterion pairs from ordinary rows and reports them separately as HOLD-OUT. The overlay is a review artifact, not an automatic replacement for the locked key. Do not copy it over the original key or count its edited rows as untouched simulation evidence. Keep all run evidence; a correction after seeing results must be disclosed and cannot be presented as a pre-run expectation.

### Implementation acceptance map

These are obligations for the downstream issues, not claims that their code or data exists in this docs-only change.

| Issue | Evidence required |
|---|---|
| #67 | Same-seed deep equality; removing one supplier leaves all others' traits unchanged; no `Math.random` in `sim/` |
| #68 | JSON/MD pair per profile; every required/nice-to-have limit covered and basis-labeled; Sid's limit review |
| #69 | Exactly applicable criteria; recomputed sample Cpk/GRR agree; byte-identical facts; world 101 supplier summaries |
| #70 | SCORECARD CSV validator and determinism; all ACT assertions on the demo using M2, or clearly reported temporary engine-dependent skip |
| #71 | Engine-built references/key; demo decision/routing targets; gap-kind parity; one-byte tamper fails; hash merged before extraction |
| #72 | Sanitized brief; stage contains only the brief; one world 101 supplier written end to end with writer provenance |
| #73 | Passing/failing tiny packets for each rule, including RFQ exclusion and claimed-value handling; build-time keyword uniqueness; world 101 failures published; bounded rewrite loop and failed-world status |
| #74 | Full-range demo search log, per-supplier/per-story hit rates and selected seed; all five worlds built and fact checks clean; runtime reported; no-writer rebuild byte identity |
| #75 | Private-before-run / published-after-run procedure; separate overlay; valid/invalid merge tests |

The #66 acceptance is this Draft, the single Specs link in `docs/README.md`, complete trait units/ranges, and review against the owning docs. Contradictions are listed in its PR; RUBRIC, SCORECARD, DATASET and PRDs are not edited by this issue. Sid reviews this spec before #67 begins.

### World runner (#74)

`sim/run.mjs` exports `inspectSeed`, `findDemo`, `suppliersForSeed`, `deterministicHashes`, `buildWorld` and `promoteDemo`. Search defaults to1–20000, retains every rejection/reserved exclusion, and prints full-range hit rates. Story diagnostics share `sim/stories.mjs`, using the SCORECARD clauses already exercised by history tests. The search additionally checks SUP-01's missing required test, SUP-06's assumed knockout and SUP-07's demonstrated capacity shortfall.

Build with `node sim/run.mjs --seed <n>`; `--model` overrides `SQC_WRITER_MODEL`, otherwise the runner resolves the top-level model from the invoking user’s Codex config before passing it explicitly into the isolated writer. If none is configured it fails clearly. Existing worlds are frozen and refused by normal build. `--no-writer` rebuilds simulator-owned artifacts in scratch, checks byte hashes against the frozen world, and validates a scratch copy of its packets without invoking Codex or modifying retained provenance. `--demo <n> --model <model>` requires all candidate/story and fact checks before copying the demo into the documented app paths. Promotion refuses existing app destinations. Eval worlds101–104 are built directly, without demo filtering. Deterministic `run.log` contains stage outcomes; actual elapsed runtime is reported outside deterministic artifacts.
