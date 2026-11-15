# Partial world 101 writer sample

Synthetic supplier SUP-01 only; this is not a completed or selected demo world.

Generated through `writePacket` with codex-cli 0.167.0 and explicit configured model `gpt-6.1-sol`. The retained brief is `briefs/SUP-01.md`, accepted output is `packets/SUP-01/`, and `writer.json` records exact hashes, flags and successful isolation probes. No extraction ran. Semantic fact checking remains issue #73.

Development attempts: an initial invocation failed runtime path metadata access; another timed out awaiting stdin EOF; a third reached the model but nested sandbox creation failed; a fourth generated the file set but was rejected for an extra RFQ trailing newline. After repairing runtime handling and clarifying the brief, a fresh invocation passed every output check. Rejected attempts were not published. The provenance attempt index counts the accepted publication in this fresh sample directory, not these development probes.

The outer macOS sandbox denies repository/personal/temp file contents except this supplier stage and clean runtime, and denies writes outside stage/runtime/device endpoints. The inner CLI uses `danger-full-access` because macOS refuses nested sandbox creation; it remains constrained by the outer process sandbox. The writer receives only the brief, not this README, simulated facts, engine, rubric, answer key or another supplier.

Review regeneration: the first retained publication used a presence-only heading guard and was later found to repeat unrelated evidence in the cover letter (32 numbered headings, including duplicates). It is superseded by a fresh world101 SUP-01 simulation and isolated Codex invocation after narrowing the cover-letter instruction and enforcing the exact assigned heading multiset in each file. The current cover letter contains exactly §1.1 and §1.2, once each; no other numbered headings. All ten current files and the revised brief passed validation and have newly recorded hashes. The fresh sample directory's accepted publication index restarts at 1; the development and superseded publication history is retained here, not asserted as current packet provenance.
