# AGENTS.md

Instructions for Codex and any other coding agent. Claude reads `CLAUDE.md`; the rules are the same.

## Who works where

Each agent has its own git worktree and its own milestone. Work only in your folder and only on your milestone's issues.

| Agent | Folder | Issues |
|---|---|---|
| Claude Code | `../supplier-quality-copilot-m2` | M2 (#23), then M5 UI |
| Codex | `../sqc-codex` | M3b simulated world (#68–#75) |
| Gemini (Antigravity) | `../sqc-gemini` | M4 agent code: #32, #31, #34, #35. #33 and #36 are Claude runs |

Antigravity: `/ship <issue#>` runs `.agents/skills/ship/SKILL.md`.

## Before you start an issue

1. Read `CLAUDE.md` (rules), `docs/README.md` (doc index) and `docs/ROADMAP.md` (milestones, decisions log).
2. Read every file the issue lists under **Read first**. Docs are the spec: if the issue and an Approved doc disagree, the doc wins. Say so in the PR.
3. Check the issue's **Depends on** list. If a dependency isn't merged into `test`, stop and say so.

## Rules

- Plain Node ES modules (`.mjs`), Node 26. **No npm dependencies**, no build step, no `package.json` unless an issue asks for one.
- Tests use `node --test` and live next to the code as `*.test.mjs`. Every issue's acceptance list is a test or a command whose output goes in the PR.
- Files under `app/` are `.js` (they run in the browser too), including their tests; Node ≥ 22.7 runs them as ES modules with no `package.json`.
- Anything random takes a seed. Same seed in, byte-identical files out.
- All data is synthetic. Buyer is Stark Industries; suppliers use the Marvel names in `docs/DATASET.md`. No real companies, people, registrars or certificate numbers (use `REG-` placeholders).
- Don't edit `docs/RUBRIC.md`, `docs/SCORECARD.md` or `app/engine.js` unless the issue says so.

## Branch and PR

- Branch `<type>/m<milestone>-<slug>` off `origin/test` (e.g. `feat/m3-world-sampler`).
- One issue = one branch = one PR into `test`. The PR body has `Closes #N`, what changed, and the test output.
- CI (`.github/workflows/test.yml`) runs `node --test` on every PR into `test` or `main`. A PR is ready only when that check is green.
- Never push to or merge `test` or `main`. Sid merges.
- After opening the PR, stop. Sid reviews before the next issue starts.
