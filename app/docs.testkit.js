// Doc-parsing helpers for tests: read tables, JSON blocks and band text out of docs/*.md.
// Test-only (like rubric.testkit.js); never imported by non-test files.
// Shared by parity.test.js and engine.test.js so the two can't parse the docs differently.

export const clean = (s) => s.replaceAll('`', '').replaceAll('**', '').trim();

export function section(md, headingText) {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => /^#{2,3} /.test(l) && l.replace(/^#+ /, '').startsWith(headingText));
  if (start < 0) throw new Error(`heading "${headingText}" not found`);
  const end = lines.findIndex((l, i) => i > start && /^#+ /.test(l));
  return lines.slice(start + 1, end < 0 ? undefined : end);
}

export function table(md, headingText) {
  const lines = section(md, headingText);
  const first = lines.findIndex((l) => l.startsWith('|'));
  if (first < 0) throw new Error(`no table in section "${headingText}"`);
  const rows = [];
  for (let i = first; i < lines.length && lines[i].startsWith('|'); i++) rows.push(lines[i]);
  const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(clean);
  const header = cells(rows[0]);
  return rows
    .slice(1)
    .filter((l) => !/^\|[\s|:-]+\|$/.test(l.trim()))
    .map((l) => Object.fromEntries(cells(l).map((c, i) => [header[i], c])));
}

export function jsonBlock(md, headingText) {
  const text = section(md, headingText).join('\n');
  const m = text.match(/```json\n([\s\S]*?)```/);
  if (!m) throw new Error(`no json block in section "${headingText}"`);
  return JSON.parse(m[1]);
}

export const OPS = { '>=': (a, b) => a >= b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '<': (a, b) => a < b };

export function bandScore(rule, x) {
  for (const b of rule) if (!('op' in b) || OPS[b.op](x, b.x)) return b.score;
  throw new Error('band list has no else row');
}

export const num = (s) => Number(s.replaceAll(',', '').replace(/%$/, ''));

// "<left> = <score>" segments of a Scoring-rule cell. A trailing "(...)" note is dropped.
export function segments(cell) {
  return cell.split(' · ').map((seg) => {
    const m = seg.trim().match(/^(.*?) = (\d+)(?: \(.*\))?$/);
    if (!m) throw new Error(`cannot parse rule segment "${seg}"`);
    return { left: m[1].trim(), score: Number(m[2]) };
  });
}

const SIGN = { '≥': '>=', '≤': '<=', '>': '>', '<': '<' };

// Doc band text to an interval { contains(x), bounds[] }. A bare number (4.fai "1.0") means x ≥ n.
export function interval(left) {
  let m;
  if ((m = left.match(/^([≥≤><]) ([\d.,]+)%?$/))) {
    const op = SIGN[m[1]], n = num(m[2]);
    return { contains: (x) => OPS[op](x, n), bounds: [n] };
  }
  if ((m = left.match(/^([\d.,]+) ([≤<]) x ([≤<]) ([\d.,]+)%?$/))) {
    const a = num(m[1]), lo = SIGN[m[2]], hi = SIGN[m[3]], b = num(m[4]);
    return { contains: (x) => OPS[lo](a, x) && OPS[hi](x, b), bounds: [a, b] };
  }
  if ((m = left.match(/^([\d.,]+)$/))) {
    const n = num(m[1]);
    return { contains: (x) => x >= n, bounds: [n] };
  }
  throw new Error(`cannot parse band "${left}"`);
}

export function expectedRule(id, type, cell) {
  if (type === 'bool' && (cell === 'bool' || cell.startsWith('bool.'))) return { true: 3, false: 0 };
  const segs = segments(cell);
  if (type === 'bool' || type === 'enum') return Object.fromEntries(segs.map((s) => [s.left, s.score]));
  if (type === 'date') {
    const out = {};
    for (const s of segs) {
      if (s.left === 'expiry ≥ as_of') out.ge_as_of = s.score;
      else if (s.left === 'expiry < as_of') out.lt_as_of = s.score;
      else throw new Error(`${id}: unknown date segment "${s.left}"`);
    }
    return out;
  }
  throw new Error(`${id}: no expected-rule shape for type ${type}`);
}
