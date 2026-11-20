# AI reader on the site: plan (v2.0)

| Field | Value |
|---|---|
| Status | Plan. Not built |
| Release / milestone | v2.0 Live |
| Issue | #173 (this plan), #172 (the rules reader it extends) |
| Product requirements | [PRD-04](product/PRD-04-agent.md) (agent and eval), [PRD-05](product/PRD-05-ui-qualify.md) (+ New supplier) |
| Last updated | 2026-11-19 |

All data is synthetic. The buyer is Stark Industries and the suppliers carry Marvel comic-book company names; this
project is fan-made and not affiliated with Marvel.

## 1. Where it stands today

| Piece | Today | Where it runs |
|---|---|---|
| Engine | Scores a filled checklist: score, knockouts, decision, routing, RFI items, audit focus | The site (pure functions) |
| AI reader (agent) | Reads a packet and writes a cited extraction. Measured on four unseen worlds: 97.3% of planted gaps caught, 10.0% false alarms (Sonnet); 100% and 0% (Opus comparison run). [EVAL.md](EVAL.md) | Offline: one fresh, sandboxed Claude Code session per packet (~40 s, ~$0.17) |
| Rules reader (#172) | Reads an uploaded packet in the browser and fills the + New supplier checklist, no AI | The site |

**Known limitation (v1.1).** The rules reader only reads packets written in this project's packet format: one section
per requirement, `Recorded result: <value>` for proven evidence. That is the format the simulation writes, so it reads
every shipped packet, but a real supplier's PDF, scan, spreadsheet or free-form report would not parse. Two planned
routes cover other files: **assisted mapping** (§4) works with no AI, and the **AI reader** (§2) can optionally
suggest the evidence for the same engineer review. Neither runs on the site yet. This was a time decision for the
interview build (Sid, 2026-11-19), not a design limit.

## 2. Design rule: the AI reads, rules check, the engine scores, a person signs

The AI is used for one job only: turning unstructured documents into evidence rows. Everything around it stays
deterministic so every number is auditable and a wrong AI answer is caught before it reaches a score.

```
 any file ──► 1 Convert ──► 2 Extract (AI) ──► 3 Verify (rules) ──► 4 Review (SQE) ──► engine score
             text + page    state, value,      quote must exist,     flagged rows       unchanged
             anchors        quote, citation    types, units, schema  confirmed
```

| Stage | What it does | AI? | Output |
|---|---|---|---|
| 1 Convert | File to plain text with page or section anchors. `.md`, `.txt`, `.csv` natively; `.docx` and `.xlsx` are zip + XML (browser `DecompressionStream`, no library); text PDFs via the [PDF spike](https://github.com/Siddardth7/supplier-quality-copilot/tree/spike/m5-pdf-text); scans and photos via a vision model. Every image-derived block is marked as such, also inside mixed PDFs, and keeps its page and region so the original image can be shown | Only for scans | Anchored blocks, each with an ID and a source locator |
| 2 Extract | The model reads the anchored blocks and the rubric. Per row it **proposes** only: state, the block IDs it relies on, the verbatim quote and the role of each selected number (or "insufficient evidence"). It never writes the value. Structured output (JSON schema), one call per packet | Yes | Proposals |
| 3 Verify | Deterministic guards, run in the page: schema and types (the `agent/validate.mjs` core, moved to shared code); every quote must appear word for word in the cited section and contain the value; units and dates parse; citation points to a real anchor. The **page constructs** the typed value from its own copy
of the selected block and the `sqc-extraction/1` row from it. Any failure turns the row into **Needs review**; nothing is silently accepted | No | Rows marked ok or needs review |
| 4 Review | The existing + New supplier checklist opens filled. Needs-review rows are highlighted; the SQE confirms or edits; the engine scores live | No | Saved supplier |

**The model selects evidence; the page builds the value.** Before the call, the page gives every paragraph, table
cell, header and number its own ID. The model returns the IDs of the blocks it relies on, the exact quote, and the role
of each selected number (*observed result*, *upper limit*, *sample size*), or "insufficient evidence". The page then
checks the quote at that location and reads the number from its **own** copy of the source; only allowlisted unit and
date conversions may change it. A model can still pick the wrong number (`minimum 20 bar | observed 18 bar` passes a
quote check either way), so the role must match the cell or label it came from, or the row stays Needs review.
A value the model typed itself can never reach the engine.

**Needs review is its own status until the SQE confirms.** *Missing* is an engineer's conclusion about the packet. An
unread scanned page, an ambiguous date and two conflicting measurements are three different reasons the software
cannot reach that conclusion, and each is shown as such. Only after confirmation do rows take the engine's three
states (proven, claimed, missing).

## 3. How we get high accuracy, and prove it

1. **Measure before trusting.** The same eval harness and locked answer keys as today ([EVAL.md](EVAL.md)). Any
   prompt or model change is re-tested on fresh worlds (PRD-04 AGENT-FR-09), and every run is published, not the best.
2. **Paired traps.** Test cases where one word or column flips the answer: *required* versus *observed*, issue date
   versus expiry date, current versus superseded revision, leak rate versus test pressure, a documented failing result
   versus a promise to pass. A verified failure is a correct extraction; a wrong verified knockout value blocks the
   release of whatever proposed it. Precision of proposed *proven* rows is reported next to coverage, so a reader
   cannot look good by proposing nothing.
3. **A stricter evidence metric.** Today's citation score only checks caught, expected-proven gap rows, and its
   matcher accepts a neighbouring section (`msa.md §3.2` for `§3.4`), so 100% there does not prove every proven row
   opens the right evidence. The existing metric stays for comparison. The converter and AI reader add one on held-out
   layouts: **of all rows proposed as Proven, how many have the correct criterion, typed value, state and original
   evidence location**, with acceptable source spans or cells labelled independently of the reader. Reported beside it:
   coverage, wrong verified knockouts, and how many decisions and routings change downstream.
4. **Messy test packets.** Add a "messy" mode to the simulation that renders the same facts as realistic packets:
   varied headings, tables, prose, PDFs and scanned pages. Targets: ≥ 95% caught, ≤ 5% false alarms, 100% citation
   match, 100% of invented values caught by the quote check.
5. **Fix the known weakness, without trading it for the opposite one.** All 108 of Sonnet's false alarms were rows it
   marked *claimed* when the key says *proven* (too cautious). But its one miss went the other way: in world 101,
   SUP-07, it marked the promise "We obtain customer authorization before changing manufacturing arrangements" as
   proven ([EVAL.md](EVAL.md)). That quote is genuine, so a quote check alone would pass it. Any prompt change that
   encourages more Proven rows must pass a gate that includes this case **paired** with a documented operative
   policy (the promise stays Claimed, the documented procedure becomes Proven) before it ships.
6. **Model by risk.** Sonnet reads every packet; knockout rows and high-risk commodities are read a second time by
   Opus (100% / 0% in the comparison run). If the two disagree, the row goes to Needs review. This keeps cost near
   Sonnet's while the rows that decide a NOT APPROVED get the strongest reader.
7. **Accuracy shown in the product.** The Eval view keeps publishing the latest numbers, so the team can see how far
   to trust the reader before they rely on it.

## 4. Without AI: assisted mapping (the converter)

The rules reader needs packets in this project's format. The no-AI way to read **any** supplier file is to let the
software do the searching and the engineer do the judging:

1. **Convert** the file into inspectable pieces with their place kept: paragraphs under their heading, and table
   cells with their row label, column header and unit. Text, Markdown, CSV and HTML are native; DOCX and XLSX need a
   small zip + XML reader; text PDFs are partial (§2 stage 1); scans are shown for the engineer to transcribe.
2. **Suggest.** For each checklist row, the page ranks the top three passages using the per-requirement keyword list,
   plus narrow value rules for a few rows (Cpk, certificate expiry, the commodity's key test).
3. **Confirm.** The engineer clicks the passage or cell, picks the value, and the row fills with a citation to the
   original file, sheet and cell, or page. Conflicts (two Cpk values, two dates) need an explicit choice.
4. **Remember.** For a recurring supplier, an approved column mapping is saved and reused only when the same sheet,
   headers and units come back.

**Citations must survive saving.** Today's viewer opens numbered sections of Markdown files. A converted file is
saved with the record as the original bytes plus a review copy, and each row keeps a **source locator**: file, and
page and region, or sheet and cell, or CSV row and column header. The viewer opens the locator in the review copy and
shows the original row, header, unit and value (or the image region). Acceptance check per phase: select a CSV result
under its *Observed* header, save, reload, export and import, then open the citation offline and recover that same
row, header, unit and value. The same check is extended to XLSX and to image regions as those phases ship.

Rows go straight into the + New supplier checklist, so the engine is unchanged. It is measured by final row accuracy
**and** review time against hand entry on the same packets. The same suggest-and-confirm screen is where the AI
reader (§2) later plugs in as a better suggester.

## 5. Getting it onto the site

| Step | How | Effort | Notes |
|---|---|---|---|
| A. Bring your own key | The page calls the Claude API directly from the browser (the API allows this with an opt-in header). The SQE pastes a key in settings; it stays in that browser only, never in the repo or the site | ~1 day, plus ~$1 to re-check accuracy on one eval batch | A packet is ~3k tokens: about 10–20 s and a few cents. Fine for a demo or a single user |
| B. Team deployment | A small server function holds the company key; staff sign in with company login; rate limits and an audit log of every call | ~1–2 weeks with IT | No key in the browser. Use an enterprise API agreement with zero data retention: supplier packets are confidential |
| C. Connect to PLM/QMS | Read packets from the QMS document store by API; write the decision, cited gaps and RFI back to the supplier record | Depends on the QMS | The QMS stays the system of record; this is the review step before the record is filed |

## 6. Phases and exit criteria

| Phase | Delivers | Done when |
|---|---|---|
| 0 (done) | Offline agent, blind eval, rules reader on the site | EVAL.md published; #172 merged |
| 1a | Assisted mapping (§4) for text, Markdown, CSV; value rules for Cpk, certificate expiry and one key test | Proven-row precision with original locations (§3.3) and review time vs hand entry measured on held-out layouts; the CSV citation round-trip check (§4) passes |
| 1b | Bring-your-own-key AI reader for the current packet format, with the verify stage | Eval worlds re-run through the browser path; numbers published |
| 2 | Convert stage for `.docx`, `.xlsx`, text PDF; saved column mappings; messy-mode test packets | Messy-mode eval meets the targets in §3; the citation round-trip check passes for XLSX |
| 3 | Scans and photos through a vision model | Transcription measured against independently labelled image values; the original page region is shown beside every transcription and the SQE confirms each image-derived value against the image before it can be Proven |
| 4 | Team deployment (§4 B) and QMS connection (§4 C) | IT and quality sign-off |

## 7. Risks

| Risk | Control |
|---|---|
| Invented values | The page builds every value from its own copy of the source (§2); a model-typed number cannot reach the engine |
| Supplier writes evidence-looking text | Every reader's *proven* means the packet records a result; the SQE confirms on the cited page before saving |
| Over-caution (false alarms) | Evidence rule in the prompt; tracked in Eval; target ≤ 5% |
| Confidential supplier data | Enterprise API with zero data retention; no key or data in the public site |
| Model or prompt drift | Pinned model ID and prompt hash on every extraction (already in `run`); re-test on fresh worlds after any change |
| Network down on the day | The rules reader and hand entry still work offline |

## Changelog

| Date | Change |
|---|---|
| 2026-11-20 | PR review: stricter Proven-row evidence metric, the published over-trusting miss as a prompt gate, image-derived evidence rules for scans, Stage 2 aligned to the selector contract, citations that survive saving, two routes named in §1 |
| 2026-11-19 | Review round: evidence-selector design (model picks block IDs, page builds the value), Needs review status, paired traps and precision, assisted-mapping converter as §4 and phase 1a |
| 2026-11-19 | First version (issue 173): known limitation of the rules reader, four-stage design, accuracy plan, delivery steps, phases |
