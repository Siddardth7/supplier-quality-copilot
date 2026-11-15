# Simulation-only selection evidence, issue74

All data are synthetic. No packet writer or extraction output was used in selection or retuning.

`retune-74-before.json` and `retune-74-after.json` contain decision/routing counts, miss causes and unchanged ACT counts for tuning1–500 (excluding101–108) and holdout501–1000. `retune-74-strict-stories.json` repeats both measurements with the runner's extra narrative checks. Original archetypes are available at parent commit8b0610b; only SUP-01 and SUP-07 traits changed.

`demo-search-summary.json` covers the full default range1–20000:19992eligible,8reserved exclusions, selectedseed93. `demo-search.jsonl.gz` contains all20000ordered per-seed outcomes, including every rejection reason and all reserved exclusions. Decompress with `gzip -dc data/simulation/demo-search.jsonl.gz`. Gzip uses a fixed zero timestamp. There are117complete matches. Search was run with `node sim/run.mjs --find-demo --from 1 --to 20000`; it never invokes Codex and does not stop diagnostics at the first match.

Candidate narrative checks include SUP-01 missing a required test, SUP-06 an assumed knockout, and SUP-07 demonstrated below-demand capacity. These are stricter than comparing decision/routing alone; both measurements are retained to avoid conflating them.

ACT-02 remains the sole selected-seed exception. No fallback exception was added for SUP-01 or SUP-07. Sid's pending review decision is recorded in docs/DECISIONS-PENDING-REVIEW.md under74.

All five real worlds finished with clean fact checks:45suppliers,450accepted packet files,50writer calls (five rejected attempts retained). `world-build-summary.json` lists final statuses and unscannable metadata; `rebuild-verification.json` records whole-frozen-world hashes before/after no-writer verification. Elapsed runtime is in the PR, not deterministic data. The demo's retry report has `recovered_from_retained_attempts:true`: an initial promotion implementation flattened the report; its exact attempt history was recovered from preserved staged bytes/briefs and accepted-publication hashes before freezing. Packet/fact/history/key bytes were not changed; no writer calls were repeated for recovery. Promotion now performs scratch frozen verification and preserves the report.

The key hashes in this feature branch are not eligible for blind extraction until Sid merges the lock commit into test. No extraction was run in issue74.

Frozen simulator outputs were generated with Node26.0.0 (darwin/arm64). `.node-version` and CI pin that exact Node release for bitwise reconstruction. CI originally selected26.13.1 and found a mismatch; failed rebuild diagnostics now identify differing artifacts and byte excerpts without altering frozen inputs. This is a runtime lock, not a rounding or scoring change.

Pinning Node alone did not resolve Linux/x64: diagnostic offsets differ only in the final floating-point bits of raw appraiser offsets (for example -0.00019777591073693636 versus -0.00019777591073693633). CI therefore runs the complete suite on ARM64 macOS, the supported writer/generator family; no test is skipped or weakened. Cross-platform byte-canonicalization is not claimed. All original fact/key/packet bytes remain unchanged. This CI-platform default is listed under74 for Sid review.
