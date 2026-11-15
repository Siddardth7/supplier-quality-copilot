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

