# PRD-08 — SCAR drafting

| Field | Value |
|---|---|
| Status | Approved |
| Owner | Sid (SME) |
| Release | v1.1 |
| Milestone | v1.1 · M7 Draft SCAR |
| ID prefix | `SCAR` |
| Specs referenced | `docs/SCORECARD.md`, PRD-02 output (`alerts`, `open_scars`, `failure_modes`), Quality Engineering Skills `skills/supplier-scar` (section structure) |
| Last updated | 2026-11-08 |

## 1. Problem

When Monitor flags a supplier, the next step is a supplier corrective action request (SCAR). Writing one takes time: pulling the numbers, stating the problem precisely, setting containment and due dates. It's also easy to get wrong by writing the root cause on the supplier's behalf, which defeats the purpose of the request.

## 2. Users and jobs

| Persona | Job to be done | How this feature helps |
|---|---|---|
| Senior SQE | Issue a SCAR the same day an alert fires | A draft with the problem stated from engine numbers, ready to edit and send |
| Supplier (indirect) | Know exactly what is being asked | Six fixed sections, each a clear request |

## 3. Goals and non-goals

**Goals**
- G1: Every supplier that meets the trigger rule has a SCAR draft; no other supplier does.
- G2: Every number in the draft comes from the scorecard engine.
- G3: The draft never states a root cause. It requests one.

**Non-goals**
- NG1: Tracking SCAR responses, validating a 5-Why, or closing SCARs. That's QES `supplier-scar`'s job.
- NG2: Commercial actions (hold, de-source, charge-back). These are business decisions for authorized people.
- NG3: An LLM writing the draft. v1.1 uses a deterministic template, so the same alert gives the same draft.

## 4. Requirements

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| SCAR-FR-01 | **Trigger.** A SCAR draft must be offered when the supplier has an active (M18) `ucl` or `run7` alert, or an active `metric_bad` alert for DPPM, escape rate or repeat NC. OTD, SCAR aging and tier drop alone don't trigger one | Must | unit test |
| SCAR-FR-02 | On the story data, exactly ACT-02, ACT-05 and ACT-06 must be offered a draft | Must | story test |
| SCAR-FR-03 | The draft must have a header (draft SCAR ID `SCAR-D-<supplier>-<YYYYMM>`, supplier, parts affected, issue date = `as_of`, response due date) and six sections in this order: Problem Definition, Interim Containment Requirement, Root-Cause Requirement, Corrective-Action Requirement, Verification-of-Effectiveness Requirement, Prevention / Read-Across | Must | unit test |
| SCAR-FR-04 | Problem Definition must state each triggering alert with its month and detail, the M18 values and bands of the triggering metrics, and the top failure-mode codes with counts and parts | Must | unit test |
| SCAR-FR-05 | Root-Cause Requirement must be fixed template text that requests the supplier's own root-cause analysis (5-Why or equivalent, with evidence). The only inserted values are the supplier and the failure-mode codes, so no cause can appear | Must | unit test (section equals template) |
| SCAR-FR-06 | If the supplier has open SCARs over 60 days old, the draft must list them under Prevention / Read-Across as overdue, and must not open a duplicate for the same failure-mode code | Must | unit test (ACT-05) |
| SCAR-FR-07 | Due dates are heuristics and must be labeled so: containment 2 working days, root cause and corrective action 30 days from issue | Must | unit test |
| SCAR-FR-08 | The Monitor detail must show a "Draft SCAR" button for triggered suppliers, in the slot PRD-06 reserves. It opens the draft with the draft label and a "Copy" button | Must | manual check |
| SCAR-NFR-01 | The template lives in `app/scar.js` as a pure function of the PRD-02 supplier output and `as_of` | Must | review |

## 5. Interfaces

`draftScar(supplierScorecard, { as_of }) → null | { id, supplier_id, parts, issued, due, sections: [{ title, body }], label }`

Inputs come only from the PRD-02 output fields `alerts`, `months[17].metrics`, `failure_modes` and `open_scars`. No v1.0 engine change is needed. These fields were added to PRD-02 for this reason.

## 6. Acceptance criteria

- [ ] SCAR-AC-01: Trigger unit tests cover each alert type in and out of the rule. *(proves SCAR-FR-01)*
- [ ] SCAR-AC-02: The story test gives drafts for exactly ACT-02, ACT-05 and ACT-06. *(proves SCAR-FR-02, G1)*
- [ ] SCAR-AC-03: The ACT-05 draft has all six sections in order, lists its overdue SCARs, and its numbers equal the engine output. *(proves SCAR-FR-03, -04, -06, G2)*
- [ ] SCAR-AC-04: In every draft, the Root-Cause Requirement equals the template with only supplier and codes filled in. *(proves SCAR-FR-05, G3)*
- [ ] SCAR-AC-05: The "Draft SCAR" button works on ACT-02 and is absent on ACT-01 and ACT-04. *(proves SCAR-FR-08)*

## 7. Open questions

| # | Question | Owner | Resolution |
|---|---|---|---|
| 1 | Should poor OTD trigger a SCAR? | Sid | v1.1: no. Delivery is usually handled by supply chain through a delivery corrective action, not a quality SCAR. Good panel question |
| 2 | Template or agent-written draft? | Sid | Template. Reproducible, and nothing in a SCAR needs prose an engine can't fill |

## 8. Out of scope

| Item | Picked up by |
|---|---|
| SCAR lifecycle and 5-Why validation | Quality Engineering Skills `supplier-scar` |
| Sending to the supplier | Unscheduled |

## 9. Changelog

| Date | Change |
|---|---|
| 2026-11-08 | First draft. Section structure follows QES `supplier-scar` (CQI-20 / Ford Global 8D). |
