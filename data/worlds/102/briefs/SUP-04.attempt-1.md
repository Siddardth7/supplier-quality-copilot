Prepare the supplier packet for Pym Technologies (SUP-04), addressed to Stark Industries Supplier Quality.
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

File certificates.md, section 1.1: Quality-system registration expiry
Recorded result: 2027-12-18.
certificate: REG-SUP-04-QMS.
registrar: REG-001.

File certificates.md, section 1.2: Quality-system registration type and manufacturing scope
Recorded result: true.
certificate: REG-SUP-04-QMS.
type: ISO 9001.

File quality_manual.md, section 1.1: Internal audit program
Recorded result: true.

File quality_manual.md, section 9.1: Corrective-action program
Recorded result: true.

File quality_manual.md, section 9.2: Gauge calibration program
Recorded result: true.

File quality_manual.md, section 1.2: Manufacturing failure-mode analysis
Recorded result: true.

File quality_manual.md, section 1.3: Production control plan
Recorded result: true.
ctqs: Board thickness, Mounting-hole pitch, Connector location.

File capability_study.md, section 1.1: Process capability
Recorded result: 1.8577159254737985.
Board thickness: 50 observations; mean: 2.005550257133821 mm. sample standard deviation: 0.016947288436486945 mm. lower drawing limit: 1.9 mm. upper drawing limit: 2.1 mm. Cpk: 1.8577159254737985.
Mounting-hole pitch: 50 observations; mean: 89.99080448760391 mm. sample standard deviation: 0.015108545934417524 mm. lower drawing limit: 89.9 mm. upper drawing limit: 90.1 mm. Cpk: 2.0033802502253617.
Connector location: 50 observations; mean: 15.009852726312577 mm. sample standard deviation: 0.01594201697828533 mm. lower drawing limit: 14.9 mm. upper drawing limit: 15.1 mm. Cpk: 1.8848989604057587.

File quality_manual.md, section 9.3: Statistical process monitoring
Recorded result: true.

File msa.md, section 1.1: Measurement-system repeatability and reproducibility
Recorded result: 5.439450096082153.
Board thickness: crossed study, 10 parts, 3 appraisers, 3 repeats; average-and-range method. GRR percent of drawing tolerance: 5.439450096082153 %. lower drawing limit: 1.9 mm. upper drawing limit: 2.1 mm.
Mounting-hole pitch: crossed study, 10 parts, 3 appraisers, 3 repeats; average-and-range method. GRR percent of drawing tolerance: 4.170924873264407 %. lower drawing limit: 89.9 mm. upper drawing limit: 90.1 mm.
Connector location: crossed study, 10 parts, 3 appraisers, 3 repeats; average-and-range method. GRR percent of drawing tolerance: 3.7170005982067424 %. lower drawing limit: 14.9 mm. upper drawing limit: 15.1 mm.

File quality_manual.md, section 9.4: Inspection methods
Recorded result: true.
method: Drawing-specific CTQ measurement instructions and calibrated gauges.

File reliability_report.md, section 1.1: Workmanship, IPC-A-610
Recorded result: true.
Drawing IPC-A-610 class (setup): Observed: Class 2 class.
Built to drawing class (acceptance): Observed: true boolean. Result: meets buyer limit.
Inspected to drawing class (acceptance): Observed: true boolean. Result: meets buyer limit.
Inspection rejects (acceptance): Observed: 0 count. Result: meets buyer limit.

File reliability_report.md, section 1.2: AOI and BGA X-ray
Recorded result: true.
AOI board coverage (acceptance): Observed: 1 fraction. Context: Every shipped board.. Result: meets buyer limit.
BGA X-ray coverage (acceptance): Observed: 1 fraction. Context: Every BGA on every shipped board.. Result: meets buyer limit.
Solder bridges (acceptance): Observed: 0 count. Result: meets buyer limit.
Solder opens (acceptance): Observed: 0 count. Result: meets buyer limit.
BGA void area per joint (acceptance): Observed: 21.930637980146916 %. Context: Stark-specific acceptance limit.. Result: meets buyer limit.

File reliability_report.md, section 1.3: In-circuit / functional test
Recorded result: true.
ICT testable-net coverage (acceptance): Observed: 1 fraction. Result: meets buyer limit.
FCT specified-function coverage (acceptance): Observed: 1 fraction. Result: meets buyer limit.
Shipped-board passing fraction (acceptance): Observed: 1 fraction. Result: meets buyer limit.
Coverage reported (acceptance): Observed: true boolean. Result: meets buyer limit.

File reliability_report.md, section 1.4: Ionic contamination
Recorded result: true.
Ionic contamination (acceptance): Observed: 1.3720276495549824 µg NaCl eq/cm². Context: Whole-board extract normalized by board surface area; synthetic buyer threshold, not a universal published acceptance limit.. Result: meets buyer limit.

File reliability_report.md, section 1.5: Moisture sensitivity handling
Recorded result: true.
J-STD-033 handling controls in place (acceptance): Observed: true boolean. Result: meets buyer limit.
Floor-life excursions (acceptance): Observed: 0 count. Result: meets buyer limit.
Dry-storage records current (acceptance): Observed: true boolean. Result: meets buyer limit.

File reliability_report.md, section 9.1: Conformal coating
Recorded result: true.
Dry coating thickness (acceptance): Observed: 48.820851787705315 µm. Result: meets buyer limit.
Specified-area coverage (acceptance): Observed: 1 fraction. Result: meets buyer limit.
Keep-out violations (acceptance): Observed: 0 count. Result: meets buyer limit.

File reliability_report.md, section 1.6: Test instructions and release limits
Recorded result: true.
document: Methods and buyer acceptance criteria documented.

File reliability_report.md, section 1.7: Statistical sample-size rationale
Recorded result: true.
document: Documented statistical sample-size rationale.

File quality_manual.md, section 1.4: Lot traceability
Recorded result: true.

File quality_manual.md, section 1.5: Record retention in years
Recorded result: 13.
unit: years.

File quality_manual.md, section 9.5: Nonconforming material segregation
Recorded result: true.

File capacity.md, section 1.1: Demonstrated output divided by peak weekly demand
Recorded result: 1.32305.
peak weekly demand: 2500.
mean: 3307.625.
unit: parts/week.
outputs: 3180, 3270, 3497, 3346, 3281, 3330, 3367, 3190.

File capacity.md, section 1.2: Delivery within the requested lead time
Recorded result: true.
quoted weeks: 5.
need by weeks: 8.
unit: weeks.

File capacity.md, section 1.3: Production ramp plan
Recorded result: true.
Milestone date: 2026-11-01. Added weekly output: 500 parts/week.

File pcn_policy.md, section 9.1: Advance change notice in days
Recorded result: 101.
unit: days.

File pcn_policy.md, section 1.1: Customer change authorization
Recorded result: true.

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
| Commodity | pcba |
| Part number | SI-PC-0004 |
| Part name | Rack control PCBA |
| Revision | A |
| Drawing number | SI-DWG-PC-0004 |

## 2 Critical-to-quality characteristics

Both tolerance endpoints are inclusive. These are two-sided drawing tolerances.

| CTQ | Nominal | Lower limit | Upper limit | Unit | Basis |
|---|---|---|---|---|---|
| Board thickness | 2 | 1.9 | 2.1 | mm | heuristic |
| Mounting-hole pitch | 90 | 89.9 | 90.1 | mm | heuristic |
| Connector location | 15 | 14.9 | 15.1 | mm | heuristic |

## 3 Test acceptance conditions

Setup conditions define how the test is run. All acceptance conditions listed for a test must be satisfied. Heuristic limits are proposed synthetic buyer values subject to review; they are not published standard limits.

### 3.1 Workmanship, IPC-A-610

Required.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| Drawing IPC-A-610 class | setup | = Class 2 | class | heuristic | — |
| Built to drawing class | acceptance | = true | boolean | heuristic | — |
| Inspected to drawing class | acceptance | = true | boolean | heuristic | — |
| Inspection rejects | acceptance | = 0 | count | heuristic | — |

### 3.2 AOI and BGA X-ray

Required.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| AOI board coverage | acceptance | = 1 | fraction | heuristic | Every shipped board. |
| BGA X-ray coverage | acceptance | = 1 | fraction | heuristic | Every BGA on every shipped board. |
| Solder bridges | acceptance | = 0 | count | heuristic | — |
| Solder opens | acceptance | = 0 | count | heuristic | — |
| BGA void area per joint | acceptance | ≤ 25 | % | heuristic | Stark-specific acceptance limit. |

### 3.3 In-circuit / functional test

Required.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| ICT testable-net coverage | acceptance | ≥ 0.9 | fraction | heuristic | — |
| FCT specified-function coverage | acceptance | = 1 | fraction | heuristic | — |
| Shipped-board passing fraction | acceptance | = 1 | fraction | heuristic | — |
| Coverage reported | acceptance | = true | boolean | heuristic | — |

### 3.4 Ionic contamination

Required.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| Ionic contamination | acceptance | ≤ 1.56 | µg NaCl eq/cm² | heuristic | Whole-board extract normalized by board surface area; synthetic buyer threshold, not a universal published acceptance limit. |

### 3.5 Moisture sensitivity handling

Nice to have.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| J-STD-033 handling controls in place | acceptance | = true | boolean | heuristic | — |
| Floor-life excursions | acceptance | = 0 | count | heuristic | — |
| Dry-storage records current | acceptance | = true | boolean | heuristic | — |

### 3.6 Conformal coating

Nice to have.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| Dry coating thickness | acceptance | 25 to 75 (inclusive) | µm | heuristic | — |
| Specified-area coverage | acceptance | = 1 | fraction | heuristic | — |
| Keep-out violations | acceptance | = 0 | count | heuristic | — |

## 4 Demand and need-by

| Planning input | Value | Unit | Basis |
|---|---|---|---|
| Peak weekly demand | 2500 | parts/week | heuristic |
| Need-by lead time | 8 | weeks | heuristic |

--- END RFQ ---

Document corrections for this attempt:
- All supplier-authored files: Restore exactly the listed files, synthetic first lines and assigned numbered sections; remove extra files or sections.
