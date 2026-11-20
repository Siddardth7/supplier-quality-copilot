# PRD-05 — Workbench: Qualify view

| Field | Value |
|---|---|
| Status | Approved |
| Owner | Sid (SME) |
| Release | v1.0 |
| Milestone | v1.0 · M5 Workbench UI |
| ID prefix | `UIQ` |
| Specs referenced | `docs/product/DESIGN-SPEC.md` (components, layout, a11y), PRD-01 output shape, PRD-04 extraction shape, PRD-12 (active policy, requirement sheets) |
| Last updated | 2026-11-19 |

## 1. Problem

The engine's output is a JSON object. An SQE needs to see the queue, open a supplier, and understand in seconds why it got its decision and who signs. They also need to check any claim against the source document and send the RFI. This must work in an interview, on a laptop or on a phone, from a link. The SQE must also be able to qualify a supplier that isn't in the dataset, by hand, with no AI.

## 2. Users and jobs

| Persona | Job to be done | How this view helps |
|---|---|---|
| Junior SQE | Work the queue; sign off what they're allowed to | *Viewing as Junior* marks every card they may sign; routing reason on every card |
| Senior SQE | Check the hard ones fast | Knockouts and problems first, each with a one-click citation |
| SQE with a new supplier | Qualify a supplier not in the dataset | **+ New supplier**: fill the checklist by hand, the engine scores it live |
| Interview panel | Follow the demo | Deep links to any supplier and any citation |

**User stories**
- US1: As a junior, I switch *Viewing as* to Junior and see which suppliers I can sign off and which go to a senior.
- US2: As a senior, I open SUP-07 and see the decision, the routing reason, the knockouts and every problem, without scrolling past criteria that passed.
- US3: As either, I click a citation and see the cited section of the source document.
- US4: As either, I copy the drafted RFI and know it's a draft.
- US5: As a presenter, I paste a link that opens straight onto SUP-07, or onto one of its citations.
- US6: As an SQE, I enter a new supplier by hand for a Stark part and watch its score, decision and routing update as I fill the checklist.

## 3. Goals and non-goals

**Goals**
- G1: Demo steps 1–4 (`ROADMAP.md`) run from this view alone.
- G2: Every number on screen comes from the engine under the active policy (PRD-00 OVR-FR-04).
- G3: Works at 390 px and by keyboard (OVR-NFR-05).

**Non-goals**
- NG1: Editing a dataset supplier's evidence, overriding scores or recording a sign-off.
- NG2: Sending email. The RFI is copied, not sent.
- NG3: Eval results inline. They are in the Eval view (PRD-13).
- NG4: AI anywhere in hand entry. v2.0 fills the same checklist from an uploaded packet with the agent.

## 4. Requirements

**Queue and detail**

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| UIQ-FR-01 | On load, the app must read `data/suppliers.json`, each `data/extracted/<id>.json` and the hand-entered suppliers saved in the browser. It must run the engine with `as_of` and the active policy (PRD-12), and render from the engine output only | Must | manual check + review |
| UIQ-FR-02 | The **queue** must list every candidate as a card: ID, name, commodity, total, decision badge, routing (Junior / Senior) and, when present, the **Entered by hand** tag. A NOT APPROVED card also shows its reason: the failed knockout names (`Knockout failed: <names>`), or `Below pass mark N` when no knockout failed, the same text as Compare. Default order is NOT APPROVED, then CONDITIONAL, then APPROVED, and by ID within each | Must | manual check |
| UIQ-FR-03 | The queue must offer filter pills (All · Junior · Senior · NOT APPROVED · CONDITIONAL · APPROVED), each with a count | Must | manual check |
| UIQ-FR-04 | The **detail header** must show ID, name, part, commodity, risk class, the policy that scored it ("Scored with: <policy name> v<version>"), and four headline values: total (1 decimal), decision, who signs with every routing reason, and the problem count plus the info count | Must | manual check |
| UIQ-FR-05 | When a knockout fails or is assumed, a knockout banner must name it above everything else in the detail | Must | manual check (SUP-01, SUP-06) |
| UIQ-FR-06 | **Category bars** must show each category's score against its weight under the active policy | Must | manual check |
| UIQ-FR-07 | The **problem list** must show every gap grouped fail → assumed → missing → info, each with requirement text, value and citation. The fail group is headed "Fail or partial": a verified row reads ✗ Fail at score 0 and ◐ Partial at score 1–2 | Must | manual check |
| UIQ-FR-08 | The **criterion table** must show every criterion grouped by category: ID, requirement, state chip, value, score, citation. The state chip uses the same words as UIQ-FR-07 (✗ Fail at 0, ◐ Partial at 1–2, else the evidence state). It is collapsed by default to the categories that have gaps | Must | manual check |
| UIQ-FR-09 | Clicking a citation must open the **citation viewer** with the cited packet file rendered and the cited section highlighted and scrolled into view. Numbers written with more than 3 decimals show rounded to 3, with a one-line note saying so; the packet files themselves are unchanged (issue 163) | Must | manual check |
| UIQ-FR-10 | The **drafts panel** must show the RFI email and the audit plan with the draft label, plus a "Copy" button for each. Text is the agent's, shown verbatim; the engine's lists are shown beside it. Where the clipboard is unavailable the text is selected instead | Must | manual check |
| UIQ-FR-11 | State must live in the URL hash (DESIGN-SPEC §4.2): `#view=qualify&supplier=<id>` opens a supplier, and `&doc=<file>&sec=<n>` also opens the citation viewer. Back and forward must restore state | Must | manual check |
| UIQ-FR-12 | Error and empty states: a failed fetch names the path; an unknown supplier ID in the hash shows "Not found" and the queue; an Eval `world` + `supplier` pair not in the data shows "Not found" (PRD-13 UIE-FR-06); a supplier without an extraction shows "Not extracted" and no score; an engine error shows its message; a cited file missing from the packet (HTTP 404 for the packet path) shows "File not in packet"; any other failure to fetch a packet file names the path as "Could not load" | Must | manual check per case |
| UIQ-FR-13 | A persistent badge must read "Synthetic data. Fictional suppliers.", and the footer must read "Fan-made demo. Not affiliated with Marvel." | Must | manual check |
| UIQ-FR-14 | Below the header, the detail must offer four sub-tabs: **Problems** (UIQ-FR-07), **Categories** (UIQ-FR-06), **All requirements** (UIQ-FR-08) and **Drafts** (UIQ-FR-10). It opens on Problems; the knockout banner and headline values stay above the sub-tabs | Must | manual check |
| UIQ-FR-18 | With *Viewing as* Junior (DESIGN-SPEC §4.1), every card the Junior may sign must carry a **You can sign** tag and every Senior-routed card a muted **Senior signs** tag. The detail header reads "You may sign this" or "Needs a senior SQE". With *Viewing as* Senior, every card is signable and no tag shows. Filters and counts don't change. The detail header line shows in both roles (a Senior may sign everything) | Must | manual check |
| UIQ-FR-19 | A Cpk of 1.67 or more must show an **excellent** label beside its value. The score is unchanged (still 3) | Must | manual check |
| UIQ-FR-20 | The detail header must link **Stark requirement sheet ↗** to the part's sheet in Standards (`#view=standards&sheet=<part number>`) | Must | manual check |
| UIQ-NFR-01 | Packet markdown must be rendered by a small built-in renderer (headings, paragraphs, lists, tables, emphasis). No library | Must | review |
| UIQ-NFR-02 | First render must take under 1 s on a mid-range laptop with every candidate | Should | manual check |

**+ New supplier (#77)**

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| UIQ-FR-15 | **+ New supplier** must open a two-step entry. Step 1 takes the supplier name and a Stark part picked from the requirement sheets (built-in and uploaded, PRD-12). The commodity and risk class follow from the sheet. Step 2 is a checklist of every criterion that applies to that commodity, generated from `app/rubric.js` with no criterion, test or commodity ID in UI code (QUAL-NFR-05). Each row has a state (proven, claimed, missing), a value input typed by the criterion, "where I found it" (required when proven) and an optional note. Each category-4 test shows Stark's limit from the sheet. A live panel shows the engine's total, decision, routing, gaps and RFI items as rows change; an engine error is shown on the row it names | Must | unit test (fills the form) + manual check |
| UIQ-FR-16 | Saving must store the supplier in the browser with the next free ID (`NEW-01`, `NEW-02`, …). It joins the queue, Today and Compare with the **Entered by hand** tag, rescored under the active policy like any candidate. It can be edited, deleted (confirmed in the page), exported and imported as JSON. If storage is blocked, scoring still works and a note reads "Can't save in this browser" | Must | manual check (incl. a private window) |
| UIQ-FR-17 | The Drafts sub-tab for a hand-entered supplier must list the engine's RFI items and audit focus, with no email text | Must | manual check |

**Upload packet in + New supplier (issue 172, rules reader, no AI)**

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| UIQ-FR-21 | In + New supplier step 2, **Upload packet** (button, drop, and **Use the sample packet**) loads Markdown packet files named like `data/suppliers/<id>/*.md`. UTF-8 only; at most 64 KB per file and 256 KB per packet; names must be the ten packet file names. A refused file is listed with its reason and never silently dropped; unmatched numbered sections and unnumbered headings that name an applicable criterion are listed; a packet that matches nothing leaves the form untouched. The help text states: the reader only reads packets in this format; real PDFs, scans and free-form packets need the AI reader (planned) | Must | unit test + manual check |
| UIQ-FR-22 | A pure, rules-based reader (no AI, no network) fills every checklist row from the files: a section titled like the requirement with a recorded result is Proven (value in the engine's type, `where` = `<file> §<section>`); a matching section with no result is Claimed (note quotes the sentence, no value); no matching section is Missing. The reader parses only plain body lines (never headings, quotes, tables or code) and only the first recorded-result line of a section. A nested checklist heading owns its evidence, while ordinary detail headings remain part of the parent criterion. Boolean fallback requires recorded or demonstrated result wording and skips descriptions of possible outcomes. "Proven" means the packet records a result, not independent proof, and the UI says so. A result the reader cannot read as the row's type, a second matching section, more than one result line in a section, carry a visible **Check** flag. A "true" next to a "does not meet" line becomes Claimed with no value and a visible **Check** flag; nothing is guessed. Repeated section numbers in one file make each affected row Claimed with no value. The citation is retained with a Check flag asking for renumbering. Matched sections with this flag stay out of Unmatched content. Every row stays editable, a person confirms before Save, and scores come only from `evaluate()` | Must | unit test |
| UIQ-FR-23 | Saving stores the accepted packet files with the hand-entered record (`packet` in `sqc-manual/1`, optional); Export carries them, Import validates and restores a deep-equal record, Delete removes them; blocked or full storage shows the existing "Can't save in this browser" note and still scores | Must | unit test + manual check |
| UIQ-FR-24 | For a hand-entered supplier with a saved packet, a citation `<file> §<section>` opens that uploaded file in the citation viewer (same renderer, same escaping, same cited-section highlight), not `data/suppliers/<id>/`. A repeated section number is ambiguous and flagged on the checklist before Save | Must | unit test + manual check |
| UIQ-NFR-03 | Packet text is untrusted: it is escaped everywhere it is shown; the reader measured on every shipped packet with an answer key agrees on state, value and citation (target 100% on the shipped format, every disagreement listed in the PR) | Must | unit test |

## 5. Interfaces

| Input | Shape |
|---|---|
| `data/suppliers.json` | PRD-03 §5 |
| `data/extracted/<id>.json` | PRD-04 §5 |
| `data/suppliers/<id>/<file>.md` | Fetched on demand by the citation viewer. Dev world: copied from `data/samples/` by `scripts/dev-world.mjs` |
| `data/samples/brand-corporation/*.md` | The demo packet for + New supplier (issue 172): fetched only by the **Use the sample packet** button, never listed in the queue. Its `README.md` is not fetched |
| `data/requirements/<commodity>.json` and uploaded sheets | PRD-12 §5. Loaded at startup, one per distinct candidate or active-supplier commodity (issue 110, so Standards lists every built-in sheet); the detail header's part number and the sheet link (UIQ-FR-20) come from the commodity's sheet `part_no` (the `suppliers.json` `part` is descriptive text) |
| Engine | `evaluate(extraction, { as_of, policy })` (PRD-01 §5) |

**Hand-entered supplier record** (`sqc-manual/1`, stored in the browser and exported as JSON). It is not a PRD-04 extraction: "where I found it" is free text or, when the packet reader filled the row, a `file §section` citation, and there are no agent drafts. The optional `packet` holds the accepted uploaded files exactly as decoded (UIQ-FR-23); a record without it is byte-identical to one saved before issue 172, and the schema string is unchanged.

```json
{ "schema": "sqc-manual/1", "supplier_id": "NEW-01", "name": "…", "part_no": "SI-CP-0007",
  "commodity": "cold_plate", "saved_at": "2026-11-11",
  "criteria": [ { "id": "2.ctq_cpk", "state": "verified", "value": 1.41, "where": "capability study, p. 4", "note": null } ],
  "packet": { "files": [ { "name": "capability_study.md", "text": "> Synthetic document for a demo. …" } ] } }
```

The app turns each record into the engine's input (`state`, `value`) and scores it exactly like an extraction.

**Hash keys** (full table in DESIGN-SPEC §4.2)

| Key | Example | Effect |
|---|---|---|
| `view` | `#view=qualify` | Qualify view, queue only |
| `supplier` | `#view=qualify&supplier=SUP-07` | Supplier detail open |
| `tab` | `&tab=drafts` | Detail sub-tab (problems, categories, requirements, drafts) |
| `doc`, `sec` | `&doc=capability_study.md&sec=2` | Plus the citation viewer on that section |
| `filter` | `&filter=junior` | Queue filter |
| `new` | `#view=qualify&new=1` | + New supplier entry open; with `supplier=NEW-01` it edits that hand-entered record |

The app fetches data from `../data/`, so the site is served from the repo root (PRD-07).

Layout and components are in [DESIGN-SPEC](DESIGN-SPEC.md).

## 6. Acceptance criteria

The demo world is chosen by #74. These checks name each demo supplier's story target (decision and routing). The exact totals are added once #74 fixes the seed. The `RUBRIC.md` SUP-07 worked example (82.6) stays an engine test fixture.

- [ ] UIQ-AC-01: Demo step 1: the queue shows every candidate in the demo world with its decision and routing, in severity order, with correct filter counts. *(proves UIQ-FR-01, -02, -03)*
- [ ] UIQ-AC-02: Demo step 2: `#view=qualify&supplier=SUP-07` shows CONDITIONAL with its fails, claimed and missing items, all cited. A citation click opens the cited section. *(proves UIQ-FR-04, -06…-09, -11, -14)*
- [ ] UIQ-AC-03: Demo step 3: SUP-07 shows "Senior SQE: CONDITIONAL; High-risk commodity", and SUP-04 shows "Junior SQE". Viewing as Junior, only SUP-04's card reads "You can sign". *(proves UIQ-FR-04, -18)*
- [ ] UIQ-AC-04: Demo step 4: SUP-07's RFI is shown with the draft label and copies to the clipboard. *(proves UIQ-FR-10)*
- [ ] UIQ-AC-05: SUP-01 and SUP-06 show the knockout banner (failed and assumed respectively). *(proves UIQ-FR-05)*
- [ ] UIQ-AC-06: Each error state in UIQ-FR-12 is triggered by hand and shows its message. *(proves UIQ-FR-12)*
- [ ] UIQ-AC-07: Every screen element in the DESIGN-SPEC Qualify layout traces to a UIQ requirement. *(proves G1)*
- [ ] UIQ-AC-08: Entering the `RUBRIC.md` SUP-07 worked example by hand gives 82.6, CONDITIONAL, Senior (CONDITIONAL; High-risk commodity). The test fills the form programmatically and reads the panel. *(proves UIQ-FR-15)*
- [ ] UIQ-AC-09: The checklist for each of the 8 commodities lists exactly the criteria the engine expects (test against `app/rubric.js`). A grep finds no criterion or test ID in the form code. *(proves UIQ-FR-15)*
- [ ] UIQ-AC-10: Changing the active policy rescores hand-entered suppliers too. Reload keeps them. Export → delete → import restores a deep-equal record. With storage blocked, scoring still works and the note shows. *(proves UIQ-FR-16)*
- [ ] UIQ-AC-11: Proven with no "where I found it" is blocked inline. A bad number or date shows the engine's error on that row. *(proves UIQ-FR-15)*
- [ ] UIQ-AC-12: A Cpk of 1.67 or more shows "excellent" and still scores 3. The sheet link opens the part in Standards. *(proves UIQ-FR-19, -20)*
- [ ] UIQ-AC-13: `node scripts/reader-accuracy.mjs` reports 1440/1440 state, value and citation and 45/45 evaluation matches on worlds 93 and 101-104, and prints the extraction comparison with its disagreements. *(proves UIQ-FR-22, UIQ-NFR-03)*
- [ ] UIQ-AC-14: The Brand Corporation sample packet, loaded in + New supplier for SI-CP-0007, reads to the expected mix and the engine shows its score, CONDITIONAL, the assumed knockout, routing, RFI items and audit focus; Save adds it to Qualify, Today and Compare tagged **Entered by hand**; reload keeps it. *(proves UIQ-FR-21, -22, -23)*
- [ ] UIQ-AC-15: A non-UTF-8 file, an oversized file, a wrong file name and an empty file are each refused with a named reason; an unmatched section is listed; a packet that matches nothing changes nothing; a packet containing HTML is shown inert. *(proves UIQ-FR-21, UIQ-NFR-03)*
- [ ] UIQ-AC-16: Export, delete, import restores a deep-equal record including its packet; with storage blocked the supplier still scores and the note shows. *(proves UIQ-FR-23)*
- [ ] UIQ-AC-17: Clicking a citation on the saved sample supplier opens the uploaded page with the cited section highlighted; a record with no packet still shows "File not in packet". *(proves UIQ-FR-24)*

## 7. Open questions

| # | Question | Owner | Resolution |
|---|---|---|---|
| 1 | Default queue order: by ID, or by decision severity? | Sid | v1.0: severity first. A backlog is worked from the problems down |
| 2 | Show passing criteria at all? | Sid | Yes, in the collapsed criterion table. Seniors want to see that a pass was cited too |
| 3 | Does *Viewing as Junior* hide Senior items? (W4) | Sid | No: it tags what the role may sign; nothing is hidden (2026-11-11, Q1) |
| 4 | Stacked panels or sub-tabs in the detail? | Sid | Sub-tabs, as in the accepted walk-through (Q2) |
| 5 | Where do hand-entered suppliers appear? | Sid | Wherever a candidate does, tagged Entered by hand (Q6) |

## 8. Out of scope

| Item | Picked up by |
|---|---|
| Sign-off recording, comments, assignment, employee logins | v2.0 / unscheduled |
| Compare bidders side by side | PRD-11 |
| Monitor view | PRD-06 |
| Filling the checklist from an uploaded packet with the agent (PDFs, scans, free-form packets) | v2.0 Live; the rules reader for the shipped Markdown format is UIQ-FR-21..24 |

## 9. Changelog

| Date | Change |
|---|---|
| 2026-11-19 | Issue 172 packet upload (rules reader, no AI): UIQ-FR-21..24, UIQ-NFR-03, UIQ-AC-13..17. §5 adds the optional `packet` field on `sqc-manual/1` (no schema bump), reader-filled `file §section` citations and the `data/samples/brand-corporation/` demo packet. §8 narrows the v2.0 item to the AI reader. |
| 2026-11-17 | Issue 163 viewer and navigation: UIQ-FR-09 the viewer shows numbers with more than 3 decimals rounded to 3 plus a note; files unchanged (decisions 240, 241). UIQ-FR-12 adds Not found for an Eval world/supplier pair not in the data (via PRD-13, decision 242). Acceptance boxes unchanged. |
| 2026-11-17 | Issue 162 plain-language labels: UIQ-FR-02 adds the NOT APPROVED reason line on queue cards (Compare's string, decision 230). UIQ-FR-07/-08 add the ◐ Partial chip for a verified row scoring 1–2 and the "Fail or partial" group heading (decisions 231, 232). No engine change; acceptance boxes unchanged. |
| 2026-11-13 | Issue 77: + New supplier shipped. Decisions 160-171. Hand-entered records are `sqc-manual/1`; `new=1` with `supplier=<id>` edits; the queue's pending note is removed. |
| 2026-11-13 | Issue 110: §5 requirement sheets load for every candidate or active-supplier commodity (decision 130), so a commodity with only active suppliers (`sheet_metal`) has its sheet too. Qualify's part number lookup is unchanged. |
| 2026-11-12 | #112: *Viewing as* tags and detail header line. Decisions 83–86. UIQ-FR-18 states that the detail header line shows in both roles. |
| 2026-11-12 | #42: citation viewer. Decisions 41–49. UIQ-FR-12 states that "File not in packet" means HTTP 404 and that any other packet fetch failure names the path; §5 notes the dev world copies the sample packets. |
| 2026-11-12 | #41: Problems list and All requirements table. Decisions 33–40: a verified row below 3 shows a Fail chip in both tabs; the agent's note sits under the requirement name; a citation link sets `doc`/`sec` in the hash and the viewer is #42; "excellent" shows for a verified Cpk only. No requirement text changes. |
| 2026-11-12 | #40: §5 states that requirement sheets load at startup and the part number comes from the commodity's sheet. No requirement text changes. |
| 2026-11-11 | #76: UI flow from the 2026-11-09 walk-through. Detail sub-tabs (UIQ-FR-14), the *Viewing as* role tags (UIQ-FR-18, W4), the Cpk "excellent" label (UIQ-FR-19), the requirement-sheet link (UIQ-FR-20) and **+ New supplier** (UIQ-FR-15…17, #77). Every result follows the active policy (PRD-12). Hash keys move under `#view=`. Acceptance names story targets until #74 fixes the demo seed. |
| 2026-11-09 | UIQ-FR-13 adds the fan-made footer. |
| 2026-11-08 | First draft. |
