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
