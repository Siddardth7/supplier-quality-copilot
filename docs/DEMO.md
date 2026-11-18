# Demo script (3 minutes)

| Field | Value |
|---|---|
| Status | Ready for the timed dry run |
| Release / milestone | v1.0 / M6 |
| Issue | #51 |
| Product requirements | [PRD-07](product/PRD-07-ship.md) SHIP-FR-05 |
| Last updated | 2026-11-14 |

All data is synthetic. The buyer is Stark Industries and the suppliers carry Marvel comic-book company names; this
project is fan-made and not affiliated with Marvel.

**Base URL.** Live: `https://siddardth7.github.io/supplier-quality-copilot/app/`. Local: run `node scripts/serve.mjs`
from the repo root and use `http://localhost:8000/app/`. Every link below is the base URL plus the hash shown.

**Before you start.** Open the step 1 link in a fresh tab at desktop width. In Standards, the left list must show
only *Stark Reference v1* with no unsaved changes (press **Reset to Stark Ref v1** if not). Each step can be reached
by clicking through the app or by pasting its link, so a wrong click costs nothing.

## Steps

| # | Time | Link | Do | Say |
|---|---|---|---|---|
| 1 | 0:15 | [`#view=today`](../app/#view=today) | Open on Today. Point at *Needs you (9)* and *Escalate this week (4)*. | "This is a supplier quality engineer's morning. Nine suppliers waiting to be qualified, four active suppliers to escalate. Every one is scored the same way." |
| 2 | 0:15 | [`#view=qualify`](../app/#view=qualify) | Open Qualify. Point at the queue: 4 NOT APPROVED, 2 CONDITIONAL, 3 APPROVED. | "The backlog is a queue, worst first. One of the nine is cleared for a junior engineer; eight need a senior." |
| 3 | 0:40 | [`#view=qualify&supplier=SUP-07`](../app/#view=qualify&supplier=SUP-07) then [`…&doc=capability_study.md&sec=1.1`](../app/#view=qualify&supplier=SUP-07&doc=capability_study.md&sec=1.1) | Open SUP-07 Oscorp. Point at 84.4, CONDITIONAL, the two knockouts, then *Fail or partial (3)* and *Assumed (4)*. Click the `capability_study.md §1.1` citation. | "Oscorp, a new cold plate. 84.4, CONDITIONAL. Three problems scored: Cpk 1.17 and capacity at 83% of peak get partial credit, and the lead time fails outright, 15 weeks against 12. Four things they claimed but never proved, and two of those are knockouts: leak test and burst pressure. Every row cites the page it came from. This is the supplier's own capability study, opened at the section the number came from." |
| 4 | 0:25 | [`#view=qualify&role=junior&supplier=SUP-07`](../app/#view=qualify&role=junior&supplier=SUP-07) then [`#view=qualify&role=junior&supplier=SUP-04`](../app/#view=qualify&role=junior&supplier=SUP-04) | Close the viewer. Flip *Viewing as* to Junior: SUP-07 reads *Needs a senior SQE*. Open SUP-04 Pym Technologies: *You may sign this*. | "Who signs? Not the junior: it's CONDITIONAL on a high-risk part. But Pym is 100, APPROVED, medium risk, second source confirmed, so the junior can sign it. The rule decides, not the agent." |
| 5 | 0:15 | [`#view=qualify&supplier=SUP-07&tab=drafts`](../app/#view=qualify&supplier=SUP-07&tab=drafts) | Back to SUP-07 as Senior, *Drafts* tab. Point at the RFI email's four numbered items. | "The email to Oscorp is already drafted. It asks for exactly the four unproven items, with our limits in it. It's a draft: a person reviews and sends it." |
| 6 | 0:30 | [`#view=compare&part=SI-CP-0007`](../app/#view=compare&part=SI-CP-0007) then [`#view=standards`](../app/#view=standards) | Compare: three cold-plate bidders, two acceptable, one not. Then Standards: untick the `1.cert_current` knockout and point at *Impact*: SUP-05 NOT APPROVED → APPROVED, senior → junior. Press **Discard changes**. | "Three bidders for the same part. Quality says who is acceptable; sourcing picks among them. And the rules are not hidden in code. If I stop treating an expired certificate as a knockout, I see who it lets through before I save anything. I'm not saving that." |
| 7 | 0:20 | [`#view=monitor&active=ACT-02`](../app/#view=monitor&active=ACT-02) | Monitor, ACT-02 Alchemax. Point at DPPM *Watch* (not Bad), then the p-chart: seven points in a row above the mean, M12–M18. | "Qualified suppliers are watched the same way. Alchemax's DPPM still isn't bad. But it has been above its own average seven months running, and that run rule fires before the number does." |
| 8 | 0:20 | [`#view=eval`](../app/#view=eval) | Eval. Point at *Caught 97.3%* (PASS), then *False alarms 10.0%* (FAIL), then the list of every miss. | "Does the agent actually work? On four simulated supplier worlds it had never seen, with the answer key locked before the run, it caught 71 of 73 planted gaps: 97.3%. It also raised too many false alarms, 10% against a 5% target, and I publish that as measured. Every miss is listed here. That is why a person still signs." |
| | **3:00** | | | |

## If something goes wrong

| Problem | Do |
|---|---|
| No network | Run `node scripts/serve.mjs` and use the local base URL. The app has no backend, so it behaves the same. |
| A click lands in the wrong place | Paste the step's link. Every state in the script is a link. |
| Standards shows unsaved changes | Press **Discard changes**, or **Reset to Stark Ref v1**. |
| Asked about the false alarms | All of them are rows the key marks `verified` and the agent marked `assumed`: it was too cautious, never too trusting. [EVAL.md](EVAL.md) has each one. |

## Checked

Each link was opened on a cold load against the local server on 2026-11-14, at 390 px and 1280 px wide: the expected
state showed, with no horizontal scroll, the synthetic-data banner and the fan-made footer. The numbers in *Say* were
read from those screens. `docs/demo.test.mjs` fails if a link here stops being a canonical app route or the time
budget goes over 3:00. The same check on the live link, and the timed dry run, are ship-checklist items in PRD-07.
