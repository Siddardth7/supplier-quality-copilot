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
