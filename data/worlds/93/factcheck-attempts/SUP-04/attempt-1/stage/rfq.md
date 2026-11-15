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
