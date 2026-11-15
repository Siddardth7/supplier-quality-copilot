# DESIGN-SPEC — Shared UI design contract

| Field | Value |
|---|---|
| Status | Approved |
| Owner | Sid (SME) |
| Release | v1.0 |
| Milestone | v1.0 · M5 Workbench UI |
| ID prefix | `DS` |
| Specs referenced | `design/tokens.css`, PRD-05, PRD-06, PRD-10…PRD-13, wireframe artifact `1r2p43AZkDzkMa2AvJW8oj` (RoLaMGAS template) |
| Last updated | 2026-11-13 |

## 1. Problem

Six views built issue by issue will drift in spacing, color meaning and keyboard behavior unless one contract defines them first. The workbench must also read as an instrument, not a marketing page: dense, quiet, numbers first.

## 2. Principles

1. **Cyan means "you can act on this".** Links, buttons, focus, selected tabs. Never used for status.
2. **Amber means "something happened".** Alerts, assumed evidence, Watch bands. Never used for controls.
3. **Color never carries meaning alone.** Every state also has a text label or a glyph.
4. **Numbers in mono**, right-aligned in tables, with fixed decimals.
5. **Problems first.** Knockouts, then gaps, then everything else.

## 3. Requirements

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| DS-FR-01 | All colors, fonts and spacing must come from `design/tokens.css` custom properties. New tokens are added there, not inline | Must | review (grep for hex values in `app/`) |
| DS-FR-02 | State colors must follow the semantics table in §5, with the glyph and label | Must | review |
| DS-FR-03 | Numbers must follow the formatting table in §6 | Must | review |
| DS-FR-04 | Layout must follow §4 at desktop (≥ 1100 px), tablet (760–1099 px) and phone (390 px), with no horizontal page scroll at 390 px | Must | manual check at each width |
| DS-FR-05 | Every component in §7 must be built once and reused by every view that needs it | Must | review |
| DS-FR-06 | The app header, the six view tabs, the policy chip and the *Viewing as* switch must follow §4.1 on every view | Must | manual check |
| DS-FR-07 | Every view's state must use the single hash scheme in §4.2. An unknown view or key value falls back to that view's default and is not an error | Must | manual check + unit test of the parser |
| DS-NFR-01 | **WCAG 2.2 AA**: text contrast ≥ 4.5:1 (≥ 3:1 for ≥ 18.7 px bold or 24 px); UI component and focus contrast ≥ 3:1; target size ≥ 24 × 24 px; visible focus on every interactive element; no keyboard trap | Must | a11y checklist (§9) |
| DS-NFR-02 | No text smaller than 11 px; body data at 12–13 px | Must | review |
| DS-NFR-03 | `prefers-reduced-motion` disables transitions (already in tokens) | Must | review |

## 4. Layout

### 4.1 App header and view tabs

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Stark Industries               Policy: Stark Reference v1     Viewing as │
│ Supplier Quality Copilot                          [Junior|Senior]        │
├──────────────────────────────────────────────────────────────────────────┤
│ Synthetic data. Fictional suppliers.                                     │
│ 01 Today  02 Qualify  03 Compare  04 Monitor  05 Standards  06 Eval      │
└──────────────────────────────────────────────────────────────────────────┘
```

- The brand is text only: "Stark Industries" over "Supplier Quality Copilot". No Marvel artwork (ROADMAP 2026-11-09).
- **Policy chip:** names the active policy and version. `--cyan` text for Stark Reference v1, `--amber` for a custom policy, plus "Unsaved changes" or "Shared, not saved" when that applies. Activating it opens Standards. The policy in effect is, in order: an unsaved draft ("Unsaved changes", amber even when it started from the reference; while the draft is invalid the chip names the last valid form, which is what scores), a shared link's policy ("Shared, not saved"), the saved active policy, then Stark Reference v1 (issue 109).
- **Viewing as:** a two-option switch (Junior / Senior), Senior by default, stored in the hash as `role`. It changes tags and *Needs you*, never data (PRD-05 UIQ-FR-18, PRD-10 UIT-FR-02).
- **Sticky shell:** below the scrolling header, a synthetic-data badge occupies its own row above the numbered tabs (`role=tablist`). The two rows stick together at the top as one bar, as tall as one badge row plus the tab row; the root scroll padding (96 px) is set taller than that bar so keyboard focus clears it. Today is the landing view.
- The synthetic-data badge is always visible. The footer carries the fan-made line on every view. The citation viewer repeats the badge in its header and the fan-made disclaimer below its independently scrolling packet body, including loading and missing-file states.
- **Print:** labels print in dark token ink on a transparent background, with the shell and viewer header static. An open viewer prints as its own document with its badge and disclaimer; the underlying page is hidden. On ordinary view printouts the tabs and other controls remain visible; no blanket button-hiding rule removes content cards (decisions 190–192).

### 4.2 URL hash

One scheme for every view: `#view=<name>&<key>=<value>…`. Keys a view doesn't use are ignored. Navigation from a click pushes a history entry, so Back and Forward restore it.

| Key | Values | Views | Example |
|---|---|---|---|
| `view` | `today` · `qualify` · `compare` · `monitor` · `standards` · `eval` | all | `#view=monitor` |
| `role` | `junior` · `senior` | all | `&role=junior` |
| `policy` | encoded shared policy | all | `&policy=p1.eyJpZCI6InBvbGljeS0xIn0` (PRD-12 UIS-FR-07) |
| `supplier` | candidate ID (`SUP-07`, `NEW-01`) | qualify, eval | `&supplier=SUP-07` |
| `tab` | `problems` · `categories` · `requirements` · `drafts` | qualify | `&tab=drafts` |
| `doc`, `sec` | packet file, section | qualify, eval | `&doc=capability_study.md&sec=2` |
| `filter` | `junior` · `senior` · `not-approved` · `conditional` · `approved` | qualify | `&filter=junior` |
| `new` | `1` | qualify | `&new=1` |
| `part` | Stark part number | compare | `&part=SI-CP-0007` |
| `active` | active supplier ID | monitor | `&active=ACT-02` |
| `month` | `1`…`18` | monitor | `&month=18` |
| `sheet` | Stark part number | standards | `&sheet=SI-CP-0007` |
| `run` | run index, from 1 | eval | `&run=2` |
| `world` | simulated world number | eval | `&world=101` |

No `view` key means Today. A bare `#supplier=<id>` (the v1.0 link form in older notes) opens Qualify on that supplier.

Formats: `supplier` is `SUP-` or `NEW-` and two or more digits; `active` is `ACT-` and two or more digits; `part` and `sheet` are `SI-` two letters `-` four digits (`SI-CP-0007`); `doc` is a packet file name `[a-z0-9_]+.md` and `sec` a section number such as `2` or `2.1` (the two halves of a PRD-04 citation), and `sec` needs a valid `doc`; `new` is exactly `1`; `policy` is 1 to 8000 base64url characters and dots (issue 109: `p1.` + base64url of the policy JSON, PRD-12 §5); a token that passes here but doesn't decode to a valid policy stays in the URL and Standards says it was refused.

A key outside the view's list is dropped, an invalid value is dropped, and both normalize the URL in place (no new history entry). IDs and part numbers are upper-cased, enums and `doc` lower-cased. `month` is 1…18 and `run` and `world` are 1…999999, as whole numbers. `month` focuses that chart point (that month's row when the chart shows as a table); a month with no point focuses nothing (#45). Keys are matched case-sensitively (lower case); every value, including `policy`, is trimmed before it is checked. An ID that is valid but unknown stays in the URL and the view shows "Not found". In Eval, `supplier` and `world` together name a world packet (`data/worlds/<world>/packets/<supplier>/`), not a candidate, so they are never "Not found": a packet that isn't there shows "File not in packet" in the viewer (issue 111). `role` and `policy` carry across tab clicks; every other key resets. There is no `criterion` key (the original #38 text named one; this table supersedes it).

### 4.3 Today

```
┌ AS OF 2026-11-01 · M18 ───────────────────────────────────────────────────┐
│ Every supplier, scored the same way. (one-line intro)                     │
├ QUEUE COUNTS ─────────────────────────────────────────────────────────────┤
│ NOT APPROVED 4   CONDITIONAL 2   APPROVED 3  │ Junior 1  Senior 8 │ D0 C2 B1 A3 │
├ NEEDS YOU (8) ─────────────────────┬ ESCALATE THIS WEEK (3) ──────────────┤
│ ✗ SUP-01 Frost Technotics  97.5  ↗ │ ● ACT-06 Trask Ind.  C  65.0  ↗      │
│ ✗ SUP-03 Hammer Industries 74.2  ↗ │   escape_rate bad                    │
│ ~ SUP-07 Oscorp            82.6  ↗ │ ● ACT-02 Alchemax    A  85.0  ↗      │
│   …                                │   run7 M18                           │
└────────────────────────────────────┴──────────────────────────────────────┘
```

At 390 px the two lists stack, *Needs you* first. Counts wrap into a 2-column grid. Count tiles are plain text, not links, and cover every supplier whatever the *Viewing as* role. Unscored candidates are not listed in *Needs you*; a quiet "N not scored" line counts them (#107). When only suppliers.json fails, both lists show its error but only *Needs you* announces it (`role=alert`); when history.csv fails too, each list shows and announces its own file. Either way nothing can be counted (Monitor needs `as_of` from suppliers.json), so QUEUE COUNTS reads "No counts: the candidate and scorecard data did not load." (issue 46, decision 178).

### 4.4 Qualify

**Desktop (≥ 1100 px).** A 300 px queue sidebar and a fluid detail column, under the header and tabs.

```
┌──────────────────────┬───────────────────────────────────────────────────┐
│ QUEUE (9) [+ New]    │ Cold plate · High risk · SI-CP-0007               │
│ [All 9][Junior 1]    │ Oscorp · SUP-07          Scored with: Stark Ref v1│
│ [Senior 8][NOT APP 4]│ Stark requirement sheet ↗                         │
│ ┌──────────────────┐ │ ┌ ★ KNOCKOUT banner, when one fails or is assumed ┐│
│ │NOT APPROVED      │ │ └─────────────────────────────────────────────────┘│
│ │SUP-01 Frost …  ↗ │ │ SCORE 82.6 │ CONDITIONAL │ SIGNS Senior │ PROBLEMS 7│
│ │97.5 · Senior     │ │            │             │ CONDITIONAL; │ + 1 info  │
│ └──────────────────┘ │ │            │             │ High-risk    │           │
│ ┌──────────────────┐ │ [Problems] [Categories] [All requirements] [Drafts]│
│ │CONDITIONAL     ◄ │ │ ✗ Fail  Lowest Cpk  1.12  capability_study.md §2 ↗│
│ │SUP-07 Oscorp   ↗ │ │ ~ Assumed  SPC      Yes      quality_manual.md §5 ↗│
│ │82.6 · Senior     │ │ ? Missing  Sub-tier named  —                      │
│ │Senior signs      │ │ i Info  Thermal cycling (nice to have)            │
│ └──────────────────┘ │                                                   │
└──────────────────────┴───────────────────────────────────────────────────┘
```

- The *Senior signs* / *You can sign* tags show only when viewing as Junior.
- The detail header line (`You may sign this` / `Needs a senior SQE`) shows in both roles; a Senior always reads 'You may sign this'.
- The citation viewer is a right-hand sheet (`width: min(560px, 100%)`) over a scrim (`doc`/`sec` open it; closing removes them). It renders the packet file with the cited section highlighted.
- The Drafts sub-tab shows the RFI email and the audit plan side by side, each with Copy.
- The Drafts panel shows the agent-drafted RFI email (verbatim, preformatted) and the audit plan (numbered, engine `audit_focus` order) with the engine's RFI items and audit focus beside them; a Copy button each. A draft that disagrees with the engine's lists gets a one-line note. With no drafts (hand-entered suppliers) it shows the engine lists only. Nothing is sent.
- **+ New supplier** opens the entry in the detail column: step 1 (name, part), then step 2 (the checklist). **+ New supplier** and **Import** sit in the queue head; the checklist is one open `<details>` per category, each row a fieldset (state, value, where I found it, note, and Stark's limit on category-4 tests); only the headline strip (score, decision, signs, problems, or the paused / engine-error line) is sticky; the knockout banner, gaps and RFI / audit lists sit under it, static, and a field focused under the strip is scrolled clear of it (WCAG 2.4.11). The field is centred with an instant scroll, never a smooth one, so fast Tab or Shift+Tab cannot strand it off-screen (issue 137). The strip is static at 759 px and below, where the entry replaces the queue. A saved hand-entered supplier's detail adds Edit, Export and Delete (confirmed in the page).
- Unscored candidates (not extracted, engine error) sit after the scored cards, only under All.
- A selected supplier hidden by the filter stays selected, with a note and Show all.
- The knockout banner shows when the engine lists a knockout (`knockouts.failed`, then `knockouts.assumed`): "★ ✗ Failed … Forces NOT APPROVED." or "★ ~ Assumed (claimed, not proven) … Blocks APPROVED.", with the requirement name and its ID. The word is "assumed", the engine and RUBRIC term. A knockout the policy switches off is not listed, so it shows no banner.
- Detail tabs are automatic-activation; Problems is the default and omits `tab` from the hash.
- The part number in the header and the requirement-sheet link come from the commodity's requirement sheet (`part_no`), not from `suppliers.json`.
- **Problems** lists the engine's gaps in groups **fail → assumed → missing**, then **info** (nice-to-have tests not verified), each group with a count; empty groups are not shown. Each row: state chip (glyph + word), requirement name with ★ on a knockout and its ID, the agent's note under the name when there is one, value, score `n / 3`, citation link. An assumed knockout with a failing claim reads "~ Assumed" with score `0 / 3`. With no gaps and no info, one line: "No problems: every requirement scored 3."
- **All requirements** is one `<details>` per category (summary: category, score / weight, problem count), open only when the category has a gap. Columns: ID, Requirement, State, Value, Score, Citation; every scored criterion, passing rows included. The state chip shows "✗ Fail" for a verified row that scores below 3, otherwise the evidence state. Nice-to-have tests are not rows; one line points to Problems (Info).
- A citation link sets `doc` and `sec` in the hash (keeping supplier, tab, filter, role and policy), and the citation viewer renders from them. A citation that does not match the PRD-04 pattern shows as plain text, never a link.
- The citation viewer is a native modal `<dialog>` outside the view panels: the page behind is inert and Tab stays inside it. It fetches `suppliers/<id>/<doc>` from the data folder and renders it with the built-in renderer (headings, paragraphs, flat lists, tables, emphasis; links show their label as plain text). `sec` highlights the heading whose number equals it exactly (`1.1` never matches `1.10`) down to the next heading of the same or a higher level. No such heading: the whole file shows with the note "Section §N is not in this file. Showing the whole file." A 404 shows "File not in packet"; any other failure names the path. Close, a scrim click or Escape push a hash without `doc`/`sec`, so Back reopens the viewer. Focus moves to Close on open and returns to the citation link on close (to the main content after a deep link or Back). An unknown supplier, or no supplier, opens no sheet.

### 4.5 Monitor

**Desktop.** The tier table is full width; the selected supplier's detail opens below it.

```
┌ TIER TABLE ───────────────────────────────────────────────────────────────┐
│ ID     Name   Comp.  Tier  DPPM    Escape  Repeat  Aging  OTD    Alerts   │
│ ACT-06 …      65.0   C ▲   1,240 w 22.4% b  4.0% g 0% g  96.1% g 1 ESCAL. │
│ ACT-02 …      85.0   A     1,480 w  0.0% g  0.0% g 0% g  97.4% g 1 ESCAL. │
│ ACT-01 …     100.0   A       180 g  0.0% g  0.0% g 0% g  99.0% g 0        │
└───────────────────────────────────────────────────────────────────────────┘
┌ ACT-02 p-CHART ──────────────────────────────┐ ┌ ALERTS ────────────────┐
│ UCL ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │ │ ● ACTIVE run7 M18      │
│ p̄  ──────────────────────────────────────── │ │   7 months above p̄     │
│ [baseline M1–M6]  ·  ·  ·  ·  ◯ ◯ ◯ ◯ ◯ ◯ ◯ │ │                        │
│ [Show as table]                              │ │ OPEN SCARS: none       │
└──────────────────────────────────────────────┘ └────────────────────────┘
```

The detail's actions column holds the disabled **Draft SCAR** button ("Arrives in v1.1") and a **← Today** link.

The detail reads, top to bottom: a **← Table** link (clears `active`), the header (commodity · M18 month, name and ID, tier and composite), the five M18 metrics, then the p-chart beside the alerts and open SCARs (stacked below 1100 px), then the actions row. At 759 px and below the table shows ID, Composite, Tier and Alerts only; opening a supplier hides the table and shows the detail with its full metrics, and **← Table** returns (#44).

The p-chart panel (#45) has a one-line text summary (p̄, the months above the UCL, the run spans), the chart and a word legend, and a **Show as table** toggle. Show as table is local state and is not in the hash; it resets when another supplier opens. The chart keeps a 600 px minimum width and scrolls sideways inside its panel below 760 px, so the page itself never scrolls sideways. The alerts panel reads `ALERTS (n)` (all alerts), then the Escalate line with its reasons as visible text (when the supplier escalates), then the list: active alerts first, then past ones newest first, each with an `ACTIVE` or `Past` word, the type label, the month and the engine's detail. `ucl` and `run7` rows link to their point (`month`); the others are plain text. An active `metric_bad` marks its metric cell "● Alert"; an over-60 SCAR row is marked as before.

### 4.6 Compare

```
[Cold plate · SI-CP-0007  3] [Power module · SI-PM-0012  1] …   (part picker pills)
┌ COLD PLATE · SI-CP-0007 · 3 BIDDERS ──────────────────────────────────────┐
│ Quality decides who is acceptable. Sourcing picks among them.             │
├ APPROVED ─────────────────┬ CONDITIONAL ─────────────┬────────────────────┤
│ Horizon Labs · SUP-09     │ Oscorp · SUP-07          │                    │
│ 94.0 · Senior signs       │ 82.6 · with conditions   │                    │
│ ▇▇▇▇▇▇▇▇▇ category bars % │ ▇▇▇▇▅▃▇▇▃ category bars %│                    │
│ Problems: none            │ RFI: 2.spc, 6.ramp_plan… │                    │
│ Open in Qualify ↗         │ Open in Qualify ↗        │                    │
├ NOT ACCEPTABLE ───────────┴──────────────────────────┴────────────────────┤
│ ✗ Frost Technotics · SUP-01 · 97.5 · Knockout: helium leak test  ↗        │
└───────────────────────────────────────────────────────────── Stark requirement sheet ↗ ┘
```

More than three acceptable bidders scroll horizontally inside the panel. At 390 px the columns stack.

With no `part` in the hash, or an unknown one (which also shows "Not found: part …"), Compare opens the part with the most bidders, then the lowest part number; every candidate counts, scored or not. Bidders that are not scored (NOT EXTRACTED, ENGINE ERROR) are listed in a `NOT SCORED (n)` band below NOT ACCEPTABLE with their Qualify status line; they never get a column or a place in the order (#108).

### 4.7 Standards

```
┌ POLICIES ─────────────────┐ ┌ QUALIFICATION · IMPORTANCE 1–5 ─────────────┐ ┌ IMPACT vs STARK REF v1 ┐
│ ● Stark Reference v1 (ro) │ │ 1 Quality system   ◀──●────▶ 5   15.0      │ │ 2 changes             │
│ ○ Cold-plate team v3      │ │ 4 Reliability tests◀────●──▶ 4   12.5      │ │ SUP-07 COND → NOT APP │
│ [+ New policy]            │ │ Pass marks: APPROVED [85] CONDITIONAL [70] │ │ ACT-04 B → C          │
│                           │ │ Knockouts: ☑ 1.cert_current ☑ 2.ctq_cpk …  │ │ [Save] [Share] [Export]│
│ REQUIREMENT SHEETS        │ │ MONITORING · weights, limits, cut-offs     │ │ [Reset to Stark Ref v1]│
│ SI-CP-0007 Cold plate     │ │ DPPM  30  Good ≤ 500  Bad > 2000          │ └───────────────────────┘
│ SI-QD-0003 Quick-disc.    │ │ …                                          │
│ SI-XX-0099 [Uploaded]     │ └────────────────────────────────────────────┘
│ [Upload requirement sheet]│
└───────────────────────────┘
```

- Opening a sheet replaces the editor column with the sheet viewer (header fields, CTQ and test limits, view-only).
- Upload opens the preview in the same column, with the parsed fields as inputs and the unmatched lines listed below. **Save** and **Cancel** sit at the bottom.
- At 1099 px and below the impact panel moves under the editor. At 390 px the policy and sheet list becomes a select above the content.
- As built in issue 109: the REQUIREMENT SHEETS block is a quiet line "Requirement sheets arrive in issue 110." until issue 110. Stark Reference v1 is tagged read-only and has no Delete; moving any control on it starts an unsaved draft with an empty name, and Save asks for one. Each saved policy has Delete, which turns into an inline "Delete <name>? [Delete] [Cancel]" in its row (focus on Cancel, Escape cancels). A shared link adds a row with "Save to this browser" and "Discard". Number fields are text inputs (`inputmode=decimal`) the engine validates; an error shows under its input with the engine's message. A slider rescores when it is released or on each arrow key. Under the impact panel: Save, Share, Export, Import (a `.json` file), Discard changes (only with a draft) and Reset to Stark Ref v1. At 759 px and below the select also carries the active row's Delete or Save to this browser.
- As built in issue 110: REQUIREMENT SHEETS lists every loaded built-in sheet as a link `SI-CP-0007 Cold plate`, sorted by part number; the open one is marked like the checked policy row, and a sheet that failed to load is listed with a "Couldn't load" badge and no link. A link sets `sheet` (keeping `role` and `policy`), and the viewer replaces the editor column: header facts (part number, name, revision, drawing, peak weekly demand, need-by weeks), the sheet's synthetic header line, a CTQ table (nominal, LSL, USL, unit as stored) and one table per test (measure, limit, Acceptance or Setup, with a Required or Optional tag). It has no edit control. The impact panel stays, and any draft policy is kept. **← Policy editor** or a policy row closes the sheet. An unknown part shows Not found with the editor link and any sheet load error. At 759 px and below a second select, "Requirement sheet" (first option "Policy editor"), replaces the list.

### 4.8 Eval

```
┌ FIRST COMPLETE RUN · claude-sonnet-5-5 · 2026-11-20 · skill abc1234 ──────┐
│ 94%  caught (34 of 36) PASS │ 3% false alarms PASS │ 34/36 decisions │ 97% cited │
├ PER WORLD ────────────────────────────────────────────────────────────────┤
│ World  Gaps  Caught  Partial  Missed  False alarms  Decisions agree      │
│ 101 … 104 rows · demo world row · hold-out traps row                      │
├ RUNS ─────────────────────────────────────────────────────────────────────┤
│ 1 Sonnet 101–104 (headline) · 2 Opus 101–104 (comparison) · 3 re-test …   │
├ EVERY MISS, PARTIAL AND FALSE ALARM (run 1) ───────────────────────────────┤
│ 102 SUP-03 2.ctq_cpk  expected verified 0.94  found assumed —       doc ↗ │
└───────────────────────── Full write-up: docs/EVAL.md ↗ ───────────────────┘
```

With no published run the panel reads "No published run yet" and the method in two sentences, with no numbers.

- As built in issue 111: `data/eval.json` is `{ runs: [ … ] }`, each entry one `node agent/eval.mjs --json` output parsed as is, oldest first; no publish script, #36 commits the file. The view reads it at startup with the other data files: a 404 is "No published run yet"; any other load failure, or a file that doesn't have the report's shape, is an error panel naming `data/eval.json`, never the empty state and never a partial table. The headline is the first run with `headline_complete` true on `claude-sonnet-5-5` and no Opus model; failing that, the first Sonnet run that scored any of 101–104, with every verdict INCOMPLETE and an "Incomplete: world(s) … refused or absent" line; with no Sonnet run, a quiet line and no headline or per-world table (decision 138). The four stats show the file's rate string, its counts as "34 of 36" and, for catch and false alarm, the PRD-04 target with PASS, FAIL or INCOMPLETE in words; decision agreement and citation say "no target" (decision 144); a zero denominator reads "n/a". The per-world table is always the headline run's (decision 139): one row per scored world of 101–104, then the demo world and hold-out traps in their own body below a divider (`not run` when absent); re-test worlds are not in it (decision 141). The run list shows every run in file order: label (Sonnet, Opus comparison, Re-test), run id, models, the date from the run id or "date not recorded" (decision 137), skill SHA, worlds, a Headline badge and an Incomplete badge for a run that scored only part of 101–104. Each run is a link that sets `run`, which changes only the miss list; an unpublished `run` falls back to the headline run with a status line. The miss list has every miss, partial and false alarm of the selected run, all four groups, with expected and found state and value as the file has them. Its Document link opens the citation viewer on `world` + `supplier` + `doc`/`sec` from the answer key's `expected_citation` (added to `eval.mjs` miss rows in issue 111, decision 143); a row with none opens the packet's ten-file list, whose links open each file. Closing the viewer returns to the Eval page and the miss row's link (decision 142). The footer and the miss list link to `../docs/EVAL.md` in every state.

### 4.9 Responsive

**Tablet (760–1099 px).** The Qualify sidebar collapses to a horizontal scroller of queue cards above the detail. The Drafts sub-tab and citation viewer stack. Two-column views (Today, Monitor detail, Standards) stack their side panels below the main column.

**Phone (390 px).**
- One column. The queue is the first screen in Qualify; opening a supplier replaces it, and a "← Queue" link returns.
- The tabs scroll horizontally in the sticky bar. The header wraps the policy chip and *Viewing as* switch onto a second line.
- The citation viewer opens as a full-screen sheet with a close button. Focus moves into it and returns on close.
- In the Monitor tier table only ID, tier, composite and alerts stay visible; tapping a row opens its full metrics.
- The p-chart keeps a 24 px hit area per point by keeping a 600 px minimum width and scrolling sideways inside its panel, and keeps "Show as table".
- Compare columns stack, and so do the Eval tables, which scroll horizontally inside their panel.

Gutters come from `--gutter` (48 / 28 / 20 px). Values in every layout sketch are illustrative; the engine and `data/eval.json` supply the real ones.

## 5. Color semantics

| Meaning | Token | Glyph + label |
|---|---|---|
| Interactive (links, buttons, focus, selected) | `--cyan` | — |
| `verified` · pass · Good band | `--ok` (new, `#7fd7a8`) | ✓ Verified · Good |
| `assumed` · Watch band · alert · CONDITIONAL | `--amber` | ~ Assumed · Watch · ● Alert |
| `missing` · fail · Bad band · NOT APPROVED · knockout | `--bad` (new, `#ff9b9b`) | ? Missing · ✗ Fail · Bad · ★ Knockout |
| APPROVED | `--ok` | ✓ APPROVED |
| `info` (nice-to-have) | `--muted` | i Info |
| Tier A / B / C / D | `--ok` / `--ink` / `--amber` / `--bad` | letter always shown |
| Active policy: Stark Reference v1 / custom | `--cyan` / `--amber` | policy name + version always shown; "Unsaved changes" or "Shared, not saved" in words |
| *You can sign* / *Senior signs* tag | `--ok` / `--muted` | text always present |
| *Entered by hand* / *Uploaded* tag | `--muted` | text always present |
| Disabled control (Draft SCAR until v1.1) | `--muted`, 0.45 opacity | label plus the reason ("Arrives in v1.1") |

Measured contrast on `--bg` (`#08111b`): `--ok` 11.0, `--bad` 9.4, `--amber` 13.2, `--cyan` 11.7, `--muted` 8.2 (all ≥ 7:1). Borders `--line` are decoration only (1.6:1). Any border that identifies a control (inputs, the pressed pill) uses `--line-active` (4.1:1).

## 6. Type and numbers

| Use | Style |
|---|---|
| View title | `h2` from tokens (32 px) |
| Panel title | `.eyebrow` (11 px mono, uppercase, cyan) |
| Body and table text | 12–13 px `--sans` |
| Big score | `.stats strong` (42 px mono) |
| Badges | 11 px mono, uppercase (tokens' 8 px is raised to meet DS-NFR-02) |

| Value | Format | Example |
|---|---|---|
| Rubric total, category score | 1 decimal | `82.6`, `2.2 / 10` |
| Criterion score | integer | `1` |
| Cpk | 2 decimals | `1.12` |
| Gage R&R, escape, repeat NC, aging, OTD | 1 decimal + `%` | `24.0%` |
| DPPM | integer, thousands separator | `1,480` |
| p, UCL | 4 decimals | `0.0016` |
| Composite | 1 decimal | `85.0` |
| Dates | `YYYY-MM-DD`; months `YYYY-MM` or `M18` | |
| Null | `—` with an accessible name stating why | |

All numbers use `--mono` and `font-variant-numeric: tabular-nums`, right-aligned in tables.

A verified Cpk ≥ 1.67 shows an `excellent` label beside its value (display only; the score stays 3, UIQ-FR-19). Criterion values: booleans `Yes` / `No`; enums capitalised (`Medium`); other values as the engine passes them.

## 7. Component inventory

| Component | Token class | Used by | Notes |
|---|---|---|---|
| App header with view tabs | `.tabs` | every view | `role=tablist`; arrow keys switch; six tabs (§4.1) |
| Synthetic-data badge | `.badge` + `.live-dot` | every view | always visible |
| Policy chip | `.policy-chip` (new) | every view | §4.1; opens Standards |
| *Viewing as* switch | `.pills` pair, `role=radiogroup` | every view | OVR-FR-12; announces the role |
| Role tag | `.badge` | UIQ-FR-18, UIT-FR-02 | "You can sign" / "Senior signs" |
| Source tag | `.badge` muted | UIQ-FR-16, UIS-FR-11 | "Entered by hand" / "Uploaded" |
| Count tile | `.metric` | UIT-FR-04 | label + mono number; tiles are not buttons |
| Triage item | `.list-card` | UIT-FR-02, -03 | glyph + ID + name + value; opens its home view |
| Detail sub-tabs | `.tabs` | UIQ-FR-14 | `role=tablist` inside the detail; state in `tab` hash key |
| Headline values | `.metrics` | UIQ-FR-04 | four `.metric` cells |
| Part picker | `.pills` | UIC-FR-01 | bidder count in `span` |
| Bidder column | `.panel` column + mini `.bar` | UIC-FR-05 | decision badge first; "Open in Qualify ↗" |
| Not-acceptable row | list row | UIC-FR-04 | `--bad` glyph + reason text |
| Importance slider | `input[type=range]` 1–5 | UIS-FR-02 | `aria-valuetext` "Reliability tests, importance 4, weight 12.5" |
| Number field | `input[type=number]` + label | UIS-FR-03, -04 | error text below the input, linked with `aria-describedby` |
| Knockout switch | `input[type=checkbox]` + label | UIS-FR-03 | label is the requirement name, the criterion ID in mono |
| Impact panel | `.feature-card` | UIS-FR-10 | old → new lines; `aria-live=polite` |
| In-page confirm | `.panel` inline | UIS-FR-09, UIQ-FR-16 | never a browser `confirm()` dialog |
| Sheet viewer | `table` | UIS-FR-11 | view-only; no input elements |
| Upload preview | form + `table` | UIS-FR-12 | parsed fields as inputs, unmatched lines listed below |
| Hand-entry checklist | `table` of rows: state radios, typed input, text inputs | UIQ-FR-15 | generated from `app/rubric.js`; errors on the row |
| Live score panel | `.metrics` sticky | UIQ-FR-15 | same headline cells as the detail |
| Eval stat | `.stats` | UIE-FR-02 | value, counts and PASS / FAIL / INCOMPLETE in words |
| Run list | `ol` of links | UIE-FR-04 | headline run marked "Headline"; the selected run `aria-current` |
| Miss row | table row | UIE-FR-05, -06 | expected vs found; "doc ↗" opens the citation viewer |
| Queue card | `.list-card` | UIQ-FR-02 | `aria-pressed` when selected |
| Filter pills | `.pills` | UIQ-FR-03 | counts in `span` |
| Decision badge | `.badge` + state color | UIQ-FR-02/04 | text always present |
| Routing chip | `.badge` | UIQ-FR-02/04 | "Junior SQE" / "Senior SQE" |
| Knockout banner | `.panel`, `--bad` border | UIQ-FR-05 | `role=alert` on first render only |
| Category bar | new `.bar` | UIQ-FR-06 | `<meter>` per category, `value` the engine category score, `max` its policy weight; no colour threshold. Label "6 Capacity & ramp, 2.2 of 10"; weight 0 shows the text "weight 0" and no meter |
| Gap row | table row | UIQ-FR-07 | glyph + state label + citation link |
| State chip | `.badge` + glyph | UIQ-FR-08 | |
| Criterion table | `table` | UIQ-FR-08 | `<details>` per category |
| Citation link | `.text-link` | UIQ-FR-07/08 | text `file §n ↗`; updates the hash |
| Citation viewer | native `<dialog class="sheet">`, `::backdrop` scrim (`--scrim`); full-screen at 759 px and below | UIQ-FR-09 | cited section has `--selected` background and `--cyan` left rule, led by an sr-only "Cited section:" label |
| Drafts panel | `.panel` | UIQ-FR-10 | the draft label as `.eyebrow.muted`; "Copy" announces "Copied" via `aria-live` |
| Tier table | `table` | UIM-FR-02 | sortable is not required; fixed order; named by its eyebrow (`aria-labelledby`), the ID cell is a row header (`th scope=row`); the open-SCARs table likewise |
| Metric cell | `td.num` + band label | UIM-FR-05 | `1,480 Watch` |
| Escalate flag | `.badge` amber | UIM-FR-04 | reasons in accessible name |
| p-chart | inline SVG | UIM-FR-06/07 | points are `<circle tabindex=0>` with `aria-label`; the hit circle (r 15) sits over a decorative `aria-hidden` mark; the tooltip is hidden from AT (the label says the same) and Escape hides it |
| Chart table toggle | `.subtle-button` | UIM-FR-08 | |
| Alert row | list item + `.dot` | UIM-FR-09 | |
| SCAR row | table row | UIM-FR-10 | over 60 days: `--bad` text + "Over 60 days" |
| Error / empty panel | `.panel` | UIQ-FR-12, UIM-FR-12, UIT-FR-07/08, UIE-FR-07 | message + path or row |
| Draft SCAR (disabled) | `.button` disabled | UIM-FR-13 | "Arrives in v1.1" beside it |

## 8. Keyboard

- Tab order: brand → policy chip → *Viewing as* → view tabs → the view's main list → its detail → footer. A skip link goes to the main content.
- Enter activates links (citation links, row ID links, alert links, Today cards, Compare part pills, Eval run links); Enter or Space activates buttons (queue cards, filter pills, tabs). A table row's pointer click is a convenience; its ID link is the keyboard path (decision 172).
- In the p-chart, arrows move between points, and Home / End go to M1 / M18 (the first / last plotted point when a month has no receipts). Enter or Space on a chart point sets `month`; arrows only move focus.
- Escape closes the citation viewer, and focus returns to the citation link. Tab stays inside the sheet while it is open.
- Sliders move one step with arrow keys; Home / End go to 1 / 5.
- Deletes confirm in the page; focus moves to the confirm and back on cancel.
- Every hash change from a click is also reachable by keyboard.
- After Back, Forward or a link (the brand, the policy chip) changes the view, focus moves to the main content and the change is announced; tab clicks and the role switch keep focus where it is.

## 9. Accessibility checklist (manual, per view, at 1280 px and 390 px)

- [ ] Every interactive element has a visible focus indicator (cyan, 2 px, offset 4 px).
- [ ] Every interactive target is ≥ 24 × 24 px.
- [ ] Every state is readable with color filters off: glyph + label present.
- [ ] The page passes keyboard-only operation of the demo script.
- [ ] Screen reader (VoiceOver): queue cards, decision, routing reasons, gap rows, chart points, policy edits (via the impact panel) and eval stats are announced with their values.
- [ ] Zoom to 200%: no content lost, no horizontal scroll at 390 px.
- [ ] `prefers-reduced-motion`: no transitions.

## 10. Acceptance criteria

- [ ] DS-AC-01: Every component named in PRD-05, PRD-06 and PRD-10…PRD-13 has a row in §7. *(proves DS-FR-05)*
- [ ] DS-AC-02: The §9 checklist passes for all six views at both widths. *(proves DS-NFR-01…-03, OVR-NFR-05)*
- [ ] DS-AC-04: Every hash in §4.2 opens its screen from a fresh load, and an unknown value falls back to the view's default. *(proves DS-FR-06, -07)*
- [ ] DS-AC-03: No hex color literal in `app/` outside `design/tokens.css`. *(proves DS-FR-01)*

## 11. Changelog

| Date | Change |
|---|---|
| 2026-11-13 | M6 review follow-ups: §4.4 records instant centred focus scrolling for issue 137, preventing fast Tab/Shift+Tab from leaving a field off-screen. Historical rows and PRD acceptance boxes unchanged. |
| 2026-11-13 | Issue 140 cleanup: §4.4 removes the obsolete sticky-panel sentence and retains the as-built headline-only strip, static gaps/lists and phone behavior. No PRD acceptance boxes or historical changelog rows changed. |
| 2026-11-13 | Issue 46: §8 narrows "Enter or Space activates cards, pills, rows and citation links" to Enter for links and Enter or Space for buttons; a row's ID link is its keyboard path (decision 172). §7 Tier table row: the Monitor tables are named and their ID cells are row headers (decision 173). §4.3 records Today's single announcement and "No counts" line on a suppliers.json failure (decision 178). §4.1 describes the sticky bar by its rows instead of a fixed height, and two wireframe lines reach the right border. §9 and §10 boxes stay open for the VoiceOver pass. |
| 2026-11-13 | Issue 47 lead review: §4.1 records the separate sticky badge row above tabs, 96 px focus scroll padding, citation-viewer identification and paper layout. Decisions 190–193 record look and export scope; historical rows unchanged. |
| 2026-11-13 | Issue 77: §4.4 records the built + New supplier entry (queue-head buttons, category checklist, a sticky headline strip with the gaps and lists static under it, static at 759 px and below) and the Edit / Export / Delete actions on a hand-entered supplier. |
| 2026-11-13 | Issue 111: §4.2 adds the `world` key and lets `supplier` into Eval (a world packet, never "Not found"); §4.8 records the built Eval view (headline rule, per-world table, run list, miss list with packet links and the ten-file list, empty and error states); §7 Run list row is an `ol` of links with the headline run marked and the selected run `aria-current`. |
| 2026-11-13 | Issue 110: §4.7 records the built requirement sheet list and viewer (part-number links in the policies panel, a "Requirement sheet" select at 759 px and below, the view-only viewer in the editor column with the impact panel kept, Not found for an unknown part). |
| 2026-11-12 | Issue 109: §4.1 states the policy precedence and that a draft is amber with "Unsaved changes"; §4.2 `policy` is a `p1.` base64url token (PRD-12 §5), so the example is a real token; §4.7 records the built layout (sheets stub until issue 110, inline delete confirm, shared row, Import, number fields validated by the engine). |
| 2026-11-12 | #108: §4.6 adds the default part rule (most bidders, then part number; an unknown `part` shows Not found) and the `NOT SCORED` band for unscored bidders. |
| 2026-11-12 | #107: §4.3 count tiles are not links and ignore *Viewing as*; unscored candidates appear as an "N not scored" note, not as items. |
| 2026-11-12 | #112: §4.4 adds the detail header sign line (`You may sign this` / `Needs a senior SQE`), shown in both roles; the card tags stay Junior-only. |
| 2026-11-12 | #45: §4.2 `month` focuses the point (the row in table mode), nothing when the month has no point. §4.5 p-chart panel (summary, legend, Show as table as local state, sideways scroll below 760 px) and alerts panel contents (`ALERTS (n)`, the Escalate line, the list). §4.9 the chart keeps its hit area by scrolling, not shrinking. §7 p-chart row: hit circle r 15 over a decorative mark, tooltip hidden from AT. §8 Enter or Space sets `month`; Home / End go to the first / last plotted point. No new hash key. |
| 2026-11-12 | #42: §4.4 states the shipped citation viewer: native `<dialog>`, `doc`/`sec` open it and closing pushes a hash without them, exact section-number match with a not-found note, "File not in packet" on a 404, focus to Close and back to the link. §7 row: `<dialog>` sheet and the sr-only "Cited section" label. §8: Tab stays inside the sheet. Adds token `--scrim` (DS-FR-01). |
| 2026-11-12 | #41: §4.4 sketch row reads "~ Assumed  SPC  Yes" (the word is "Assumed", not "Claimed"); bullets for the Problems groups and rows, the All requirements table (open only with gaps, Fail chip for a verified row below 3) and citation links that set `doc`/`sec`. §6 adds the Cpk `excellent` label (verified only, display only), Yes/No booleans and capitalised enums. |
| 2026-11-12 | #40: §4.4 sketch and bullets: the knockout banner says "assumed", not "claimed", and shows when the engine lists a knockout; detail tabs are automatic-activation with Problems as the default (no `tab` key); the part number comes from the requirement sheet. §7 Category bar row: `<meter>` with value = score, max = weight, no colour threshold. |
| 2026-11-12 | #39: §4.4 places unscored candidates (not extracted, engine error) after the scored cards, only under All, and keeps a selected supplier that the filter hides selected, with a note and Show all. |
| 2026-11-12 | #38: §4.2 states the key formats and the normalization rules (foreign and invalid keys dropped, URL rewritten in place, case folded, unknown ID shows "Not found", `role` and `policy` carry across tabs). The issue's `#criterion=` key is superseded: §4.2 has no such key. §8 adds focus after Back or Forward. |
| 2026-11-11 | #37: the policy chip has no caret (it is a link to Standards, not a menu), so the §4.1 sketch drops the ▾ after the policy name, and draws *Viewing as* as the two-option `[Junior|Senior]` switch it is. |
| 2026-11-11 | #76: six views from the approved walk-through. App header with policy chip and *Viewing as* switch (§4.1, DS-FR-06), one hash scheme (§4.2, DS-FR-07), layouts for Today, Qualify sub-tabs and + New supplier, Compare, Standards and Eval (§4.3–4.8), responsive rules for all views (§4.9), new color rows and components. |
| 2026-11-08 | First draft. Adds tokens `--ok` and `--bad`; raises the badge size to 11 px. |
