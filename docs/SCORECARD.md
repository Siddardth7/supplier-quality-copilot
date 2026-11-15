# Supplier Scorecard v1

Monthly, per active supplier, computed by the engine from `data/history.csv`. Product requirements are in [PRD-02](product/PRD-02-scorecard.md). If the engine and this doc disagree, fix one of them in the same commit.

## Time frame

- History covers **18 calendar months**, ending with the month before `as_of` (the same evaluation date the qualification engine uses). With `as_of = 2026-11-01` that is months 2025-05 to 2026-10, numbered **M1…M18**.
- **Baseline** = M1–M6. **Monitoring** = M7–M18. The current month is M18.
- Rows dated outside the 18 months are ignored and reported as a warning.
- Every `supplier_id` in the file is listed, sorted by id. A supplier with no rows inside the 18 months has `null` DPPM and on-time delivery in every month.
- Rolling windows are **truncated at the start of history**: in M1 a 3-month window covers M1 only, in M2 it covers M1–M2.
- A row belongs to the month of its `date` (the receipt date). A defect found later on the line or in the field is still attributed to the receipt month.

## `data/history.csv`

One row per receipt lot.

```
date,supplier_id,part_no,received_qty,rejected_qty,on_time,defect_found_at,failure_mode_code,scar_id,scar_opened,scar_closed
```

| Column | Type | Rule |
|---|---|---|
| `date` | `YYYY-MM-DD` | Receipt date |
| `supplier_id` | `ACT-nn` | |
| `part_no` | string | |
| `received_qty` | integer > 0 | |
| `rejected_qty` | integer, 0 ≤ x ≤ `received_qty` | |
| `on_time` | `0` / `1` | |
| `defect_found_at` | `incoming` · `line` · `field` · `none` | `none` if and only if `rejected_qty` = 0 |
| `failure_mode_code` | string, e.g. `FM-LEAK` | Required if and only if `rejected_qty` > 0 |
| `scar_id` | string or empty | A SCAR raised against this lot |
| `scar_opened` | `YYYY-MM-DD` or empty | Required when `scar_id` is set |
| `scar_closed` | `YYYY-MM-DD` or empty | Empty while open |

Every row with the same `scar_id` carries the same `scar_opened` and `scar_closed`. SCAR dates are chronological: a row with `scar_opened` or `scar_closed` but no `scar_id`, or with `scar_closed` earlier than `scar_opened`, breaks the rules. A **nonconformance (NC)** is a row with `rejected_qty` > 0. A file that breaks any rule above is rejected with an error naming the row.

## Metrics

Computed for each month *m*. Values are rounded before the band comparison: DPPM to an integer, percentages to 0.1.

| Metric | Numerator | Denominator | Window ending at *m* | Empty case | Good | Watch | Bad | Weight |
|---|---|---|---|---|---|---|---|---|
| DPPM | rejected qty × 1,000,000 | received qty | 3 months | no receipts → `null` | ≤ 500 | 500 < x ≤ 2,000 | > 2,000 | 30 |
| Escape rate | rejected qty found at `line` or `field` | rejected qty found anywhere | 6 months | no rejects → 0% | ≤ 5% | 5 < x ≤ 15% | > 15% | 20 |
| Repeat NC rate | NCs whose failure-mode code also appears on an earlier NC of this supplier dated within 180 days before it | NCs | 6 months (the 180-day look-back may reach before the window) | no NCs → 0% | ≤ 10% | 10 < x ≤ 25% | > 25% | 15 |
| SCAR aging | open SCARs older than 30 days | open SCARs | snapshot at month end | no open SCARs → 0% | 0% | 0 < x ≤ 25% | > 25% | 15 |
| On-time delivery | lots with `on_time` = 1 | lots | 3 months | no receipts → `null` | ≥ 95% | 85 ≤ x < 95% | < 85% | 20 |

- A SCAR is **open at month end** when `scar_opened` ≤ month end and `scar_closed` is empty or later than month end. Its **age** is month end − `scar_opened`, in days.
- For repeat NC, an earlier NC counts when it is 1 to 180 days before (180 counts, 181 does not); an NC on the same day is not earlier, and only rows inside the 18 months are looked back on.
- Points per metric: Good = 100%, Watch = 50%, Bad = 0% of its weight.

## Composite and tier

- **Composite** = sum of points (out of 100), rounded half up to 1 decimal. If any metric is `null`, the composite and tier are `null` and the supplier shows as **Unrated** for that month. Missing data is undecided, never zero, and its weight is not spread over the other metrics (same rule as Quality Engineering Skills).
- **Tier**: A ≥ 85 · B 70 ≤ x < 85 · C 50 ≤ x < 70 · D < 50. Tier D means escalate to the director and consider a hold.
- **Policy.** Metric weights, Good/Watch/Bad limits and tier cut-offs above are the Stark Reference v1 defaults. A team policy (`RUBRIC.md` § Team scoring policy, key `scorecard`) may change them: weights summing to 100, limits in the same direction as the table, tier cut-offs descending. Windows, empty cases, p-chart and alert rules are fixed.

The `scorecard` part of a policy has this shape (Stark Reference v1 values shown):

```json
{ "weights": { "dppm": 30, "escape": 20, "repeat_nc": 15, "scar_aging": 15, "otd": 20 },
  "limits": { "dppm":       { "good": 500, "watch": 2000 },
              "escape":     { "good": 5,   "watch": 15 },
              "repeat_nc":  { "good": 10,  "watch": 25 },
              "scar_aging": { "good": 0,   "watch": 25 },
              "otd":        { "good": 95,  "watch": 85 } },
  "tiers": { "A": 85, "B": 70, "C": 50 } }
```

`limits` keep each metric's direction from the table. Lower is better (DPPM, escape, repeat NC, SCAR aging): Good if x ≤ `good`, Watch if `good` < x ≤ `watch`, Bad if x > `watch`. Higher is better (OTD): Good if x ≥ `good`, Watch if `watch` ≤ x < `good`, Bad if x < `watch`. Percentages are in percent (5 means 5%). `tiers` are the lower bounds of A, B and C, inclusive; anything below C is D.

## p-chart

On the **monthly** reject fraction (not rolling).

- pᵢ = rejected qty ÷ received qty in month *i*; nᵢ = received qty in month *i*.
- p̄ = total rejected ÷ total received over M1–M6 (pooled).
- UCLᵢ = p̄ + 3·√(p̄(1−p̄)/nᵢ). No lower limit is used.
- A month with no receipts has no point. It neither breaks nor extends a run.
- If the baseline has no receipts, there is no chart and a warning is returned. If p̄ = 0, UCL = 0, so any month with a reject is above the UCL.
- Rules are evaluated on M7–M18 only, and a run counts only plotted monitoring points.
- Output (`pchart`): `p_bar` and one point per plotted month M1–M18 (months with receipts), each with `n`, `p`, `ucl`, `above_ucl` and `run`. Baseline points are plotted but not judged: `above_ucl: false`, `run: 0`. A monitoring point's `run` is the length of the run of consecutive plotted points strictly above p̄ ending at it, counted from M7. Values are unrounded; the UI shows 4 decimals.
- Empty baseline: `pchart` is `null`, no `ucl` or `run7` alerts, and the warning reads "<supplier_id>: no receipts in M1–M6 (2025-05 to 2025-10), no p-chart" (one per supplier, in supplier order, after any ignored-rows warning).

## Alerts

Each alert has a `type`, the month it holds in, and a detail string. An alert is **active** when it holds in M18. The alert list holds every month an alert held, newest first.

| Type | Holds in month *m* when |
|---|---|
| `ucl` | pₘ > UCLₘ |
| `run7` | pₘ and the 6 plotted points before it are all strictly above p̄ (a point equal to p̄ breaks the run) |
| `tier_drop` | tier(*m*) is worse than tier(*m*−1), both non-null |
| `scar_aging` | any SCAR open at the end of *m* is more than 60 days old |
| `metric_bad` | any metric is in its Bad band (one alert per metric) |

- `tier_drop`, `scar_aging` and `metric_bad` are evaluated in every month M1…M18; `ucl` and `run7` in M7–M18 only (§ p-chart).
- `run7` holds in every month where the run of strictly-above-p̄ plotted points is 7 or longer, so a run of 8 alerts in its 7th and 8th months.
- `scar_aging` is one alert per month, not one per SCAR. Its age test is 60 days, independent of the 30-day test in the SCAR aging metric.
- `metric_bad` alerts carry a `metric` key (e.g. `otd`). Detail strings: `ucl` `p <p> > UCL <UCL>` with 4 decimals, e.g. "p 0.0080 > UCL 0.0040"; `run7` `<run> months above p̄ (M<first>–M<m>)`, where `<run>` counts plotted points and `<first>` is the run's first month, e.g. "7 months above p̄ (M12–M18)"; `tier_drop` "B → C"; `scar_aging` "SCAR-0412 open 78 days" (several SCARs joined by "; ", oldest first); `metric_bad` `<metric name> <value> > <Bad limit>` for lower-is-better and `<metric name> <value> < <Bad limit>` for higher-is-better, where the Bad limit is the policy's Watch limit, e.g. "DPPM 2500 > 2000", "On-time delivery 83 < 85".
- The list is sorted newest month first; within a month by type in the table's order, then by metric order.

## Active-supplier stories

What the generator ([DATASET.md](DATASET.md)) must produce, and what the story tests check.

| ID | Story | Must hold | Must not hold |
|---|---|---|---|
| ACT-01 | Stable, excellent | M18 tier A, all metrics Good | any alert in M7–M18 |
| ACT-02 | Reject rate creeping up from M12 | `run7` in M18 (first time); M18 DPPM not Bad | `ucl` in M7–M18; `run7` before M18 |
| ACT-03 | One bad lot in M9 | `ucl` in M9 | `ucl` in any other month; M18 tier below B |
| ACT-04 | Good quality, poor delivery | M18 tier B; `metric_bad` for OTD in M18; DPPM, escape, repeat NC Good | `ucl`, `run7` |
| ACT-05 | Repeat failure mode, old open SCARs | M18 tier C; DPPM Watch; repeat NC and SCAR aging Bad; `scar_aging` in M18 | |
| ACT-06 | Defects escaping to the line and field | M18 tier C or D; `metric_bad` for escape rate in M18 | |

Worked check for ACT-05 in M18: DPPM Watch 15 + escape Good 20 + repeat NC Bad 0 + aging Bad 0 + OTD Good 20 = 55 → tier C.
