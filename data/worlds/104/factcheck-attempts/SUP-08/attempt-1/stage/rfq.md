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
