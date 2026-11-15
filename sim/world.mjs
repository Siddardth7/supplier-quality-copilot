import { readFileSync } from 'node:fs';
import { makeRng } from './rng.mjs';
import { subSeed, validateSeed } from './seed.mjs';

const archetypes = JSON.parse(readFileSync(new URL('./archetypes.json', import.meta.url), 'utf8'));
const integerTraits = new Set([
  'cert_expiry_offset_days',
  'records_retention_years',
  'pcn_notice_days',
  'fpy_months',
  'quality_pattern.start_month',
  'quality_pattern.spike_month',
  'scar_trigger',
]);
const enumTraits = {
  region_risk: ['low', 'medium', 'high'],
  financial_health: ['healthy', 'watch', 'distressed'],
  'quality_pattern.kind': ['stable', 'creep', 'spike'],
  failure_pattern: ['mixed', 'repeat'],
};

function sampleTrait(value, path, rng) {
  const choices = enumTraits[path];
  if (choices) {
    const values = Array.isArray(value) ? value : [value];
    if (values.length === 0 || values.some(choice => !choices.includes(choice))) {
      throw new TypeError(`Invalid enum choices for ${path}`);
    }
    return rng.pick(values);
  }
  if (path === 'failure_modes') {
    if (!Array.isArray(value) || value.length === 0
        || value.some(mode => typeof mode !== 'string')) {
      throw new TypeError('failure_modes must be a nonempty list of strings');
    }
    return [...value];
  }
  if (path === 'detection') return structuredClone(value);
  if (path === 'received_qty') return [...value];
  if (Array.isArray(value)) {
    if (value.length !== 2 || value.some(bound => typeof bound !== 'number')) {
      throw new TypeError(`Invalid numeric range for ${path}`);
    }
    try {
      return integerTraits.has(path) ? rng.int(...value) : rng.uniform(...value);
    } catch (error) {
      throw new RangeError(`Invalid numeric range for ${path}: ${error.message}`);
    }
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, trait]) => [
      key,
      sampleTrait(trait, path ? `${path}.${key}` : key, rng),
    ]));
  }
  return value;
}

export function sampleWorld(seed) {
  validateSeed(seed);
  function sampleSupplier(entry) {
    const rng = makeRng(subSeed(seed, entry.id));
    return { ...structuredClone(entry), traits: sampleTrait(entry.traits, '', rng) };
  }
  return {
    seed,
    candidates: archetypes.candidates.map(sampleSupplier),
    active: archetypes.active.map(sampleSupplier),
  };
}
