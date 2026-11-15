> Synthetic document for a demo. Fictional supplier.

# Stark Industries — Supplier Quality. Synthetic document for a demo.

## 1 Part and drawing

| Field | Value |
|---|---|
| Commodity | sheet_metal |
| Part number | SI-SM-0010 |
| Part name | Rack mounting panel |
| Revision | A |
| Drawing number | SI-DWG-SM-0010 |

## 2 Critical-to-quality characteristics

Both tolerance endpoints are inclusive. These are two-sided drawing tolerances.

| CTQ | Nominal | Lower limit | Upper limit | Unit | Basis |
|---|---|---|---|---|---|
| Sheet thickness | 1.5 | 1.4 | 1.6 | mm | heuristic |
| Bend angle | 90 | 89 | 91 | degrees | heuristic |
| Mounting-hole pitch | 400 | 399.5 | 400.5 | mm | heuristic |

## 3 Test acceptance conditions

Setup conditions define how the test is run. All acceptance conditions listed for a test must be satisfied. Heuristic limits are proposed synthetic buyer values subject to review; they are not published standard limits.

### 3.1 First article inspection

Required.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| Drawing-characteristic coverage | acceptance | ≥ 1 | fraction | heuristic | — |

### 3.2 Coating thickness

Required.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| Dry coating thickness | acceptance | 60 to 100 (inclusive) | µm | heuristic | Drawing-specified coated surfaces. |

### 3.3 Salt spray

Nice to have.

| Measure | Kind | Limit / condition | Unit | Basis | Context |
|---|---|---|---|---|---|
| Salt-spray exposure | setup | ≥ 96 | h | heuristic | Neutral salt spray on coated drawing surfaces; duration is a buyer heuristic. |
| Substrate corrosion area | acceptance | = 0 | % | heuristic | — |

## 4 Demand and need-by

| Planning input | Value | Unit | Basis |
|---|---|---|---|
| Peak weekly demand | 1500 | parts/week | heuristic |
| Need-by lead time | 6 | weeks | heuristic |
