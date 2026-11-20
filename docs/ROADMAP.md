# Roadmap

Releases are made of milestones, and milestones are made of issues. Product docs come first (M1), so every later issue builds against an agreed spec. There are no dates; work moves when the previous gate is met.

## Releases and milestones

These match the GitHub milestones exactly.

| Release | Milestone | Delivers | PRD | Issues | Exit gate |
|---|---|---|---|---|---|
| **v1.0 MVP** | v1.0 · M1 Product docs | PRDs, specs, test plan, this roadmap | PRD-00…09, DESIGN-SPEC, TEST-PLAN | #1–#14 | Engine, data and agent docs Approved; M2–M8 issues refined (#14). UI docs updated at M5 start (#76) |
| | v1.0 · M2 Engine | `app/rubric.js`, `app/engine.js`: qualification and scorecard | PRD-01, PRD-02 | #15–#23 | L1 + L2 tests green |
| | ~~v1.0 · M3 Dataset~~ | Superseded by M3b (hand-planted traps) | PRD-03 | #24–#30 (to close) | — |
| | v1.0 · M3b Simulated world | Seeded supplier simulation, Stark requirement sheets, Codex-written packets, fact check, locked answer key, demo world + 4 eval worlds | PRD-03, SIMULATION.md | #66–#75 | All 5 worlds built, fact check clean, answer keys locked |
| | v1.0 · M4 Agent | Extraction skill, validator, blind run, eval, `docs/EVAL.md` | PRD-04 | #31–#36 | Catch rate published |
| | v1.0 · M5 Workbench UI | Today, Qualify, Compare, Monitor, Standards, Eval; + New supplier; sheet upload | PRD-05, PRD-06, PRD-10…13, DESIGN-SPEC (#76) | #37–#47, #76–#78, #107–#112 | L5 checklist passes at 1280 px and 390 px |
| | v1.0 · M6 Ship | Scrub, public link, README, demo, handout, tag | PRD-07 | #48–#53, #169 | Ship checklist all ticked; `v1.0` tagged |
| **v1.1** | v1.1 · M7 Draft SCAR | SCAR drafts for flagged active suppliers | PRD-08 | #54–#56 | `v1.1` tagged |
| **v1.2** | v1.2 · M8 QES port | `supplier-qualification` in Quality Engineering Skills | PRD-09 | #57–#60 | QES CI green; `v1.2` tagged |
| **v2.0 Live** | not created yet | Daily supplier data feeds, shared team dashboard and logins, live packet upload with AI reading, PDF upload ([spike evidence](https://github.com/Siddardth7/supplier-quality-copilot/tree/spike/m5-pdf-text)), scanned-PDF OCR, team-wide policies, editable requirement sheets, AHP weighting; **option B, a desktop shell** (Electron or Tauri) for local file access plus calling Claude with a local key (live packet upload with AI reading, no server). It costs a dependency, a build step and code signing | — | — | — |

## How work moves

- **Branches:** `<type>/<milestone>-<slug>` off `origin/test` → PR into `test` → `test` merges into `main` only at a release (`/release vX.Y`, merged `--no-ff` by Sid). Nothing is pushed or merged to `test` or `main` directly.
- **One issue = one branch = one PR**, with `Closes #N` and the requirement IDs it delivers. Exception: doc-only milestones may batch issues into one PR at Sid's call (M1 did).
- **Bigger issues** (engine, dataset, agent, UI) run through `/ship <issue#>`: research → coder → tester → reviewer, see `.claude/`. Small doc fixes are done inline.
- **Definition of done:** [TEST-PLAN §2](product/TEST-PLAN.md#2-definition-of-done-per-issue).
- **Review:** after each issue the work stops for Sid's review before the next one starts.

## Demo script (3 minutes)

The script, with a deep link, what to say and a time for each step, is [`docs/DEMO.md`](DEMO.md) (M6, SHIP-FR-05). In outline:

1. Open on **Today**: triage items, queue counts, this week's escalations.
2. "Your backlog is a queue." Qualify: 9 suppliers waiting, worst first.
3. Open SUP-07 (NPI cold plate): 84.4, CONDITIONAL, three fails and four claimed-but-unproven items (two of them knockouts), all cited. Click a citation.
4. "Who signs?" Flip *Viewing as* Junior/Senior. Senior, because it's CONDITIONAL and High-risk. Then SUP-04 to show the junior sign-off path.
5. Show the RFI email already drafted, asking only for what's unproven.
6. Compare the three cold-plate bidders. Then Standards: switch off a knockout and watch a decision flip in the impact panel.
7. Switch to Monitor: ACT-02's run rule fires while its DPPM still isn't Bad.
8. Close on Eval: "On four simulated worlds it had never seen, with answer keys locked before the run, the agent caught 97.3%. Here are the ones it missed, and that's why a person still signs."

## Decisions log

| Date | Decision | Why |
|---|---|---|
| 2026-11-08 | Static vanilla web app, no backend or build; agent output precomputed | Zero hosting cost, opens anywhere, nothing to break in a demo |
| 2026-11-08 | Scores are deterministic JS, never LLM | Auditability; the same principle as Quality Engineering Skills |
| 2026-11-08 | Private until ship, no target-company branding | The demo must stand on its own and not leak anything identifying |
| 2026-11-08 | Release structure v1.0 / v1.1 / v1.2, one milestone per feature, docs first in M1 | Every feature gets a spec and its own review gate before code |
| 2026-11-08 | `test` integration branch; `main` only at releases | Keeps `main` equal to the last release |
| 2026-11-08 | Blind extraction: fresh session per packet, staged files only | A catch rate is only evidence if the agent couldn't see the answers |
| 2026-11-08 | Catch-rate target ≥ 90% (23 of 25), published as measured, every run reported | Stating the bar before the run is the honest version |
| 2026-11-08 | ~~25 planted gaps (23 scored, 2 nice-to-have)~~ superseded 2026-11-09 by the simulated world | Enough to make the catch rate meaningful across all gap kinds |
| 2026-11-08 | 18 months of history, M1–M6 baseline | ACT-02's 7-month run needs 7 monitoring months after a baseline |
| 2026-11-08 | Rubric v1: criterion IDs, value types, explicit band edges | Two engineers (or an engine) must get the same score |
| 2026-11-08 | Nice-to-have evidence unscored; an assumed knockout caps at CONDITIONAL | Keeps the total honest; no approving on a claim for a must-pass item |
| 2026-11-08 | Null scorecard metric makes the composite Unrated | Missing data is undecided, never zero; matches QES so the port needs no change |
| 2026-11-08 | SCAR drafts are a deterministic template, never authoring a root cause | The supplier owns the root cause |
| 2026-11-09 | Go public as a separate repo from a scrubbed v1.0 snapshot | Merged PR diffs keep identifying text even after a history rewrite |
| 2026-11-09 | Buyer is Stark Industries; suppliers carry Marvel company names; fan-made disclaimer | Fits the team's startup culture and makes the demo memorable; real companies stay out |
| 2026-11-09 | Commodity list kept at 8; plastics left out | Matches the JD and public filings; plastics is Low risk and sheet metal already covers that case |
| 2026-11-09 | Category 4 is a test catalog plus commodity profiles; adding a test is a data change | Must scale to any number of tests without code changes (QUAL-NFR-05) |
| 2026-11-09 | Section Q reference values (weights, pass marks 85/70, knockouts, Cpk and Gage R&R bands, heuristic thresholds, junior routing) kept as the **Stark Reference** policy defaults | Sensible starting points; teams can change them (next row) |
| 2026-11-09 | Weights, pass marks and knockouts are editable in the app as a named, versioned team scoring policy; every result shows the policy that scored it | Teams value categories differently; ISO 9001 8.4 needs consistent, documented criteria, so policies are controlled, not personal |
| 2026-11-09 | Weights set by a 1–5 importance rating per category, normalized to 100. A pairwise (AHP) matrix is a future option | Fast to set and easy to explain; AHP's 36 comparisons are tedious |
| 2026-11-09 | A Stark requirement sheet per part sets our acceptance limits; tests are judged against Stark's limits, not the supplier's | Real qualification checks results against the buyer's spec |
| 2026-11-09 | Side-by-side comparison of suppliers bidding for the same part | Quality decides who is acceptable; Sourcing picks among them |
| 2026-11-09 | Live upload of new packets with in-browser AI extraction deferred past v1.0 | Needs a backend and an API key; the static v1.0 has neither |
| 2026-11-09 | Scorecard weights, color limits and grade cut-offs are editable in the same team policy; section S reference values kept as Stark Reference defaults (S2 limits revisited with the website flow) | Same controlled-policy model as qualification |
| 2026-11-09 | Simulate the supplier base instead of planting traps; Codex writes packets from simulated facts; answer key from the engine, hash-locked before extraction; 5 worlds (demo + 101–104); Sid adds hold-out traps; archetypes keep the demo stories; Horizon Labs (SUP-09) added as a third cold-plate bidder | Planting and finding our own traps is circular; independent generation, a different writer model and a pre-committed key make the catch rate credible |
| 2026-11-09 | `AGENTS.md` added so Codex can pick up issues under the same rules | Codex reads AGENTS.md, not CLAUDE.md |
| 2026-11-09 | Eval: caught = right state and value (Cpk ±0.01), partial = wrong kind, missed = said fine; only caught counts toward ≥ 90% | One strict, published definition |
| 2026-11-09 | Headline catch rate from eval worlds 101–104 only; demo world reported separately | The demo world was selected for its stories |
| 2026-11-09 | A skill changed after seeing results is re-tested on fresh worlds 105–108; every run is published | Re-testing on seen data is studying the exam |
| 2026-11-09 | Also report false alarms (target ≤ 5% of clean items), decision agreement per world, citation accuracy, and Sid's hold-out traps in their own row | A catch rate alone hides false alarms and wrong decisions |
| 2026-11-09 | Reader: Claude Sonnet main run plus one Claude Opus comparison run; drafts signed by Stark Industries Supplier Quality (Pepper Potts) | Cheap enough to run every world; the comparison is a good panel question |
| 2026-11-09 | Screens: Qualify (queue, detail, citation viewer), Compare, Monitor, Policy, Eval; header "Stark Industries · Supplier Quality Copilot", text only, no Marvel artwork | One tab per job; Compare and Policy carry decisions D4 and D1, Eval closes the demo |
| 2026-11-09 | Requirement sheets view-only in v1.0 | Editable limits would need the agent to extract every measured value; editable policy already shows nothing is hardcoded |
| 2026-11-09 | Custom policies saved in the browser, shared via URL, export/import as a file | No server in v1.0; team-wide storage comes with the live version |
| 2026-11-09 | Section R confirmed: v1.1 SCAR drafts as a fixed template (no root cause, OTD alone doesn't trigger, "red" follows the active policy); v1.2 QES port extends the existing vendor scorecard | As written in PRD-08 and PRD-09 |
| 2026-11-09 | v2.0 "Live" named on the roadmap, no issues yet: live upload with AI reading, PDFs, team-wide saved policies, editable requirement sheets, pairwise (AHP) weighting. Order: v1.1 → v1.2 → v2.0 | Gives "what's next" a concrete plan without scheduling it |
| 2026-11-09 | Wireframe walk-through accepted as the demo flow (RoLaMGAS template, artifact `1r2p43AZkDzkMa2AvJW8oj`). UI PRDs (PRD-00 feature map, PRD-05, PRD-06, DESIGN-SPEC) are updated at M5 start, not now (#76) | Sid: "mostly UI questions … make the changes when you're working on the UI milestone" |
| 2026-11-09 | W1: 1–5 ratings stay; the reference keeps exact points until a rating changes; revisit in M2 rubric work | Ratings can't reproduce 15/10/8/7 exactly |
| 2026-11-09 | W2 + W6: Policy tab renamed **Standards** (company standards); it holds the scoring policy and the Stark requirement sheets in one place | One home for "our company's rules and requirements" |
| 2026-11-09 | Standards accepts uploaded Stark requirement sheets as JSON, CSV, Markdown **and PDF** in v1.0, read without AI or libraries; the SQE confirms a preview before saving (#78). PDF ships only if the spike reads text PDFs from three producers; else PDF moves to v2.0. Scanned PDFs (OCR) are v2.0 | Most teams keep sheets as PDFs; text PDFs are parseable with browser built-ins, scans are not |
| 2026-11-09 | **+ New supplier** in Qualify: the SQE fills the rubric checklist by hand and the engine scores it live; saved in the browser, exportable (#77). v2.0 fills the same checklist from an uploaded packet with the agent | Lets the tool qualify a real new supplier in v1.0 with no AI |
| 2026-11-09 | W3: Compare ranks acceptable bidders by score (dynamic, follows the active policy); not-acceptable bidders listed below with the reason | Sid wants to see who is doing better; the decision still gates who is acceptable |
| 2026-11-09 | W4: *Viewing as* Junior/Senior switch; it highlights what that role may sign. Employee logins are v2.0 | Makes the delegation rule visible in the demo |
| 2026-11-09 | W5: the app opens on **Today**: triage items, queue counts, this week's escalations; then the tabs | The shared team dashboard is the real-world use |
| 2026-11-09 | W7: Monitor links to Qualify and to Today; any out-of-spec alert lands in Today's triage | One alarm list for the team |
| 2026-11-09 | Real-world goal recorded: one shared quality dashboard for qualification and daily supplier scoring, fed automatically from supplier data. Daily feeds are v2.0 Live | Sets direction without adding v1.0 scope |
| 2026-11-09 | An `assumed` knockout with a claimed failing value (e.g. Cpk 0.9) scores 0 and fails; with no value or a passing value it scores 1 and caps at CONDITIONAL | Approving or conditionally approving on a claim the supplier's own number contradicts isn't defensible; rule is `min(1, rule(value))` for every criterion |
| 2026-11-09 | Cpk and Gage R&R bands stay as in RUBRIC.md (Cpk ≥ 1.33 full, 1.00–1.33 partial, < 1.00 fails; GR&R ≤ 10 / ≤ 30). CTQs are two-sided in v1.0. The UI may label Cpk ≥ 1.67 "excellent" with no score change (M5) | Keeps the AIAG-based bars unchanged; "excellent" is a display label only, the engine score stays 3 |
| 2026-11-09 | Routing reason: `Sole source` only when the second source is verified `false`; a claim without proof, missing or absent gives `Second source unconfirmed` (RUBRIC, #18) | A reason should say what we know, not what the supplier claims |
| 2026-11-09 | Nice-to-have tests that are not verified (missing or assumed) are `info`, listed separately from scored gaps (RUBRIC, PRD-01, #19) | Matches the eval rules, so the app and the catch rate count the same things |
| 2026-11-10 | Repeat NC: an earlier NC with the same failure-mode code 1–180 days before; the same day doesn't count (SCORECARD, #20) | Pins the look-back edges so two people get the same rate |
| 2026-11-10 | Tier-drop, SCAR-aging and bad-metric alerts fire in all 18 months; only M18 alerts are active (SCORECARD, #21) | Monitor history shows when a supplier first went bad, even in the baseline |
| 2026-11-10 | CI: one GitHub Actions workflow runs `node --test` on Node 26 for every PR and push to `test` and `main`. No CD until the UI ships (M6 adds the Pages deploy) | Verifies Codex's and Claude's PRs independently and catches two PRs that break each other; no dependencies, so the job is seconds |
| 2026-11-10 | Three agents in parallel, each in its own worktree and milestone: Claude M2 then M5, Codex M3b, Gemini (Antigravity) the M4 agent code. The M4 extraction and eval runs (#33, #36) stay on Claude, as PRD-04 requires (AGENTS.md) | Speeds up v1.0 without two agents touching the same files; CI checks every PR |
| 2026-11-12 | URL-hash router (#38): DESIGN-SPEC §4.2 is the key list; the issue's `#criterion=` key is superseded (not a key). Invalid or foreign keys are dropped and the URL normalized in place; a well-formed unknown ID shows "Not found" | Docs are the spec; one canonical URL per screen |
| 2026-11-13 | PDF requirement-sheet upload → v2.0 (Sid, issue 78), superseding the conditional PDF-in-v1.0 decision of 2026-11-09. V1.0 ships JSON, CSV and Markdown only; PDF scan/encryption refusal handlers also stay with v2.0. [Preserved spike and producer table](https://github.com/Siddardth7/supplier-quality-copilot/tree/spike/m5-pdf-text) | Chrome reads only 139/154 complete rows across real tables; cupsfilter’s 154/154 plain-text result is not representative of typical sheets |
| 2026-11-14 | First eval published in `docs/EVAL.md` and `data/eval.json` (issue 36): Sonnet catch 97.3% (target met), false alarms 10.0% (target ≤ 5% missed), published as measured with no skill change; Opus comparison 100.0% / 0.0% | PRD-04 G3: the bar was stated before the run, so the result stands as measured |
| 2026-11-17 | Desktop app, option A (Sid, issue 169): ship an installable web app (manifest, root service worker, icons) with offline mode for the whole app plus the 560 data files it fetches (2.5 MB). No Electron/Tauri in v1.0 | Zero dependencies, no build, works from Pages and serve.mjs, covers a failed venue Wi-Fi |
| 2026-11-17 | Desktop app, option B (Sid, issue 169): an Electron or Tauri desktop shell goes on the v2.0 Live row. Needed only for local file access plus calling Claude with a local key (live packet upload with AI reading, no server). It costs a dependency, a build step and code signing | Not needed for the static v1.0; each cost conflicts with the vanilla/no-build rule |
| 2026-11-19 | Packet upload, option A (Sid, issue 172): a rules-based packet reader in the browser fills the + New supplier checklist from uploaded packet Markdown; the AI reader stays offline and is planned separately. The reader only reads packets in the shipped format. This supersedes the 2026-11-09 "+ New supplier" row's "v2.0 fills the same checklist with the agent" for the rules reader only; v2.0 Live keeps live packet upload with AI reading and PDFs | Qualify a brand-new supplier end to end on the site with no terminal and no AI call; accuracy is measured against the answer keys |
| 2026-11-19 | Issue 172 defaulted decisions (Sid may overrule): D1 the reader matches section titles exactly, no keyword or fuzzy fallback (1440/1440 without; fuzzy would add false matches). D2 an optional `packet` field on `sqc-manual/1`, no schema bump (additive; records without it are byte-identical). D3 caps 64 KB per file, 256 KB per packet (shipped max 4.7 KB). D4 value ladder P1–P3 and Check flags F1–F6. D5 claimed rows carry no value; absent sections are Missing. D6 flags are transient and do not block Save. D7 upload lives in step 2 and replaces rows after a confirm if any were filled. D8 a "Use the sample packet" button. D9 the sample is derived from the SUP-07 packet, `rfq.md` from `renderRequirements`. D10 Cpk 1.3187 as the sample's near-limit value (just under 1.33, scores 1). D11 Proven means "the packet records a result in the evidence format", not independent proof (Team Lead); the reader reads only plain body lines and the first result line per section (F6). Sample name Brand Corporation, real-vendor check UNVERIFIED | Defaults keep the reader exact, auditable and small; each is listed so it can be reversed in one place |
| 2026-11-20 | A true recorded result contradicted by a reported failed buyer limit is Claimed with a Check flag (#172) | Keeps contradictory evidence from passing a knockout |
| 2026-11-20 | List applicable unnumbered packet headings as unmatched (#172) | Explains why their evidence could not be cited |
| 2026-11-20 | Packet reader review (#172): nested criteria own their evidence, possible boolean outcomes stay Claimed, and duplicate section numbers produce Claimed rows with citation flags | Keeps unrelated evidence and ambiguous citations from passing qualification checks |
| 2026-11-19 | The AI reader on the site is planned, not built: [AI-READER-PLAN.md](AI-READER-PLAN.md) (#173). Convert, AI proposes evidence by block ID, the page builds the value and checks it, SQE review; assisted mapping (no AI) for other file types; stricter Proven-row evidence metric | Shows the path past the rules reader's known limitation (#172) with measurable exit criteria |
| 2026-11-20 | Coolant Loop theme (#178), dark default plus a light variant with a Light mode toggle (Sid, 2026-11-19/20). Defaulted (Sid may overrule): D1 the toggle sits in the header tools right after *Viewing as*, not in the sticky shell bar (a one-line HTML move); D2 light-mode particles are subtler (`--flow-alpha` .35), not off; D3 the contrast worst case is the two strongest blobs stacked at full alpha, unblurred (all four only for the large-text title check); D4 particles are left out of the bound for bare-page text but included for text on a surface; D5 the light theme is screen-only, so print keeps the dark tokens the print rules assume; D6 CLAUDE.md should drop "dark navy" for the Coolant Loop wording (left for Sid to edit; the pipeline does not change CLAUDE.md). Merges to test only; reaches main at the next release. | Fits the liquid-cooling context; surfaces stay opaque enough that tables and the packet viewer keep AA contrast. |
