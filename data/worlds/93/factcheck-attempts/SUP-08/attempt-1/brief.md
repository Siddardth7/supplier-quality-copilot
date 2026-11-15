Prepare the supplier packet for Roxxon (SUP-08), addressed to Stark Industries Supplier Quality.
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
Recorded result: 2027-09-16.
certificate: REG-SUP-08-QMS.
registrar: REG-001.

File certificates.md, section 9.1: Quality-system registration type and manufacturing scope
Recorded result: true.
certificate: REG-SUP-08-QMS.
type: ISO 9001.

File quality_manual.md, section 1.1: Internal audit program
Recorded result: true.

File quality_manual.md, section 9.1: Corrective-action program
Recorded result: true.

File quality_manual.md, section 1.2: Gauge calibration program
Recorded result: true.

File quality_manual.md, section 1.3: Manufacturing failure-mode analysis
Recorded result: true.

File quality_manual.md, section 1.4: Production control plan
Recorded result: true.
ctqs: Rail spacing, Mounting fastener torque, Manifold alignment.

File capability_study.md, section 1.1: Process capability
Recorded result: 1.8711978588677134.
Rail spacing: 50 observations; mean: 450.0163258966379 mm. sample standard deviation: 0.08444340319730495 mm. lower drawing limit: 449.5 mm. upper drawing limit: 450.5 mm. Cpk: 1.9092634239762918.
Mounting fastener torque: 50 observations; mean: 5.006536904575047 N·m. sample standard deviation: 0.07941280057692442 N·m. lower drawing limit: 4.5 N·m. upper drawing limit: 5.5 N·m. Cpk: 2.071299554731742.
Manifold alignment: 50 observations; mean: 24.958016147890334 mm. sample standard deviation: 0.08159054296329823 mm. lower drawing limit: 24.5 mm. upper drawing limit: 25.5 mm. Cpk: 1.8711978588677134.

File quality_manual.md, section 1.5: Statistical process monitoring
Recorded result: true.

File msa.md, section 1.1: Measurement-system repeatability and reproducibility
Recorded result: 3.369316154426757.
Rail spacing: crossed study, 10 parts, 3 appraisers, 3 repeats; average-and-range method. GRR percent of drawing tolerance: 2.8895459046635814 %. lower drawing limit: 449.5 mm. upper drawing limit: 450.5 mm.
Mounting fastener torque: crossed study, 10 parts, 3 appraisers, 3 repeats; average-and-range method. GRR percent of drawing tolerance: 3.369316154426757 %. lower drawing limit: 4.5 N·m. upper drawing limit: 5.5 N·m.
Manifold alignment: crossed study, 10 parts, 3 appraisers, 3 repeats; average-and-range method. GRR percent of drawing tolerance: 2.8679847134962047 %. lower drawing limit: 24.5 mm. upper drawing limit: 25.5 mm.

File quality_manual.md, section 1.6: Inspection methods
Recorded result: true.
method: Drawing-specific CTQ measurement instructions and calibrated gauges.

File reliability_report.md, section 9.1: Process audit
Recorded result: true.
Process audit complete (acceptance): Observed: true boolean. Result: meets buyer limit.
Open major process findings (acceptance): Observed: 0 count. Result: meets buyer limit.

File reliability_report.md, section 9.2: ESD control program
Recorded result: false.
ESD control program implemented (acceptance): Observed: false boolean. Context: Audit all stations building this part; no certification claim.. Result: does not meet buyer limit.
Open major ESD findings (acceptance): Observed: 3 count. Result: does not meet buyer limit.

File reliability_report.md, section 1.1: First-pass yield data
Recorded result: 3.
Consecutive months of FPY data (acceptance): Observed: 3 months. Result: does not meet buyer limit.

File reliability_report.md, section 1.2: MES traceability
Recorded result: true.
Serial-level build records in MES (acceptance): Observed: true boolean. Result: meets buyer limit.
Shipped serial record coverage (acceptance): Observed: 1 fraction. Result: meets buyer limit.

File reliability_report.md, section 9.3: Operator training records
Recorded result: true.
Operator/station qualification coverage (acceptance): Observed: 1 fraction. Context: Current operators at all stations building this part.. Result: meets buyer limit.
Expired qualifications (acceptance): Observed: 0 count. Result: meets buyer limit.

File reliability_report.md, section 1.3: Test instructions and release limits
Recorded result: true.
document: Methods and buyer acceptance criteria documented.

File reliability_report.md, section 1.4: Statistical sample-size rationale
Recorded result: true.
document: Documented statistical sample-size rationale.

File quality_manual.md, section 9.2: Lot traceability
Recorded result: true.

File quality_manual.md, section 1.7: Record retention in years
Recorded result: 11.
unit: years.

File quality_manual.md, section 1.8: Nonconforming material segregation
Recorded result: true.

File capacity.md, section 9.1: Demonstrated output divided by peak weekly demand
Recorded result: 1.515.
peak weekly demand: 200.
mean: 303.
unit: parts/week.
outputs: 295, 300, 315, 304, 297, 293, 312, 308.

File capacity.md, section 9.2: Delivery within the requested lead time
Recorded result: true.
quoted weeks: 9.
need by weeks: 12.
unit: weeks.

File capacity.md, section 9.3: Production ramp plan
Recorded result: true.
Milestone date: 2026-11-01. Added weekly output: 40 parts/week.

File pcn_policy.md, section 1.1: Advance change notice in days
Recorded result: 100.
unit: days.

File pcn_policy.md, section 9.1: Customer change authorization
Recorded result: true.

File subtier.md, section 1.1: Named critical outside suppliers
Recorded result: true.
suppliers: Wakanda Design Group.

File subtier.md, section 9.1: Requirements passed to outside suppliers
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

File cover_letter.md, section 9.2: Financial condition
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
| Commodity | contract_mfg |
| Part number | SI-CM-0008 |
| Part name | Liquid-cooled rack system build |
| Revision | A |
| Drawing number | SI-DWG-CM-0008 |

## 2 Critical-to-quality characteristics

Both tolerance endpoints are inclusive. These are two-sided drawing tolerances.

| CTQ | Nominal | Lower limit | Upper limit | Unit | Basis |
|---|---|---|---|---|---|
| Rail spacing | 450 | 449.5 | 450.5 | mm | heuristic |
| Mounting fastener torque | 5 | 4.5 | 5.5 | N·m | heuristic |
| Manifold alignment | 25 | 24.5 | 25.5 | mm | heuristic |

## 3 Test acceptance conditions

Setup conditions define how the test is run. All acceptance conditions listed for a test must be satisfied. Heuristic limits are proposed synthetic buyer values subject to review; they are not published standard limits.

### 3.1 Process audit

Required.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| Process audit complete | acceptance | = true | boolean | heuristic | — |
| Open major process findings | acceptance | = 0 | count | heuristic | — |

### 3.2 ESD control program

Required.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| ESD control program implemented | acceptance | = true | boolean | heuristic | Audit all stations building this part; no certification claim. |
| Open major ESD findings | acceptance | = 0 | count | heuristic | — |

### 3.3 First-pass yield data

Required.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| Consecutive months of FPY data | acceptance | ≥ 6 | months | heuristic | — |

### 3.4 MES traceability

Required.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| Serial-level build records in MES | acceptance | = true | boolean | heuristic | — |
| Shipped serial record coverage | acceptance | = 1 | fraction | heuristic | — |

### 3.5 Operator training records

Nice to have.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| Operator/station qualification coverage | acceptance | = 1 | fraction | heuristic | Current operators at all stations building this part. |
| Expired qualifications | acceptance | = 0 | count | heuristic | — |

## 4 Demand and need-by

| Planning input | Value | Unit | Basis |
|---|---|---|---|
| Peak weekly demand | 200 | parts/week | heuristic |
| Need-by lead time | 12 | weeks | heuristic |

--- END RFQ ---

Document corrections for this attempt:
- All supplier-authored files: Restore exactly the listed files, synthetic first lines and assigned numbered sections; remove extra files or sections.
