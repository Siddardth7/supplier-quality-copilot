# PRD-04 — Evidence extraction agent & eval

| Field | Value |
|---|---|
| Status | Approved |
| Owner | Sid (SME) |
| Release | v1.0 |
| Milestone | v1.0 · M4 Agent |
| ID prefix | `AGENT` |
| Specs referenced | `docs/RUBRIC.md` (criteria the agent extracts), `docs/DATASET.md` (answer key, reference extractions) |
| Last updated | 2026-11-13 |

## 1. Problem

Reading a 40–200 page packet against 30-plus criteria is the slow part of qualification, and it's the part an LLM is good at. But "the AI reads it" isn't credible unless the output is checkable: every claim cited, every unknown marked as such, and the agent's accuracy measured on gaps it couldn't have seen in advance.

## 2. Users and jobs

| Persona | Job to be done | How this feature helps |
|---|---|---|
| Senior SQE | Stop reading full packets | Gets a per-criterion extraction with citations, then checks only what matters |
| Junior SQE | Write the RFI and plan the audit | Gets both drafted, built from the engine's item lists |
| Interview panel | Decide whether to trust the agent | Sees a catch rate measured blind against a fixed answer key, with the misses explained |

## 3. Goals and non-goals

**Goals**
- G1: The extraction schema is strict enough to validate mechanically.
- G2: The blind protocol can be repeated by someone else from this doc. *(PRD-00 G4)*
- G3: Catch rate ≥ 90% on eval worlds 101–104 with false alarms ≤ 5%, published as measured. *(PRD-00 G4)*
- G4: Drafts are consistent with the engine: the RFI asks for exactly the engine's RFI items, and the audit plan covers exactly its audit focus.

**Non-goals**
- NG1: The agent producing scores, decisions or routing (PRD-00 NG3).
- NG2: Live calls from the browser (PRD-00 NG6). Extractions are committed JSON.
- NG3: Prompt tuning against the answer key. Changing the skill after seeing the key invalidates the run (AGENT-FR-09).

## 4. Requirements

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| AGENT-FR-01 | `agent/SKILL.md` must be a Claude Code skill that reads one packet and writes one extraction per the schema below | Must | validator on every output |
| AGENT-FR-02 | The extraction must list every criterion that applies to the supplier's commodity, including nice-to-have, exactly once, and nothing else | Must | validator |
| AGENT-FR-03 | Each item must follow the state rules in §5; `value` must match the criterion's type in `RUBRIC.md`; citations must use the `file §section` format and point to a file that exists in the packet | Must | validator |
| AGENT-FR-04 | `drafts.rfi_items` and `drafts.audit_focus` must equal what the engine computes from the same extraction, and the RFI email must name every RFI item | Must | draft consistency check |
| AGENT-FR-05 | Every draft must start with the label `DRAFT — prepared by an agent for SQE review. Not sent.` | Must | draft consistency check |
| AGENT-FR-06 | Each packet must be extracted by a fresh session that can reach only the staged files listed in §5 | Must | run log audit |
| AGENT-FR-07 | `agent/eval.mjs` must compute catch, partial, miss, false positives, citation match and decision agreement, using the definitions in §5 | Must | unit test on a hand-made extraction |
| AGENT-FR-08 | `docs/EVAL.md` must publish the first complete run's numbers, every miss and partial with the reason, the model ID, the run date and the skill's git SHA. The same runs' `eval.mjs --json` output is committed as `data/eval.json` (`{ runs: [...] }`, oldest first) for the Eval view (PRD-13) | Must | review |
| AGENT-FR-09 | If the skill changes after a run, it must be re-tested on fresh worlds 105–108, and `docs/EVAL.md` must report every run, not just the best | Must | review |
| AGENT-FR-10 | A run must cover every candidate in the demo world and eval worlds 101–104 on `claude-sonnet-5-5`, plus one comparison run of 101–104 on `claude-opus-5-5`. The headline comes from 101–104 only; the demo world and Sid's hold-out traps are reported in their own rows | Must | review |
| AGENT-FR-11 | `eval.mjs` must refuse to score a world whose answer key doesn't match its committed `answer_key.sha256` | Must | unit test |
| AGENT-FR-12 | The RFI email's last line must be exactly `Stark Industries Supplier Quality — Pepper Potts` | Must | draft consistency check |
| AGENT-NFR-01 | `validate.mjs`, `stage.mjs`, `eval.mjs` and `drafts.mjs` must use only Node built-ins | Must | review |

## 5. Interfaces

### Extraction schema: `data/extracted/<id>.json`

```json
{
  "schema": "sqc-extraction/1",
  "supplier_id": "SUP-07",
  "commodity": "cold_plate",
  "run": { "run_id": "2026-11-20a", "model": "claude-sonnet-5-5", "skill_sha": "abc1234" },
  "criteria": [
    { "id": "2.ctq_cpk", "state": "verified", "value": 1.12, "citation": "capability_study.md §2", "note": "Flatness, n=125" },
    { "id": "6.ramp_plan", "state": "assumed", "value": null, "citation": "cover_letter.md §3", "note": "\"Ramp plan to follow\"" },
    { "id": "8.subtier_named", "state": "missing", "value": null, "citation": null, "note": "quality_manual.md §7.4 says plating is outsourced, no name" }
  ],
  "drafts": {
    "rfi_items": ["2.spc", "6.ramp_plan", "8.subtier_named", "8.subtier_certs"],
    "rfi_email": "DRAFT — prepared by an agent for SQE review. Not sent.\n\nSubject: …",
    "audit_focus": ["2.ctq_cpk", "6.lead_time", "8.subtier_named"],
    "audit_plan": [ { "criterion_id": "2.ctq_cpk", "question": "…" } ]
  }
}
```

**State rules**

| State | `value` | `citation` | `note` |
|---|---|---|---|
| `verified` | required, of the criterion's type | required: where the evidence is | optional |
| `assumed` | optional (the claimed value, if any) | required: where the claim is | required: quote the claim |
| `missing` | `null` | `null` | required: where the agent looked |

- `citation` matches `^[a-z0-9_]+\.md §[0-9]+(\.[0-9]+)*$`, and the file must exist in the packet.
- `note` is at most 240 characters.
- `audit_plan` has one entry per `audit_focus` ID, in the same order.
- Unknown top-level keys are rejected.

### Blind protocol

1. **Freeze.** Commit `agent/SKILL.md` and record its SHA. Nobody looks at outputs before the full run is done.
2. **Stage.** `node agent/stage.mjs <n> SUP-07` creates `$TMPDIR/sqc-blind/<n>/SUP-07/` containing only:
   - `SKILL.md`
   - `RUBRIC.md`
   - `packet/` (a copy of `data/worlds/<n>/packets/SUP-07/`)

   The staging area excludes the answer key, facts, briefs, `DATASET.md`, `SIMULATION.md`, PRDs, reference extractions, the engine, other packets and earlier extractions.
3. **Run.** From the staging directory, start a new headless session with no prior conversation:

   ```
   claude -p "Run the skill in SKILL.md on ./packet; write extraction.json. run_id: <run_id>, model: <model>, skill_sha: <sha>" --model <model> --tools Read,Glob,Write --allowedTools Read,Glob,Write --strict-mcp-config --disable-slash-commands --restricted --no-session-persistence --output-format stream-json --verbose > run.jsonl
   ```

   `agent/blind-run.sh` runs this for every staged packet, under a fresh `CLAUDE_CONFIG_DIR`; `docs/BLIND-RUN.md` is the runbook.

   Run one packet per session, every packet of every world in one sitting, on the same model.
4. **Audit.** `node agent/stage.mjs --audit run.jsonl --run <run_id>` fails if any tool call used a tool other than Read, Glob or Write, touched a path outside the staging directory, or wrote any file other than `extraction.json`, and fails on any log line it doesn't understand. It takes the staging directory, `<n>` and `<id>` from the log's init event. The list of files read is saved as `agent/runs/<run_id>/<n>/<id>.files.txt`.
5. **Collect.** `node agent/stage.mjs --collect <staging-dir> --run <run_id>` (add `--demo` for the demo world) re-checks the audit, then copies `extraction.json` to `agent/runs/<run_id>/<n>/<id>.json` and saves the run log (`<id>.run.jsonl`), the SHA-256 of every staged file (`<id>.inputs.txt`) and the validator's result (`<id>.validation.json`). With `--demo` a valid extraction is also copied to `data/extracted/<id>.json` for the app. It never replaces earlier evidence. A packet that fails validation counts as all misses. It isn't re-run.
6. **Score.** Run `node agent/eval.mjs`, then write `docs/EVAL.md`.

### Eval definitions

Each world's answer key holds every applicable criterion per candidate. A **gap row** is one whose expected item scores below 3, or, for nice-to-have, isn't `verified`; every other row is **clean**. Headline numbers are over the gap rows of worlds 101–104. The targets are judged only when all four worlds are scored; a headline missing a world is reported as incomplete, with no pass or fail.

| Outcome | Rule |
|---|---|
| **Catch** | The agent's state equals `expected_state`. When the expected state is `verified`, the value must also match `expected_value`: Cpk and %GRR within ±0.01, other numbers to 2 decimals, bools and dates exactly |
| **Partial** | The agent flags the gap but the state or value differs (the wrong kind of problem). "Flags" means its item scores below 3, or, for `info` rows, isn't `verified` |
| **Miss** | Not flagged: the item scores 3 (or, for `info`, is `verified`), or is absent |

- **Catch rate** = catches ÷ gap rows. Only catches count; the target is ≥ 90%.
- **Flag rate** = (catches + partials) ÷ gap rows.
- **False alarm**: a clean row the agent flags. Reported as count ÷ clean rows; target ≤ 5%. The clean rows of a packet with no extraction, or one that fails validation, were never assessed: they are left out of this rate and reported as a separate count. That packet's gap rows still count as misses.
- **Citation match**: for catches with expected state `verified`, the share whose citation file and top-level section equal the answer key's.
- **Decision agreement**: per world, the candidates where the engine on the agent's extraction gives the same decision and routing as on the answer key.
- **Rows reported separately**: demo world, Sid's hold-out traps, the Opus comparison run, and any re-test on 105–108.

## 6. Acceptance criteria

- [ ] AGENT-AC-01: The validator rejects one hand-made bad case per schema rule and accepts every reference extraction of the five worlds. *(proves AGENT-FR-02, -03)*
- [ ] AGENT-AC-02: `eval.mjs` gives the expected catch, partial, miss and false-positive counts on a hand-made extraction with one of each. *(proves AGENT-FR-07)*
- [ ] AGENT-AC-03: Every run log passes the audit, and every file read is listed. *(proves AGENT-FR-06, G2)*
- [ ] AGENT-AC-04: The draft consistency check passes for every extraction. *(proves AGENT-FR-04, -05, -12, G4)*
- [ ] AGENT-AC-05: `docs/EVAL.md` reports the catch rate (≥ 90%) and false alarms (≤ 5%) for worlds 101–104, the separate rows, every miss and partial with a reason, and the model, date and skill SHA. *(proves AGENT-FR-08…10, G3)*
- [ ] AGENT-AC-06: `eval.mjs` refuses a world whose answer key was edited after its hash was committed. *(proves AGENT-FR-11)*

## 7. Open questions

| # | Question | Owner | Resolution |
|---|---|---|---|
| 1 | Which model runs the extraction? | Sid | 2026-11-09: `claude-sonnet-5-5` main run plus one `claude-opus-5-5` comparison run, recorded per run |
| 2 | Is `RUBRIC.md` allowed in the staging area? | Sid | Yes. The rubric is what a human SQE would also read. The gap matrix lives in `DATASET.md`, which is excluded |
| 3 | If the catch rate is below 90%, do we fix the skill and re-run? | Sid | Allowed, but every run is published (AGENT-FR-09). The first run stays in `EVAL.md` |

## 8. Out of scope

| Item | Picked up by |
|---|---|
| Live extraction from a pasted packet | Unscheduled (was stretch S3) |
| SCAR drafting | v1.1 (PRD-08) |
| A held-out second dataset | Unscheduled |

## 9. Changelog

| Date | Change |
|---|---|
| 2026-11-14 | Issue 36: `docs/EVAL.md` and `data/eval.json` published for runs `2026-11-14-sonnet` and `2026-11-14-opus`. The first Sonnet run fails the false-alarm target (10.0% vs ≤ 5%) and meets the catch target (97.3%), as measured. No definition changes. The acceptance boxes stay as written. |
| 2026-11-13 | §5 step 3 (issue 33): the headless command now also passes `--tools Read,Glob,Write --strict-mcp-config --disable-slash-commands --restricted --no-session-persistence --verbose` (no other tool, MCP server, skill or user setting can reach the session; `--verbose` is required for stream-json) and gives `run_id`, `model` and `skill_sha` in the prompt, which SKILL.md copies into `run`. Step 4: the audit also fails when the init event offers a tool beyond Read, Glob and Write or any MCP server, and accepts `rate_limit_event` lines (a real log has them). `docs/BLIND-RUN.md` and `agent/blind-run.sh` added. No eval definition changes. |
| 2026-11-13 | AGENT-FR-08 (issue 111): every miss, partial and false-alarm row of `eval.mjs --json` also carries `expected_citation`, the answer key's citation (hold-out: `<file> §<section>` for a verified trap, else null), so the Eval view can open the key's section. Additive; no count, rate or target changes. A run's date is the leading `YYYY-MM-DD` of its `run_id` (as in the `2026-11-20a` example); `--json` has no separate date field. |
| 2026-11-11 | AGENT-FR-08: the published runs' `eval.mjs --json` output is also committed as `data/eval.json` for the Eval view (PRD-13, #76). No eval definition changes. |
| 2026-11-11 | Draft consistency check in `agent/drafts.mjs` (#35): `rfi_items` and `audit_focus` equal the engine's (same ids, same order), `audit_plan` follows the engine's `audit_focus`, and the RFI email names exactly the engine's RFI items by criterion ID (every one, nothing else). The FR-05 label applies to `rfi_email`, the only text draft, and is checked as its exact first line. New AGENT-FR-12: the email's last line is exactly the signature. The check needs the evaluation day: `--as-of` is required, policy is Stark Reference v1. |
| 2026-11-11 | Eval definitions: targets judged only when all of 101–104 are scored; clean rows of unusable packets are left out of the false-alarm rate (#34). |
| 2026-11-11 | Blind protocol steps 4–5 name the commands `agent/stage.mjs` implements: `--audit` takes `--run <run_id>` and allows Write to `extraction.json` only; new `--collect` form (#33). |
| 2026-11-09 | Eval over five simulated worlds: headline from 101–104, gap/clean rows, Cpk ±0.01, false alarms ≤ 5%, re-test on 105–108, Opus comparison, hash check (AGENT-FR-10, -11, AC-06). |
| 2026-11-08 | First draft: extraction schema with state rules, blind protocol (staging, headless session, path audit), eval definitions, draft consistency rules. |
