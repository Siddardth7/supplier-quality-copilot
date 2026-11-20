# Brand Corporation sample packet (synthetic)

Synthetic data for a demo. Brand Corporation is a fictional supplier (a Marvel comic-book company name, fan-made, not affiliated with Marvel). It is **not a candidate in the queue**: it is a packet to upload in **+ New supplier** to show the rules-based packet reader (issue 172, PRD-05 UIQ-FR-21..24). The app never fetches this README; it fetches only the ten packet files, and only from the **Use the sample packet** button.

## How to use it

1. Qualify > **+ New supplier**, name `Brand Corporation`, part **SI-CP-0007** (cold plate), Continue.
2. In **Read a supplier packet**, press **Upload packet** and pick the ten `.md` files in this folder (or drop them on the panel, or press **Use the sample packet**).
3. Check the rows (confirm each Proven row on its cited page), then Save. The supplier joins Qualify, Today and Compare tagged **Entered by hand**, and its citations open these files in the citation viewer.

## Planned mix

| Row | State the reader gives | Why |
|---|---|---|
| Leak test (knockout) | Claimed | The section only says `Our assemblies remain sealed under the specified conditions.`, no recorded result |
| Burst / proof pressure (knockout) | Proven, true | Recorded result: true |
| Lowest Cpk | Proven, 1.3187 (Partial, scores 1) | Just under the 1.33 band edge. The per-CTQ lines recompute from mean, sample standard deviation and limits: Base thickness 1.6235, Port bore 1.6497, Mounting-hole pitch 1.3187 (the minimum) |
| Record retention in years | Missing | The section is left out of `quality_manual.md` |
| Corrective-action program | Claimed | Prose only, no recorded result |
| Capacity ratio | Proven, 1.25 | Mean output 2500 against peak weekly demand 2000 |
| Delivery lead time | Proven, true | Quoted 11 weeks against a 12-week need |
| Nonconforming segregation | Proven, true | Recorded result: true |
| Everything else | As the SUP-07 packet | Certificate expiry 2027-07-20, after `as_of` 2026-11-01 |

Reader totals: 30 proven, 2 claimed, 1 missing, no rows flagged, no unmatched sections; `rfq.md` is stored, not read.

## Expected result

Engine output with Stark Reference v1, `as_of` 2026-11-01 (pinned in `app/packet-reader.test.js`):

- Total **90.5**, decision **CONDITIONAL** (the leak test is an assumed knockout), no failed knockouts.
- Routing **Senior**, reasons `CONDITIONAL`, `High-risk commodity`.
- Gaps: corrective-action program (claimed, 1), lowest Cpk (proven, 1, Partial), leak test (claimed, 1), record retention (missing, 0).
- RFI items: corrective-action program, leak test, record retention. Audit focus: lowest Cpk, leak test, record retention.

## How it was made

The nine supplier files were derived by hand from the shipped `data/suppliers/SUP-07/` packet (same voice, headings and numbering, including the buried `9.x` sections), with the name changed and the edits in the table above. The SUP-07 certificate number was replaced by the placeholder `REG-QMS-0001`. `rfq.md` is `sim/render-requirements.mjs` `renderRequirements()` of `data/requirements/cold_plate.json`, byte-identical to `data/suppliers/SUP-07/rfq.md`.

## Name check

UNVERIFIED: the check that no real cold-plate or liquid-cooling vendor trades as "Brand Corporation" could not be run (no web access from the build session). The name is absent from `data/suppliers.json` and from the `docs/DATASET.md` candidate table. It appears only in this folder, the sample path (`SAMPLE_DIR` in `app/packet-reader.js`, `scripts/precache.mjs`, `scripts/pwa.test.mjs`, `sw.js`) and tests, so a rename is one grep: `grep -ri "brand.corporation"`.

## Format limitation

The reader only reads packets in this format: Markdown files named like the Stark packet, each section numbered and titled like a checklist row, with its result written as "recorded result". Real PDFs, scans and free-form packets need the AI reader (planned).
