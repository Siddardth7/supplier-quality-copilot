# PRD-01 — Qualification scoring engine

| Field | Value |
|---|---|
| Status | Approved |
| Owner | Sid (SME) |
| Release | v1.0 |
| Milestone | v1.0 · M2 Engine |
| ID prefix | `QUAL` |
| Specs referenced | `docs/RUBRIC.md` (all numbers and rules), `docs/DATASET.md` (extraction format) |
| Last updated | 2026-11-09 |

## 1. Problem

Two engineers scoring the same packet against the same checklist reach different answers, because the checklist doesn't say what "meets" means, where the edge of a band sits, or who signs. A junior can't take work off a senior until the scoring and the sign-off rule are written down precisely enough that a machine could apply them. If a machine can apply them, every decision can be reproduced and audited.

## 2. Users and jobs

| Persona | Job to be done | How this feature helps |
|---|---|---|
| Junior SQE | Know whether they may sign off, and why | Gets one decision and one routing result, with reasons, from a written rule |
| Senior SQE | Trust a score without re-reading the packet | Every criterion's score traces to an evidence state, a value and a citation |
| Q&R director | Defend a decision to an auditor or customer | Same input, same output, every time; the rules live in one doc |
| Supplier (indirect) | Get a short, exact request | The RFI item list contains only what they can send |

## 3. Goals and non-goals

**Goals**
- G1: Every criterion in `RUBRIC.md` has a stable ID, a value type and a rule with stated band edges. *(PRD-00 G1)*
- G2: The engine is a pure function: identical input gives deep-equal output. *(PRD-00 G2)*
- G3: Routing matches the `RUBRIC.md` rule for every dataset supplier. *(PRD-00 G5)*
- G4: The worked example in `RUBRIC.md` and the README's SUP-07 block can be reproduced by hand from the doc alone.

**Non-goals**
- NG1: Reading packets or deciding evidence states. That's the agent (PRD-04).
- NG2: Drafting RFI or audit text. The engine selects the items; the agent writes the prose.
- NG3: Weights per commodity (PRD-00 NG7). Teams can change the global weights through a policy (QUAL-FR-14), not per commodity.
- NG4: Scoring nice-to-have evidence.
- NG5: Partial credit for `bool` criteria. A bool is met or not; "minor gaps" only exist where a numeric band defines them.

## 4. Requirements

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| QUAL-FR-01 | The engine must score each criterion 0–3 from its evidence state and value, using the criterion's value type and rule in `RUBRIC.md` | Must | unit test (every criterion, every band) |
| QUAL-FR-02 | `missing` must score 0; `assumed` must score `min(1, rule(value))`, or 1 when the value is null | Must | unit test |
| QUAL-FR-03 | A criterion that applies to the commodity but is absent from the extraction must be treated as `missing`. A criterion that doesn't apply must be ignored and listed in `warnings` | Must | unit test |
| QUAL-FR-04 | Band edges must fall on the side stated in `RUBRIC.md` (Cpk 1.33 and 1.00, GR&R 10 and 30, capacity 1.2/1.0/0.8, PCN 90/30, retention 10/5, FAI 1.0/0.9/0.5, FPY 6/3, cert expiry on `as_of`) | Must | unit test per edge |
| QUAL-FR-05 | Category scores and the total must be computed as in `RUBRIC.md`, with the total rounded half up to 1 decimal before any threshold comparison | Must | unit test |
| QUAL-FR-06 | A knockout at 0 must force NOT APPROVED regardless of total. `5.lot_trace` must be a knockout only for High-risk commodities | Must | unit test |
| QUAL-FR-07 | The decision must follow `RUBRIC.md`, including the edges 85 → APPROVED and 70 → CONDITIONAL, an `assumed` knockout capping the result at CONDITIONAL, and an `assumed` knockout with a failing claimed value failing (score 0, NOT APPROVED) | Must | unit test |
| QUAL-FR-08 | Routing must send to Junior SQE only when APPROVED, the risk class is Low or Medium, and `9.second_source` is verified `true`; otherwise Senior SQE. Reasons must be listed in the `RUBRIC.md` order | Must | unit test + reference-extraction test |
| QUAL-FR-09 | The gap list must contain every scored criterion below 3, typed `fail`, `assumed` or `missing`. Nice-to-have items that are not `verified` are listed separately in `nice_to_have` as `info` | Must | unit test |
| QUAL-FR-10 | RFI items must be exactly the `missing` and `assumed` gaps, in criteria-table order | Must | unit test |
| QUAL-FR-11 | Audit focus must be up to 3 gaps, ordered knockout first, then score ascending, then category weight descending, then criteria-table order | Must | unit test |
| QUAL-FR-12 | The engine must throw an error naming the criterion when the input has an unknown criterion ID, an unknown state, a `verified` item with a null value or no citation, or a value of the wrong type or outside its enum | Must | unit test |
| QUAL-FR-13 | The output must carry each criterion's state, value, citation and note through unchanged, so the UI can show and link them | Must | unit test |
| QUAL-FR-14 | `evaluate` must take a team scoring policy (`RUBRIC.md` § Team scoring policy) and use its weights, `approve`, `conditional` and `knockouts_off` in place of the reference values. With no policy it must use Stark Reference v1. An invalid policy must throw an error naming the field | Must | unit test |
| QUAL-FR-15 | The output must carry the policy's `id`, `version` and `name` | Must | unit test |
| QUAL-NFR-01 | The engine must be pure: no I/O, no `Date.now()`, no randomness. The evaluation date comes in as `as_of` | Must | review + determinism test |
| QUAL-NFR-02 | The engine must be a dependency-free ES module that runs unchanged in the browser and under `node --test` | Must | review |
| QUAL-NFR-03 | The rubric must live as data in one module, `app/rubric.js`. A test must check its IDs, weights, knockouts and bands against `RUBRIC.md` | Must | parity test |
| QUAL-NFR-04 | Weights must sum to 100. Every commodity must have at least one required category-4 test | Must | unit test |
| QUAL-NFR-05 | **Data-driven category 4.** Tests and commodities must exist only as rows in `app/rubric.js` (test catalog and commodity profiles, `RUBRIC.md`). No engine or UI code may name a test ID or commodity key. Adding a test of an existing value type, or a commodity, must need no code change | Must | integrity test + scale test |

## 5. Interfaces

**Files**

| Path | Role |
|---|---|
| `app/rubric.js` | Rubric data: categories, criteria, test catalog, commodity profiles, bands, and the `STARK_REFERENCE` policy (QUAL-NFR-03, -05, QUAL-FR-14) |
| `app/engine.js` | The single engine module: `evaluate(extraction, { as_of, policy, rubric })` and its helpers (`rubric` defaults to `RUBRIC`; tests pass a generated one), `weightsFromRatings(ratings)`, the scorecard engine (PRD-02), and re-exports of the rubric data. Full list in [Engine API](#engine-api-appenginejs) |
| `data/extracted/<id>.json` | Input, produced by the agent (PRD-04) or written by hand as a reference extraction |

**Input** (shape owned by PRD-04; restated here because the engine validates it)

```json
{
  "supplier_id": "SUP-07",
  "commodity": "cold_plate",
  "criteria": [
    { "id": "2.ctq_cpk", "state": "verified", "value": 1.12, "citation": "capability_study.md §2", "note": "Flatness, n=125" },
    { "id": "8.subtier_named", "state": "missing", "value": null, "citation": null, "note": "quality_manual.md §7.4 is silent on the plater" }
  ],
  "drafts": { "rfi_email": "...", "audit_plan": ["..."] }
}
```

The engine ignores `drafts`. `as_of` is a `YYYY-MM-DD` string set once for the whole dataset (PRD-03).

**Output**

```json
{
  "supplier_id": "SUP-07",
  "commodity": "cold_plate",
  "risk": "High",
  "policy": { "id": "stark-reference", "version": 1, "name": "Stark Reference v1" },
  "total": 82.6,
  "categories": [
    {
      "n": 2, "name": "Process control", "weight": 15, "score": 10.0,
      "criteria": [
        { "id": "2.ctq_cpk", "knockout": true, "state": "verified", "value": 1.12,
          "citation": "capability_study.md §2", "note": "Flatness, n=125", "score": 1, "gap": "fail" }
      ]
    }
  ],
  "knockouts": { "failed": [], "assumed": [] },
  "decision": "CONDITIONAL",
  "routing": { "to": "senior", "reasons": ["CONDITIONAL", "High-risk commodity"] },
  "sole_source": false,
  "gaps": [ { "id": "2.ctq_cpk", "type": "fail", "score": 1 } ],
  "nice_to_have": [ { "id": "4.thermal_cycling", "state": "missing" } ],
  "rfi_items": ["2.spc", "6.ramp_plan", "8.subtier_named", "8.subtier_certs"],
  "audit_focus": ["2.ctq_cpk", "6.lead_time", "8.subtier_named"],
  "warnings": []
}
```

- `score` per category is rounded to 1 decimal for display. `total` is computed from the unrounded category scores.
- `gap` is `null` for criteria that score 3.
- `gaps` holds only scored criteria. `nice_to_have` lists every nice-to-have test of the commodity that is not `verified` (`missing`, `assumed`, or left out of the extraction = `missing`); these are the `info` items. A `verified` nice-to-have, even with value `false`, is not listed.
- `decision` is one of `APPROVED`, `CONDITIONAL` or `NOT APPROVED`. `routing.to` is `junior` or `senior`.
- `sole_source` is `true` unless `9.second_source` is `verified` with `true`. `routing.reasons` lists every rule that forced Senior in `RUBRIC.md` order; a Junior routing has the single reason `APPROVED, <risk> risk, second source confirmed`. Policy affects routing only through `decision`.
- `knockouts.failed` and `knockouts.assumed` list criterion IDs in category order then row order; a knockout switched off by the policy is in neither list. `warnings` are strings that start with the criterion ID.
- `policy` is `{ id, version, name }` of the policy that scored the packet, never the whole policy (QUAL-FR-15). A policy without a non-empty string `id` and `name` and an integer `version` ≥ 1 throws naming the field (`RUBRIC.md` § Team scoring policy).
- A row's `knockout` is the effective flag, `false` for a knockout switched off by the policy. The UI shows a `★ off` badge from the policy it passed in: `policy.qualification.knockouts_off`. The output has no separate field for it.
- Evidence `value` is a primitive (`null`, boolean, finite number or string) and `citation` and `note` are a string or `null`, for every entry including nice-to-have and not-applicable ones; anything else throws `<id>: value|citation|note: ...`. Output rows therefore share nothing with the input.

### Engine API (`app/engine.js`)

UI and tests import everything from `app/engine.js`; the engine has no DOM, fetch, clock or randomness.

| Name | Signature | Returns | Throws |
|---|---|---|---|
| `evaluate` | `evaluate(extraction, { as_of, policy?, rubric? })` | the Output above | `as_of`, a policy field path, `extraction`, `criteria[i]`, or `<id>: ...` (QUAL-FR-12) |
| `scoreCriterion` | `scoreCriterion(criterion, evidence, as_of)` | 0..3 for one criterion or catalog test; `null`/absent evidence is `missing` | `<id>: ...` on an unknown state or a bad value |
| `findCriterion` | `findCriterion(rubric, id)` | the criterion or catalog-test definition | `<id>: unknown criterion id` |
| `weightsFromRatings` | `weightsFromRatings(ratings)` | category weights from 1–5 ratings, summing to 100, unrounded | `ratings.<n>: ...` |
| `validatePolicy` | `validatePolicy(policy)` | nothing; checks a whole team policy, the qualification half then the scorecard half, with the same checks `evaluate` and `scorecard` run (the Standards editor and Import use it, PRD-12) | the same policy field path `evaluate` or `scorecard` would throw |
| `parseHistory` | `parseHistory(text)` | typed `data/history.csv` rows (PRD-02) | `header: ...` or `row <n>: <column>: ...` |
| `scorecard` | `scorecard(rows, { as_of, policy? })` | the scorecard output (PRD-02 §5) | `as_of`, `rows[i]: ...`, or a policy field path |
| `RUBRIC` | data | the rubric (`app/rubric.js`) | — |
| `STARK_REFERENCE` | data | the default team policy, Stark Reference v1 | — |
| `SCORECARD` | data | scorecard constants (`SCORECARD.md`) | — |

## 6. Acceptance criteria

- [ ] QUAL-AC-01: The `RUBRIC.md` SUP-07 worked example, run as a reference extraction, gives total 82.6, CONDITIONAL, Senior SQE with reasons `CONDITIONAL` and `High-risk commodity`, and the listed gaps, RFI items and audit focus. *(proves QUAL-FR-01, -02, -05, -07…-11)*
- [ ] QUAL-AC-02: Each band edge listed in QUAL-FR-04 has a test on both sides of the edge. *(proves QUAL-FR-04)*
- [ ] QUAL-AC-03: For every knockout, a packet that is otherwise perfect (total ≥ 85) but has that knockout at 0 gives NOT APPROVED; `5.lot_trace` at 0 on a Medium-risk commodity doesn't. *(proves QUAL-FR-06)*
- [ ] QUAL-AC-04: A perfect Medium-risk packet with a confirmed second source routes to Junior SQE. Flipping each one of risk class, second source and decision in turn routes it to Senior SQE with the matching reason. *(proves QUAL-FR-08)*
- [ ] QUAL-AC-05: Total exactly 85.0 is APPROVED, 84.9 is CONDITIONAL, 70.0 is CONDITIONAL and 69.9 is NOT APPROVED; a total ≥ 85 with an `assumed` knockout is CONDITIONAL. *(proves QUAL-FR-05, -07)*
- [ ] QUAL-AC-06: Each invalid input in QUAL-FR-12 throws an error whose message names the criterion. *(proves QUAL-FR-12)*
- [ ] QUAL-AC-07: Evaluating the same input twice gives deep-equal output, and `app/engine.js` contains no `Date`, `Math.random`, `fetch` or `import` of I/O modules. *(proves QUAL-NFR-01, -02)*
- [ ] QUAL-AC-08: The parity test passes: `app/rubric.js` matches the `RUBRIC.md` tables, and weights sum to 100. *(proves QUAL-NFR-03, -04)*
- [ ] QUAL-AC-09: The README SUP-07 block matches the engine's output for the worked example. *(proves G4)*
- [ ] QUAL-AC-11: With no policy, every result equals the Stark Reference v1 result. A policy with SUP-07's weights moved so its total crosses 85 flips it to APPROVED; switching off `2.ctq_cpk` turns a Cpk-0 NOT APPROVED into a total-based decision; `approve` 90 makes a 87 total CONDITIONAL; weights summing to 99, or `conditional` ≥ `approve`, throw. The output names the policy. *(proves QUAL-FR-14, -15)*
- [ ] QUAL-AC-10: A test-only rubric fixture adds a commodity with 100 generated required tests (mixed bool and number). The unchanged engine scores it, fails it when any one test is 0, and lists that test as the knockout. A grep finds no test ID or commodity key in `app/engine.js` or `app/*.js` UI code. *(proves QUAL-NFR-05)*

## 7. Open questions

| # | Question | Owner | Resolution |
|---|---|---|---|
| 1 | Nice-to-have evidence: unscored and reported as `info`, or a bonus that can only raise the score? | Sid | v1.0: unscored (NG4). Keeps the total out of 100 honest |
| 2 | Should an `assumed` knockout block APPROVED? | Sid | v1.0: yes, it caps at CONDITIONAL. Approving on a claim for a must-pass item isn't defensible |
| 3 | Should a missing `9.second_source` count as sole source for routing? | Sid | v1.0: yes ("Second source unconfirmed"). Junior sign-off needs a confirmed second source |
| 4 | Should RFI items include fails? | Sid | v1.0: no. A fail needs corrective action (CONDITIONAL plan or SCAR), not more documents |
| 5 | 1–5 ratings can't reproduce 15/10/8/7 exactly. How do ratings map to weights? | Sid | 2026-11-09: the reference keeps exact points until a rating changes; revisit during M2 rubric work (W1) |

## 8. Out of scope

| Item | Picked up by |
|---|---|
| Category weights per commodity | Unscheduled (PRD-00 NG7) |
| RFI and audit prose | PRD-04 (agent drafts) |
| Showing the breakdown | PRD-05 (Qualify view) |
| Scorecard math | PRD-02 |

## 9. Changelog

| Date | Change |
|---|---|
| 2026-11-12 | §5 Engine API (issue 109): adds `validatePolicy(policy)`, which runs the existing qualification and scorecard policy checks in that order and throws their field-named error unchanged. `evaluate` and `scorecard` are unchanged. No scores change. |
| 2026-11-10 | §5 (#23): `evaluate` outputs `policy` `{ id, version, name }` (QUAL-FR-15); a policy without a valid `id`, `version` and `name` throws (QUAL-FR-14, `RUBRIC.md`); evidence `value` must be a primitive and `citation`/`note` a string or `null` (QUAL-FR-13); `★ off` badge comes from the policy passed in; Engine API table is the single export surface. |
| 2026-11-09 | QUAL-FR-09 and §5: `info` items (nice-to-have tests that are not `verified`, so `missing` or `assumed`) live only in `nice_to_have`, not in `gaps` (Sid, #19). |
| 2026-11-09 | §5: `sole_source` and `routing.reasons` defined; policy reaches routing only through `decision` (QUAL-FR-08, #18). |
| 2026-11-09 | QUAL-FR-07: an `assumed` knockout with a failing claimed value fails (min(1, rule(value)) = 0), matching RUBRIC.md. |
| 2026-11-09 | QUAL-FR-14, -15, QUAL-AC-11: team scoring policy as an engine input (Sid, D1); required tests judged against Stark's requirement sheet (D3). |
| 2026-11-09 | QUAL-NFR-05 and QUAL-AC-10: category 4 is data-driven and scales to any number of tests (Sid, A4). |
| 2026-11-08 | First draft. `RUBRIC.md` v1 alongside it: criterion IDs, value types, band edges, per-commodity category 4, nice-to-have unscored, `assumed` knockout cap, audit-focus order, SUP-07 worked example. |
