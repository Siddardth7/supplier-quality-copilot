// Shared hold-out input contract for overlay publication and eval (issue 128).
import { lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { RUBRIC, scoreCriterion } from '../app/engine.js';

const fields = ['supplier_id', 'criterion', 'expected_state', 'expected_value', 'file', 'section'];
const check = (ok, message) => { if (!ok) throw new TypeError(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Inventory only regular files under regular packet directories; invalid IDs never become paths. */
export function holdoutPacketFiles(worldDirectory, key, entries) {
  const root = join(worldDirectory, 'packets');
  const rootStat = lstatSync(root);
  check(rootStat.isDirectory() && !rootStat.isSymbolicLink(), 'Unsafe packet root');
  const files = {};
  for (const id of new Set(Array.isArray(entries) ? entries.map(entry => entry?.supplier_id) : [])) {
    if (typeof id !== 'string' || !/^SUP-[0-9]{2}$/.test(id) || !key.candidates.some(row => row.supplier_id === id)) continue;
    const directory = join(root, id);
    const stat = lstatSync(directory);
    check(stat.isDirectory() && !stat.isSymbolicLink(), 'Unsafe supplier packet directory');
    files[id] = readdirSync(directory).filter(name => {
      const file = lstatSync(join(directory, name));
      return file.isFile() && !file.isSymbolicLink();
    });
  }
  return files;
}

/** Validate the published six-field expectations without changing the key or entries. */
export function validateHoldout(entries, key, packetFilesBySupplier) {
  check(Array.isArray(entries), 'holdout.json must be an array');
  const seen = new Set();
  for (const [index, entry] of entries.entries()) {
    const label = `holdout.json[${index}]`;
    check(object(entry) && Object.keys(entry).length === fields.length && fields.every(field => Object.hasOwn(entry, field)), `${label}: expected exactly ${fields.join(', ')}`);
    const candidate = key.candidates.find(row => row.supplier_id === entry.supplier_id);
    check(candidate && typeof entry.supplier_id === 'string' && /^SUP-[0-9]{2}$/.test(entry.supplier_id), `${label}: unknown supplier ${JSON.stringify(entry.supplier_id)}`);
    const profile = RUBRIC.commodities.find(row => row.key === candidate.commodity);
    const applicable = profile && [...RUBRIC.criteria.map(row => row.id), ...profile.required, ...profile.nice];
    // Applicability and presence in the locked key are distinct (issue 128).
    check(applicable?.includes(entry.criterion) && candidate.criteria.some(row => row.criterion_id === entry.criterion), `${label}: unknown criterion ${JSON.stringify(entry.criterion)} for ${entry.supplier_id}`);
    const pair = `${entry.supplier_id}:${entry.criterion}`;
    check(!seen.has(pair), `${label}: duplicate supplier/criterion`);
    seen.add(pair);
    check(['verified', 'assumed', 'missing'].includes(entry.expected_state), `${label}: invalid expected_state`);
    check(typeof entry.file === 'string' && /^[a-z0-9_]+\.md$/.test(entry.file) && entry.file !== 'rfq.md' && packetFilesBySupplier[entry.supplier_id]?.includes(entry.file), `${label}: unknown or unsafe supplier packet file`);
    check(typeof entry.section === 'string' && /^[0-9]+(\.[0-9]+)*$/.test(entry.section), `${label}: invalid numbered section`);
    check(entry.expected_value !== undefined && (entry.expected_state !== 'missing' || entry.expected_value === null) && (entry.expected_state !== 'verified' || entry.expected_value !== null), `${label}: invalid expected_value for ${entry.expected_state}`);
    if (entry.expected_value !== null) {
      const definition = [...RUBRIC.criteria, ...RUBRIC.tests].find(row => row.id === entry.criterion);
      try {
        scoreCriterion(definition, { state: 'verified', value: entry.expected_value, citation: '-' }, key.as_of);
      } catch (error) { throw new TypeError(`${label}: invalid expected_value: ${error.message}`); }
    }
  }
}
