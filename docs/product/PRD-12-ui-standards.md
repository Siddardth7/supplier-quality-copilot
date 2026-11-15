# PRD-12 — Workbench: Standards view

| Field | Value |
|---|---|
| Status | Approved |
| Owner | Sid (SME) |
| Release | v1.0 (JSON, CSV, Markdown); PDF upload moves to v2.0 (Sid, 2026-11-13) |
| Milestone | v1.0 · M5 Workbench UI |
| ID prefix | `UIS` |
| Specs referenced | `docs/RUBRIC.md` § Team scoring policy, `docs/SCORECARD.md` § Policy, PRD-01 QUAL-FR-14, PRD-02 SCORE-FR-10, `data/requirements/<commodity>.json` (PRD-03, #68), `docs/product/DESIGN-SPEC.md` |
| Last updated | 2026-11-13 |

## 1. Problem

Teams value categories differently, so the weights, pass marks, knockouts and scorecard limits must be editable. ISO 9001 8.4 also wants consistent, documented criteria, so an edit must be a named, versioned policy that every result names, not a private tweak. The Stark requirement sheets that set the acceptance limits need one place to be read too. Most teams keep those sheets as PDFs. Standards is the one home for "our company's rules and requirements" (W2, W6).

## 2. Users and jobs

| Persona | Job to be done | How this view helps |
|---|---|---|
| Senior SQE / Q&R lead | Set the team's scoring policy and see its effect | Editor, live rescoring, impact against Stark Reference v1 |
| Either SQE | Check Stark's limit for a part | View-only requirement sheets |
| SQE onboarding a new part | Bring a requirement sheet they already have | Upload JSON, CSV or Markdown, preview, confirm; PDF in v2.0 |
| Interview panel | See that nothing is hardcoded | Change a weight, watch decisions and grades move |

**User stories**
- US1: As a lead, I raise the importance of Reliability tests, name the policy "Cold-plate team", save it, and the header chip shows it.
- US2: As a lead, I see which suppliers changed decision, routing or grade compared with Stark Reference v1.
- US3: As a lead, I copy a share link; a colleague opens it and sees my policy marked "Shared, not saved".
- US4: As either SQE, I open the cold-plate sheet from Compare and read Stark's leak-rate limit.
- US5: As an SQE, I upload a requirement sheet CSV, correct one field in the preview and save it.

## 3. Goals and non-goals

**Goals**
- G1: Every policy parameter that `RUBRIC.md` and `SCORECARD.md` allow to change is editable here, and nothing else is.
- G2: A policy change visibly rescores every view without a reload.
- G3: Uploaded sheets are parsed without AI or libraries (OVR-NFR-03).

**Non-goals**
- NG1: Team-wide shared storage. Policies live in the browser, shared by link or file; a server is v2.0.
- NG2: Editing requirement sheets. They are view-only in v1.0 (ROADMAP 2026-11-09).
- NG3: Re-judging demo suppliers against an uploaded sheet. Their tests were judged against the built-in sheets when they were extracted.
- NG4: Scanned PDFs (OCR) and pairwise (AHP) weighting. Both are v2.0.

## 4. Requirements

**Scoring policy**

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| UIS-FR-01 | Standards must list Stark Reference v1, which can't be edited or deleted, and every policy saved in this browser. Exactly one is active, and the header chip names it: the reference in cyan, a custom policy in amber (DESIGN-SPEC §4.1) | Must | manual check |
| UIS-FR-02 | The qualification editor must set each category's importance on a 1–5 scale and show the resulting weights, normalized to 100 and shown to 1 decimal. The reference shows its exact points until any rating changes (RUBRIC § Team scoring policy, W1) | Must | manual check + unit test of the normalization |
| UIS-FR-03 | The editor must set the APPROVED and CONDITIONAL pass marks (0 ≤ conditional < approve ≤ 100), and switch each knockout criterion on or off one by one. The knockout list is generated from `app/rubric.js`, not hard-coded (QUAL-NFR-05) | Must | manual check + review |
| UIS-FR-04 | The scorecard editor must set metric weights (summing to 100), the Good/Watch/Bad limits and the tier cut-offs (`SCORECARD.md` § Policy) | Must | manual check |
| UIS-FR-05 | Edits must apply live to every view as an unsaved draft, with an "Unsaved changes" mark on the header chip. An invalid value must show the engine's error naming the field next to that input, and the last valid policy stays in effect | Must | manual check |
| UIS-FR-06 | **Save** must require a name, keep a stable `id`, increase `version` by 1 on every save, and store the policy in the browser. If storage is blocked, the policy still applies for the session and a note reads "Can't save in this browser" | Must | manual check (incl. a private window) |
| UIS-FR-07 | **Share** must copy a link that carries the policy. Opening that link must apply the policy marked "Shared, not saved" without overwriting any saved policy, until the user saves it | Must | manual check |
| UIS-FR-08 | **Export** must download the policy as a JSON file. **Import** must validate it with the engine and refuse an invalid file with the engine's message, naming the field | Must | manual check |
| UIS-FR-09 | Deleting a custom policy must ask for confirmation in the page (no browser dialog). Deleting the active one makes Stark Reference v1 active | Must | manual check |
| UIS-FR-10 | The **impact panel** must compare the active policy with Stark Reference v1. It lists every candidate whose decision or routing changes and every active supplier whose grade changes, as old → new, with counts. With no difference it reads "No changes." | Must | manual check |

**Requirement sheets**

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| UIS-FR-11 | Standards must list every built-in sheet (`data/requirements/*.json`) and every uploaded sheet, the latter tagged **Uploaded**. Opening one shows its header (part number, name, revision, drawing, demand, need-by weeks) and its CTQ and test limits, view-only. `#view=standards&sheet=<part number>` opens it | Must | manual check |
| UIS-FR-12 | **Upload requirement sheet** must accept JSON, CSV and Markdown. PDF upload is deferred to v2.0 (Sid, 2026-11-13). It shows a preview of the parsed fields plus every line it couldn't match. The SQE can correct any field before saving | Must | manual check + unit tests (#78) |
| UIS-FR-13 | The upload must refuse a sheet missing a limit for a required test of its commodity, with a plain message naming the test. PDF upload, including encrypted-PDF and no-text-layer refusal handling, is deferred to v2.0 | Must | unit test (#78) |
| UIS-FR-14 | A saved upload must be stored in the browser like a policy, and can be exported or deleted. The sheet view states that uploaded limits apply to suppliers entered by hand only (PRD-05 UIQ-FR-15), not to the demo suppliers | Must | manual check |
| UIS-NFR-01 | Parsing must use browser built-ins only: no libraries or AI. PDF reading and its scan/encryption refusal handlers remain out of v1.0. Test IDs and names are matched from `app/rubric.js` | Must | review + unit tests (#78) |

## 5. Interfaces

| Input / output | Shape |
|---|---|
| Policy | `RUBRIC.md` § Team scoring policy plus the `scorecard` part (`SCORECARD.md` § Policy); `id`, `version`, `name` required. A policy saved from the editor may also carry `qualification.ratings` (1–5 per category) beside the `weights` they produce; the engine ignores it, and a file whose `ratings` don't reproduce its `weights` loses them on import (weights win) |
| Engine | `evaluate(x, { as_of, policy })` and `scorecard(rows, { as_of, policy })` validate and apply it (PRD-01 §5, PRD-02 §5); `validatePolicy(policy)` runs both halves' checks for the editor, Import and shared links |
| Saved policies | browser `localStorage` key `sqc:policies`: `{ "schema": "sqc-policies/1", "active": <id> or null, "policies": [policy, …] }`. A stored policy the engine rejects is dropped on load; `active` null means Stark Reference v1 |
| Built-in sheets | `data/requirements/<commodity>.json` (#68) |
| Uploaded sheet | Same shape as a built-in sheet, plus uploaded: true; sqc:sheets stores {schema: "sqc-sheets/1", sheets: [...]}. JSON export omits only this source tag. Preview and CSV/Markdown contracts: [SHEET-IMPORT.md](../SHEET-IMPORT.md) |
| Exported policy file | the policy object as JSON (2-space indent), named `policy-<id>-v<version>.json` |

| Hash | Effect |
|---|---|
| `#view=standards` | Standards, the active policy open |
| `#view=standards&sheet=SI-CP-0007` | Standards, that sheet open |
| `#policy=<encoded>` (any view) | Applies a shared policy, "Shared, not saved". `<encoded>` is `p1.` + base64url (no padding) of the policy's UTF-8 JSON. A token that doesn't decode to a valid policy changes nothing; Standards shows "This link's policy was refused: <message>". Stark Reference v1 is never encoded: Share on the untouched reference copies a link with no `policy` key, so the receiver sees their own active policy, and a token carrying the `stark-reference` id is refused, as Import refuses it (decision 129) |

## 6. Acceptance criteria

- [ ] UIS-AC-01: Moving Reliability tests from 5 to 3 rescores the queue, Compare and Today live. The impact panel lists each changed decision or routing as old → new. *(proves UIS-FR-02, -05, -10, G2)*
- [ ] UIS-AC-02: A saved policy survives a reload, its version increases on each save, and the header chip shows it in amber. *(proves UIS-FR-01, -06)*
- [ ] UIS-AC-03: A share link opened in a fresh window applies the policy as "Shared, not saved" and leaves saved policies untouched. *(proves UIS-FR-07)*
- [ ] UIS-AC-04: Export → delete → import restores a deep-equal policy. An edited file with weights summing to 99 is refused naming `weights`. *(proves UIS-FR-08, -09)*
- [ ] UIS-AC-05: Changing the tier cut-offs (e.g. to 90/75/55) or a metric's Bad limit re-grades Monitor and Today live, as PRD-02 SCORE-AC-09 specifies for the engine. *(proves UIS-FR-04)*
- [ ] UIS-AC-06: Each built-in sheet opens by deep link and shows its limits, with no edit control. *(proves UIS-FR-11)*
- [ ] UIS-AC-07: #78's v1.0 acceptance passes: JSON/CSV/Markdown preview, correction and the required-limit refusal messages. *(proves UIS-FR-12…-14, UIS-NFR-01)*

## 7. Open questions

| # | Question | Owner | Resolution |
|---|---|---|---|
| 1 | Policy a tab or a panel? (W2) | Sid | A tab, renamed Standards, holding the policy and the sheets (2026-11-09) |
| 2 | How many custom policies, and how is one shared? | Sid | Several saved in the browser, one active; share by link ("Shared, not saved") or file (2026-11-11, S1–S3) |
| 3 | Knockout switches by kind or by criterion? | Sid | One switch per knockout criterion, as the engine takes them (S5) |

## 8. Out of scope

| Item | Picked up by |
|---|---|
| Team-wide saved policies, editable sheets, AHP weighting, OCR | v2.0 Live |
| PDF upload (Sid, 2026-11-13; failed Chrome spike) | v2.0 |

## 9. Changelog

| Date | Change |
|---|---|
| 2026-11-13 | Issue 78 lead-review clarification: PDF fixtures and the text reader are preserved on `spike/m5-pdf-text`, not merged into v1.0. The producer table remains decision-150 / v2.0 evidence; UIS-AC-07 covers JSON, CSV and Markdown only. The checkbox and existing dated rows remain unchanged. |
| 2026-11-13 | Sid decided PDF → v2.0 after the Chrome table spike read only 139/154 complete rows. Issue 78 continues JSON, CSV and Markdown only: UIS-FR-12/-13 and scope updated; encrypted/scan PDF refusals are v2.0. Decision 150 records the evidence and preserved spike branch. The new upload preview/store/viewer/export/delete implement UIS-FR-12…14; PRD acceptance boxes remain unchanged. |
| 2026-11-13 | Issue 78 PDF spike only: Chrome and cupsfilter fixtures and browser-only text reader added for review. The complete-row gate fails on 6 of 8 Chrome fixtures (139/154 rows); cupsfilter reads all 154/154 rows. LibreOffice is not installed. Import, preview, storage and UI remain unbuilt pending Sid’s PDF scope decision; no acceptance boxes changed. |
| 2026-11-13 | Issue 110 built UIS-FR-11 for the built-in sheets (decisions 130–136): Standards lists every loaded `data/requirements/*.json` sheet by part number, and `#view=standards&sheet=<part number>` opens it view-only in the editor column (header, CTQs, test limits split Acceptance / Setup). Upload and the **Uploaded** tag (UIS-FR-12…14) stay with #78. UIS-AC-06 is checked by `app/standards.test.js` and the TEST-PLAN L5 Standards built-in sheet row; the box stays as written. |
| 2026-11-12 | Issue 109 built UIS-FR-01…10 (decisions 105–129): §5 adds the `p1.` share-token encoding, the `sqc:policies` store, the optional `qualification.ratings` and `validatePolicy`. Requirement sheets (UIS-FR-11…14) stay with issue 110 and #78. The headless QA run verified UIS-AC-01…05 (TEST-PLAN L5 Standards); the boxes stay as written, and UIS-AC-06/-07 wait for issue 110 and #78. |
| 2026-11-11 | First draft (#76), from W1, W2, W6, the upload decision (#78) and Sid's section 4 decisions. |
