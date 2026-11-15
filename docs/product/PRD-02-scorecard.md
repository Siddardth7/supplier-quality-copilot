# PRD-02 — Supplier scorecard & alerts

| Field | Value |
|---|---|
| Status | Approved |
| Owner | Sid (SME) |
| Release | v1.0 (feeds v1.1 SCAR drafting) |
| Milestone | v1.0 · M2 Engine |
| ID prefix | `SCORE` |
| Specs referenced | `docs/SCORECARD.md` (all formulas, bands, rules), `docs/DATASET.md` (stories) |
| Last updated | 2026-11-10 |

## 1. Problem

Active suppliers are reviewed on a monthly spreadsheet. A supplier whose reject rate creeps up by a little each month looks fine in any single month, so it is noticed only after DPPM has turned bad and parts have shipped. The metrics also aren't defined tightly enough for two people to compute the same number from the same receipts.

## 2. Users and jobs

| Persona | Job to be done | How this feature helps |
|---|---|---|
| Senior SQE | Decide which supplier to escalate this week | One composite tier per supplier, plus alerts that fire on trends, not only on bad months |
| Q&R director | Know who is at tier D and why | Tier and the metric that drove it, computed the same way every month |
| Junior SQE | Prepare the monthly supplier review | The numbers are computed; the job becomes reading them |

## 3. Goals and non-goals

**Goals**
- G1: Every metric states its numerator, denominator, window and empty case. *(PRD-00 G2)*
- G2: All six active-supplier stories produce exactly their expected outcomes. *(PRD-00 G6)*
- G3: A drift is caught by the run rule before the 3-month DPPM turns Bad (ACT-02).

**Non-goals**
- NG1: Statistical forecasting or anomaly detection beyond the stated p-chart rules.
- NG2: Western Electric rules beyond "above UCL" and "7 in a row above p̄".
- NG3: Opening, editing or closing SCARs. The scorecard reads SCAR dates from history.
- NG4: Per-part or per-failure-mode charts. One chart per supplier.

## 4. Requirements

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| SCORE-FR-01 | The engine must parse `data/history.csv` and reject any file that breaks a column rule in `SCORECARD.md`, naming the row | Must | unit test |
| SCORE-FR-02 | The engine must derive the 18-month frame from `as_of`, ignore rows outside it with a warning, and number months M1…M18 | Must | unit test |
| SCORE-FR-03 | The engine must compute the five metrics per supplier per month with the numerators, denominators, windows (truncated at history start) and empty cases in `SCORECARD.md` | Must | unit test per metric, including each empty case |
| SCORE-FR-04 | Metric values must be rounded (DPPM to integer, % to 0.1) before banding, and each band edge must fall on the side stated | Must | unit test per edge |
| SCORE-FR-05 | The composite must be the sum of points, rounded half up to 1 decimal, mapped to tiers A/B/C/D at 85/70/50; any `null` metric makes composite and tier `null` (Unrated) | Must | unit test |
| SCORE-FR-06 | The p-chart must use a pooled M1–M6 p̄ and a per-month UCL, skip zero-receipt months, and handle p̄ = 0 and an empty baseline as stated | Must | unit test |
| SCORE-FR-07 | The engine must emit `ucl`, `run7`, `tier_drop`, `scar_aging` and `metric_bad` alerts per the rules in `SCORECARD.md`, with month and detail, and mark M18 alerts active | Must | unit test |
| SCORE-FR-08 | The output must list each supplier's open SCARs at M18 (id, opened date, age) and its NC counts by failure-mode code over M7–M18, with the part numbers affected | Must (v1.1 SCAR drafting needs it) | unit test |
| SCORE-FR-09 | The six stories ACT-01…06 must meet every "must hold" and no "must not hold" in `SCORECARD.md` | Must | story tests (M3) |
| SCORE-FR-10 | `scorecard` must take the team policy's `scorecard` part (weights, Good/Watch/Bad limits, tier cut-offs; `SCORECARD.md` § Policy) and default to Stark Reference v1; alerts that test "Bad" follow the active policy. The output must carry the policy's `id`, `version` and `name`. An invalid policy throws naming the field | Must | unit test |
| SCORE-NFR-01 | The scorecard engine must be pure, in `app/engine.js`, with no `Date.now()`; `as_of` comes in as an argument | Must | review + determinism test |
| SCORE-NFR-02 | Bands, weights, tier cut-offs and alert thresholds must live as data next to the rubric (`app/rubric.js` or a sibling module), checked against `SCORECARD.md` by the parity test | Must | parity test |

## 5. Interfaces

**Input:** the parsed rows of `data/history.csv` (`parseHistory(text)` turns the file text into typed rows), plus `{ as_of: "2026-11-01", policy }` (`policy` optional). Both functions are in `app/engine.js`; the full export list is the [PRD-01 Engine API table](PRD-01-qualification-engine.md#engine-api-appenginejs). Integer cells must be canonical (`0`, `12`, `-5`): `-0` and leading zeros (`01`) are rejected with the row number. A policy without a valid `id`, `version` and `name` throws naming the field (`RUBRIC.md` § Team scoring policy). `validatePolicy(policy)` runs this half's checks after the qualification half's, so the Standards editor validates a whole policy with one call (PRD-01 Engine API, issue 109).

**Output** of `scorecard(rows, { as_of, policy })` (plus `"policy": { "id", "version", "name" }` at the top level):

```json
{
  "months": ["2025-05", "…", "2026-10"],
  "warnings": [],
  "suppliers": [
    {
      "supplier_id": "ACT-02",
      "months": [
        {
          "month": "2026-10", "index": 18,
          "metrics": {
            "dppm":      { "value": 1480, "band": "watch", "points": 15 },
            "escape":    { "value": 0.0,  "band": "good",  "points": 20 },
            "repeat_nc": { "value": 0.0,  "band": "good",  "points": 15 },
            "scar_aging":{ "value": 0.0,  "band": "good",  "points": 15 },
            "otd":       { "value": 97.4, "band": "good",  "points": 20 }
          },
          "composite": 85.0, "tier": "A"
        }
      ],
      "current": { "month": "2026-10", "composite": 85.0, "tier": "A" },
      "pchart": {
        "p_bar": 0.0009,
        "points": [ { "month": "2026-10", "index": 18, "n": 5400, "p": 0.0016, "ucl": 0.0021, "above_ucl": false, "run": 7 } ]
      },
      "alerts": [ { "type": "run7", "month": "2026-10", "index": 18, "active": true, "detail": "7 months above p̄ (M12–M18)" } ],
      "open_scars": [ { "scar_id": "SCAR-0412", "opened": "2026-08-14", "age_days": 78 } ],
      "failure_modes": [ { "code": "FM-PLATING", "count": 4, "parts": ["CP-2210"] } ]
    }
  ]
}
```

- `metrics.<name>.value` is `null` for an empty case that yields `null`; `band` and `points` are then `null` too.
- Percentages are stored as percent (97.4 means 97.4%).
- A `metric_bad` alert also carries `"metric"` (the metric key, e.g. `"otd"`) after `detail`; no other alert type has it. The supplier is the parent object, so an alert has no `supplier_id`.
- `pchart` is `null` when the baseline (M1–M6) has no receipts; the supplier then gets one entry in `warnings`. Otherwise `points` holds every month M1–M18 with receipts, baseline months included with `above_ucl: false` and `run: 0`. `p_bar`, `p` and `ucl` are unrounded doubles; the UI shows 4 decimals.
- The numbers above are illustrative. The story tests in M3 pin the real ones.

**Constraint from v1.1 (PRD-08):** the SCAR draft uses `alerts`, `open_scars` and `failure_modes`. These fields are part of the v1.0 output so v1.1 needs no engine change.

**Constraints from v1.2 (PRD-09):**
- The engine imports nothing from the DOM or the app shell, and its output is plain JSON, so the Python port can be checked against it output for output.
- Null metrics make the composite Unrated rather than being reweighted (QES "missing data is undecided, never zero").
- Every threshold in `SCORECARD.md` is a project heuristic, not a standards requirement. The port labels them `is_heuristic: true`.

## 6. Acceptance criteria

- [ ] SCORE-AC-01: Each malformed-row case in the `history.csv` rules throws an error naming the row. *(proves SCORE-FR-01)*
- [ ] SCORE-AC-02: Hand-made rows give the expected value for each metric in M1, M2, M3 and M7 (window truncation) and for each empty case. *(proves SCORE-FR-02, -03)*
- [ ] SCORE-AC-03: Every band edge in `SCORECARD.md` has a test on both sides; a null metric makes the composite and tier null. *(proves SCORE-FR-04, -05)*
- [ ] SCORE-AC-04: A hand-made series with 7 points above p̄ fires `run7` on the 7th; one point equal to p̄ resets it; a zero-receipt month neither breaks nor extends it; `ucl` fires on a single spike; p̄ = 0 is handled. *(proves SCORE-FR-06, -07)*
- [ ] SCORE-AC-05: Each alert type fires on a hand-made case and not on its near miss (tier same as last month; SCAR aged exactly 60 days). *(proves SCORE-FR-07)*
- [ ] SCORE-AC-06: Open SCARs and failure-mode counts match a hand-made case. *(proves SCORE-FR-08)*
- [ ] SCORE-AC-07: All six story tests pass on the generated `history.csv`. *(proves SCORE-FR-09, G2, G3)*
- [ ] SCORE-AC-09: With no policy, output equals Stark Reference v1. On hand-made rows, OTD 83% is Bad under the reference and Watch once the Bad limit moves to 80% (and its `metric_bad` alert goes away); a composite of 85.0 is tier A under the reference and B with cut-offs 90/75/55; weights summing to 99 throw. *(proves SCORE-FR-10)*
- [ ] SCORE-AC-08: Determinism and parity tests pass. *(proves SCORE-NFR-01, -02)*

## 7. Open questions

| # | Question | Owner | Resolution |
|---|---|---|---|
| 1 | Escape rate by rejected quantity or by NC count? | Sid | v1.0: by quantity. One field escape of 200 parts matters more than one bad part at incoming |
| 2 | What happens to the composite when a metric is null? | Sid | v1.0: composite and tier are null (Unrated). A month with no receipts isn't evidence of anything, and this matches Quality Engineering Skills, so the v1.2 port needs no behavior change |
| 3 | Run rule over baseline months too? | Sid | v1.0: monitoring months only. The baseline defines p̄, it isn't judged against it |

## 8. Out of scope

| Item | Picked up by |
|---|---|
| SCAR drafting from alerts | v1.1 (PRD-08) |
| Charts and tables | PRD-06 (Monitor view) |
| More control-chart rules | Unscheduled |

## 9. Changelog

| Date | Change |
|---|---|
| 2026-11-12 | §5 (issue 109): the scorecard policy checks are also reachable through `validatePolicy(policy)`, shared with the qualification half. No scores change. |
| 2026-11-10 | #23: §5 Input names `parseHistory(text)` and links the PRD-01 Engine API table; `history.csv` integer cells must be canonical (`-0`, `01` rejected); a policy without a valid `id`, `version`, `name` throws (SCORE-FR-10); a sparse `rows` array throws `rows[i]: expected an object`. |
| 2026-11-10 | #22: p-chart, `ucl` and `run7` alerts (SCORE-FR-06, -07). `pchart` between `current` and `alerts`, `null` with a warning on an empty baseline; baseline points plotted but not judged; values unrounded. `SCORECARD.md`: p-chart output, `run7` holds in every month of a run of 7 or more, `ucl`/`run7` detail formats. |
| 2026-11-10 | #21: composite, tier (from the rounded composite, Unrated on any null metric), `current`, and the `tier_drop`, `scar_aging` and `metric_bad` alerts in `app/engine.js`; `scorecard` validates the whole `policy.scorecard` and echoes the policy's `id`, `version`, `name` (SCORE-FR-05, -07 part, -10). `metric_bad` alerts carry a `metric` key. `SCORECARD.md` § Alerts: alerts evaluated in M1–M18, one `scar_aging` alert per month, detail formats, list order. |
| 2026-11-10 | #20: `parseHistory` and `scorecard` metrics in `app/engine.js` (SCORE-FR-01, -02, -03, -04, -08). `SCORECARD.md` clarified: repeat-NC look-back is 1–180 days, same day is not earlier, in-frame rows only; SCAR dates without a `scar_id`, or `scar_closed` before `scar_opened`, reject the file; the roster is every `supplier_id` in the file. |
| 2026-11-09 | Scorecard policy key names and fixed constants defined in `app/rubric.js` and `SCORECARD.md` § Policy. |
| 2026-11-09 | SCORE-FR-10, SCORE-AC-09: editable scorecard policy (weights, limits, tier cut-offs) with Stark Reference v1 defaults. |
| 2026-11-08 | First draft. `SCORECARD.md` v1 alongside it: 18-month frame with M1–M6 baseline, metric table with windows and empty cases, rounding before banding, Unrated composite on a null metric, p-chart edge rules, `metric_bad` alert, story table with must/must-not outcomes. |
