---
name: ship
description: >-
  Runs one GitHub issue of Supplier Quality Copilot through research, build, test and review, then opens
  a PR into `test`. Use when the user types /ship <issue#> or asks to ship an issue.
---

# /ship <issue#>

The same pipeline Claude Code runs (`.claude/commands/ship.md`). The four stage instructions live in
`.claude/agents/`; read and follow each one when you reach that stage. Ignore their `model:` and `tools:`
lines; you run every stage yourself.

Rules: stages in order, never skip one, and confirm each hand-off file exists before the next stage.
Never push to or merge `test` or `main`. Sid is the final gate.

0. **Prep.** Read `AGENTS.md`. `rm -rf .pipeline && mkdir .pipeline`. `git fetch origin`; the tree must be
   clean. Check the issue's **Depends on**: if a dependency isn't merged into `origin/test`, stop and say so.
   `git switch -c <type>/m<milestone>-<slug> origin/test`.
1. **Research.** Follow `.claude/agents/research.md` with the issue body (`gh issue view <n>`) and every
   doc it cites. Output: `.pipeline/spec.md`. If it has OPEN QUESTIONS, stop and show them to Sid.
2. **Build.** Follow `.claude/agents/coder.md`. Output: `.pipeline/changes.md`.
3. **Test.** Follow `.claude/agents/tester.md`. Output: `.pipeline/test-results.md`. If it starts with
   `FAIL`, stop and show Sid the failures.
4. **Review.** Follow `.claude/agents/reviewer.md`. Output: `.pipeline/review.md`. Review as if someone
   else wrote the code: re-read the diff from git, not from memory, and run the mutations yourself.
5. **Gate.**
   - `VERDICT: SHIP`: commit (conventional message, `Closes #<n>`), push the branch, then
     `gh pr create --base test`. The PR body is self-contained: what, why, requirement IDs, the test output,
     the review verdict. Stop and report the PR URL.
   - `VERDICT: NEEDS WORK` or `BLOCK`: no PR. Fix small, unambiguous findings, then re-run stage 4. Stop and
     list the fixes (file:line) when one needs Sid's call (a threshold, scope, user-visible behavior).

Standing rules:
- Docs are the spec. If code and doc disagree, change both in the same PR or stop.
- Never claim a test count, gate or mutation result you didn't run. Restore mutations by copying a backup
  and check with `shasum -a 256`, never `git checkout` or `git restore`.
- Stage files by explicit path, never `git add -A`. `.pipeline/` is gitignored.
