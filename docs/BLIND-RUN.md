# Blind extraction run (issue 33)

This document is the whole assignment for the person who runs the blind extraction. They need only this file and
the kit Sid sends. They don't need the repo, the project's history or any other document.

**What it is.** The kit holds 81 folders, one per supplier packet. Each folder contains three things: the extraction
skill (`SKILL.md`), the scoring rubric (`RUBRIC.md`) and the supplier's packet. A script starts one fresh,
headless Claude Code session per folder. Each session reads its folder and writes `extraction.json`. You don't judge,
edit or check anything; you start the script and send the folders back. It takes about 3–5 hours of machine time.

Why it's run this way (PRD-04 §5, "Blind protocol"): the catch rate only counts as evidence if the reader could not
see the answers. Each session can open only its own folder, has only the Read, Glob and Write tools, and starts with
no memory, settings or plugins. Every session's log is audited afterwards, and anything outside those rules fails the
audit.

---

## Part B: for the person running it

You need:
- A Mac or Linux computer (not Windows), plugged in, that can stay awake for about 5 hours.
- Claude Code installed (`claude --version` prints a version) and your own Claude account. Run this on your own
  computer with your own login; don't share credentials. Your plan must cover about 45 Sonnet and 36 Opus sessions
  of a few minutes each (a Max plan is comfortable; on Pro expect to wait out a usage limit).
- The kit file `sqc-blind-kit.tgz` from Sid.

**1. Unpack the kit into `/tmp`.** The folders must end up at exactly these paths; the audit checks them.

```sh
tar -xzf ~/Downloads/sqc-blind-kit.tgz -C /tmp
cat /tmp/sqc-sonnet/run.conf /tmp/sqc-opus/run.conf   # the two models and run names
ls /tmp/sqc-sonnet/sqc-blind /tmp/sqc-opus/sqc-blind   # 93 101 102 103 104 and 101 102 103 104
```

**2. Make a clean Claude profile** so no memory, settings or plugins from your own projects can reach the sessions.
Use the same terminal window for every step from here on.

```sh
export CLAUDE_CONFIG_DIR="$HOME/.claude-sqc"
claude          # log in with /login, then type /exit
claude --version
```

**3. Keep the computer awake** (macOS): `caffeinate -dims &`. On Linux, turn off sleep in settings.

**4. Run Sonnet, then Opus.** One command runs both, one after the other:

```sh
sh /tmp/blind-run.sh /tmp/sqc-sonnet && sh /tmp/blind-run.sh /tmp/sqc-opus
```

It prints a `start` and a `done` line per packet, three at a time, and each model ends with
`… 0 packet(s) without a finished run`. The model, run name and skill version come from the kit; you type nothing else.

**5. If it stops with `FAIL`** (almost always a usage limit): don't delete anything. Wait until the limit resets,
then run the **same command** again. In a new terminal, repeat step 2's `export` line first. It skips finished
packets, moves the failed attempt to `interrupted/` (kept and reported), and carries on. If you close the terminal
or the computer sleeps mid-run, do the same.

**Please don't:**
- start the command a second time while it is still running (two runs on the same folders would trip over each
  other); wait for it to finish or stop it with Ctrl-C first;
- open, edit, move or add files inside `/tmp/sqc-sonnet` or `/tmp/sqc-opus`;
- run `claude` yourself inside those folders, or ask Claude about the packets;
- change the commands or their flags, or run a packet again by hand.

**6. Send everything back:**

```sh
tar -czf ~/sqc-blind-results.tgz -C /tmp sqc-sonnet sqc-opus
claude --version
```

Send Sid `sqc-blind-results.tgz`, the `claude --version` output, and anything odd you saw. Then you
can delete `/tmp/sqc-*` and `~/.claude-sqc`.

---

## Part A: Sid prepares the kit

From a clean checkout of `test`, where the answer keys were locked before any extraction (SIMULATION.md §1). Set
`DAY` to the date the runner will run; it starts both run names (PRD-04: a run's date is the leading date of its
`run_id`). If the run slips to another day, pack again.

```sh
git switch test && git pull --ff-only
git status --short agent/SKILL.md docs/RUBRIC.md data/worlds    # must print nothing
DAY=2026-11-14; SHA=$(git log -1 --format=%h -- agent/SKILL.md); HEAD=$(git rev-parse HEAD)
rm -rf /tmp/sqc-sonnet /tmp/sqc-opus
for n in 93 101 102 103 104; do for p in data/worlds/$n/packets/SUP-*; do
  TMPDIR=/tmp/sqc-sonnet node agent/stage.mjs "$n" "$(basename "$p")" >/dev/null || break 2; done; done
for n in 101 102 103 104; do for p in data/worlds/$n/packets/SUP-*; do
  TMPDIR=/tmp/sqc-opus node agent/stage.mjs "$n" "$(basename "$p")" >/dev/null || break 2; done; done
for m in sonnet opus; do printf 'model=claude-%s-5-5\nrun_id=%s-%s\nskill_sha=%s\ntest_head=%s\n' \
  "$m" "$DAY" "$m" "$SHA" "$HEAD" > /tmp/sqc-$m/run.conf; done
ls -d /tmp/sqc-sonnet/sqc-blind/*/SUP-* /tmp/sqc-opus/sqc-blind/*/SUP-* | wc -l     # 81 stages
find /tmp/sqc-sonnet /tmp/sqc-opus -type f | sort | xargs shasum -a 256 > ~/sqc-kit.sha256
tar -czf ~/sqc-blind-kit.tgz -C /tmp sqc-sonnet sqc-opus -C "$PWD/agent" blind-run.sh -C "$PWD/docs" BLIND-RUN.md
```

Send `~/sqc-blind-kit.tgz` and this document. Keep `~/sqc-kit.sha256`. Nobody looks at any output until both runs
are back (§5 step 1).

## Part C: Sid collects the results

Run it as one block from the repo root; it stops at the first failed check.

```sh
sh -eu <<'END'
rm -rf /tmp/sqc-sonnet /tmp/sqc-opus && tar -xzf ~/sqc-blind-results.tgz -C /tmp
shasum -a 256 -c --quiet ~/sqc-kit.sha256                  # kit files and run.conf unchanged
# each stage holds exactly the kit files plus run.jsonl and extraction.json
sed 's/^[0-9a-f]*  //' ~/sqc-kit.sha256 | grep /sqc-blind/ | sort > /tmp/sqc-want.txt
find /tmp/sqc-sonnet/sqc-blind /tmp/sqc-opus/sqc-blind ! -type d ! -path '*/SUP-[0-9][0-9]/run.jsonl' \
  ! -path '*/SUP-[0-9][0-9]/extraction.json' | sort | diff /tmp/sqc-want.txt -
for m in sonnet opus; do
  . /tmp/sqc-$m/run.conf
  for d in /tmp/sqc-$m/sqc-blind/*/SUP-*; do
    demo=; [ "$m" = sonnet ] && [ "$(basename "$(dirname "$d")")" = 93 ] && demo=--demo
    node agent/stage.mjs --audit "$d/run.jsonl" --run "$run_id"
    # INVALID still files its evidence (it counts as all misses); a refusal files nothing and stops the block
    node agent/stage.mjs --collect "$d" --run "$run_id" $demo ||
      [ -f "agent/runs/$run_id/$(basename "$(dirname "$d")")/$(basename "$d").validation.json" ]
  done
  # interrupted attempts: a cut-off log has no result line; any other audit problem is a finding
  for f in /tmp/sqc-$m/interrupted/*/run.jsonl; do [ -f "$f" ] || continue
    [ -s "$f" ] || { echo "empty (killed before it started) $f"; continue; }
    node --input-type=module -e "import { auditLog } from './agent/stage.mjs'; import { readFileSync } from 'node:fs';
      const v = auditLog(readFileSync(process.argv[1], 'utf8')).violations.filter((x) => !x.includes('no result event'));
      console.log(v.length ? 'PROBLEM' : 'ok', process.argv[1], v.join('; ')); if (v.length) process.exit(1);" "$f"
  done
  if [ -d /tmp/sqc-$m/interrupted ]; then mkdir -p "agent/runs/$run_id" && cp -R /tmp/sqc-$m/interrupted "agent/runs/$run_id/"; fi
  cp /tmp/sqc-$m/run.conf ~/sqc-kit.sha256 "agent/runs/$run_id/"   # lock evidence: test_head and the kit hashes
done
echo "all collected"
END
```

- The audit fails closed: a log line it doesn't understand, a tool other than Read, Glob or Write, an MCP server, or
  a path outside the folder fails the packet. A parser fix for a new but harmless log shape is allowed. The logs are
  the evidence and don't change.
- Check each log's `system/init` line for the model (`claude-sonnet-5-5` / `claude-opus-5-5`) and record
  `claude_code_version` and `test_head` from `run.conf` in `docs/EVAL.md`.
- Commit `agent/runs/` and `data/extracted/` (demo world) on a branch with `Closes #33`, then run
  `node agent/eval.mjs` for issue 36.

## Rules this run follows

- A packet whose extraction fails validation counts as all misses and isn't re-run (PRD-04 §5 step 5).
- A session that ends without a success result (usage limit, crash, Ctrl-C) never produced an extraction. Its log and
  anything it wrote are kept under `interrupted/`, the packet runs again when the runner resumes, and every attempt
  is reported in `docs/EVAL.md` (decision 202).
- The skill isn't changed after the run. A changed skill is re-tested on fresh worlds 105–108 (AGENT-FR-09).

## Changelog

| Date | Change |
|---|---|
| 2026-11-13 | First version: kit, runner (`agent/blind-run.sh`), clean profile and flags, collection steps (issue 33). |
