Prepare the supplier packet for Stane International (SUP-06), addressed to Stark Industries Supplier Quality.
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
Recorded result: 2028-04-18.
certificate: REG-SUP-06-QMS.
registrar: REG-001.

File certificates.md, section 9.1: Quality-system registration type and manufacturing scope
Recorded result: true.
certificate: REG-SUP-06-QMS.
type: ISO 9001.

File quality_manual.md, section 1.1: Internal audit program
Recorded result: true.

File quality_manual.md, section 1.2: Corrective-action program
Recorded result: true.

File quality_manual.md, section 1.3: Gauge calibration program
Recorded result: true.

File quality_manual.md, section 9.1: Manufacturing failure-mode analysis
Recorded result: true.

File quality_manual.md, section 1.4: Production control plan
Recorded result: true.
ctqs: Cable length, Ferrule protrusion, Strain-relief length.

File capability_study.md, section 9.1: Process capability
Recorded result: 2.0096515775269834.
Cable length: 50 observations; mean: 1999.3200383235485 mm. sample standard deviation: 1.545879632033437 mm. lower drawing limit: 1990 mm. upper drawing limit: 2010 mm. Cpk: 2.0096515775269834.
Ferrule protrusion: 50 observations; mean: 1.0026056936078365 mm. sample standard deviation: 0.00660427603800496 mm. lower drawing limit: 0.95 mm. upper drawing limit: 1.05 mm. Cpk: 2.392102032048547.
Strain-relief length: 50 observations; mean: 29.918873331307886 mm. sample standard deviation: 0.15081362907914808 mm. lower drawing limit: 29 mm. upper drawing limit: 31 mm. Cpk: 2.0309246074518774.

File quality_manual.md, section 1.5: Statistical process monitoring
Recorded result: true.

File msa.md, section 1.1: Measurement-system repeatability and reproducibility
Recorded result: 5.152021056080718.
Cable length: crossed study, 10 parts, 3 appraisers, 3 repeats; average-and-range method. GRR percent of drawing tolerance: 4.902988847188663 %. lower drawing limit: 1990 mm. upper drawing limit: 2010 mm.
Ferrule protrusion: crossed study, 10 parts, 3 appraisers, 3 repeats; average-and-range method. GRR percent of drawing tolerance: 3.4754685898352635 %. lower drawing limit: 0.95 mm. upper drawing limit: 1.05 mm.
Strain-relief length: crossed study, 10 parts, 3 appraisers, 3 repeats; average-and-range method. GRR percent of drawing tolerance: 5.152021056080718 %. lower drawing limit: 29 mm. upper drawing limit: 31 mm.

File quality_manual.md, section 1.6: Inspection methods
Recorded result: true.
method: Drawing-specific CTQ measurement instructions and calibrated gauges.

File reliability_report.md, section 9.1: Insertion / return loss
Recorded result: true.
Insertion loss per channel (acceptance): Observed: 0.33803464738749317 dB. Result: meets buyer limit.
Return loss per channel (acceptance): Observed: 44.39119218595949 dB. Result: meets buyer limit.
Wavelength (setup): Observed: 1310 nm.
All channels tested (acceptance): Observed: true boolean. Result: meets buyer limit.

File reliability_report.md, section 9.2: Workmanship, IPC/WHMA-A-620
Recorded result: true.
Drawing IPC/WHMA-A-620 class (setup): Observed: Class 2 class.
Built to drawing class (acceptance): Observed: true boolean. Result: meets buyer limit.
Inspected to drawing class (acceptance): Observed: true boolean. Result: meets buyer limit.
Inspection rejects (acceptance): Observed: 0 count. Result: meets buyer limit.

File reliability_report.md, section 9.3: Bend / flex
Repeat this statement exactly, without supplying supporting records: Our cables maintain optical performance after repeated bending.

File reliability_report.md, section 1.1: Test instructions and release limits
Recorded result: true.
document: Methods and buyer acceptance criteria documented.

File reliability_report.md, section 1.2: Statistical sample-size rationale
Recorded result: true.
document: Documented statistical sample-size rationale.

File quality_manual.md, section 9.2: Lot traceability
Recorded result: true.

File quality_manual.md, section 9.3: Record retention in years
Recorded result: 11.
unit: years.

File quality_manual.md, section 1.7: Nonconforming material segregation
Recorded result: true.

File capacity.md, section 1.1: Demonstrated output divided by peak weekly demand
Recorded result: 1.4809375.
peak weekly demand: 2000.
mean: 2961.875.
unit: parts/week.
outputs: 2885, 2971, 2972, 2985, 2868, 3041, 2968, 3005.

File capacity.md, section 1.2: Delivery within the requested lead time
Recorded result: true.
quoted weeks: 6.
need by weeks: 8.
unit: weeks.

File capacity.md, section 1.3: Production ramp plan
Recorded result: true.
Milestone date: 2026-11-01. Added weekly output: 400 parts/week.

File pcn_policy.md, section 9.1: Advance change notice in days
Recorded result: 99.
unit: days.

File pcn_policy.md, section 1.1: Customer change authorization
Recorded result: true.

File subtier.md, section 9.1: Named critical outside suppliers
Recorded result: true.
suppliers: Wakanda Design Group.

File subtier.md, section 1.1: Requirements passed to outside suppliers
Recorded result: true.

File subtier.md, section 1.2: Outside supplier registrations
Repeat this statement exactly, without supplying supporting records: We retain current registrations for our critical outside suppliers.

File cover_letter.md, section 1.1: Qualified alternate source
Repeat this statement exactly, without supplying supporting records: An alternate manufacturer is qualified to supply this part.

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
| Commodity | optics_cable |
| Part number | SI-OC-0006 |
| Part name | Rack optical cable assembly |
| Revision | A |
| Drawing number | SI-DWG-OC-0006 |

## 2 Critical-to-quality characteristics

Both tolerance endpoints are inclusive. These are two-sided drawing tolerances.

| CTQ | Nominal | Lower limit | Upper limit | Unit | Basis |
|---|---|---|---|---|---|
| Cable length | 2000 | 1990 | 2010 | mm | heuristic |
| Ferrule protrusion | 1 | 0.95 | 1.05 | mm | heuristic |
| Strain-relief length | 30 | 29 | 31 | mm | heuristic |

## 3 Test acceptance conditions

Setup conditions define how the test is run. All acceptance conditions listed for a test must be satisfied. Heuristic limits are proposed synthetic buyer values subject to review; they are not published standard limits.

### 3.1 Insertion / return loss

Required.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| Insertion loss per channel | acceptance | ≤ 0.5 | dB | heuristic | — |
| Return loss per channel | acceptance | ≥ 35 | dB | heuristic | — |
| Wavelength | setup | = 1310 | nm | heuristic | — |
| All channels tested | acceptance | = true | boolean | heuristic | — |

### 3.2 Workmanship, IPC/WHMA-A-620

Required.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| Drawing IPC/WHMA-A-620 class | setup | = Class 2 | class | heuristic | — |
| Built to drawing class | acceptance | = true | boolean | heuristic | — |
| Inspected to drawing class | acceptance | = true | boolean | heuristic | — |
| Inspection rejects | acceptance | = 0 | count | heuristic | — |

### 3.3 Bend / flex

Nice to have.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| Completed bend/flex cycles | acceptance | ≥ 1000 | cycles | heuristic | — |
| Bend radius | setup | = 30 | mm | heuristic | — |
| Post-flex insertion loss per channel | acceptance | ≤ 0.5 | dB | heuristic | — |
| Post-flex return loss per channel | acceptance | ≥ 35 | dB | heuristic | — |
| Post-flex wavelength | setup | = 1310 | nm | heuristic | — |
| All channels tested after flexing | acceptance | = true | boolean | heuristic | — |

## 4 Demand and need-by

| Planning input | Value | Unit | Basis |
|---|---|---|---|
| Peak weekly demand | 2000 | parts/week | heuristic |
| Need-by lead time | 8 | weeks | heuristic |

--- END RFQ ---

Document corrections for this attempt:
- All supplier-authored files: Restore exactly the listed files, synthetic first lines and assigned numbered sections; remove extra files or sections.
