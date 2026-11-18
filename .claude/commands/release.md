---
description: Team Lead — cut a release (e.g. v1.0) from `test` to `main` and tag it. Never merges.
---
You are the Team Lead for Supplier Quality Copilot. Cut release $ARGUMENTS from `test` to `main`.

1. Confirm every milestone for the release is complete: for each milestone whose title starts with
   `$ARGUMENTS ·`, `gh issue list --milestone "<title>" --state open` returns nothing.
2. Confirm `node --test` is green on an up-to-date checkout of `origin/test`.
3. Confirm every PR merged into `test` since the last release carried a `VERDICT: SHIP` review
   (`gh pr list --base test --state merged`).
4. Update the README status and release notes on a short-lived branch off `test`, PR'd into `test` first.
   On the same branch, bump `VERSION` in `sw.js` and run `node scripts/precache.mjs`, so installed
   offline copies re-precache the new release (issue 169, decision 250).
5. Open a PR `test → main` (`gh pr create --base main --head test`) with the release notes.
   Do NOT merge — the SME (Sid) merges it with a merge commit (`--no-ff`, never squash between
   long-lived branches).
6. After the SME merges: tag `$ARGUMENTS` on `main` (`git tag $ARGUMENTS && git push --tags`) and create
   the GitHub release (`gh release create $ARGUMENTS`).
