Prepare the supplier packet for Oscorp (SUP-07), addressed to Stark Industries Supplier Quality.
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

File certificates.md, section 1.1: Quality-system registration expiry
Repeat this statement exactly, without supplying supporting records: Our quality-system registration remains current.

File certificates.md, section 1.2: Quality-system registration type and manufacturing scope
Recorded result: true.
certificate: REG-SUP-07-QMS.
type: ISO 9001.

File quality_manual.md, section 1.1: Internal audit program
Recorded result: true.

File quality_manual.md, section 1.2: Corrective-action program
Recorded result: true.

File quality_manual.md, section 1.3: Gauge calibration program
Recorded result: true.

File quality_manual.md, section 1.4: Manufacturing failure-mode analysis
Recorded result: true.

File quality_manual.md, section 1.5: Production control plan
Recorded result: true.
ctqs: Base thickness, Port bore, Mounting-hole pitch.

File capability_study.md, section 1.1: Process capability
Recorded result: 1.1300542478927795.
Base thickness: 50 observations; mean: 3.0059145561714176 mm. sample standard deviation: 0.024155386849222887 mm. lower drawing limit: 2.9 mm. upper drawing limit: 3.1 mm. Cpk: 1.2983362595385826.
Port bore: 50 observations; mean: 8.004576036761874 mm. sample standard deviation: 0.013398755951415438 mm. lower drawing limit: 7.95 mm. upper drawing limit: 8.05 mm. Cpk: 1.1300542478927795.
Mounting-hole pitch: 50 observations; mean: 80.00517311883931 mm. sample standard deviation: 0.02440244158229778 mm. lower drawing limit: 79.9 mm. upper drawing limit: 80.1 mm. Cpk: 1.2953195802269672.

File quality_manual.md, section 9.1: Statistical process monitoring
Recorded result: true.

File msa.md, section 1.1: Measurement-system repeatability and reproducibility
Recorded result: 5.986288570693152.
Base thickness: crossed study, 10 parts, 3 appraisers, 3 repeats; average-and-range method. GRR percent of drawing tolerance: 5.918492931137833 %. lower drawing limit: 2.9 mm. upper drawing limit: 3.1 mm.
Port bore: crossed study, 10 parts, 3 appraisers, 3 repeats; average-and-range method. GRR percent of drawing tolerance: 5.986288570693152 %. lower drawing limit: 7.95 mm. upper drawing limit: 8.05 mm.
Mounting-hole pitch: crossed study, 10 parts, 3 appraisers, 3 repeats; average-and-range method. GRR percent of drawing tolerance: 4.803333661552956 %. lower drawing limit: 79.9 mm. upper drawing limit: 80.1 mm.

File quality_manual.md, section 1.6: Inspection methods
Recorded result: true.
method: Drawing-specific CTQ measurement instructions and calibrated gauges.

File reliability_report.md, section 9.1: Leak test
Recorded result: true.
Helium leak rate (acceptance): Observed: 6.913395559483644e-7 mbar·L/s. Result: meets buyer limit.
Helium differential pressure (setup): Observed: 6 bar.
Test temperature (setup): Observed: 20 °C.

File reliability_report.md, section 1.1: Burst / proof pressure
Recorded result: true.
Maximum operating pressure (setup): Observed: 6 bar.
Proof / maximum operating pressure (acceptance): Observed: 3.8444299461893965 ratio. Context: Sustained proof pressure divided by the setup maximum operating pressure, throughout the proof hold.. Result: meets buyer limit.
Proof hold time (setup): Observed: 60 s.
Rupture during proof hold (acceptance): Observed: false boolean. Result: meets buyer limit.

File reliability_report.md, section 1.2: Internal cleanliness
Recorded result: true.
Particles at least 100 µm (acceptance): Observed: 64 particles/part. Context: Total extracted from each complete internal wetted circuit; includes larger particles.. Result: meets buyer limit.
Particles at least 500 µm (acceptance): Observed: 0 particles/part. Context: Total extracted from each complete internal wetted circuit.. Result: meets buyer limit.

File reliability_report.md, section 1.3: Material certificate
Recorded result: true.
Drawing material (setup): Observed: SI-MAT-AL-01 designation. Context: Fictional drawing designation for aluminum alloy..
Certificate traceable to material lot (acceptance): Observed: true boolean. Result: meets buyer limit.
Certificate matches drawing material (acceptance): Observed: true boolean. Result: meets buyer limit.

File reliability_report.md, section 1.4: Thermal cycling / HTOL
Recorded result: true.
Completed thermal cycles (acceptance): Observed: 627 cycles. Result: meets buyer limit.
Lower temperature (setup): Observed: -20 °C.
Upper temperature (setup): Observed: 80 °C.
Dwell at each extreme (setup): Observed: 15 min.
Failures (acceptance): Observed: 0 count. Result: meets buyer limit.
Post-cycle helium leak rate (acceptance): Observed: 7.086875388290226e-7 mbar·L/s. Result: meets buyer limit.
Post-cycle helium differential pressure (setup): Observed: 6 bar.

File reliability_report.md, section 9.2: Coolant compatibility
Recorded result: true.
System coolant (setup): Observed: SI-COOL-01 designation. Context: Fictional propylene-glycol/water mixture..
Propylene glycol concentration by volume (setup): Observed: 30 %.
Exposure duration (setup): Observed: 1000 h.
Exposure temperature (setup): Observed: 80 °C.
Absolute mass change (acceptance): Observed: 0.6942809009143014 %. Result: meets buyer limit.
All wetted materials assessed (acceptance): Observed: true boolean. Result: meets buyer limit.
Visible corrosion (acceptance): Observed: false boolean. Result: meets buyer limit.

File reliability_report.md, section 1.5: Test instructions and release limits
Recorded result: true.
document: Methods and buyer acceptance criteria documented.

File reliability_report.md, section 1.6: Statistical sample-size rationale
Recorded result: true.
document: Documented statistical sample-size rationale.

File quality_manual.md, section 1.7: Lot traceability
Recorded result: true.

File quality_manual.md, section 1.8: Record retention in years
Recorded result: 12.
unit: years.

File quality_manual.md, section 9.2: Nonconforming material segregation
Recorded result: true.

File capacity.md, section 9.1: Demonstrated output divided by peak weekly demand
Recorded result: 0.8485.
peak weekly demand: 2000.
mean: 1697.
unit: parts/week.
outputs: 1713, 1688, 1641, 1698, 1748, 1690, 1657, 1741.

File capacity.md, section 9.2: Delivery within the requested lead time
Recorded result: false.
quoted weeks: 16.
need by weeks: 12.
unit: weeks.

File capacity.md, section 1.1: Production ramp plan
Recorded result: true.
Milestone date: 2026-11-01. Added weekly output: 400 parts/week.

File pcn_policy.md, section 1.1: Advance change notice in days
Recorded result: 115.
unit: days.

File pcn_policy.md, section 1.2: Customer change authorization
Repeat this statement exactly, without supplying supporting records: We obtain customer authorization before changing manufacturing arrangements.

File subtier.md, section 1.1: Named critical outside suppliers
Recorded result: true.
suppliers: Wakanda Design Group.

File subtier.md, section 1.2: Requirements passed to outside suppliers
Recorded result: true.

File subtier.md, section 1.3: Outside supplier registrations
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
- All supplier-authored files: Restore exactly the listed files, synthetic first lines and assigned numbered sections; remove extra files or sections.
