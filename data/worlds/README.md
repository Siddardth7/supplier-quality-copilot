# Frozen simulated worlds

Synthetic Stark Industries suppliers only. Demo seed93 and fixed eval seeds101–104 each contain9candidate packets,6active suppliers,18months of history, engine-built references/key+SHA256, clean final factcheck, writer provenance and retained rejected attempts.

No blind extraction has run. The key-lock commit must be merged into test before any extraction. Sid reviews and merges; a feature-branch commit does not satisfy the lock.

The selected demo's packet-only app copies live at data/suppliers/, data/history.csv, data/suppliers.json and data/answer_key.json. Reference extractions were not copied to data/extracted/.

Verify frozen inputs and packets without Codex: `node sim/run.mjs --seed 93 --no-writer` (and each eval seed). The verification builds deterministic artifacts in scratch and leaves the frozen world unchanged. Normal builds refuse existing worlds. Search and tuning evidence: data/simulation/.

Final reports explicitly retain unscannable metadata under the approved collision-aware checker; these are abstentions, not concealed failures. All final suppliers have zero failures. Earlier rejected packets and writer failures remain under factcheck-attempts/. The demo report was recovered from retained immutable evidence after correcting promotion's report overwrite; see data/simulation/README.md.
