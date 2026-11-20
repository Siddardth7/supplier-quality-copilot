# CLAUDE.md

Interview showcase for a supplier quality engineer role at an AI hardware company ramping liquid-cooled systems. Start every session by reading `docs/ROADMAP.md` and `docs/README.md`, then pick the next open issue in the earliest open milestone.

## Rules

- Docs are the spec. `docs/RUBRIC.md` and `docs/SCORECARD.md` define the engine. Change doc and code together.
- Vanilla HTML/CSS/JS in `app/`. No framework, no build, no new dependencies. Tests use `node --test`.
- The engine is pure functions, and every score comes from it. The agent only extracts evidence (`state`, `value`, `citation`) and drafts text.
- UI follows `design/tokens.css` (Coolant Loop: deep blue-black glass by default, light variant via the theme toggle; cyan = interactive, amber = events/alerts, mono for numbers). Reference: `/Users/sid/Documents/Upskill/Design template/RoLaMGAS/README.md`.
- All data is synthetic and labeled as such. The buyer is **Stark Industries** and suppliers carry Marvel comic-book company names (`docs/DATASET.md`); the app says it is fan-made and not affiliated with Marvel. No real company names (the target employer, its suppliers, or any real vendor), real people, or logos anywhere in the app or data.
- Deep-linkable state in the URL hash (`#supplier=SUP-07`).
- Branch ladder: `<type>/<milestone>-<slug>` → PR into `test` → `test` merges into `main` only at a release (`/release`). Never push or merge to `test` or `main` directly; Sid merges.
- One issue = one branch = one PR, with `Closes #N` and the requirement IDs it delivers.
- Bigger issues (engine, dataset, agent, UI features) run through `/ship <issue#>` (research → coder → tester → reviewer, see `.claude/`). Small doc fixes can be done inline.

## Related

- Quality Engineering Skills repo (stretch port target): `/Users/sid/Documents/Upskill/Projects/quality-engineering/tools/Quality engineering Skills` — see its `skills/supplier-scar`, `skills/ppap-checker`.
