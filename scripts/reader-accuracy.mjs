// Packet reader accuracy (issue 172, PRD-05 UIQ-AC-13, UIQ-NFR-03). node scripts/reader-accuracy.mjs
// measure() reads every shipped packet with an answer key (data/worlds/<n>/, n all digits) and compares state, value
// and citation per row, then evaluate() on the reader's rows vs the key's evaluation; and data/suppliers vs the agent's
// data/extracted/ (not ground truth: listed, not a target). Node built-ins only.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { readPacket } from '../app/packet-reader.js';
import { PACKET_FILES } from '../app/packet.js';
import { evaluate, STARK_REFERENCE } from '../app/engine.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const readDir = (dir) => PACKET_FILES.filter((f) => existsSync(join(dir, f))).map((name) => ({ name, text: readFileSync(join(dir, name), 'utf8') }));
const show = (v) => JSON.stringify(v ?? null);

function readOrThrow(dir, commodity) {
  const r = readPacket(readDir(dir), commodity);
  if (!r.ok) throw new Error(`${dir}: ${r.error}`);
  return r;
}

/** -> { key: { worlds, packets, rows, state, value, citation, evaluation, disagreements }, extraction: { packets, rows, state, value, citation, disagreements } } */
export function measure(root = ROOT) {
  const worldsDir = join(root, 'data', 'worlds');
  const worlds = readdirSync(worldsDir).filter((n) => /^\d+$/.test(n)).sort((a, b) => a - b);
  const key = { worlds: worlds.map(Number), packets: 0, rows: 0, state: 0, value: 0, citation: 0, evaluation: 0, disagreements: [] };
  for (const n of worlds) {
    const ak = json(join(worldsDir, n, 'answer_key.json'));
    for (const c of ak.candidates) {
      const r = readOrThrow(join(worldsDir, n, 'packets', c.supplier_id), c.commodity);
      key.packets++;
      for (const k of c.criteria) {
        const got = r.rows[k.criterion_id];
        key.rows++;
        const cite = got?.where || null;
        const ok = { state: got?.state === k.expected_state, value: isDeepStrictEqual(got?.value ?? null, k.expected_value ?? null),
          citation: cite === (k.expected_citation ?? null) };
        for (const f of ['state', 'value', 'citation']) if (ok[f]) key[f]++;
        if (!ok.state || !ok.value || !ok.citation) {
          key.disagreements.push(`world ${n} ${c.supplier_id} ${k.criterion_id}: key ${k.expected_state} ${show(k.expected_value)} ${show(k.expected_citation)}, reader ${got?.state} ${show(got?.value)} ${show(cite)}`);
        }
      }
      const ev = evaluate({ supplier_id: c.supplier_id, commodity: c.commodity, source: 'manual',
        criteria: Object.entries(r.rows).map(([id, x]) => ({ id, state: x.state, value: x.value, citation: x.where || null, note: x.note || null })) },
      { as_of: ak.as_of, policy: STARK_REFERENCE });
      const pick = (e) => ({ total: e.total, decision: e.decision, knockouts: e.knockouts, routing: e.routing });
      if (isDeepStrictEqual(pick(ev), pick(c.evaluation))) key.evaluation++;
      else key.disagreements.push(`world ${n} ${c.supplier_id} evaluation: key ${show(pick(c.evaluation))}, reader ${show(pick(ev))}`);
    }
  }
  const extraction = { packets: 0, rows: 0, state: 0, value: 0, citation: 0, disagreements: [] };
  const exDir = join(root, 'data', 'extracted');
  for (const file of readdirSync(exDir).filter((f) => /^SUP-\d+\.json$/.test(f)).sort()) {
    const ex = json(join(exDir, file));
    const r = readOrThrow(join(root, 'data', 'suppliers', ex.supplier_id), ex.commodity);
    extraction.packets++;
    for (const c of ex.criteria) {
      const got = r.rows[c.id];
      extraction.rows++;
      const cite = got?.where || null;
      const ok = { state: got?.state === c.state, value: isDeepStrictEqual(got?.value ?? null, c.value ?? null), citation: cite === (c.citation ?? null) };
      for (const f of ['state', 'value', 'citation']) if (ok[f]) extraction[f]++;
      if (!ok.state || !ok.value || !ok.citation) {
        extraction.disagreements.push({ supplier: ex.supplier_id, criterion: c.id, extracted: { state: c.state, value: c.value ?? null },
          reader: { state: got?.state, value: got?.value ?? null } });
      }
    }
  }
  return { key, extraction };
}

/** The report the PR quotes. */
export function report({ key, extraction }) {
  const k = key, e = extraction;
  return [
    `answer key (worlds ${k.worlds.join(',')}; ${k.packets} packets; ${k.rows} rows)`,
    `  state agreement    ${k.state}/${k.rows}`,
    `  value agreement    ${k.value}/${k.rows}   (deepEqual after typed conversion; null for missing/assumed)`,
    `  citation agreement ${k.citation}/${k.rows}`,
    `  evaluation match   ${k.evaluation}/${k.packets}       (total, decision, knockouts, routing from evaluate() on reader rows vs candidate.evaluation)`,
    `  disagreements: ${k.disagreements.length ? '' : 'none'}`,
    ...k.disagreements.map((d) => `    ${d}`),
    `extraction (data/suppliers vs data/extracted; ${e.packets} packets; ${e.rows} rows)`,
    `  state ${e.state}/${e.rows}  value ${e.value}/${e.rows}  citation ${e.citation}/${e.rows}`,
    `  disagreements: ${e.disagreements.length ? '' : 'none'}`,
    ...e.disagreements.map((d) => `    ${d.supplier} ${d.criterion}: extracted ${d.extracted.state} ${show(d.extracted.value)}, reader ${d.reader.state} ${show(d.reader.value)}`),
  ].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) console.log(report(measure()));
