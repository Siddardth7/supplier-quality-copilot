// Draft consistency check (#35): AGENT-FR-04 (drafts equal the engine), AGENT-FR-05 (label), AGENT-FR-12
// (signature), G4, AGENT-AC-04, AGENT-NFR-01 (Node built-ins only). Spec: docs/product/PRD-04-agent.md § 4,
// agent/SKILL.md § Drafts. Structure and types are validate.mjs's job; this file only asks whether the drafts
// agree with what the engine computes from the same extraction.
//
// CLI: node agent/drafts.mjs --as-of <YYYY-MM-DD> <extraction.json | run-dir>...
//   A run dir contributes its SUP-nn.json files only. Every supplier is reported: "OK <file>" on stdout, or one
//   "<file>: <path>: <message>" line per mismatch then "INVALID <file> (<n> errors)" on stderr.
//   exit 0 all consistent, 1 any mismatch, 2 usage, bad --as-of, or unreadable / non-JSON input.
import { readFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUBRIC, STARK_REFERENCE, evaluate } from '../app/engine.js';

export const DRAFT_LABEL = 'DRAFT — prepared by an agent for SQE review. Not sent.';
export const DRAFT_SIGNATURE = 'Stark Industries Supplier Quality — Pepper Potts';

// Criterion-id token: "8.subtier_named" never satisfies "8.subtier_certs", "3.5 days" never matches,
// "(2.spc)" and "2.spc," do. ponytail: assumes every rubric id has this shape (true for all 59 today).
const ID_TOKEN = /(?<![A-Za-z0-9_.])[1-9]\.[a-z][a-z0-9_]*(?![A-Za-z0-9_])/g;
const SUPPLIER_FILE = /^SUP-[0-9]{2}\.json$/;

const isObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const show = (v) => {
  try { return JSON.stringify(v) ?? String(v); } catch { return String(v); }
};
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// Rules 1 and 2: same ids, same order as the engine.
function compareList(add, path, got, want) {
  if (!Array.isArray(got)) return add(path, `expected the engine's ${show(want)}, got ${show(got)}`);
  if (sameList(got, want)) return;
  const missing = want.filter((id) => !got.includes(id));
  const extra = got.filter((id) => !want.includes(id));
  const why = [];
  if (missing.length) why.push(`missing ${missing.join(', ')}`);
  if (extra.length) why.push(`extra ${extra.map((id) => (typeof id === 'string' ? id : show(id))).join(', ')}`);
  if (!why.length) why.push(got.length === want.length ? 'order differs' : 'duplicate ids');
  add(path, `expected the engine's ${show(want)}, got ${show(got)}: ${why.join('; ')}`);
}

/** Pure. Never throws; returns every mismatch found.
 *  extraction: parsed JSON, normally already passing validateExtraction.
 *  opts.as_of: 'YYYY-MM-DD', required (1.cert_current depends on it). opts.policy: default STARK_REFERENCE.
 *  returns { ok, errors: [{ path, message }], expected: { rfi_items, audit_focus } | null },
 *  ok === (errors.length === 0). */
export function checkDrafts(extraction, { as_of, policy = STARK_REFERENCE, rubric = RUBRIC } = {}) {
  const errors = [];
  const add = (path, message) => errors.push({ path, message });
  let expected = null;
  try {
    const e = evaluate(extraction, { as_of, policy, rubric });
    expected = { rfi_items: e.rfi_items, audit_focus: e.audit_focus };
  } catch (e) {
    add('', `cannot evaluate: ${e.message}`);
  }
  const done = () => ({ ok: errors.length === 0, errors, expected });
  const d = isObj(extraction) ? extraction.drafts : undefined;
  if (!isObj(d)) {
    add('drafts', `expected an object with rfi_items, rfi_email, audit_focus, audit_plan, got ${show(d)}`);
    return done();
  }

  if (expected) {
    compareList(add, 'drafts.rfi_items', d.rfi_items, expected.rfi_items);
    compareList(add, 'drafts.audit_focus', d.audit_focus, expected.audit_focus);
    // Rule 3: the plan follows the engine's focus, not the extraction's own (validate.mjs checks that one).
    const focus = expected.audit_focus, plan = d.audit_plan;
    if (!Array.isArray(plan)) add('drafts.audit_plan', `expected one entry per engine audit_focus id ${show(focus)}, got ${show(plan)}`);
    else {
      plan.slice(0, focus.length).forEach((entry, i) => {
        const got = isObj(entry) ? entry.criterion_id : undefined;
        if (got !== focus[i]) add(`drafts.audit_plan[${i}].criterion_id`, `expected ${show(focus[i])} (engine audit_focus[${i}]), got ${show(got)}`);
      });
      if (plan.length !== focus.length) {
        add('drafts.audit_plan', `expected ${focus.length} entries, one per engine audit_focus id, got ${plan.length}`);
      }
    }
  }

  const email = d.rfi_email;
  if (typeof email !== 'string') {
    add('drafts.rfi_email', `expected a string, got ${show(email)}`);
    return done();
  }
  // Rule 4 (FR-05): the first line is exactly the label (SKILL.md), so no prefix, suffix, BOM or CR.
  if (email.split('\n')[0] !== DRAFT_LABEL) add('drafts.rfi_email', `must start with the label ${show(DRAFT_LABEL)}`);
  // Rule 5 (FR-12): last line exactly the signature; one trailing newline allowed, CRLF is not.
  const last = email.replace(/\n$/, '').split('\n').at(-1);
  if (last !== DRAFT_SIGNATURE) add('drafts.rfi_email', `last line must be exactly ${show(DRAFT_SIGNATURE)}, got ${show(last)}`);

  if (expected) {
    const known = new Set([...rubric.criteria, ...rubric.tests].map((c) => c.id));
    const named = new Set((email.match(ID_TOKEN) ?? []).filter((id) => known.has(id)));
    // Rule 6: names every engine RFI item. Rule 7: asks for nothing else.
    for (const id of expected.rfi_items) if (!named.has(id)) add('drafts.rfi_email', `does not name RFI item ${id}`);
    for (const id of named) if (!expected.rfi_items.includes(id)) add('drafts.rfi_email', `names ${id}, which is not an engine RFI item`);
  }
  return done();
}

const isIsoDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
  && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;

function main(args) {
  const usage = 'usage: node agent/drafts.mjs --as-of <YYYY-MM-DD> <extraction.json | run-dir>...';
  const [flag, as_of, ...paths] = args;
  if (flag !== '--as-of' || !paths.length || paths.some((p) => p.startsWith('--'))) {
    console.error(usage);
    return 2;
  }
  if (!isIsoDay(as_of)) {
    console.error(`--as-of: expected an ISO day YYYY-MM-DD, got ${show(as_of)}\n${usage}`);
    return 2;
  }
  // Read every input first: an unreadable file is a usage error, not a supplier mismatch.
  const inputs = [];
  for (const p of paths) {
    let files;
    try {
      files = statSync(p).isDirectory() ? readdirSync(p).filter((f) => SUPPLIER_FILE.test(f)).sort().map((f) => join(p, f)) : [p];
    } catch (e) {
      console.error(`${p}: cannot read: ${e.message}\n${usage}`);
      return 2;
    }
    if (!files.length) {
      console.error(`${p}: no SUP-nn.json extractions in this directory\n${usage}`);
      return 2;
    }
    for (const file of files) {
      try {
        inputs.push([file, JSON.parse(readFileSync(file, 'utf8'))]);
      } catch (e) {
        console.error(`${file}: cannot read as JSON: ${e.message}\n${usage}`);
        return 2;
      }
    }
  }
  let code = 0;
  for (const [file, extraction] of inputs) {
    const { ok, errors } = checkDrafts(extraction, { as_of });
    if (ok) { console.log(`OK ${file}`); continue; }
    for (const { path, message } of errors) console.error(path ? `${file}: ${path}: ${message}` : `${file}: ${message}`);
    console.error(`INVALID ${file} (${errors.length} errors)`);
    code = 1;
  }
  return code;
}

// CLI only when run directly, never on import (same guard as validate.mjs).
const isMain = () => {
  try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; }
};
if (isMain()) process.exitCode = main(process.argv.slice(2)); // exitCode, not exit(): lets piped stderr flush
