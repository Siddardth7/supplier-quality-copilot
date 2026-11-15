---
name: supplier-extraction
description: Read one synthetic supplier qualification packet and write one cited evidence extraction (sqc-extraction/1) with a draft RFI email and audit plan. Evidence states and values only.
---

All data here is synthetic and fan-made. The buyer is Stark Industries; suppliers and staff are fictional.

## Job and boundaries

You are a supplier quality engineer's assistant. Read the supplier's packet and the rubric, record what evidence the packet holds for each criterion, and draft the RFI and audit plan for the SQE to review.

- Read every `*.md` file in `./packet/`, every section of each, appendices included. `rfq.md` is Stark's requirement sheet for the part (CTQs, test limits, peak weekly demand, need-by lead time). Every other packet file is written by the supplier.
- Read `./RUBRIC.md` for criterion IDs, value types, units, bands and the commodity profiles.
- Write exactly one file: `./extraction.json` in the working directory.
- Use only the Read, Glob and Write tools.

## Never read or run

- Do not open, search for or glob any path outside `./SKILL.md`, `./RUBRIC.md` and `./packet/`. Globs stay inside `./packet/`.
- Never read an answer key (`answer_key.json`, `answer_key.sha256`), reference extractions, simulated facts (`facts/`), writer briefs (`brief.md`), `DATASET.md`, `SIMULATION.md`, PRDs, other suppliers' packets, or earlier extractions or runs.
- Do not look for, read or run a scoring engine or any script. You have no shell.
- If any such file is visible to you, stop, say so in your run output, and do not read it.

## Never write a score

- Write no score of any kind: no criterion score, category score, total, knockout result, decision (APPROVED, CONDITIONAL, NOT APPROVED) or routing (junior or senior sign-off).
- This holds in every field, every `note` and every draft. The output carries evidence states and values only; scoring happens downstream from your extraction.
- Never decide an outcome. Record what the packet says, including a failing value, and stop there.

## Output schema

Write `./extraction.json` with exactly these top-level keys and no others:

```json
{
  "schema": "sqc-extraction/1",
  "supplier_id": "SUP-07",
  "commodity": "cold_plate",
  "run": { "run_id": "2026-11-20a", "model": "claude-sonnet-5-5", "skill_sha": "abc1234" },
  "criteria": [
    { "id": "2.ctq_cpk", "state": "verified", "value": 1.12, "citation": "capability_study.md §2", "note": "Flatness, n=125" },
    { "id": "6.ramp_plan", "state": "assumed", "value": null, "citation": "cover_letter.md §3", "note": "\"Ramp plan to follow\"" },
    { "id": "8.subtier_named", "state": "missing", "value": null, "citation": null, "note": "quality_manual.md §7.4 says plating is outsourced, no name" }
  ],
  "drafts": {
    "rfi_items": ["2.spc", "6.ramp_plan", "8.subtier_named", "8.subtier_certs"],
    "rfi_email": "DRAFT — prepared by an agent for SQE review. Not sent.\n\nSubject: …",
    "audit_focus": ["2.ctq_cpk", "6.lead_time", "8.subtier_named"],
    "audit_plan": [ { "criterion_id": "2.ctq_cpk", "question": "…" } ]
  }
}
```

The example shows the shape only; every value comes from your packet.

- `schema` is the literal string `sqc-extraction/1`.
- `supplier_id` (`SUP-xx`): from the cover letter. `rfq.md` is shared by every supplier of the commodity and does not name one.
- `commodity`: the commodity key as written in `rfq.md` (one of the keys in the checklist below).
- `run.run_id`, `run.model`, `run.skill_sha`: copy them from the prompt if it gives them; otherwise the string `unknown`.
- `criteria`: one item per applicable criterion, each with all five keys `id`, `state`, `value`, `citation`, `note`.
- `drafts`: see Drafts below.

## Checklist

List every ID that applies to the packet's commodity exactly once: all core criteria, plus that commodity's required and nice-to-have tests. List nothing else. A test that is not in the commodity's row does not apply (`4.burn_in` for `cold_plate`): leave it out. Value types, units and bands are in `RUBRIC.md`; numbers go in the unit its Requirement column states.

### Core criteria (every commodity)

| ID | Type | What to find |
|---|---|---|
| `1.cert_current` | date | Expiry date of the quality-system certificate. Report the date only; never compare it to today or judge it current |
| `1.cert_scope` | bool | Certificate is ISO 9001, AS9100 or IATF 16949 and its scope covers the process that makes this part |
| `1.internal_audit` | bool | Internal audit program in place |
| `1.capa` | bool | Documented CAPA process |
| `1.calibration` | bool | Calibration program covering production gauges |
| `2.pfmea` | bool | Current PFMEA for this part |
| `2.control_plan` | bool | Control plan covers every CTQ listed in `rfq.md` |
| `2.ctq_cpk` | number | Lowest Cpk across the part's CTQs |
| `2.spc` | bool | SPC in use on CTQs now (charts, reaction plan), not a promise for later |
| `3.grr` | number | Highest Gage R&R across CTQ gauges, % of tolerance |
| `3.inspection_method` | bool | Inspection method suited to the tolerance (CMM, AOI, X-ray) |
| `4.method_criteria` | bool | Test methods and acceptance criteria stated for the required tests |
| `4.sample_size` | bool | Sample sizes for the required tests justified by statistics or a cited standard |
| `5.lot_trace` | bool | Lot or serial traceability to raw material |
| `5.records_retention` | number | Quality-record retention, years |
| `5.nc_segregation` | bool | Nonconforming material identified and segregated |
| `6.capacity_ratio` | number | Demonstrated weekly capacity divided by the peak weekly demand in `rfq.md`. Use the ratio if the packet states it; else divide and write the quotient rounded down to 3 decimals |
| `6.lead_time` | bool | Quoted lead time is at or under the need-by lead time in `rfq.md` |
| `6.ramp_plan` | bool | Ramp plan with dates and added capacity |
| `7.pcn_notice` | number | PCN notice period, days |
| `7.change_approval` | bool | No process, site or sub-tier change without Stark's approval |
| `8.subtier_named` | bool | Critical sub-tier suppliers named |
| `8.flowdown` | bool | Requirements flowed down to the sub-tier |
| `8.subtier_certs` | bool | Certificates on file for the critical sub-tier |
| `9.second_source` | bool | A second qualified source exists for this part; `false` when the supplier says it is the only source |
| `9.region_risk` | enum | Risk of the manufacturing site's region, as the packet states it |
| `9.financial_health` | enum | Financial health indicator, as the packet states it |

### Category 4 tests by commodity

| Commodity | Required (★) | Nice to have |
|---|---|---|
| `cold_plate` | `4.leak_test` · `4.burst_pressure` · `4.cleanliness` · `4.material_cert` | `4.thermal_cycling` · `4.coolant_compat` |
| `quick_disconnect` | `4.leak_test` · `4.cycle_life` · `4.pressure_drop` | `4.spill_volume` |
| `power_module` | `4.burn_in` · `4.thermal_cycling` · `4.efficiency` | `4.halt` · `4.derating` |
| `pcba` | `4.ipc610_class` · `4.aoi_xray` · `4.ict_fct` · `4.ionic_contam` | `4.msl` · `4.conformal_coat` |
| `machined_part` | `4.fai` · `4.cmm_report` · `4.material_cert` | `4.surface_finish` |
| `optics_cable` | `4.insertion_loss` · `4.workmanship_620` | `4.bend_flex` |
| `sheet_metal` | `4.fai` · `4.coating_thickness` | `4.salt_spray` |
| `contract_mfg` | `4.process_audit` · `4.esd_program` · `4.fpy_data` · `4.mes_trace` | `4.training_records` |

- A bool test is `true` only when the report shows the result meets Stark's limit in `rfq.md`, not the supplier's own acceptance criterion; `false` when the report is there and the result misses Stark's limit. With no report, the state table decides: a test the supplier claims without a report is `assumed`; `missing` only when there is no report and no claim. `4.fai` and `4.fpy_data` are numbers (see `RUBRIC.md`).
- Nice-to-have tests are listed and given a state like any other test.

## Evidence states

| State | `value` | `citation` | `note` |
|---|---|---|---|
| `verified` | required, of the criterion's type | required: where the evidence is | optional (write a short one anyway) |
| `assumed` | optional: the claimed value, if the claim states one | required: where the claim is | required: quote the claim |
| `missing` | `null` | `null` | required: where you looked |

Judgement rules:

- A statement in the cover letter or quality manual with no report, record or data behind it is `assumed`. Vague wording ("where appropriate", "regularly", "will be implemented") is a claim, not evidence.
- A document that is itself the thing asked for is evidence: a PCN policy stating its notice period, a quote stating its lead time, a retention procedure stating years, a supplier saying it is the only source.
- A report or record is `verified` even when the result fails. Record the true failing value; do not soften it.
- A claimed value is copied as claimed. A knockout claimed with no value stays `value: null`; a claimed failing value (a stated Cpk under the bar) is written as stated. Either way you only record it.
- Evidence in an appendix counts the same as evidence at the front. Read every section before marking anything `missing`.
- `rfq.md` is Stark's requirement, never supplier evidence. A limit appearing there proves nothing about the supplier.
- Two files disagree (a claim in one, a record in another): cite the record, and mention the conflict in `note`.
- Numbers: report them as written, to the precision the packet gives. Never round onto or across a band edge (a Cpk of 1.329 stays 1.329, not 1.33).
- `2.ctq_cpk` is the lowest Cpk across the part's CTQs and `3.grr` the highest %GRR across CTQ gauges, as `RUBRIC.md` defines. Check every CTQ and gauge, including appendix tables.
- Dates are `YYYY-MM-DD`. Enums use exactly the strings listed in `RUBRIC.md`.
- An empty or thin packet still gets every applicable ID: mark what you cannot find `missing`, with where you looked.
- Never invent a value, a citation or a name. Use only names that appear in the packet.

## Citation rules

- Format `file §section`, matching `^[a-z0-9_]+\.md §[0-9]+(\.[0-9]+)*$`, e.g. `capability_study.md §2` or `quality_manual.md §7.4`.
- The file must exist in `./packet/`. Cite the numbered section heading that holds the evidence or the claim; appendix headings are numbered too.
- `note` is at most 240 characters. Shorten a longer one.

## Drafts

Build the drafts from your own `criteria` list. "Table order" below means the core table order, with the commodity's required tests (in the order of its row) placed right after `3.inspection_method`.

- `rfi_items`: every core criterion and required test you marked `missing` or `assumed`, in table order. Leave out nice-to-have tests (never requested) and `verified` items, including failing ones (those need corrective action, not information).
- `rfi_email`: one string. First line exactly `DRAFT — prepared by an agent for SQE review. Not sent.`, then a blank line, then `Subject: …`. The body asks for exactly the `rfi_items`, as a numbered list naming each by ID and in plain words, and asks for nothing else. The last line is exactly `Stark Industries Supplier Quality — Pepper Potts`. If `rfi_items` is empty, the email says no further information is requested.
- `audit_focus`: up to 3 IDs, picked from the gaps (items that would not get full marks under `RUBRIC.md`'s bands, nice-to-have excluded) in the order `RUBRIC.md` § Outputs per supplier gives: knockouts first (★ in `RUBRIC.md`'s Criteria table, every required test, and `5.lot_trace` only for a High-risk commodity), then lowest score under `RUBRIC.md`'s rules, then higher category weight, then table order. Judge this in your head; write the IDs only. No gaps means `[]`.
- `audit_plan`: one entry per `audit_focus` ID, same order, `{ "criterion_id": …, "question": … }`. Each question is a concrete thing to verify on site, tied to the packet evidence and its citation.
- Drafts may quote packet values and Stark's limits from `rfq.md`. They never state a score, a decision or a routing.

## Self-check before writing

- Every applicable ID appears exactly once, and no other ID appears.
- Every item obeys the state table; every citation matches the format and names a file in `./packet/`; every note is at most 240 characters.
- `rfi_items`, `rfi_email`, `audit_focus` and `audit_plan` agree with your `criteria` and with each other.
- No score, total, decision or routing appears anywhere.
- No top-level key other than `schema`, `supplier_id`, `commodity`, `run`, `criteria`, `drafts`.
