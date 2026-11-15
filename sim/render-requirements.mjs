import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const HEADER = 'Stark Industries — Supplier Quality. Synthetic document for a demo.';
const BANNER = '> Synthetic document for a demo. Fictional supplier.';
const isText = value => typeof value === 'string' && value.trim().length > 0;
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const check = (valid, message) => { if (!valid) throw new TypeError(message); };

function validateBasis(item, path) {
  check(item.basis === 'heuristic' || item.basis === 'standard', `${path}: invalid basis`);
  if (item.basis === 'standard') {
    check(isText(item.standard), `${path}: standard must name the standard and traceable provision`);
  } else {
    check(!Object.hasOwn(item, 'standard'), `${path}: heuristic limit must omit standard`);
  }
}

function validateSheet(sheet) {
  check(isRecord(sheet), 'Requirement sheet must be an object');
  check(sheet.header === HEADER, 'Invalid requirement sheet header');
  for (const key of ['commodity', 'part_no', 'part_name', 'revision', 'drawing_no']) {
    check(isText(sheet[key]), `${key} must be nonempty text`);
  }
  check(Array.isArray(sheet.ctqs) && sheet.ctqs.length >= 3 && sheet.ctqs.length <= 5, 'ctqs must contain 3–5 entries');
  for (const [index, ctq] of sheet.ctqs.entries()) {
    const path = `ctqs[${index}]`;
    check(isRecord(ctq), `${path} must be an object`);
    check(isText(ctq.name) && isText(ctq.unit), `${path}: name and unit required`);
    check([ctq.nominal, ctq.lsl, ctq.usl].every(Number.isFinite)
      && ctq.lsl < ctq.nominal && ctq.nominal < ctq.usl, `${path}: finite bounds must contain nominal strictly`);
    validateBasis(ctq, path);
  }
  check(isRecord(sheet.tests) && Object.keys(sheet.tests).length > 0, 'tests must be a nonempty map');
  for (const [id, test] of Object.entries(sheet.tests)) {
    check(isRecord(test) && isText(test.name), `${id}: test name required`);
    check(typeof test.required === 'boolean', `${id}: required must be boolean`);
    check(['bool', 'number'].includes(test.value_type), `${id}: invalid value_type`);
    check(Array.isArray(test.conditions) && test.conditions.length > 0, `${id}: conditions required`);
    for (const [index, condition] of test.conditions.entries()) {
      const path = `${id}.conditions[${index}]`;
      check(isRecord(condition), `${path} must be an object`);
      check(['setup', 'acceptance'].includes(condition.kind), `${path}: invalid kind`);
      check(isText(condition.measure) && isText(condition.unit), `${path}: measure and unit required`);
      check(condition.context === undefined || isText(condition.context), `${path}: context must be nonempty text`);
      const { operator, value } = condition;
      check(['<=', '>=', '=', 'between'].includes(operator), `${path}: invalid operator`);
      const validValue = operator === 'between'
        ? Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) && value[0] < value[1]
        : operator === '='
          ? Number.isFinite(value) || isText(value) || typeof value === 'boolean'
          : Number.isFinite(value);
      check(validValue, `${path}: invalid value for ${operator}`);
      validateBasis(condition, path);
    }
    check(test.conditions.some(condition => condition.kind === 'acceptance'), `${id}: at least one acceptance condition required`);
  }
  check(Number.isInteger(sheet.peak_weekly_demand) && sheet.peak_weekly_demand > 0, 'peak_weekly_demand must be a positive integer');
  check(Number.isFinite(sheet.need_by_weeks) && sheet.need_by_weeks > 0, 'need_by_weeks must be positive');
  check(sheet.planning_basis === 'heuristic', 'planning_basis must be heuristic');
}

// Escaping also keeps text values from introducing table columns or new rows.
// Expand the shortest JS numeric representation to plain decimal, without rounding.
function formatValue(value) {
  const text = String(value);
  if (typeof value !== 'number' || !text.includes('e')) return text;
  const [coefficient, exponent] = text.split('e');
  const sign = coefficient.startsWith('-') ? '-' : '';
  const unsigned = coefficient.replace('-', '');
  const digits = unsigned.replace('.', '');
  const point = (unsigned.indexOf('.') === -1 ? unsigned.length : unsigned.indexOf('.')) + Number(exponent);
  if (point <= 0) return `${sign}0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return sign + digits + '0'.repeat(point - digits.length);
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}
const cell = value => formatValue(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('|', '&#124;').replace(/\r\n|\r|\n/g, '<br>');
const basisText = item => item.basis === 'standard' ? `standard: ${item.standard}` : 'heuristic';
const row = values => `| ${values.map(cell).join(' | ')} |`;
const limitText = condition => condition.operator === 'between'
  ? `${formatValue(condition.value[0])} to ${formatValue(condition.value[1])} (inclusive)`
  : `${{ '<=': '≤', '>=': '≥', '=': '=' }[condition.operator]} ${formatValue(condition.value)}`;

/** Render a validated sheet without mutation, clocks, randomness or locale-dependent formatting. */
export function renderRequirements(sheet) {
  validateSheet(sheet);
  const lines = [BANNER, '', `# ${sheet.header}`, '', '## 1 Part and drawing', '',
    '| Field | Value |', '|---|---|',
    row(['Commodity', sheet.commodity]), row(['Part number', sheet.part_no]),
    row(['Part name', sheet.part_name]), row(['Revision', sheet.revision]), row(['Drawing number', sheet.drawing_no]), '',
    '## 2 Critical-to-quality characteristics', '',
    'Both tolerance endpoints are inclusive. These are two-sided drawing tolerances.', '',
    '| CTQ | Nominal | Lower limit | Upper limit | Unit | Basis |', '|---|---|---|---|---|---|',
    ...sheet.ctqs.map(ctq => row([ctq.name, ctq.nominal, ctq.lsl, ctq.usl, ctq.unit, basisText(ctq)])), '',
    '## 3 Test acceptance conditions', '',
    'Setup conditions define how the test is run. All acceptance conditions listed for a test must be satisfied. Heuristic limits are proposed synthetic buyer values subject to review; they are not published standard limits.', ''];
  let section = 0;
  for (const test of Object.values(sheet.tests)) {
    lines.push(`### 3.${++section} ${cell(test.name)}`, '',
      `${test.required ? 'Required' : 'Nice to have'}.`, '',
      '| Measure | Kind | Limit / condition | Unit | Basis | Context |', '|---|---|---|---|---|---|',
      ...test.conditions.map(condition => row([condition.measure, condition.kind, limitText(condition), condition.unit, basisText(condition), condition.context ?? '—'])), '');
  }
  lines.push('## 4 Demand and need-by', '', '| Planning input | Value | Unit | Basis |', '|---|---|---|---|',
    row(['Peak weekly demand', sheet.peak_weekly_demand, 'parts/week', sheet.planning_basis]),
    row(['Need-by lead time', sheet.need_by_weeks, 'weeks', sheet.planning_basis]), '');
  return lines.join('\n');
}

/** Validate every input before writing any sibling Markdown output. */
export async function renderAllRequirements(directory = new URL('../data/requirements/', import.meta.url)) {
  const path = directory instanceof URL ? fileURLToPath(directory) : directory;
  const filenames = (await readdir(path)).filter(name => name.endsWith('.json')).sort();
  const outputs = [];
  for (const name of filenames) {
    const sheet = JSON.parse(await readFile(join(path, name), 'utf8'));
    check(sheet.commodity === name.slice(0, -5), `${name}: commodity must match filename`);
    outputs.push({ name: `${name.slice(0, -5)}.md`, markdown: renderRequirements(sheet) });
  }
  for (const output of outputs) await writeFile(join(path, output.name), output.markdown, 'utf8');
  return outputs.map(output => output.name);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const files = await renderAllRequirements();
  console.log(`Rendered ${files.length} requirement sheets.`);
}
