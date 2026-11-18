# PRD-07 — Release & distribution

| Field | Value |
|---|---|
| Status | Approved |
| Owner | Sid (SME) |
| Release | v1.0 |
| Milestone | v1.0 · M6 Ship |
| ID prefix | `SHIP` |
| Specs referenced | PRD-00 (OVR-NFR-01…03), `docs/ROADMAP.md` (demo script) |
| Last updated | 2026-11-17 |

## 1. Problem

The project only counts if a panel can open it from a link in under a minute, follow a 3-minute demo, and find nothing that points at a real company or at internal data. The repo was started from notes that named a real public system, so going public takes a deliberate scrub, not just flipping visibility.

## 2. Users and jobs

| Persona | Job to be done | How this feature helps |
|---|---|---|
| Interview panel | Open it, understand it, try it | Live link, a README that explains it in 30 seconds, a one-page handout |
| Sid | Present it without surprises | A scripted demo with exact links, and a binary ship checklist |

## 3. Goals and non-goals

**Goals**
- G1: Public link works on desktop and at 390 px. *(PRD-00 G7)*
- G2: Nothing public identifies the target company, its products or its team. *(OVR-NFR-02)*
- G3: The demo runs in ≤ 3 minutes from the script. *(PRD-00 G7)*

**Non-goals**
- NG1: A custom domain, analytics or a contact form.
- NG2: A CI pipeline. `node --test` runs locally and in `/release`.

## 4. Requirements

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| SHIP-FR-01 | **Scrub.** A local, untracked term list (`.scrub-terms`, gitignored) holds the identifying phrases. `node scripts/scrub.mjs` must report zero hits across the tree, and across commit messages, issue bodies and PR bodies of whatever becomes public | Must | script output in the release PR |
| SHIP-FR-02 | **Public repo.** The public repo is decided per open question 1. Whatever is public must pass SHIP-FR-01, including its history | Must | checklist |
| SHIP-FR-03 | **Pages.** GitHub Pages serves the public repo's `main` branch root. `index.html` at the root redirects to `app/`, and `.nojekyll` is present | Must | live link check |
| SHIP-FR-04 | **README** must have: a one-paragraph pitch, the live link, a screenshot, a demo GIF (≤ 5 MB, ≤ 30 s), the catch rate with a link to `docs/EVAL.md`, run instructions (`node scripts/serve.mjs` from the root, then `/app/`), the data disclaimer, and links to PRD-00 and `RUBRIC.md` | Must | checklist |
| SHIP-FR-05 | **Demo script** (`docs/DEMO.md`) must list each step with its deep link, what to say and a time budget summing to ≤ 3:00 | Must | timed dry run |
| SHIP-FR-06 | **Handout** (`docs/HANDOUT.md`, printable to one page): problem, how it works (pipeline diagram), the routing rule, one screenshot per view, the catch rate, three questions for the panel | Must | print preview fits one page |
| SHIP-FR-07 | **Release.** `/release v1.0` opens `test → main`; after Sid merges, tag `v1.0` and publish a GitHub Release whose notes list delivered requirement IDs per milestone and the catch rate | Must | release page |
| SHIP-FR-08 | **Installable and offline.** A web app manifest (name, icons, start_url) and a root service worker make the workbench installable (Chrome, Edge, Safari Add to Dock). After one online visit every view, citation and Eval packet works offline from a versioned cache of exactly the files the app fetches; a release bumps the cache version so it updates. localStorage is untouched | Should | scripts/pwa.test.mjs and the manual offline checklist |
| SHIP-NFR-01 | Every page of the app shows the synthetic-data banner and the fan-made footer, and the README states that all data is synthetic and the Marvel names are fan use, not affiliated with Marvel | Must | checklist |

## 5. Interfaces

**Scrub term categories** (the actual terms live only in `.scrub-terms`):
- the target company's name, product and system names, and chip or wafer terms
- program codenames and internal part names seen in public sources
- the team's size and composition as written in the job description
- capacity figures quoted from public sources
- the JD file's path and title
- the hiring team's names

Marvel company and character names are allowed (`DATASET.md`) and must not be on the scrub list.

**Known hits today** (to be fixed in M6.1):
- `README.md` "Why this exists": team size and composition
- `README.md` data disclaimer: the system description
- Git history: early `docs/IDEA.md` and `README.md` (see open question 1)

### Ship checklist (all binary)

- [ ] `node --test` passes on `main`.
- [ ] `node scripts/scrub.mjs` reports 0 hits on the public tree and its history.
- [ ] The public repo's issue and PR text contains 0 hits (or the public repo has no issues or PRs).
- [ ] The live link opens the queue in < 3 s on a cold load.
- [ ] Every demo step's deep link opens the expected state.
- [ ] The demo dry run takes ≤ 3:00.
- [ ] Works at 390 px: no horizontal scroll on any demo screen.
- [ ] The synthetic banner shows on both views.
- [ ] The README has every SHIP-FR-04 item.
- [ ] The handout prints on one page.
- [ ] `docs/EVAL.md` is published with the catch rate.
- [ ] `v1.0` is tagged and the GitHub Release is published.
- [ ] Installed from the live link, the app opens every view and the 11 demo links offline after one visit (SHIP-FR-08).
- [ ] Demo day: after the last release, open the app online once and wait for the `sqc-<VERSION>` worker to activate (DevTools > Application > Service workers) before going to the venue, so the first visit's caching never happens on venue Wi-Fi.

## 6. Acceptance criteria

- [ ] SHIP-AC-01: Every box in the ship checklist is ticked, with evidence in the release PR. *(proves SHIP-FR-01…-08, SHIP-NFR-01, G1–G3)*

## 7. Open questions

| # | Question | Owner | Resolution |
|---|---|---|---|
| 1 | Identifying text is in git history, and in this repo's merged PR diffs, which GitHub keeps even after a history rewrite. How do we go public? (a) Make this repo public as-is; (b) rewrite history, then make public; (c) keep this repo private as the working repo, and publish a separate public repo from a scrubbed snapshot of `main` at v1.0 | Sid | **Decided: (c)** (Sid, 2026-11-09). Only (c) guarantees nothing identifying is public. The PRDs and decisions log carry the process evidence into the public repo; the private repo can be shown on request |
| 2 | Pages from the repo root or from `docs/`? | Sid | Root, so `app/` and `data/` are siblings and the app's `../data/` fetches work unchanged |

## 8. Out of scope

| Item | Picked up by |
|---|---|
| v1.1 and v1.2 release notes | M7, M8 |
| CI on GitHub Actions | Unscheduled |

## 9. Changelog

| Date | Change |
|---|---|
| 2026-11-17 | SHIP-FR-08 added (issue 169): installable PWA with offline mode, option A of the desktop-app question; option B (Electron or Tauri) is v2.0. |
| 2026-11-14 | Public repo named (issue 50, Sid): `Siddardth7/supplier-quality-copilot`; this private repo is renamed when #49 publishes. Live link `https://siddardth7.github.io/supplier-quality-copilot/`; root `index.html` redirects to `app/` (SHIP-FR-03, #49). The README (SHIP-FR-04) links it before #49 lands, so it does not resolve until then. |
| 2026-11-14 | `node scripts/scrub.mjs` added (issue 48): tree and commit messages by default, `--history` adds every blob, exit 0/1/2. Known hits in README fixed, and the JD path moved from `CLAUDE.md` to the gitignored `CLAUDE.local.md`. Issue and PR bodies are not scanned by the script; the public repo has none (checklist item 3). |
| 2026-11-14 | Root `index.html` (forwards to `app/`, keeping the hash) and `.nojekyll` added for Pages (issue 49, SHIP-FR-03). `.scrub-terms` has no hiring-team names yet: Sid does not have the panel list, so that part of SHIP-FR-01 is **pending** and the scrub is re-run when he does. |
| 2026-11-14 | `docs/HANDOUT.md` added (issue 52) with `docs/HANDOUT.pdf`, built by `node scripts/handout.mjs` (headless Chrome, US Letter; exits 1 unless the PDF is one page). "One screenshot per view" is six cropped thumbnails, one per workbench view. `scripts/handout.test.mjs` checks the parts and that the catch and false-alarm figures equal `data/eval.json`. |
| 2026-11-14 | `docs/DEMO.md` added (issue 51): 8 steps, 11 deep links, 3:00. `docs/demo.test.mjs` guards the links and the time budget. Step 6 switches off the `1.cert_current` knockout, because no weight change flips a decision in the demo world. Checked locally at 390 px and 1280 px; the live-link check and the timed dry run stay open on the ship checklist. |
| 2026-11-11 | SHIP-FR-04 run instructions: `node scripts/serve.mjs` from the root (#37). `python3 -m http.server` resets module requests on a cold load. |
| 2026-11-09 | Open question 1 decided: (c). Marvel names allowed, fan-made disclaimer added to SHIP-NFR-01. |
| 2026-11-08 | First draft, including the git-history decision raised on #10. |
