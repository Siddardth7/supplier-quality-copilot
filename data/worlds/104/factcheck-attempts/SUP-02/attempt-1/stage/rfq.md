> Synthetic document for a demo. Fictional supplier.

# Stark Industries — Supplier Quality. Synthetic document for a demo.

## 1 Part and drawing

| Field | Value |
|---|---|
| Commodity | quick_disconnect |
| Part number | SI-QD-0002 |
| Part name | Dry-break coolant coupling |
| Revision | A |
| Drawing number | SI-DWG-QD-0002 |

## 2 Critical-to-quality characteristics

Both tolerance endpoints are inclusive. These are two-sided drawing tolerances.

| CTQ | Nominal | Lower limit | Upper limit | Unit | Basis |
|---|---|---|---|---|---|
| Seal bore | 10 | 9.97 | 10.03 | mm | heuristic |
| Engagement length | 20 | 19.9 | 20.1 | mm | heuristic |
| Latch groove width | 2 | 1.95 | 2.05 | mm | heuristic |

## 3 Test acceptance conditions

Setup conditions define how the test is run. All acceptance conditions listed for a test must be satisfied. Heuristic limits are proposed synthetic buyer values subject to review; they are not published standard limits.

### 3.1 Leak test

Required.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| Helium leak rate | acceptance | ≤ 0.000001 | mbar·L/s | heuristic | — |
| Helium differential pressure | setup | = 6 | bar | heuristic | — |
| Test temperature | setup | = 20 | °C | heuristic | — |

### 3.2 Connect / disconnect cycle life

Required.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| Connect/disconnect cycles | acceptance | ≥ 5000 | cycles | heuristic | — |
| Post-cycle helium leak rate | acceptance | ≤ 0.000001 | mbar·L/s | heuristic | — |
| Post-cycle helium differential pressure | setup | = 6 | bar | heuristic | — |

### 3.3 Pressure drop

Required.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| Pressure drop | acceptance | ≤ 0.2 | bar | heuristic | Fully coupled assembly. |
| Rated water flow | setup | = 4 | L/min | heuristic | — |
| Water temperature | setup | = 20 | °C | heuristic | — |

### 3.4 Spill on disconnect

Nice to have.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| Disconnect spill volume | acceptance | ≤ 0.1 | mL/disconnect | heuristic | — |
| Operating pressure | setup | = 6 | bar | heuristic | — |

## 4 Demand and need-by

| Planning input | Value | Unit | Basis |
|---|---|---|---|
| Peak weekly demand | 4000 | parts/week | heuristic |
| Need-by lead time | 10 | weeks | heuristic |
