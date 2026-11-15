# PRD-00 — Product overview

| Field | Value |
|---|---|
| Status | Approved |
| Owner | Sid (SME) |
| Release | v1.0 (frames v1.1, v1.2) |
| Milestone | v1.0 · M1 Product docs |
| ID prefix | `OVR` |
| Specs referenced | `docs/RUBRIC.md`, `docs/SCORECARD.md`, `docs/DATASET.md` |
| Supersedes | `docs/IDEA.md` |
| Last updated | 2026-11-11 |

## 1. Problem

A small supplier-quality team at a hardware company ramping a liquid-cooled AI system has a backlog of new suppliers to qualify. The next-generation system is built from new modular subassemblies (compute, power conversion, liquid cooling, I/O), so most new parts come from new suppliers.

Today a senior SQE reads each supplier's 40–200 page qualification packet against a checklist that lives in a spreadsheet or in their head, then writes emails asking for what's missing. That takes hours per supplier, and the criteria drift from one engineer to the next. Juniors joining the team can't take work off the seniors because there's no written protocol to follow.

Active suppliers are tracked on a monthly spreadsheet, so a supplier that is getting worse is noticed late.

## 2. Users and jobs

| Persona | Job to be done | How the product helps |
|---|---|---|
| **Junior SQE** (new to the team, paired with a senior) | Work through the qualification queue and approve what's within their authority | Scores packets against a written rubric, shows the cited evidence and gaps, and says plainly whether the junior can sign off or must route to a senior |
| **Senior SQE** (owns high-risk commodities) | Spend their time on the hard calls: high-risk parts, sole sources, knockouts | Gets only the packets that need them, with knockouts, gaps and a draft audit plan already prepared |
| **Quality & reliability director** | Know the backlog state and which active suppliers to escalate this week | Sees decisions and tiers that are reproducible and auditable, plus trend alerts that fire before a monthly table would |
| **Supplier** (indirect) | Know exactly what to send to get qualified | Receives an RFI that lists only the missing evidence |

### The two recurring decisions

1. **Qualify:** *Is this supplier qualified for this part? If not, what exactly is missing, and who has to decide?*
2. **Monitor:** *Which of our active suppliers is trending badly enough to escalate this week?*

## 3. Goals and non-goals

**Goals**

| ID | Goal | Metric | v1.0 target |
|---|---|---|---|
| G1 | Turn qualification into a written, repeatable protocol | Share of rubric criteria with a stable ID and an unambiguous scoring rule | 100% |
| G2 | Make every decision reproducible | Same inputs give the same scores, decision and routing | 100% (engine tests) |
| G3 | Separate fact from assumption | Share of criteria with a state of `verified`, `assumed` or `missing`, where each `verified` one carries a citation | 100% |
| G4 | Measure the agent instead of claiming it works | Catch rate of planted gaps on a blind extraction run | ≥ 90% (≈ 23 of 25), reported as measured even if below |
| G5 | Route work according to delegated authority | Share of suppliers whose routing matches the routing rule in `RUBRIC.md` | 100% (reference-extraction tests) |
| G6 | Catch supplier trends early | Every designed active-supplier story fires its expected alert | 6 of 6 (story tests) |
| G7 | Easy to show in an interview | The demo script runs end to end on the public link | ≤ 3 min, works at 390 px wide |

**Non-goals**

- NG1: Parsing real supplier packets, drawings or scanned documents. Packets are markdown. Requirement-sheet PDF upload is v2.0 (Sid, 2026-11-13, decision 150; PRD-12).
- NG2: Login, a database or shared multi-user state.
- NG3: An LLM that produces scores, decisions or routing.
- NG4: The product approving anything. It recommends; a person signs.
- NG5: Checking an FAI against drawing balloons. That's a later candidate.
- NG6: A live in-browser LLM call in v1.0. Agent output is precomputed JSON.
- NG7: Category weights that differ by commodity. v1.0 uses one global rubric, plus commodity-specific reliability evidence.

## 4. Requirements

These are product-level requirements. Feature PRDs break them down further.

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| OVR-FR-01 | The product must provide a **Qualify** view: a queue of candidate suppliers, each with a score, knockouts, gaps, cited evidence, decision, routing with its reason, a drafted RFI and an audit focus plan, plus **+ New supplier** entry by hand, scored live with no AI | Must | PRD-05 acceptance |
| OVR-FR-02 | The product must provide a **Monitor** view: active suppliers with five metrics, a composite tier, a p-chart and alerts | Must | PRD-06 acceptance |
| OVR-FR-03 | Every view must share one supplier identity scheme and one URL-hash scheme (DESIGN-SPEC §4.2), so every screen is reachable by deep link | Must | PRD-05/06/10–13 acceptance |
| OVR-FR-04 | Every score, knockout, decision, routing result, tier and alert must come from the deterministic engine | Must | PRD-01/02 tests + review |
| OVR-FR-05 | The agent must output only evidence (`state`, `value`, `citation`, note) and draft text, never a score | Must | PRD-04 schema validator |
| OVR-FR-06 | The agent's catch rate must be measured against an answer key it never sees, and the number must be published as measured | Must | PRD-04 eval + `docs/EVAL.md` |
| OVR-FR-07 | Drafted text (RFI, audit plan, and SCAR in v1.1) must be labeled as agent drafts for a person to review and send | Must | PRD-05/06/08 acceptance |
| OVR-FR-08 | The app must open on a **Today** view: qualifications that need the current role's sign-off, active suppliers to escalate, and queue counts | Must | PRD-10 acceptance |
| OVR-FR-09 | The product must provide a **Compare** view: bidders for the same Stark part, acceptable ones ranked by score under the active policy, the rest listed with their reason, and no winner declared | Must | PRD-11 acceptance |
| OVR-FR-10 | The product must provide a **Standards** view: an editable, named, versioned team scoring policy that every result names, with its impact against Stark Reference v1, and the Stark requirement sheets, view-only, with upload of structured sheets | Must | PRD-12 acceptance |
| OVR-FR-11 | The product must provide an **Eval** view that shows the published eval runs' numbers exactly as `agent/eval.mjs` produced them, with every miss linked to its document | Must | PRD-13 acceptance |
| OVR-FR-12 | A header **Viewing as** Junior / Senior switch must mark, in every view, what that role may sign. It does not log anyone in | Must | PRD-05 / PRD-10 acceptance |
| OVR-NFR-01 | **Synthetic data only.** Every supplier, document and number is fictional and labeled as synthetic in the app and the repo | Must | PRD-07 ship checklist |
| OVR-NFR-02 | **No real company names, logos or identifying product descriptions** in the app or data. Fictional Marvel comic-book company names are used on purpose (buyer: Stark Industries), with a fan-made disclaimer | Must | PRD-07 scrub audit |
| OVR-NFR-03 | **Static and free to host.** Vanilla HTML/CSS/JS, no framework, no build step, no runtime dependencies; served by GitHub Pages | Must | Review + PRD-07 |
| OVR-NFR-04 | **Reproducible data.** Generated data comes from a seeded script, and the same seed gives byte-identical output | Must | PRD-03 test |
| OVR-NFR-05 | **Accessible and responsive.** WCAG 2.2 AA targets, keyboard operable, works at 390 px wide | Must | DESIGN-SPEC checklist |
| OVR-NFR-06 | **Docs are the spec.** Behavior that disagrees with an Approved doc is a defect; doc and code change together | Must | Reviewer gate on every PR |

## 5. Interfaces: how the pieces fit

```
data/suppliers/<id>/*.md ──► agent (Claude Code skill, blind) ──► data/extracted/<id>.json
                                                                        │
docs/RUBRIC.md ──► app/rubric.js ──────────────────────────────► app/engine.js ──► Qualify view
data/gen_history.mjs ──► data/history.csv ─────────────────────► app/engine.js ──► Monitor view
data/answer_key.json ──► agent/eval.mjs (catch rate) ──► docs/EVAL.md + data/eval.json ──► Eval view
```

| Step | Done by | Why |
|---|---|---|
| Read the packet; extract evidence and a citation per criterion | Claude Code skill (`agent/`), blind | Reading unstructured documents is what LLMs are good at |
| Score, knockouts, decision, routing, scorecard math, alerts | Deterministic JS engine (`app/engine.js`), unit-tested | Scores must be reproducible and auditable |
| Draft the RFI email, audit plan and SCAR text | Agent | Drafts are cheap to review and expensive to write |
| Approve or reject | A person (junior or senior, per the routing rule) | Authority stays with people |

### Feature map

| Feature | PRD | Milestone | Release |
|---|---|---|---|
| Qualification scoring engine | [PRD-01](PRD-01-qualification-engine.md) | M2 | v1.0 |
| Supplier scorecard & alerts | [PRD-02](PRD-02-scorecard.md) | M2 | v1.0 |
| Synthetic dataset | [PRD-03](PRD-03-dataset.md) | M3 | v1.0 |
| Evidence extraction agent & eval | [PRD-04](PRD-04-agent.md) | M4 | v1.0 |
| Workbench: Qualify view | [PRD-05](PRD-05-ui-qualify.md) | M5 | v1.0 |
| Workbench: Monitor view | [PRD-06](PRD-06-ui-monitor.md) | M5 | v1.0 |
| Workbench: Today view | [PRD-10](PRD-10-ui-today.md) | M5 | v1.0 |
| Workbench: Compare view | [PRD-11](PRD-11-ui-compare.md) | M5 | v1.0 |
| Workbench: Standards view (policy, requirement sheets, upload) | [PRD-12](PRD-12-ui-standards.md) | M5 | v1.0 |
| Workbench: Eval view | [PRD-13](PRD-13-ui-eval.md) | M5 | v1.0 |
| UI design contract | [DESIGN-SPEC](DESIGN-SPEC.md) | M5 | v1.0 |
| Release & distribution | [PRD-07](PRD-07-ship.md) | M6 | v1.0 |
| SCAR drafting | [PRD-08](PRD-08-scar.md) | M7 | v1.1 |
| Port to Quality Engineering Skills | [PRD-09](PRD-09-qes-port.md) | M8 | v1.2 |

### Release plan

| Release | Contents | Exit criterion |
|---|---|---|
| **v1.0 MVP** | M1–M6: docs, engine, dataset, agent with eval, workbench, public link | Demo script runs on the live link; catch rate published; tagged `v1.0` |
| **v1.1** | M7: "Draft SCAR" for flagged active suppliers | Each flagged supplier has a SCAR draft; tagged `v1.1` |
| **v1.2** | M8: engine and skills ported into Quality Engineering Skills as `supplier-qualification` and `supplier-scorecard` | That repo's CI is green; tagged `v1.2` |

## 6. Acceptance criteria

- [ ] OVR-AC-01: Every v1.0 feature in the feature map traces to at least one goal (G1–G7) and one requirement (OVR-FR/NFR). *(proves G1–G7 coverage)*
- [ ] OVR-AC-02: Every OVR requirement appears in the `TEST-PLAN.md` traceability matrix with a verification method. *(OVR-FR-01…12, OVR-NFR-01…06)*
- [ ] OVR-AC-03: `docs/IDEA.md` points to this document, and nothing else in `docs/` cites IDEA.md as a source of truth. *(supersedes IDEA.md)*
- [ ] OVR-AC-04: Personas and terms are used consistently across all PRDs (terms as defined in §10). *(OVR-NFR-06)*

## 7. Open questions

| # | Question | Owner | Resolution |
|---|---|---|---|
| 1 | Catch-rate target for G4: is ≥ 90% (≈ 23 of 25) the right bar to state up front, or do we publish the number with no target? | Sid | ≥ 90%, stated up front (2026-11-08) |
| 2 | Do real teams weight categories by commodity, or use one global rubric? (v1.0: global; NG7) | Interview panel | Conversation starter |
| 3 | What is the team's junior delegation threshold today? (v1.0 rule in `RUBRIC.md`) | Interview panel | Conversation starter |
| 4 | Do reliability engineers own category 4 acceptance, or does the SQE? | Interview panel | Conversation starter |

## 8. Out of scope

| Item | Picked up by |
|---|---|
| SCAR drafting | v1.1 (PRD-08) |
| Port to Quality Engineering Skills | v1.2 (PRD-09) |
| Live extraction from a pasted packet in the browser | Unscheduled (was stretch S3) |
| Scanned PDFs, drawing parsing, FAI balloon checking | v2.0 / unscheduled |
| Multi-user state, sign-off records, database | Unscheduled |

## 9. Positioning

**One-line pitch:** *"This is how I'd onboard a new liquid-cooling supplier in my first month, and the workflow your team could run on the next fifty."*

What sets it apart:
- It's built for a specific backlog and team shape, not as a generic QMS demo.
- Reliability evidence (leak, thermal cycling, burn-in) is first-class, which fits a team that runs quality and reliability as one function.
- The routing rule makes "approve within an assigned level of authority" concrete.
- The agent's catch rate is measured against planted gaps. It's evidence, not a claim.

### Design principles

1. **The AI reads and drafts. The engine scores. A person decides.**
2. **Every claim has a citation or is marked missing.** Verified, assumed and missing are different states.
3. **Routing follows delegated authority.**
4. **Quality and reliability together.**
5. **Measured, not claimed.**

## 10. Glossary

| Term | Meaning here |
|---|---|
| **SQE** | Supplier Quality Engineer |
| **Qualification packet** | The documents a candidate supplier submits: certificates, PFMEA, control plan, capability and MSA studies, reliability reports, capacity, sub-tier and PCN policy |
| **Criterion** | One scored rubric line, with a stable ID (e.g. `2.ctq_cpk`), defined in `RUBRIC.md` |
| **Evidence state** | `verified` (citation present), `assumed` (supplier claims it, no proof; scores at most 1) or `missing` (nothing found; scores 0) |
| **Citation** | Where the evidence was found, written `file §section` |
| **Knockout (KO)** | A must-pass criterion. A score of 0 forces NOT APPROVED regardless of total |
| **Gap** | A scored criterion below 3: `fail` (evidence shows it falls short), `assumed` (claimed without proof) or `missing` (no evidence) |
| **Decision** | APPROVED, CONDITIONAL or NOT APPROVED, per `RUBRIC.md` |
| **Routing** | Who signs off: Junior SQE or Senior SQE, with the reason |
| **RFI** | Request for information: the email asking the supplier for the missing evidence |
| **Audit focus plan** | Up to three gaps (knockouts first, then lowest score), written as on-site audit questions |
| **Commodity / risk class** | Part family (e.g. cold plate) and its risk class (High, Medium, Low), which set the required reliability evidence |
| **Sole source** | The only qualified supplier for a part; caps the supply-risk score and forces senior routing |
| **CTQ** | Critical-to-quality characteristic |
| **Cpk** | Process capability index; ≥ 1.33 is the rubric's pass bar |
| **Gage R&R (GR&R)** | Measurement-system variation as a share of tolerance; ≤ 10% is the pass bar |
| **PFMEA** | Process failure mode and effects analysis |
| **FAI** | First article inspection |
| **PCN** | Process change notification |
| **Sub-tier** | A supplier's own suppliers (e.g. the plating house behind a cold-plate maker) |
| **DPPM** | Defective parts per million received |
| **Escape rate** | Share of defects found downstream (at the CM line or in the field) instead of at incoming inspection |
| **Repeat NC** | A nonconformance whose failure mode already occurred in the previous 180 days |
| **SCAR** | Supplier corrective action request |
| **OTD** | On-time delivery |
| **p-chart** | Control chart of the monthly reject fraction, with p̄ and a per-month UCL |
| **Tier** | Composite scorecard grade A–D, per `SCORECARD.md` |
| **CM** | Contract manufacturer |
| **NPI** | New product introduction |
| **SME** | Subject-matter expert and final approver for this project (Sid) |

## 11. Changelog

| Date | Change |
|---|---|
| 2026-11-13 | Issue 78 lead-review correction: requirement-sheet PDF upload is v2.0 (Sid, 2026-11-13, decision 150). NG1 now reflects the final scope; v1.0 upload supports JSON, CSV and Markdown. Historical changelog rows remain unchanged. |
| 2026-11-11 | #76: views from the approved walk-through. Today (OVR-FR-08), Compare (-09), Standards (-10), Eval (-11), the *Viewing as* switch (-12) and + New supplier (-01). One hash scheme for every view (-03). NG1 narrowed to supplier packets and scanned documents; text-PDF requirement sheets are in v1.0 if #78's spike passes. Feature map adds PRD-10…13. |
| 2026-11-09 | Section A decisions: buyer is Stark Industries with Marvel supplier names (OVR-NFR-02); commodity list confirmed against the JD and public filings, plastics left out; public release as a separate scrubbed repo. |
| 2026-11-08 | G4 target set to ≥ 90% (open question 1). Gap and audit-focus terms aligned with `RUBRIC.md` v1 (#3). |
| 2026-11-08 | First draft. Supersedes `docs/IDEA.md`. Identifying public-source details from IDEA.md left out (OVR-NFR-02). |
