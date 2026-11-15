> Synthetic document for a demo. Fictional supplier.

# Stark Industries — Supplier Quality. Synthetic document for a demo.

## 1 Part and drawing

| Field | Value |
|---|---|
| Commodity | machined_part |
| Part number | SI-MP-0005 |
| Part name | Precision coolant bracket |
| Revision | A |
| Drawing number | SI-DWG-MP-0005 |

## 2 Critical-to-quality characteristics

Both tolerance endpoints are inclusive. These are two-sided drawing tolerances.

| CTQ | Nominal | Lower limit | Upper limit | Unit | Basis |
|---|---|---|---|---|---|
| Datum bore | 12 | 11.98 | 12.02 | mm | heuristic |
| Base thickness | 6 | 5.95 | 6.05 | mm | heuristic |
| Hole pitch | 50 | 49.95 | 50.05 | mm | heuristic |

## 3 Test acceptance conditions

Setup conditions define how the test is run. All acceptance conditions listed for a test must be satisfied. Heuristic limits are proposed synthetic buyer values subject to review; they are not published standard limits.

### 3.1 First article inspection

Required.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| Drawing-characteristic coverage | acceptance | ≥ 1 | fraction | heuristic | — |

### 3.2 CMM report

Required.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| CTQ measurement coverage | acceptance | = 1 | fraction | heuristic | — |
| Out-of-tolerance CTQs | acceptance | = 0 | count | heuristic | Use the CTQ tolerances on this sheet. |
| Datum-face flatness | acceptance | ≤ 0.05 | mm | heuristic | — |

### 3.3 Material certificate

Required.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| Drawing material | setup | = SI-MAT-AL-02 | designation | heuristic | Fictional drawing designation for aluminum alloy. |
| Certificate traceable to material lot | acceptance | = true | boolean | heuristic | — |
| Certificate matches drawing material | acceptance | = true | boolean | heuristic | — |

### 3.4 Surface finish

Nice to have.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| Surface roughness Ra | acceptance | ≤ 1.6 | µm | heuristic | Drawing-designated machined surfaces. |

## 4 Demand and need-by

| Planning input | Value | Unit | Basis |
|---|---|---|---|
| Peak weekly demand | 3000 | parts/week | heuristic |
| Need-by lead time | 6 | weeks | heuristic |
