Prepare the supplier packet for Frost Technotics (SUP-01), addressed to Stark Industries Supplier Quality.
Use ordinary business prose. This voice never changes the listed facts, exact claims, or omissions.
Use only the supplied information. Do not invent measurements, dates, registrations, proof, or successful outcomes.
Write exactly these Markdown files:
- capability_study.md
- capacity.md
- certificates.md
- cover_letter.md
- msa.md
- pcn_policy.md
- quality_manual.md
- reliability_report.md
- rfq.md
- subtier.md

Every listed file begins with this exact first line:
> Synthetic document for a demo. Fictional supplier.

The cover letter introduces the supplier and part, then includes only the evidence sections assigned to cover_letter.md below. Do not copy evidence assigned to other files. Keep buyer requirements distinct from supplier evidence.
Use each assigned numbered Markdown heading exactly once in its assigned file, with no extra numbered headings. Introductory headings must be unnumbered. Locations beginning with 9 remain numeric appendix headings.
Preserve every number exactly. Boolean true means present or demonstrated; false means absent or not demonstrated, and must be stated plainly.

File certificates.md, section 9.1: Quality-system registration expiry
Recorded result: 2028-06-07.
certificate: REG-SUP-01-QMS.
registrar: REG-001.

File certificates.md, section 1.1: Quality-system registration type and manufacturing scope
Recorded result: true.
certificate: REG-SUP-01-QMS.
type: ISO 9001.

File quality_manual.md, section 1.1: Internal audit program
Recorded result: true.

File quality_manual.md, section 1.2: Corrective-action program
Recorded result: true.

File quality_manual.md, section 9.1: Gauge calibration program
Recorded result: true.

File quality_manual.md, section 9.2: Production control plan
Recorded result: true.
ctqs: Base thickness, Port bore, Mounting-hole pitch.

File capability_study.md, section 1.1: Process capability
Recorded result: 1.6599963879994164.
Base thickness: 50 observations; mean: 3.0044977109778674 mm. sample standard deviation: 0.017754114683395713 mm. lower drawing limit: 2.9 mm. upper drawing limit: 3.1 mm. Cpk: 1.79305456275346.
Port bore: 50 observations; mean: 7.999083547682866 mm. sample standard deviation: 0.008234696719466047 mm. lower drawing limit: 7.95 mm. upper drawing limit: 8.05 mm. Cpk: 1.9868591544214307.
Mounting-hole pitch: 50 observations; mean: 79.99177923558824 mm. sample standard deviation: 0.01842960548021513 mm. lower drawing limit: 79.9 mm. upper drawing limit: 80.1 mm. Cpk: 1.6599963879994164.

File quality_manual.md, section 9.3: Statistical process monitoring
Recorded result: true.

File msa.md, section 1.1: Measurement-system repeatability and reproducibility
Recorded result: 7.735012813750115.
Base thickness: crossed study, 10 parts, 3 appraisers, 3 repeats; average-and-range method. GRR percent of drawing tolerance: 4.662340129674634 %. lower drawing limit: 2.9 mm. upper drawing limit: 3.1 mm.
Port bore: crossed study, 10 parts, 3 appraisers, 3 repeats; average-and-range method. GRR percent of drawing tolerance: 7.735012813750115 %. lower drawing limit: 7.95 mm. upper drawing limit: 8.05 mm.
Mounting-hole pitch: crossed study, 10 parts, 3 appraisers, 3 repeats; average-and-range method. GRR percent of drawing tolerance: 3.978780661009254 %. lower drawing limit: 79.9 mm. upper drawing limit: 80.1 mm.

File quality_manual.md, section 1.3: Inspection methods
Recorded result: true.
method: Drawing-specific CTQ measurement instructions and calibrated gauges.

File reliability_report.md, section 9.1: Leak test
Recorded result: true.
Helium leak rate (acceptance): Observed: 8.981351555712888e-7 mbar·L/s. Result: meets buyer limit.
Helium differential pressure (setup): Observed: 6 bar.
Test temperature (setup): Observed: 20 °C.

File reliability_report.md, section 1.1: Internal cleanliness
Recorded result: true.
Particles at least 100 µm (acceptance): Observed: 92 particles/part. Context: Total extracted from each complete internal wetted circuit; includes larger particles.. Result: meets buyer limit.
Particles at least 500 µm (acceptance): Observed: 0 particles/part. Context: Total extracted from each complete internal wetted circuit.. Result: meets buyer limit.

File reliability_report.md, section 1.2: Material certificate
Recorded result: true.
Drawing material (setup): Observed: SI-MAT-AL-01 designation. Context: Fictional drawing designation for aluminum alloy..
Certificate traceable to material lot (acceptance): Observed: true boolean. Result: meets buyer limit.
Certificate matches drawing material (acceptance): Observed: true boolean. Result: meets buyer limit.

File reliability_report.md, section 1.3: Thermal cycling / HTOL
Recorded result: true.
Completed thermal cycles (acceptance): Observed: 574 cycles. Result: meets buyer limit.
Lower temperature (setup): Observed: -20 °C.
Upper temperature (setup): Observed: 80 °C.
Dwell at each extreme (setup): Observed: 15 min.
Failures (acceptance): Observed: 0 count. Result: meets buyer limit.
Post-cycle helium leak rate (acceptance): Observed: 8.949923724124037e-7 mbar·L/s. Result: meets buyer limit.
Post-cycle helium differential pressure (setup): Observed: 6 bar.

File reliability_report.md, section 1.4: Coolant compatibility
Recorded result: true.
System coolant (setup): Observed: SI-COOL-01 designation. Context: Fictional propylene-glycol/water mixture..
Propylene glycol concentration by volume (setup): Observed: 30 %.
Exposure duration (setup): Observed: 1000 h.
Exposure temperature (setup): Observed: 80 °C.
Absolute mass change (acceptance): Observed: 0.8789682922765518 %. Result: meets buyer limit.
All wetted materials assessed (acceptance): Observed: true boolean. Result: meets buyer limit.
Visible corrosion (acceptance): Observed: false boolean. Result: meets buyer limit.

File reliability_report.md, section 1.5: Test instructions and release limits
Recorded result: true.
document: Methods and buyer acceptance criteria documented.

File reliability_report.md, section 9.2: Statistical sample-size rationale
Recorded result: true.
document: Documented statistical sample-size rationale.

File quality_manual.md, section 1.4: Lot traceability
Recorded result: true.

File quality_manual.md, section 1.5: Record retention in years
Recorded result: 13.
unit: years.

File quality_manual.md, section 1.6: Nonconforming material segregation
Recorded result: true.

File capacity.md, section 1.1: Demonstrated output divided by peak weekly demand
Recorded result: 1.3705.
peak weekly demand: 2000.
mean: 2741.
unit: parts/week.
outputs: 2699, 2771, 2815, 2706, 2772, 2609, 2725, 2831.

File capacity.md, section 9.1: Production ramp plan
Recorded result: true.
Milestone date: 2026-11-01. Added weekly output: 400 parts/week.

File pcn_policy.md, section 9.1: Advance change notice in days
Recorded result: 98.
unit: days.

File pcn_policy.md, section 9.2: Customer change authorization
Recorded result: true.

File subtier.md, section 9.1: Named critical outside suppliers
Recorded result: true.
suppliers: Wakanda Design Group.

File subtier.md, section 9.2: Outside supplier registrations
Recorded result: true.
certificates: REG-SUB-001.

File cover_letter.md, section 1.1: Qualified alternate source
Recorded result: true.
Qualified alternate manufacturer: Horizon Labs.

File cover_letter.md, section 1.2: Regional continuity exposure
Recorded result: low.
unit: category.

File cover_letter.md, section 1.3: Financial condition
Recorded result: healthy.
unit: category.

Omit the following topics throughout supplier-authored documents. Do not state their presence, absence, results, or supporting evidence:
- Manufacturing failure-mode analysis
- Burst / proof pressure
- Delivery within the requested lead time
- Requirements passed to outside suppliers

Write rfq.md as the following exact buyer-authored text. End it with exactly one newline after the last table row, with no extra blank line. This is buyer context only, never supplier proof.
--- BEGIN RFQ ---
> Synthetic document for a demo. Fictional supplier.

# Stark Industries — Supplier Quality. Synthetic document for a demo.

## 1 Part and drawing

| Field | Value |
|---|---|
| Commodity | cold_plate |
| Part number | SI-CP-0007 |
| Part name | NPI liquid-cooling cold plate |
| Revision | A |
| Drawing number | SI-DWG-CP-0007 |

## 2 Critical-to-quality characteristics

Both tolerance endpoints are inclusive. These are two-sided drawing tolerances.

| CTQ | Nominal | Lower limit | Upper limit | Unit | Basis |
|---|---|---|---|---|---|
| Base thickness | 3 | 2.9 | 3.1 | mm | heuristic |
| Port bore | 8 | 7.95 | 8.05 | mm | heuristic |
| Mounting-hole pitch | 80 | 79.9 | 80.1 | mm | heuristic |

## 3 Test acceptance conditions

Setup conditions define how the test is run. All acceptance conditions listed for a test must be satisfied. Heuristic limits are proposed synthetic buyer values subject to review; they are not published standard limits.

### 3.1 Leak test

Required.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| Helium leak rate | acceptance | ≤ 0.000001 | mbar·L/s | heuristic | — |
| Helium differential pressure | setup | = 6 | bar | heuristic | — |
| Test temperature | setup | = 20 | °C | heuristic | — |

### 3.2 Burst / proof pressure

Required.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| Maximum operating pressure | setup | = 6 | bar | heuristic | — |
| Proof / maximum operating pressure | acceptance | ≥ 3 | ratio | heuristic | Sustained proof pressure divided by the setup maximum operating pressure, throughout the proof hold. |
| Proof hold time | setup | ≥ 60 | s | heuristic | — |
| Rupture during proof hold | acceptance | = false | boolean | heuristic | — |

### 3.3 Internal cleanliness

Required.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| Particles at least 100 µm | acceptance | ≤ 100 | particles/part | heuristic | Total extracted from each complete internal wetted circuit; includes larger particles. |
| Particles at least 500 µm | acceptance | = 0 | particles/part | heuristic | Total extracted from each complete internal wetted circuit. |

### 3.4 Material certificate

Required.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| Drawing material | setup | = SI-MAT-AL-01 | designation | heuristic | Fictional drawing designation for aluminum alloy. |
| Certificate traceable to material lot | acceptance | = true | boolean | heuristic | — |
| Certificate matches drawing material | acceptance | = true | boolean | heuristic | — |

### 3.5 Thermal cycling / HTOL

Nice to have.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| Completed thermal cycles | acceptance | ≥ 500 | cycles | heuristic | — |
| Lower temperature | setup | = -20 | °C | heuristic | — |
| Upper temperature | setup | = 80 | °C | heuristic | — |
| Dwell at each extreme | setup | ≥ 15 | min | heuristic | — |
| Failures | acceptance | = 0 | count | heuristic | — |
| Post-cycle helium leak rate | acceptance | ≤ 0.000001 | mbar·L/s | heuristic | — |
| Post-cycle helium differential pressure | setup | = 6 | bar | heuristic | — |

### 3.6 Coolant compatibility

Nice to have.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| System coolant | setup | = SI-COOL-01 | designation | heuristic | Fictional propylene-glycol/water mixture. |
| Propylene glycol concentration by volume | setup | = 30 | % | heuristic | — |
| Exposure duration | setup | ≥ 1000 | h | heuristic | — |
| Exposure temperature | setup | = 80 | °C | heuristic | — |
| Absolute mass change | acceptance | ≤ 1 | % | heuristic | — |
| All wetted materials assessed | acceptance | = true | boolean | heuristic | — |
| Visible corrosion | acceptance | = false | boolean | heuristic | — |

## 4 Demand and need-by

| Planning input | Value | Unit | Basis |
|---|---|---|---|
| Peak weekly demand | 2000 | parts/week | heuristic |
| Need-by lead time | 12 | weeks | heuristic |

--- END RFQ ---

Document corrections for this attempt:
- certificates.md §1.1: Restore the exact supplied recorded result here without rounding or changing it.
- quality_manual.md §1.1: Restore the exact supplied recorded result here without rounding or changing it.
- quality_manual.md §1.2: Restore the exact supplied recorded result here without rounding or changing it.
- quality_manual.md §9.1: Restore the exact supplied recorded result here without rounding or changing it.
- quality_manual.md §9.2: Restore the exact supplied recorded result here without rounding or changing it.
- quality_manual.md §9.3: Restore the exact supplied recorded result here without rounding or changing it.
- quality_manual.md §1.3: Restore the exact supplied recorded result here without rounding or changing it.
- reliability_report.md §9.1: Restore the exact supplied recorded result here without rounding or changing it.
- reliability_report.md §1.1: Restore the exact supplied recorded result here without rounding or changing it.
- reliability_report.md §1.3: Restore the exact supplied recorded result here without rounding or changing it.
- reliability_report.md §1.5: Restore the exact supplied recorded result here without rounding or changing it.
- reliability_report.md §9.2: Restore the exact supplied recorded result here without rounding or changing it.
- quality_manual.md §1.4: Restore the exact supplied recorded result here without rounding or changing it.
- quality_manual.md §1.6: Restore the exact supplied recorded result here without rounding or changing it.
- capacity.md §9.1: Restore the exact supplied recorded result here without rounding or changing it.
- pcn_policy.md §9.2: Restore the exact supplied recorded result here without rounding or changing it.
- subtier.md §9.1: Restore the exact supplied recorded result here without rounding or changing it.
- subtier.md §9.2: Restore the exact supplied recorded result here without rounding or changing it.
- cover_letter.md §1.1: Restore the exact supplied recorded result here without rounding or changing it.
