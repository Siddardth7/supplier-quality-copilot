Prepare the supplier packet for Hammer Industries (SUP-03), addressed to Stark Industries Supplier Quality.
Use thorough, organized prose. This voice never changes the listed facts, exact claims, or omissions.
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
Recorded result: 2027-06-07.
certificate: REG-SUP-03-QMS.
registrar: REG-001.

File certificates.md, section 9.2: Quality-system registration type and manufacturing scope
Recorded result: true.
certificate: REG-SUP-03-QMS.
type: ISO 9001.

File quality_manual.md, section 9.1: Internal audit program
Recorded result: true.

File quality_manual.md, section 9.2: Corrective-action program
Recorded result: true.

File quality_manual.md, section 1.1: Gauge calibration program
Recorded result: true.

File quality_manual.md, section 9.3: Manufacturing failure-mode analysis
Recorded result: true.

File quality_manual.md, section 1.2: Production control plan
Recorded result: true.
ctqs: Output voltage, Connector pitch, Mounting-hole pitch.

File capability_study.md, section 9.1: Process capability
Recorded result: 0.6273095999190162.
Output voltage: 50 observations; mean: 47.992169378005535 V. sample standard deviation: 0.2569372333153464 V. lower drawing limit: 47.5 V. upper drawing limit: 48.5 V. Cpk: 0.6385079235823604.
Connector pitch: 50 observations; mean: 11.986159004306357 mm. sample standard deviation: 0.045372006251435094 mm. lower drawing limit: 11.9 mm. upper drawing limit: 12.1 mm. Cpk: 0.6329821066973523.
Mounting-hole pitch: 50 observations; mean: 99.98613283304775 mm. sample standard deviation: 0.045768380322816396 mm. lower drawing limit: 99.9 mm. upper drawing limit: 100.1 mm. Cpk: 0.6273095999190162.

File quality_manual.md, section 9.4: Statistical process monitoring
Recorded result: true.

File msa.md, section 9.1: Measurement-system repeatability and reproducibility
Recorded result: 35.10076012226965.
Output voltage: crossed study, 10 parts, 3 appraisers, 3 repeats; average-and-range method. GRR percent of drawing tolerance: 35.10076012226965 %. lower drawing limit: 47.5 V. upper drawing limit: 48.5 V.
Connector pitch: crossed study, 10 parts, 3 appraisers, 3 repeats; average-and-range method. GRR percent of drawing tolerance: 16.59462533022402 %. lower drawing limit: 11.9 mm. upper drawing limit: 12.1 mm.
Mounting-hole pitch: crossed study, 10 parts, 3 appraisers, 3 repeats; average-and-range method. GRR percent of drawing tolerance: 22.03476756875123 %. lower drawing limit: 99.9 mm. upper drawing limit: 100.1 mm.

File quality_manual.md, section 9.5: Inspection methods
Recorded result: true.
method: Drawing-specific CTQ measurement instructions and calibrated gauges.

File reliability_report.md, section 9.1: Burn-in
Recorded result: true.
Burn-in duration (setup): Observed: 48 h.
Ambient temperature (setup): Observed: 55 °C.
Rated-load fraction (setup): Observed: 1 fraction.
Burn-in fallout (acceptance): Observed: 0.008626694703713873 fraction. Result: meets buyer limit.

File reliability_report.md, section 9.2: Thermal cycling / HTOL
Recorded result: true.
Completed thermal cycles (acceptance): Observed: 573 cycles. Result: meets buyer limit.
Lower temperature (setup): Observed: -20 °C.
Upper temperature (setup): Observed: 85 °C.
Dwell at each extreme (setup): Observed: 15 min.
Functional failures (acceptance): Observed: 0 count. Result: meets buyer limit.

File reliability_report.md, section 9.3: Efficiency vs load
Recorded result: true.
Efficiency at low load point (acceptance): Observed: 1 fraction. Result: meets buyer limit.
Low load point / rated load (setup): Observed: 0.2 fraction.
Efficiency at middle load point (acceptance): Observed: 1 fraction. Result: meets buyer limit.
Middle load point / rated load (setup): Observed: 0.5 fraction.
Efficiency at full load point (acceptance): Observed: 1 fraction. Result: meets buyer limit.
Full load point / rated load (setup): Observed: 1 fraction.
Input voltage (setup): Observed: 400 V DC.
Output voltage (setup): Observed: 48 V DC.

File reliability_report.md, section 9.4: HALT
Recorded result: true.
Operating-limit margins reported (acceptance): Observed: true boolean. Context: Report cold, hot and vibration margins relative to the declared product operating envelope.. Result: meets buyer limit.
Destruct-limit margins reported (acceptance): Observed: true boolean. Context: Report cold, hot and vibration margins relative to the declared product operating envelope.. Result: meets buyer limit.

File reliability_report.md, section 9.5: Component derating
Recorded result: true.
Derating analysis present (acceptance): Observed: true boolean. Context: Stark heuristic policy for all components at worst-case declared load and ambient.. Result: meets buyer limit.
Component applied / rated voltage (acceptance): Observed: 0.6923604484032424 ratio. Result: meets buyer limit.
Component applied / rated current (acceptance): Observed: 0.644357105480225 ratio. Result: meets buyer limit.

File reliability_report.md, section 9.6: Test instructions and release limits
Recorded result: true.
document: Methods and buyer acceptance criteria documented.

File reliability_report.md, section 9.7: Statistical sample-size rationale
Recorded result: true.
document: Documented statistical sample-size rationale.

File quality_manual.md, section 1.3: Lot traceability
Recorded result: true.

File quality_manual.md, section 9.6: Record retention in years
Recorded result: 11.
unit: years.

File quality_manual.md, section 1.4: Nonconforming material segregation
Recorded result: true.

File capacity.md, section 1.1: Demonstrated output divided by peak weekly demand
Recorded result: 1.332375.
peak weekly demand: 1000.
mean: 1332.375.
unit: parts/week.
outputs: 1332, 1248, 1430, 1378, 1344, 1350, 1255, 1322.

File capacity.md, section 9.1: Delivery within the requested lead time
Recorded result: true.
quoted weeks: 9.
need by weeks: 12.
unit: weeks.

File capacity.md, section 9.2: Production ramp plan
Recorded result: true.
Milestone date: 2026-11-01. Added weekly output: 200 parts/week.

File pcn_policy.md, section 1.1: Advance change notice in days
Recorded result: 96.
unit: days.

File pcn_policy.md, section 1.2: Customer change authorization
Recorded result: true.

File subtier.md, section 9.1: Named critical outside suppliers
Recorded result: true.
suppliers: Wakanda Design Group.

File subtier.md, section 1.1: Requirements passed to outside suppliers
Recorded result: true.

File subtier.md, section 9.2: Outside supplier registrations
Recorded result: true.
certificates: REG-SUB-001.

File cover_letter.md, section 1.1: Qualified alternate source
Recorded result: true.
Qualified alternate manufacturer: Horizon Labs.

File cover_letter.md, section 9.1: Regional continuity exposure
Recorded result: low.
unit: category.

File cover_letter.md, section 1.2: Financial condition
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
| Commodity | power_module |
| Part number | SI-PM-0003 |
| Part name | Rack power conversion module |
| Revision | A |
| Drawing number | SI-DWG-PM-0003 |

## 2 Critical-to-quality characteristics

Both tolerance endpoints are inclusive. These are two-sided drawing tolerances.

| CTQ | Nominal | Lower limit | Upper limit | Unit | Basis |
|---|---|---|---|---|---|
| Output voltage | 48 | 47.5 | 48.5 | V | heuristic |
| Connector pitch | 12 | 11.9 | 12.1 | mm | heuristic |
| Mounting-hole pitch | 100 | 99.9 | 100.1 | mm | heuristic |

## 3 Test acceptance conditions

Setup conditions define how the test is run. All acceptance conditions listed for a test must be satisfied. Heuristic limits are proposed synthetic buyer values subject to review; they are not published standard limits.

### 3.1 Burn-in

Required.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| Burn-in duration | setup | ≥ 48 | h | heuristic | — |
| Ambient temperature | setup | = 55 | °C | heuristic | — |
| Rated-load fraction | setup | = 1 | fraction | heuristic | — |
| Burn-in fallout | acceptance | ≤ 0.01 | fraction | heuristic | — |

### 3.2 Thermal cycling / HTOL

Required.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| Completed thermal cycles | acceptance | ≥ 500 | cycles | heuristic | — |
| Lower temperature | setup | = -20 | °C | heuristic | — |
| Upper temperature | setup | = 85 | °C | heuristic | — |
| Dwell at each extreme | setup | ≥ 15 | min | heuristic | — |
| Functional failures | acceptance | = 0 | count | heuristic | — |

### 3.3 Efficiency vs load

Required.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| Efficiency at low load point | acceptance | ≥ 0.9 | fraction | heuristic | — |
| Low load point / rated load | setup | = 0.2 | fraction | heuristic | — |
| Efficiency at middle load point | acceptance | ≥ 0.94 | fraction | heuristic | — |
| Middle load point / rated load | setup | = 0.5 | fraction | heuristic | — |
| Efficiency at full load point | acceptance | ≥ 0.94 | fraction | heuristic | — |
| Full load point / rated load | setup | = 1 | fraction | heuristic | — |
| Input voltage | setup | = 400 | V DC | heuristic | — |
| Output voltage | setup | = 48 | V DC | heuristic | — |

### 3.4 HALT

Nice to have.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| Operating-limit margins reported | acceptance | = true | boolean | heuristic | Report cold, hot and vibration margins relative to the declared product operating envelope. |
| Destruct-limit margins reported | acceptance | = true | boolean | heuristic | Report cold, hot and vibration margins relative to the declared product operating envelope. |

### 3.5 Component derating

Nice to have.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| Derating analysis present | acceptance | = true | boolean | heuristic | Stark heuristic policy for all components at worst-case declared load and ambient. |
| Component applied / rated voltage | acceptance | ≤ 0.8 | ratio | heuristic | — |
| Component applied / rated current | acceptance | ≤ 0.8 | ratio | heuristic | — |

## 4 Demand and need-by

| Planning input | Value | Unit | Basis |
|---|---|---|---|
| Peak weekly demand | 1000 | parts/week | heuristic |
| Need-by lead time | 12 | weeks | heuristic |

--- END RFQ ---

Document corrections for this attempt:
- All supplier-authored files: Restore exactly the listed files, synthetic first lines and assigned numbered sections; remove extra files or sections.
