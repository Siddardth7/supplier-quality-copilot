# Eval results (issue 36)

| Field | Value |
|---|---|
| Status | First complete run, published as measured |
| Release / milestone | v1.0 / M4 |
| Issue | #36 |
| Product requirements | [PRD-04](product/PRD-04-agent.md) AGENT-FR-08…10, AGENT-AC-05 |
| Data | [`data/eval.json`](../data/eval.json), the unedited `eval.mjs --json` output of both runs below |
| Last updated | 2026-11-14 |

All data is synthetic. The buyer is Stark Industries and the suppliers carry Marvel comic-book company names; this
project is fan-made and not affiliated with Marvel.

**Verdict.** On the four eval worlds (101–104, pooled), the first Sonnet run caught 71 of 73 planted gaps (97.3%),
so it **meets** the catch target (≥ 90%). It raised 108 false alarms on 1079 clean rows (10.0%), so it **misses** the
false-alarm target (≤ 5%). Both numbers are published as measured (PRD-04 G3). The skill was not changed after the
run (NG3), so there is no re-test. The Opus comparison run caught 73 of 73 with no false alarms.

## 1. Headline: Sonnet, worlds 101–104 pooled

Run `2026-11-14-sonnet`, model `claude-sonnet-5-5`, skill `af74a03`. All four worlds were scored, so the targets are
judged.

| Measure | Count | Rate | Target | Result |
|---|---|---|---|---|
| Catch | 71/73 | 97.3% | ≥ 90% | PASS |
| Partial | 1/73 | 1.4% | none | - |
| Miss | 1/73 | 1.4% | none | - |
| Flag rate (catch + partial) | 72/73 | 98.6% | none | - |
| False alarm | 108/1079 | 10.0% | ≤ 5% | FAIL |
| Citation match | 35/35 | 100.0% | no target | - |
| Decision agreement | 30/36 | 83.3% | no target | - |

Definitions are PRD-04 §5 "Eval definitions": catch = state equals the key (and value, for `verified`); partial =
flagged but the wrong state or value; miss = not flagged; false alarm = a clean row the agent flags. Citation match
and decision agreement have no PRD-04 target.

## 2. Per world (Sonnet)

| World | Gap rows | Catch | Partial | Miss | Clean rows | False alarms | Catch % | False alarm % | Citation | Decision agreement |
|---|---|---|---|---|---|---|---|---|---|---|
| 101 | 16 | 14 | 1 | 1 | 272 | 28 | 87.5% | 10.3% | 9/9 | 9/9 (100.0%) |
| 102 | 19 | 19 | 0 | 0 | 269 | 25 | 100.0% | 9.3% | 9/9 | 7/9 (77.8%) |
| 103 | 20 | 20 | 0 | 0 | 268 | 12 | 100.0% | 4.5% | 8/8 | 8/9 (88.9%) |
| 104 | 18 | 18 | 0 | 0 | 270 | 43 | 100.0% | 15.9% | 9/9 | 6/9 (66.7%) |

Decision agreement is the number of candidates where the engine, run on the agent's extraction, gives the same
decision and routing as on the answer key. No packet was missing or failed validation, so no clean row went
unassessed (`clean_unassessed` is 0 in every world).

## 3. Other rows

### Opus comparison: `2026-11-14-opus`, worlds 101–104 pooled

Model `claude-opus-5-5`, same skill (`af74a03`), same worlds. Its own run, not part of the headline (AGENT-FR-10).

| Measure | Count | Rate | Target | Result |
|---|---|---|---|---|
| Catch | 73/73 | 100.0% | ≥ 90% | PASS |
| Partial | 0/73 | 0.0% | none | - |
| Miss | 0/73 | 0.0% | none | - |
| Flag rate (catch + partial) | 73/73 | 100.0% | none | - |
| False alarm | 0/1079 | 0.0% | ≤ 5% | PASS |
| Citation match | 35/35 | 100.0% | no target | - |
| Decision agreement | 36/36 | 100.0% | no target | - |

| World | Gap rows | Catch | Partial | Miss | Clean rows | False alarms | Catch % | False alarm % | Citation | Decision agreement |
|---|---|---|---|---|---|---|---|---|---|---|
| 101 | 16 | 16 | 0 | 0 | 272 | 0 | 100.0% | 0.0% | 9/9 | 9/9 (100.0%) |
| 102 | 19 | 19 | 0 | 0 | 269 | 0 | 100.0% | 0.0% | 9/9 | 9/9 (100.0%) |
| 103 | 20 | 20 | 0 | 0 | 268 | 0 | 100.0% | 0.0% | 8/8 | 9/9 (100.0%) |
| 104 | 18 | 18 | 0 | 0 | 270 | 0 | 100.0% | 0.0% | 9/9 | 9/9 (100.0%) |

### Demo world 93 (Sonnet)

Reported on its own, not in the headline. Targets apply to the headline only. The Opus run did not cover world 93.

| Measure | Count | Rate | Target | Result |
|---|---|---|---|---|
| Catch | 22/22 | 100.0% | ≥ 90% | headline only |
| Partial | 0/22 | 0.0% | none | - |
| Miss | 0/22 | 0.0% | none | - |
| Flag rate (catch + partial) | 22/22 | 100.0% | none | - |
| False alarm | 10/266 | 3.8% | ≤ 5% | headline only |
| Citation match | 9/9 | 100.0% | no target | - |
| Decision agreement | 9/9 | 100.0% | no target | - |

### Hold-out

Not run: no hold-out traps were set for this run (decision 213). No number is reported.

### Re-test, worlds 105–108

Not run: skill unchanged after the run (AGENT-FR-09). A future skill change would need a re-test on 105–108 before
any new number is published.

## 4. Every miss and partial

Two Sonnet gap rows were not catches, both in world 101. The Opus run has none.

| World | Supplier | Criterion | Outcome | Key | Agent | Citation |
|---|---|---|---|---|---|---|
| 101 | SUP-01 | 1.calibration | partial | missing null | assumed null | agent: quality_manual.md §9.1; key: none |
| 101 | SUP-07 | 7.change_approval | miss | assumed null | verified true | pcn_policy.md §1.2 (both) |

**101 SUP-01 `1.calibration`: partial.** Agent note: "Only mention: \"calibrated gauges\" under inspection methods;
no calibration program or records in the packet". Key note: "Expected 1.calibration evidence in quality_manual.md;
none disclosed in the planned supplier packet." The agent recorded a passing phrase as an `assumed` claim where the
key says nothing was disclosed (`missing`): the gap was flagged, but as the wrong kind.

**101 SUP-07 `7.change_approval`: miss.** Agent note: "\"obtain customer authorization before changing manufacturing
arrangements\"; wording does not name process/site/sub-tier". Key note: "Supplier claims: \"We obtain customer
authorization before changing manufacturing arrangements.\"" The agent marked the supplier's commitment sentence
`verified` true, although its own note says the wording is incomplete; the key treats the same sentence as a bare
claim (`assumed`). A verified item scores 3, so the gap was not flagged.

## 5. Every false alarm

Sonnet raised 108 false alarms in the headline worlds and 10 in the demo world. The Opus run has none.

| World | Supplier | False alarms |
|---|---|---|
| 101 | SUP-03 | 10 |
| 101 | SUP-05 | 10 |
| 101 | SUP-08 | 8 |
| 102 | SUP-03 | 12 |
| 102 | SUP-08 | 13 |
| 103 | SUP-01 | 12 |
| 104 | SUP-02 | 10 |
| 104 | SUP-03 | 5 |
| 104 | SUP-04 | 10 |
| 104 | SUP-05 | 8 |
| 104 | SUP-08 | 10 |
| 93 | SUP-03 | 10 |

Every one of the 118 rows has the same shape: the key says `verified` with a value, and the agent gives `assumed` with
the same value and the key's file. The answer key carries no note on any of these rows. The agent's notes give one of
two reasons for not accepting the evidence. Most read the packet's statement (for example "Recorded result: true." or
"... is present or demonstrated.") as a claim with nothing behind it ("No CAPA procedure or records in packet"). The six
`3.inspection_method` rows (101 SUP-03, 101 SUP-05, 102 SUP-03, 102 SUP-08, 103 SUP-01, 104 SUP-05) instead say the
measurement method isn't named ("No method named (CMM etc.)"). The key counts the statement as verified evidence in
both cases. The rows sit in 12 supplier packets, all cited to `quality_manual.md` (98), `subtier.md` (10),
`cover_letter.md` (6) and `reliability_report.md` (4).

The full list, generated from `data/eval.json` and each extraction's own note in `agent/runs/2026-11-14-sonnet/`:

| World | Supplier | Criterion | Key | Agent | Citation | Agent note (verbatim) |
|---|---|---|---|---|---|---|
| 101 | SUP-03 | 1.internal_audit | verified true | assumed true | quality_manual.md §9.1 | Quality manual: "Recorded result: true." No audit records in packet |
| 101 | SUP-03 | 1.capa | verified true | assumed true | quality_manual.md §9.2 | Quality manual: "Recorded result: true." No CAPA procedure or records in packet |
| 101 | SUP-03 | 1.calibration | verified true | assumed true | quality_manual.md §9.3 | Quality manual: "Recorded result: true." No calibration records in packet |
| 101 | SUP-03 | 2.pfmea | verified true | assumed true | quality_manual.md §1.1 | Quality manual: "Recorded result: true." No PFMEA document in packet |
| 101 | SUP-03 | 2.control_plan | verified true | assumed true | quality_manual.md §9.4 | Quality manual claims true, lists CTQs: Output voltage, Connector pitch, Mounting-hole pitch. No control plan document |
| 101 | SUP-03 | 2.spc | verified true | assumed true | quality_manual.md §9.5 | Quality manual: "Recorded result: true." No charts or reaction plan in packet |
| 101 | SUP-03 | 3.inspection_method | verified true | assumed true | quality_manual.md §9.6 | Claims "Drawing-specific CTQ measurement instructions and calibrated gauges." No method named (CMM etc.) |
| 101 | SUP-03 | 5.lot_trace | verified true | assumed true | quality_manual.md §1.2 | Quality manual: "Recorded result: true." No trace records in packet |
| 101 | SUP-03 | 5.nc_segregation | verified true | assumed true | quality_manual.md §9.7 | Quality manual: "Recorded result: true." No segregation records in packet |
| 101 | SUP-03 | 8.flowdown | verified true | assumed true | subtier.md §9.2 | Subtier doc: "Recorded result: true." No flowdown document or record |
| 101 | SUP-05 | 1.internal_audit | verified true | assumed true | quality_manual.md §1.1 | Claim only, no audit record: "The recorded result is true." |
| 101 | SUP-05 | 1.capa | verified true | assumed true | quality_manual.md §1.2 | Claim only, no CAPA procedure or records: "The recorded result is true." |
| 101 | SUP-05 | 1.calibration | verified true | assumed true | quality_manual.md §9.1 | Claim only, no calibration records: "The recorded result is true." |
| 101 | SUP-05 | 2.pfmea | verified true | assumed true | quality_manual.md §1.3 | Claim only, no PFMEA document: "The recorded result is true." |
| 101 | SUP-05 | 2.control_plan | verified true | assumed true | quality_manual.md §1.4 | Claim only, no control plan document; lists Datum bore, Base thickness, Hole pitch |
| 101 | SUP-05 | 2.spc | verified true | assumed true | quality_manual.md §1.5 | Claim only, no charts or reaction plan: "The recorded result is true." |
| 101 | SUP-05 | 3.inspection_method | verified true | assumed true | quality_manual.md §1.6 | Claim: "Drawing-specific CTQ measurement instructions and calibrated gauges." No CMM named |
| 101 | SUP-05 | 5.lot_trace | verified true | assumed true | quality_manual.md §1.7 | Claim only, no trace records: "The recorded result is true." |
| 101 | SUP-05 | 5.nc_segregation | verified true | assumed true | quality_manual.md §9.2 | Claim only, no procedure or records: "The recorded result is true." |
| 101 | SUP-05 | 8.flowdown | verified true | assumed true | subtier.md §1.2 | Claim only, no flowdown document: "The recorded result is true." |
| 101 | SUP-08 | 1.internal_audit | verified true | assumed true | quality_manual.md §9.1 | "Internal audit program is present or demonstrated." No audit record. |
| 101 | SUP-08 | 1.capa | verified true | assumed true | quality_manual.md §1.1 | "Corrective-action program is present or demonstrated." No CAPA record. |
| 101 | SUP-08 | 1.calibration | verified true | assumed true | quality_manual.md §1.2 | "Gauge calibration program is present or demonstrated." No calibration records. |
| 101 | SUP-08 | 2.pfmea | verified true | assumed true | quality_manual.md §1.3 | "Manufacturing failure-mode analysis is present or demonstrated." No PFMEA document. |
| 101 | SUP-08 | 2.spc | verified true | assumed true | quality_manual.md §1.5 | "Statistical process monitoring is present or demonstrated." No charts or reaction plan. |
| 101 | SUP-08 | 5.lot_trace | verified true | assumed true | quality_manual.md §1.7 | "Lot traceability is present or demonstrated." No trace record. |
| 101 | SUP-08 | 5.nc_segregation | verified true | assumed true | quality_manual.md §1.9 | "Nonconforming material segregation is present or demonstrated." No record. |
| 101 | SUP-08 | 8.flowdown | verified true | assumed true | subtier.md §9.1 | "Requirements passed to outside suppliers is present or demonstrated." No flowdown record. |
| 102 | SUP-03 | 1.internal_audit | verified true | assumed true | quality_manual.md §9.1 | "Internal audit program is present or demonstrated. Recorded result: true." No audit records in packet |
| 102 | SUP-03 | 1.capa | verified true | assumed true | quality_manual.md §1.1 | "Corrective-action program is present or demonstrated. Recorded result: true." No CAPA records in packet |
| 102 | SUP-03 | 1.calibration | verified true | assumed true | quality_manual.md §1.2 | "Gauge calibration program is present or demonstrated. Recorded result: true." No calibration records in packet |
| 102 | SUP-03 | 2.pfmea | verified true | assumed true | quality_manual.md §9.2 | "Manufacturing failure-mode analysis is present or demonstrated. Recorded result: true." No PFMEA document in packet |
| 102 | SUP-03 | 2.control_plan | verified true | assumed true | quality_manual.md §9.3 | Claim lists ctqs: Output voltage, Connector pitch, Mounting-hole pitch (all three rfq CTQs). No control plan document |
| 102 | SUP-03 | 2.spc | verified true | assumed true | quality_manual.md §1.3 | "Statistical process monitoring is present or demonstrated. Recorded result: true." No charts or reaction plan in packet |
| 102 | SUP-03 | 3.inspection_method | verified true | assumed true | quality_manual.md §9.4 | "Drawing-specific CTQ measurement instructions and calibrated gauges." No method named (CMM etc.) |
| 102 | SUP-03 | 5.lot_trace | verified true | assumed true | quality_manual.md §9.5 | "Lot traceability is present or demonstrated. Recorded result: true." No trace records in packet |
| 102 | SUP-03 | 5.nc_segregation | verified true | assumed true | quality_manual.md §1.5 | "Nonconforming material segregation is present or demonstrated. Recorded result: true." No records |
| 102 | SUP-03 | 9.second_source | verified true | assumed true | cover_letter.md §9.1 | "Qualified alternate manufacturer: Horizon Labs." Claim only; no qualification record |
| 102 | SUP-03 | 9.region_risk | verified "low" | assumed "low" | cover_letter.md §9.2 | "The recorded result is low." Cover letter statement only |
| 102 | SUP-03 | 9.financial_health | verified "healthy" | assumed "healthy" | cover_letter.md §1.1 | "The recorded result is healthy." Cover letter statement only; no financial data |
| 102 | SUP-08 | 1.internal_audit | verified true | assumed true | quality_manual.md §1.1 | "Internal audit program is present or demonstrated." No audit record in packet |
| 102 | SUP-08 | 1.capa | verified true | assumed true | quality_manual.md §1.2 | "Corrective-action program is present or demonstrated." No procedure or CAPA records in packet |
| 102 | SUP-08 | 1.calibration | verified true | assumed true | quality_manual.md §1.3 | "Gauge calibration program is present or demonstrated." No calibration records in packet |
| 102 | SUP-08 | 2.pfmea | verified true | assumed true | quality_manual.md §9.1 | "Manufacturing failure-mode analysis is present or demonstrated." No PFMEA document in packet |
| 102 | SUP-08 | 2.control_plan | verified true | assumed true | quality_manual.md §1.4 | Claim lists ctqs: Rail spacing, Mounting fastener torque, Manifold alignment (all 3 RFQ CTQs). No control plan document |
| 102 | SUP-08 | 2.spc | verified true | assumed true | quality_manual.md §9.2 | "Statistical process monitoring is present or demonstrated." No charts or reaction plan in packet |
| 102 | SUP-08 | 3.inspection_method | verified true | assumed true | quality_manual.md §1.5 | "Drawing-specific CTQ measurement instructions and calibrated gauges." No instrument type (CMM etc.) named |
| 102 | SUP-08 | 4.method_criteria | verified true | assumed true | reliability_report.md §1.6 | "Methods and buyer acceptance criteria documented." Document itself not in packet |
| 102 | SUP-08 | 4.sample_size | verified true | assumed true | reliability_report.md §1.7 | "Documented statistical sample-size rationale." Rationale itself not in packet |
| 102 | SUP-08 | 5.lot_trace | verified true | assumed true | quality_manual.md §1.6 | "Lot traceability is present or demonstrated." No trace records in packet |
| 102 | SUP-08 | 5.nc_segregation | verified true | assumed true | quality_manual.md §1.7 | "Nonconforming material segregation is present or demonstrated." No procedure or records |
| 102 | SUP-08 | 8.flowdown | verified true | assumed true | subtier.md §1.2 | "Requirements passed to outside suppliers is present or demonstrated." No flowdown document or PO terms |
| 102 | SUP-08 | 9.second_source | verified true | assumed true | cover_letter.md §9.1 | Cover letter: "Qualified alternate manufacturer: Horizon Labs." No qualification record in packet |
| 103 | SUP-01 | 1.internal_audit | verified true | assumed true | quality_manual.md §1.1 | "Internal audit program is demonstrated (true)." No audit records provided. |
| 103 | SUP-01 | 1.capa | verified true | assumed true | quality_manual.md §1.2 | "Corrective-action program is demonstrated (true)." No procedure or records provided. |
| 103 | SUP-01 | 1.calibration | verified true | assumed true | quality_manual.md §9.1 | "Gauge calibration program is demonstrated (true)." No calibration records provided. |
| 103 | SUP-01 | 2.control_plan | verified true | assumed true | quality_manual.md §1.3 | "Production control plan is demonstrated (true)." Lists Base thickness, Port bore, Mounting-hole pitch. No plan document. |
| 103 | SUP-01 | 2.spc | verified true | assumed true | quality_manual.md §1.4 | "Statistical process monitoring is demonstrated (true)." No control charts or reaction plan provided. |
| 103 | SUP-01 | 3.inspection_method | verified true | assumed true | quality_manual.md §9.2 | "Drawing-specific CTQ measurement instructions and calibrated gauges." No CMM/AOI method named. |
| 103 | SUP-01 | 4.method_criteria | verified true | assumed true | reliability_report.md §1.7 | "Methods and buyer acceptance criteria documented." Document itself not in packet. |
| 103 | SUP-01 | 4.sample_size | verified true | assumed true | reliability_report.md §1.8 | "Documented statistical sample-size rationale." Rationale itself not in packet. |
| 103 | SUP-01 | 5.lot_trace | verified true | assumed true | quality_manual.md §9.3 | "Lot traceability is demonstrated (true)." No trace records provided. |
| 103 | SUP-01 | 5.nc_segregation | verified true | assumed true | quality_manual.md §9.5 | "Nonconforming material segregation is demonstrated (true)." No records provided. |
| 103 | SUP-01 | 8.flowdown | verified true | assumed true | subtier.md §1.2 | "Requirements passed to outside suppliers is demonstrated (true)." No flowdown document provided. |
| 103 | SUP-01 | 9.second_source | verified true | assumed true | cover_letter.md §9.1 | "Qualified alternate source is demonstrated (true). Qualified alternate manufacturer: Horizon Labs." No qualification record. |
| 104 | SUP-02 | 1.internal_audit | verified true | assumed true | quality_manual.md §1.1 | "Internal audit program is present or demonstrated (recorded result: true)"; no audit records in packet |
| 104 | SUP-02 | 1.capa | verified true | assumed true | quality_manual.md §1.2 | "Corrective-action program is present or demonstrated (recorded result: true)"; no CAPA records |
| 104 | SUP-02 | 1.calibration | verified true | assumed true | quality_manual.md §1.3 | "Gauge calibration program is present or demonstrated (recorded result: true)"; no calibration records |
| 104 | SUP-02 | 2.pfmea | verified true | assumed true | quality_manual.md §9.1 | "Manufacturing failure-mode analysis is present or demonstrated (recorded result: true)"; no PFMEA document |
| 104 | SUP-02 | 2.control_plan | verified true | assumed true | quality_manual.md §1.4 | Claim lists CTQs Seal bore, Engagement length, Latch groove width; no control plan document |
| 104 | SUP-02 | 2.spc | verified true | assumed true | quality_manual.md §1.5 | "Statistical process monitoring is present or demonstrated (recorded result: true)"; no charts or reaction plan |
| 104 | SUP-02 | 3.inspection_method | verified true | assumed true | quality_manual.md §1.6 | "Drawing-specific CTQ measurement instructions and calibrated gauges"; no record behind it |
| 104 | SUP-02 | 5.lot_trace | verified true | assumed true | quality_manual.md §9.2 | "Lot traceability is present or demonstrated (recorded result: true)"; no trace records |
| 104 | SUP-02 | 5.nc_segregation | verified true | assumed true | quality_manual.md §1.7 | "Nonconforming material segregation is present or demonstrated (recorded result: true)"; no records |
| 104 | SUP-02 | 8.flowdown | verified true | assumed true | subtier.md §1.1 | "Requirements passed to outside suppliers is present or demonstrated (recorded result: true)"; no flowdown document |
| 104 | SUP-03 | 2.pfmea | verified true | assumed true | quality_manual.md §1.2 | "Manufacturing failure-mode analysis is present (recorded result: true)." No PFMEA document for this part in packet |
| 104 | SUP-03 | 2.spc | verified true | assumed true | quality_manual.md §1.3 | "Statistical process monitoring is present (recorded result: true)." No charts or reaction plan in packet |
| 104 | SUP-03 | 5.lot_trace | verified true | assumed true | quality_manual.md §9.5 | "Lot traceability is present (recorded result: true)." No trace record to raw material in packet |
| 104 | SUP-03 | 8.flowdown | verified true | assumed true | subtier.md §9.2 | "Requirements passed to outside suppliers is present (recorded result: true)." No flowdown document in packet |
| 104 | SUP-03 | 9.second_source | verified true | assumed true | cover_letter.md §1.1 | "Qualified alternate source is present (recorded result: true)." Alternate named as Horizon Labs; no qualification record |
| 104 | SUP-04 | 1.internal_audit | verified true | assumed true | quality_manual.md §1.1 | Quality manual states "The recorded result is true" for the internal audit program; no audit report or record in packet |
| 104 | SUP-04 | 1.capa | verified true | assumed true | quality_manual.md §1.2 | Quality manual states "The recorded result is true" for the corrective-action program; no CAPA procedure or record in packet |
| 104 | SUP-04 | 1.calibration | verified true | assumed true | quality_manual.md §1.3 | Quality manual states "The recorded result is true" for gauge calibration; no calibration records in packet |
| 104 | SUP-04 | 2.pfmea | verified true | assumed true | quality_manual.md §9.1 | Quality manual states "The recorded result is true" for manufacturing failure-mode analysis; no PFMEA document in packet |
| 104 | SUP-04 | 2.control_plan | verified true | assumed true | quality_manual.md §9.2 | Manual claims a production control plan listing Board thickness, Mounting-hole pitch, Connector location; no control plan document in packet |
| 104 | SUP-04 | 2.spc | verified true | assumed true | quality_manual.md §1.4 | Quality manual states "The recorded result is true" for statistical process monitoring; no control charts or reaction plan in packet |
| 104 | SUP-04 | 3.inspection_method | verified true | assumed true | quality_manual.md §9.3 | Manual claims "Drawing-specific CTQ measurement instructions and calibrated gauges"; no method named (CMM, AOI, X-ray) and no instructions in packet |
| 104 | SUP-04 | 5.lot_trace | verified true | assumed true | quality_manual.md §1.5 | Quality manual states "The recorded result is true" for lot traceability; no trace records in packet |
| 104 | SUP-04 | 5.nc_segregation | verified true | assumed true | quality_manual.md §9.4 | Quality manual states "The recorded result is true" for nonconforming material segregation; no procedure or records in packet |
| 104 | SUP-04 | 8.flowdown | verified true | assumed true | subtier.md §1.2 | Subtier file states "The recorded result is true" for requirements passed to outside suppliers; no flowdown document in packet |
| 104 | SUP-05 | 1.internal_audit | verified true | assumed true | quality_manual.md §1.1 | Manual: "Internal audit program" recorded true; no audit records in packet |
| 104 | SUP-05 | 1.capa | verified true | assumed true | quality_manual.md §1.2 | Manual: "Corrective-action program" recorded true; no CAPA records in packet |
| 104 | SUP-05 | 1.calibration | verified true | assumed true | quality_manual.md §1.3 | Manual: "Gauge calibration program" recorded true; no calibration records in packet |
| 104 | SUP-05 | 2.pfmea | verified true | assumed true | quality_manual.md §1.4 | Manual: "Manufacturing failure-mode analysis" recorded true; no PFMEA document in packet |
| 104 | SUP-05 | 2.spc | verified true | assumed true | quality_manual.md §9.1 | Manual: "Statistical process monitoring" recorded true; no control charts or reaction plan in packet |
| 104 | SUP-05 | 3.inspection_method | verified true | assumed true | quality_manual.md §1.6 | Manual: "Drawing-specific CTQ measurement instructions and calibrated gauges"; no CMM or method named |
| 104 | SUP-05 | 5.lot_trace | verified true | assumed true | quality_manual.md §1.7 | Manual: "Lot traceability" recorded true; no trace records in packet |
| 104 | SUP-05 | 5.nc_segregation | verified true | assumed true | quality_manual.md §1.9 | Manual: "Nonconforming material segregation" recorded true; no records in packet |
| 104 | SUP-08 | 1.internal_audit | verified true | assumed true | quality_manual.md §1.1 | "The recorded result is true." Manual statement, no audit record in packet |
| 104 | SUP-08 | 1.capa | verified true | assumed true | quality_manual.md §1.2 | "The recorded result is true." Manual statement, no CAPA procedure or records in packet |
| 104 | SUP-08 | 1.calibration | verified true | assumed true | quality_manual.md §1.3 | "The recorded result is true." Manual statement, no calibration records in packet |
| 104 | SUP-08 | 2.pfmea | verified true | assumed true | quality_manual.md §1.4 | "The recorded result is true." Manual statement, no PFMEA document in packet |
| 104 | SUP-08 | 2.control_plan | verified true | assumed true | quality_manual.md §1.5 | Manual lists CTQs: Rail spacing, Mounting fastener torque, Manifold alignment; no control plan document in packet |
| 104 | SUP-08 | 2.spc | verified true | assumed true | quality_manual.md §9.1 | "The recorded result is true." Statistical process monitoring claimed; no charts or reaction plan in packet |
| 104 | SUP-08 | 3.inspection_method | verified true | assumed true | quality_manual.md §9.2 | "Drawing-specific CTQ measurement instructions and calibrated gauges." No method named, no record |
| 104 | SUP-08 | 5.lot_trace | verified true | assumed true | quality_manual.md §1.6 | "The recorded result is true." Manual statement, no trace records to raw material in packet |
| 104 | SUP-08 | 5.nc_segregation | verified true | assumed true | quality_manual.md §1.8 | "The recorded result is true." Manual statement, no segregation records in packet |
| 104 | SUP-08 | 8.flowdown | verified true | assumed true | subtier.md §1.2 | "The recorded result is true." Requirements passed to outside suppliers; no flowdown document or record |
| 93 | SUP-03 | 1.internal_audit | verified true | assumed true | quality_manual.md §9.1 | "Internal audit program is present or demonstrated (recorded result: true)"; no audit record in packet |
| 93 | SUP-03 | 1.capa | verified true | assumed true | quality_manual.md §9.2 | "Corrective-action program is present or demonstrated (recorded result: true)"; no CAPA record in packet |
| 93 | SUP-03 | 1.calibration | verified true | assumed true | quality_manual.md §1.1 | "Gauge calibration program is present or demonstrated (recorded result: true)"; no calibration records in packet |
| 93 | SUP-03 | 2.pfmea | verified true | assumed true | quality_manual.md §9.3 | "Manufacturing failure-mode analysis is present or demonstrated (recorded result: true)"; no PFMEA document in packet |
| 93 | SUP-03 | 2.control_plan | verified true | assumed true | quality_manual.md §1.2 | Claim: control plan covers Output voltage, Connector pitch, Mounting-hole pitch; no control plan document in packet |
| 93 | SUP-03 | 2.spc | verified true | assumed true | quality_manual.md §9.4 | "Statistical process monitoring is present or demonstrated (recorded result: true)"; no charts or reaction plan in packet |
| 93 | SUP-03 | 3.inspection_method | verified true | assumed true | quality_manual.md §9.5 | "Drawing-specific CTQ measurement instructions and calibrated gauges"; no specific method (CMM etc.) named, no records |
| 93 | SUP-03 | 5.lot_trace | verified true | assumed true | quality_manual.md §1.3 | "Lot traceability is present or demonstrated (recorded result: true)"; no trace record in packet |
| 93 | SUP-03 | 5.nc_segregation | verified true | assumed true | quality_manual.md §1.4 | "Nonconforming material segregation is present or demonstrated (recorded result: true)"; no record in packet |
| 93 | SUP-03 | 8.flowdown | verified true | assumed true | subtier.md §1.1 | "Requirements passed to outside suppliers is present or demonstrated (recorded result: true)"; no flowdown document |

### Decision disagreements (Sonnet, 6 of 36)

Decision and routing for the six candidates that disagree, from the engine (`evaluate`, Stark Reference v1) on the
committed extraction and from the answer key's `evaluation`:

| World | Supplier | Key decision / route | Agent-based decision / route | What differs |
|---|---|---|---|---|
| 102 | SUP-03 | NOT APPROVED / senior | NOT APPROVED / senior | Added reason "Second source unconfirmed" |
| 102 | SUP-08 | NOT APPROVED / senior | NOT APPROVED / senior | Added reason "Second source unconfirmed" |
| 103 | SUP-01 | NOT APPROVED / senior | NOT APPROVED / senior | Added reason "Second source unconfirmed" |
| 104 | SUP-02 | APPROVED / senior | CONDITIONAL / senior | Decision: total 74.9 (key 97.8); `5.lot_trace` knockout assumed |
| 104 | SUP-03 | NOT APPROVED / senior | NOT APPROVED / senior | Added reason "Second source unconfirmed" |
| 104 | SUP-04 | APPROVED / junior | CONDITIONAL / senior | Decision and route: total 77.2 (key 100) |

Each follows from that supplier's false alarms above. In 102 SUP-03, 102 SUP-08, 103 SUP-01 and 104 SUP-03 the agent
gave `9.second_source` as `assumed`, and the engine reports an unproven second source as "Second source unconfirmed"
(RUBRIC; ROADMAP 2026-11-09). In 104 SUP-02 and 104 SUP-04 the assumed items lower the total below the pass mark.

## 6. What a human reviewer still catches

Taken only from the rows above:

- **The miss** (101 SUP-07 `7.change_approval`): the agent marked a commitment sentence `verified`. A reviewer who
  reads the item's note sees "wording does not name process/site/sub-tier" and downgrades it to a claim.
- **The partial** (101 SUP-01 `1.calibration`): a passing mention of "calibrated gauges" is not a calibration
  program. The gap is flagged either way; the reviewer corrects it from "claimed" (`assumed`) to "not disclosed"
  (`missing`).
- **The 118 false alarms** are conservative flags: the agent asked for proof the key did not require. The reviewer
  clears each against the cited section. The cost is review time, not a missed gap.
- **The 6 decision disagreements** are decision or routing shifts a reviewer must recheck, most of all 104 SUP-04
  (key APPROVED for junior sign-off, agent-based CONDITIONAL for senior).

The agent never scores or decides (PRD-00 NG3). Every score, decision and route in this document comes from the
engine.

## 7. Run metadata

| Field | Sonnet run | Opus run |
|---|---|---|
| Model ID | `claude-sonnet-5-5` | `claude-opus-5-5` |
| run_id | `2026-11-14-sonnet` | `2026-11-14-opus` |
| Run date (leading date of run_id) | 2026-11-14 | 2026-11-14 |
| Skill git SHA (`agent/SKILL.md`) | `af74a03` | `af74a03` |
| test_head | `4c6c111e1061a7cd2376108120e57d0f1825e63e` | `4c6c111e1061a7cd2376108120e57d0f1825e63e` |
| Claude Code | 2.1.325 (every log's init line) | 2.1.325 (every log's init line) |
| Worlds | 93 (demo), 101, 102, 103, 104 | 101, 102, 103, 104 |
| Packets | 45 | 36 |
| Validation | 45/45 ok | 36/36 ok |
| Path audit | 45/45 pass | 36/36 pass |
| Machine | Another person's Claude account on a separate Linux laptop (decision 200; the OS is as reported by Sid, the logs don't record it) | Same |
| Answer-key hashes | Every world's `answer_key.json` matched its `answer_key.sha256`; none refused | Same |

Evidence: `agent/runs/2026-11-14-sonnet/` and `agent/runs/2026-11-14-opus/` (extraction, run log, files read, input
hashes and validator result per packet, plus `run.conf`).

## 8. Interrupted attempts (decision 202)

The Opus run had two sessions cut off by the account's usage limit (log result `usage_limit_reached`). Both logs are
kept in `agent/runs/2026-11-14-opus/interrupted/`:

| Attempt | Kept files | What happened |
|---|---|---|
| `103-SUP-03-20261114-130632-failed` | `run.jsonl`, `stderr.txt` (empty), `extraction.json` | Cut off after 15 turns; it had written an `extraction.json`, which was never validated or scored |
| `103-SUP-04-20261114-130615-failed` | `run.jsonl`, `stderr.txt` (empty) | Cut off on its first turn; no extraction |

Both packets ran again when the runner resumed and finished. The scored extractions (`103/SUP-03.json`,
`103/SUP-04.json`) are the re-runs'. The Sonnet run had no interrupted attempts (no `interrupted/` folder).

## 9. Reproduce

```
node --test
node agent/eval.mjs --run 2026-11-14-sonnet --demo 93
node agent/eval.mjs --run 2026-11-14-opus
node agent/eval.mjs --run 2026-11-14-sonnet --demo 93 --json
node agent/eval.mjs --run 2026-11-14-opus --json
```

`data/eval.json` is this command's output, committed unedited:

```
node -e "const {execFileSync:x}=require('node:child_process');const r=(a)=>JSON.parse(x('node',['agent/eval.mjs',...a,'--json'],{encoding:'utf8'}));process.stdout.write(JSON.stringify({runs:[r(['--run','2026-11-14-sonnet','--demo','93']),r(['--run','2026-11-14-opus'])]},null,2)+'\n')" > data/eval.json
```

`agent/eval-results.test.mjs` re-runs both evals and checks that `data/eval.json` and the numbers in this document
match them.

`eval.mjs` refuses any world whose `answer_key.json` differs from its committed `answer_key.sha256`, exit 1
(AGENT-FR-11, AGENT-AC-06). The blind protocol is in [`BLIND-RUN.md`](BLIND-RUN.md) and PRD-04 §5; the outcome
definitions are PRD-04 §5 "Eval definitions". The skill is frozen at `af74a03`; these numbers hold for that SHA only.

## 10. Limits

- One run per model. No repeat runs, so run-to-run variation is not measured.
- Synthetic data: simulated suppliers and packets, not real supplier documents.
- The answer keys were written by the same project that wrote the skill, though locked by hash before the run.
- No hold-out traps were set, so there is no check against traps nobody planned for.

## Changelog

| Date | Change |
|---|---|
| 2026-11-14 | First version: runs `2026-11-14-sonnet` and `2026-11-14-opus` (issue 36). |
