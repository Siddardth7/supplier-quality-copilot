# Requirement-sheet import (issue 78)

Standards → **Upload requirement sheet** accepts UTF-8 JSON, CSV and Markdown. PDF is planned for v2.0 by Sid’s 2026-11-13 decision; [the spike and complete producer table are preserved separately](https://github.com/Siddardth7/supplier-quality-copilot/tree/spike/m5-pdf-text). No AI, dependencies or scoring changes.

## JSON and Markdown

JSON uses the same object as data/requirements/*.json. Tests may be keyed by the catalog ID or catalog name; IDs in saved/exported files come from app/rubric.js. Unknown top-level fields/test rows are shown as unmatched content. All fields retained in the preview are visible and editable.

Markdown uses the tables produced by sim/render-requirements.mjs: part/drawing fields; CTQ name/nominal/lower/upper/unit/basis; a heading per catalog test, required flag, and measure/kind/limit/unit/basis/context rows; demand and need-by planning rows. HTML-escaped cells and multi-line contexts are restored. Any unrecognized line remains in **Unmatched content**.

## CSV

The sheetCsv(sheet) helper in app/sheet-import.js creates a lossless quoted CSV for the same sheet schema. CSV can have quoted commas, quotes and newlines. The header is:

~~~csv
record,field,value,test,name,required,value_type,nominal,lsl,usl,measure,kind,operator,unit,basis,standard,context
~~~

| record | Filled columns |
|---|---|
| header | field is a sheet header/property name, such as part_no, commodity, header, peak_weekly_demand; value is its JSON literal (quoted string or number). CTQs/tests use their own records. |
| ctq | name, nominal, lsl, usl, unit, basis; optional standard |
| test | test is a catalog ID or name; name, required, value_type set its metadata. Required is true or false. |
| condition | Must follow its test record. test, measure, kind, operator, value, unit, basis; optional standard, context. Value is a JSON literal: number, boolean, quoted designation string or two-number array. |

Unknown rows/extra populated columns are listed, not silently dropped. Duplicate test records are refused. Each test needs an acceptance condition. All commodity-required tests must have a limit, and the refusal names the missing test. Catalog membership, flags/types, finite values, CTQ bounds, basis/standard, positive whole demand and positive lead time are validated.

## Preview, save and storage

Every parsed scalar is editable in the preview table. **Edit full sheet (JSON)** adds/removes rows and corrects any field, then **Apply full-sheet corrections** rebuilds the preview. A missing-limit or invalid-value error keeps the draft available for correction. Malformed/unreadable files have a plain refusal. Unmatched content remains visible even after corrections and requires review acknowledgment before saving.

Use a unique Stark part number (SI-XX-0000), matching the existing sheet deep-link route. Duplicate built-in or uploaded part numbers cannot replace existing sheets. The saved sheet joins the existing Standards list/viewer with an **Uploaded** tag; no second viewer. Uploads apply only to suppliers entered by hand, not to demo suppliers. Hand-entry wiring is deferred; this is a notice only.

The browser store is separate from policies: sqc:sheets, {schema:"sqc-sheets/1",sheets:[...]}. Invalid/duplicate saved records are ignored. Blocked reads start empty; blocked/quota writes keep uploads/deletions for the current session and show **Can't save in this browser**. Reload cannot retain those session-only changes.

Export downloads the complete sheet as JSON, without its uploaded source tag. Export → delete (inline confirmation) → import restores a deep-equal sheet. Cancel/Escape leaves storage unchanged. No source files, built-in sheets, demo extraction or scores are modified.
