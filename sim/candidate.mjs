import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RUBRIC, findCriterion, scoreCriterion } from '../app/engine.js';
import { sampleWorld } from './world.mjs';
import { makeRng } from './rng.mjs';
import { subSeed, validateSeed } from './seed.mjs';
import { renderRequirements } from './render-requirements.mjs';
import { computeCpk, computeAverageRangeGrr } from './measurements.mjs';

export const AS_OF = '2026-11-01';
const check = (ok, message) => { if (!ok) throw new TypeError(message); };
const mean = xs => xs.reduce((sum, x) => sum + x, 0) / xs.length;
const countSuccesses = (n, probability, rng) => Array.from({ length: n }, () => rng.bernoulli(probability)).filter(Boolean).length;
const profiles = RUBRIC.commodities;
// Fixed assertions depend only on the topic, never on private results.
const claims = {
  "1.cert_current": "Our quality-system registration remains current.",
  "1.cert_scope": "Our registered activities include manufacture of these parts.",
  "1.internal_audit": "We regularly review our own operations against our quality procedures.",
  "1.capa": "We investigate defects and track corrective actions to closure.",
  "1.calibration": "Our measuring equipment is checked on a controlled schedule.",
  "2.pfmea": "We review manufacturing failure modes for this part.",
  "2.control_plan": "Our production checks address all critical drawing features.",
  "2.ctq_cpk": "Our process consistently holds the critical drawing tolerances.",
  "2.spc": "We monitor critical dimensions using statistical charts.",
  "3.grr": "Our measurement system has suitable repeatability across operators.",
  "3.inspection_method": "We select measuring equipment appropriate to each drawing tolerance.",
  "4.method_criteria": "Our test instructions define the procedure and release limits.",
  "4.sample_size": "We select test quantities using a documented statistical rationale.",
  "5.lot_trace": "We can link each shipment back to its incoming material batch.",
  "5.records_retention": "We retain production and inspection history for the required period.",
  "5.nc_segregation": "We label rejected parts and hold them away from released stock.",
  "6.capacity_ratio": "Our demonstrated weekly output supports the forecast peak.",
  "6.lead_time": "We can deliver within the requested schedule.",
  "6.ramp_plan": "We have scheduled additional equipment and staffing for the ramp.",
  "7.pcn_notice": "We notify customers of planned changes with the required advance notice.",
  "7.change_approval": "We obtain customer authorization before changing manufacturing arrangements.",
  "8.subtier_named": "We identify the outside suppliers performing critical operations.",
  "8.flowdown": "Our purchase instructions carry the customer requirements to outside suppliers.",
  "8.subtier_certs": "We retain current registrations for our critical outside suppliers.",
  "9.second_source": "An alternate manufacturer is qualified to supply this part.",
  "9.region_risk": "Our manufacturing location supports reliable supply continuity.",
  "9.financial_health": "Our business has the resources to sustain the supply agreement.",
  "4.leak_test": "Our assemblies remain sealed under the specified conditions.",
  "4.burst_pressure": "Our assemblies withstand the required proof load without rupture.",
  "4.cleanliness": "Our internal passages meet the particle limits.",
  "4.material_cert": "Our lot-linked alloy records match the drawing designation.",
  "4.thermal_cycling": "Our parts survive the required temperature exposure without failure.",
  "4.coolant_compat": "Our wetted materials tolerate the specified fluid.",
  "4.cycle_life": "Our couplings remain sealed after repeated mating operations.",
  "4.pressure_drop": "Our assemblies maintain the required hydraulic performance at rated flow.",
  "4.spill_volume": "Our couplings release less fluid than the allowed amount when separated.",
  "4.burn_in": "Our units complete the required powered endurance exposure.",
  "4.efficiency": "Our conversion performance meets the required levels at each load point.",
  "4.halt": "We characterize operating and destructive stress margins.",
  "4.derating": "Our selected components operate within the prescribed stress allowances.",
  "4.ipc610_class": "Our boards are built and inspected to the drawing classification.",
  "4.aoi_xray": "We inspect every board optically and check hidden solder joints radiographically.",
  "4.ict_fct": "We verify electrical operation before releasing each board.",
  "4.ionic_contam": "Our boards meet the specified ionic residue limits.",
  "4.msl": "We control dry storage and exposure time for moisture-sensitive devices.",
  "4.conformal_coat": "Our protective film meets the specified thickness and coverage.",
  "4.fai": "We check the drawing features on initial production parts.",
  "4.cmm_report": "Our dimensional measurements confirm the critical features meet drawing tolerances.",
  "4.surface_finish": "Our measured roughness meets the drawing limits.",
  "4.insertion_loss": "Our optical channels meet the specified signal attenuation limits.",
  "4.workmanship_620": "Our cable assemblies are built and inspected to the drawing classification.",
  "4.bend_flex": "Our cables maintain optical performance after repeated bending.",
  "4.coating_thickness": "Our deposited layer lies within the specified dimensional range.",
  "4.salt_spray": "Our parts withstand the required corrosive exposure.",
  "4.process_audit": "Our manufacturing review has no unresolved major findings.",
  "4.esd_program": "We control electrostatic discharge throughout assembly.",
  "4.fpy_data": "We maintain monthly records of units passing on their first attempt.",
  "4.mes_trace": "We retain electronic build history for each serial number.",
  "4.training_records": "Our station operators have current task qualifications."
};
const traitRanges = {
  process_capability: [0.5, 2.5], gauge_variation: [2, 40], cert_expiry_offset_days: [-365, 1095],
  doc_discipline: [0, 1], claim_tendency: [0, 1], burying: [0, 1], capacity_ratio: [0.5, 2],
  lead_time_ratio: [0.5, 2], test_margin: [-0.25, 0.5], records_retention_years: [0, 20],
  pcn_notice_days: [0, 180], fai_coverage: [0, 1], fpy_months: [0, 18],
};
const integerTraits = ['cert_expiry_offset_days', 'records_retention_years', 'pcn_notice_days', 'fpy_months'];

// Fixed Gregorian fixture arithmetic, independent of wall clock and timezone.
export function expiryDate(offset) {
  check(Number.isInteger(offset) && offset >= -365 && offset <= 1095, 'Invalid certificate offset');
  let y = 2026, m = 11, d = 1;
  const days = () => [31, (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  for (let i = 0; i < Math.abs(offset); i++) {
    if (offset > 0) { if (++d > days()) { d = 1; if (++m > 12) { m = 1; y++; } } }
    else if (--d < 1) { if (--m < 1) { m = 12; y--; } d = days(); }
  }
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function drawDisclosure(rng, documented, claimProbability) {
  return rng.bernoulli(documented) ? 'verified' : rng.bernoulli(claimProbability) ? 'assumed' : 'missing';
}
export function conditionPasses(condition, observed) {
  switch (condition.operator) {
    case '<=': return observed <= condition.value;
    case '>=': return observed >= condition.value;
    case '=': return observed === condition.value;
    case 'between': return observed >= condition.value[0] && observed <= condition.value[1];
    default: throw new TypeError('Unsupported condition operator');
  }
}
function domain(value, unit) {
  const nonnegative = Math.max(0, value);
  if (unit === 'fraction') return Math.min(1, nonnegative);
  if (unit === '%') return Math.min(100, nonnegative);
  if (['count', 'cycles', 'particles/part', 'months'].includes(unit)) return Math.round(nonnegative);
  return nonnegative;
}
function observe(condition, traits, passes, rng) {
  const { kind, operator, value, unit } = condition;
  if (kind === 'setup') return { observed: operator === 'between' ? mean(value) : value, model: 'fixed_setup' };
  if (typeof value === 'boolean') return { observed: passes ? value : !value, model: 'test_outcome_compliance' };
  if (operator === 'between') {
    const draw = rng.normal(mean(value), (value[1] - value[0]) / (6 * traits.process_capability));
    return { observed: passes ? domain(Math.max(value[0], Math.min(value[1], draw)), unit) : domain(value[1] + Math.max(Math.abs(draw - value[1]), (value[1] - value[0]) * 0.01), unit), model: 'range_normal_conditioned' };
  }
  if (typeof value === 'number' && value > 0 && ['<=', '>='].includes(operator)) {
    const draw = rng.normal(value * (1 + (operator === '<=' ? -1 : 1) * traits.test_margin), 0.02 * value);
    const discrete = ['count', 'cycles', 'particles/part', 'months'].includes(unit);
    const distance = Math.max(Math.abs(draw - value), discrete ? 1 : value * 0.001);
    const direction = (operator === '<=' ? -1 : 1) * (passes ? 1 : -1);
    return { observed: domain(value + direction * distance, unit), model: 'limit_margin_normal_conditioned' };
  }
  if (operator === '=' && value === 0 && ['count', 'particles/part', '%'].includes(unit)) {
    return { observed: passes ? 0 : unit === '%' ? rng.uniform(0.1, 5) : rng.int(1, 3), model: 'zero_limit_compliance' };
  }
  if (operator === '=' && value === 1 && unit === 'fraction') {
    const total = 100, covered = passes ? total : rng.int(0, total - 1);
    return { observed: covered / total, covered, total, model: 'coverage_conditioned' };
  }
  throw new TypeError(`Unsupported acceptance condition: ${condition.measure}`);
}
function simulateTest(id, test, traits, rng) {
  let observations;
  if (id === '4.fai') {
    const total = 20, covered = countSuccesses(total, traits.fai_coverage, rng);
    observations = [{ observed: covered / total, covered, total, model: 'fai_binomial' }];
  } else if (id === '4.fpy_data') {
    const months = traits.fpy_months;
    const records = Array.from({ length: months }, (_, i) => {
      const index = 2026 * 12 + 9 - (months - i - 1);
      const total = 100, first_pass = countSuccesses(total, 0.98, rng);
      return { month: `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`, total, first_pass };
    });
    observations = [{ observed: months, records, model: 'fpy_history' }];
  } else {
    const passes = rng.bernoulli(traits.boolean_probability[id]);
    observations = test.conditions.map(c => observe(c, traits, passes, rng));
  }
  check(observations.length === test.conditions.length, `${id}: numeric test needs exactly one condition`);
  const conditions = test.conditions.map((c, i) => ({ ...structuredClone(c), ...observations[i], model_basis: 'heuristic' }));
  // The >=100 µm bin includes the >=500 µm bin, including failing large particles.
  if (id === '4.cleanliness') {
    const total = conditions.find(c => c.measure === 'Particles at least 100 µm');
    const large = conditions.find(c => c.measure === 'Particles at least 500 µm');
    if (total && large) { total.observed = Math.max(total.observed, large.observed); total.model = 'nested_particle_bins'; }
  }
  for (const c of conditions) c.passed = c.kind === 'acceptance' ? conditionPasses(c, c.observed) : null;
  const accepted = conditions.filter(c => c.kind === 'acceptance').every(c => c.passed);
  const true_value = test.value_type === 'number' ? conditions[0].observed : accepted;
  const evidence = { name: test.name, conditions, accepted };
  if (id === '4.burst_pressure') {
    const operating = conditions.find(c => c.measure === 'Maximum operating pressure');
    const ratio = conditions.find(c => c.measure === 'Proof / maximum operating pressure');
    evidence.sustained_proof_pressure = { value: operating.observed * ratio.observed, unit: 'bar', derived_from: 'observed pressure ratio × setup maximum operating pressure' };
  }
  return { true_value, evidence };
}
function capability(sheet, traits, stream) {
  const ctqs = sheet.ctqs.map(ctq => {
    const rng = stream(`2.ctq_cpk:${ctq.name}`), span = ctq.usl - ctq.lsl;
    const shift = rng.uniform(-0.05 * span, 0.05 * span), sigma = span / (6 * traits.process_capability);
    const observations = Array.from({ length: 50 }, () => rng.normal(ctq.nominal + shift, sigma));
    return { ...structuredClone(ctq), shift, sigma, model_basis: 'heuristic', observations, ...computeCpk(observations, ctq.lsl, ctq.usl) };
  });
  const lowest = ctqs.reduce((a, b) => a.cpk <= b.cpk ? a : b);
  return { true_value: lowest.cpk, evidence: { unit: 'dimensionless', lowest_ctq: lowest.name, ctqs } };
}
function gaugeStudies(capabilityEvidence, traits, stream) {
  const gauges = capabilityEvidence.ctqs.map(ctq => {
    const rng = stream(`3.grr:${ctq.name}`), sigma = (ctq.usl - ctq.lsl) * traits.gauge_variation / 600;
    const component_sigma = sigma / Math.sqrt(2);
    const part_values = ctq.observations.slice(0, 10);
    const appraiser_offsets = Array.from({ length: 3 }, () => rng.normal(0, component_sigma));
    const readings = part_values.map(value => appraiser_offsets.map(offset => Array.from({ length: 3 }, () => rng.normal(value + offset, component_sigma))));
    return { name: ctq.name, unit: ctq.unit, lsl: ctq.lsl, usl: ctq.usl, part_values, appraiser_offsets,
      generating_sigma: sigma, component_sigma, model_basis: 'heuristic', readings,
      ...computeAverageRangeGrr(readings, ctq.lsl, ctq.usl) };
  });
  const highest = gauges.reduce((a, b) => a.percent_tolerance >= b.percent_tolerance ? a : b);
  return { true_value: highest.percent_tolerance, evidence: { unit: '% of tolerance', highest_ctq: highest.name, gauges } };
}
export function fileFor(id) {
  if (id.startsWith('1.cert')) return 'certificates.md';
  if (id === '2.ctq_cpk') return 'capability_study.md';
  if (id === '3.grr') return 'msa.md';
  return ({ 4: 'reliability_report.md', 6: 'capacity.md', 7: 'pcn_policy.md', 8: 'subtier.md', 9: 'cover_letter.md' })[id[0]] ?? 'quality_manual.md';
}
function supportingRecord(id, value, sheet, candidate) {
  const evidence = { record: `SI-REC-${id.replace('.', '-')}`, part_no: sheet.part_no, revision: sheet.revision, confirmed: value };
  if (id === '1.cert_scope') Object.assign(evidence, { certificate: `REG-${candidate.id}-QMS`, type: 'ISO 9001', covers_part_process: value });
  if (id === '2.control_plan') evidence.ctqs = value ? sheet.ctqs.map(c => c.name) : [];
  if (id === '3.inspection_method') evidence.method = value ? 'Drawing-specific CTQ measurement instructions and calibrated gauges' : null;
  if (['4.method_criteria', '4.sample_size'].includes(id)) {
    evidence.required_tests = Object.entries(sheet.tests).filter(([, t]) => t.required).map(([key]) => key);
    evidence.document = value ? id === '4.sample_size' ? 'Documented statistical sample-size rationale' : 'Methods and buyer acceptance criteria documented' : null;
  }
  if (id === '6.ramp_plan') evidence.plan = value ? { milestones: [{ date: AS_OF, added_parts_per_week: Math.ceil(sheet.peak_weekly_demand * 0.2) }], basis: 'heuristic' } : null;
  if (id === '8.subtier_named') evidence.suppliers = value ? [candidate.name === 'Wakanda Design Group' ? 'Horizon Labs' : 'Wakanda Design Group'] : [];
  if (id === '8.subtier_certs') evidence.certificates = value ? ['REG-SUB-001'] : [];
  if (id === '9.second_source') evidence.qualified_source = value ? (candidate.name === 'Horizon Labs' ? 'Wakanda Design Group' : 'Horizon Labs') : null;
  return evidence;
}
function validateCandidate(candidate, sheet, seed) {
  validateSeed(seed);
  check(candidate && /^SUP-\d{2}$/.test(candidate.id), 'Invalid supplier ID');
  const profile = profiles.find(p => p.key === candidate.commodity);
  check(profile, 'Unknown commodity');
  check(sheet?.commodity === candidate.commodity, 'Requirement sheet commodity mismatch');
  renderRequirements(sheet); // Existing shape validation; no writes.
  check(new Set(sheet.ctqs.map(c => c.name)).size === sheet.ctqs.length, 'Duplicate CTQ name');
  const ids = [...profile.required, ...profile.nice];
  check(JSON.stringify(Object.keys(sheet.tests).sort()) === JSON.stringify([...ids].sort()), 'Profile test set mismatch');
  for (const id of ids) {
    check(sheet.tests[id].required === profile.required.includes(id) && sheet.tests[id].value_type === findCriterion(RUBRIC, id).type, `${id}: profile type/classification mismatch`);
    if (sheet.tests[id].value_type === 'number') check(sheet.tests[id].conditions.length === 1 && sheet.tests[id].conditions[0].kind === 'acceptance', `${id}: numeric test shape`);
  }
  const traits = candidate.traits;
  for (const [key, [min, max]] of Object.entries(traitRanges)) {
    check(Number.isFinite(traits?.[key]) && traits[key] >= min && traits[key] <= max, `Invalid trait ${key}`);
  }
  for (const key of integerTraits) check(Number.isInteger(traits[key]), `Invalid integer trait ${key}`);
  for (const [key, options] of [['region_risk', ['low', 'medium', 'high']], ['financial_health', ['healthy', 'watch', 'distressed']]]) check(options.includes(traits[key]), `Invalid trait ${key}`);
  const booleans = [...RUBRIC.criteria.filter(c => c.type === 'bool' && c.id !== '6.lead_time').map(c => c.id), ...ids.filter(id => sheet.tests[id].value_type === 'bool')];
  for (const id of booleans) check(Number.isFinite(traits.boolean_probability?.[id]) && traits.boolean_probability[id] >= 0 && traits.boolean_probability[id] <= 1, `Invalid boolean_probability ${id}`);
  return profile;
}
export function simulateCandidate(candidate, sheet, seed) {
  const profile = validateCandidate(candidate, sheet, seed), traits = candidate.traits;
  const stream = label => makeRng(subSeed(seed, `${candidate.id}:facts:${label}`));
  const ids = RUBRIC.criteria.filter(c => c.cat < 4).map(c => c.id)
    .concat(profile.required, profile.nice, RUBRIC.criteria.filter(c => c.cat >= 4).map(c => c.id));
  const criteria = {};
  for (const id of ids) {
    const rng = stream(id), def = findCriterion(RUBRIC, id);
    let value, evidence;
    if (id === '2.ctq_cpk') ({ true_value: value, evidence } = capability(sheet, traits, stream));
    else if (id === '3.grr') ({ true_value: value, evidence } = gaugeStudies(criteria['2.ctq_cpk'].evidence, traits, stream));
    else if (sheet.tests[id]) ({ true_value: value, evidence } = simulateTest(id, sheet.tests[id], traits, rng));
    else if (id === '1.cert_current') {
      value = expiryDate(traits.cert_expiry_offset_days);
      evidence = { as_of: AS_OF, offset_days: traits.cert_expiry_offset_days, expiry: value, certificate: `REG-${candidate.id}-QMS`, registrar: 'REG-001' };
    } else if (id === '6.capacity_ratio') {
      const weekly_mean = traits.capacity_ratio * sheet.peak_weekly_demand;
      const outputs = Array.from({ length: 8 }, () => Math.max(0, Math.round(rng.normal(weekly_mean, 0.03 * weekly_mean))));
      value = mean(outputs) / sheet.peak_weekly_demand;
      evidence = { outputs, unit: 'parts/week', peak_weekly_demand: sheet.peak_weekly_demand, mean: mean(outputs), model_basis: 'heuristic' };
    } else if (id === '6.lead_time') {
      const quoted_weeks = Math.max(1, Math.ceil(traits.lead_time_ratio * sheet.need_by_weeks));
      value = quoted_weeks <= sheet.need_by_weeks;
      evidence = { quoted_weeks, need_by_weeks: sheet.need_by_weeks, unit: 'weeks' };
    } else if (def.type === 'bool') {
      value = rng.bernoulli(traits.boolean_probability[id]);
      evidence = supportingRecord(id, value, sheet, candidate);
    } else {
      const [trait, unit] = ({ '5.records_retention': ['records_retention_years', 'years'], '7.pcn_notice': ['pcn_notice_days', 'days'], '9.region_risk': ['region_risk', 'category'], '9.financial_health': ['financial_health', 'category'] })[id];
      value = traits[trait];
      evidence = { record: `SI-REC-${id.replace('.', '-')}`, value, unit };
    }
    const disclosure = drawDisclosure(stream(`${id}:disclosure`), traits.doc_discipline, traits.claim_tendency);
    criteria[id] = { true_value: value, disclosure, buried: false, file: null, section: null, evidence,
      claim: disclosure === 'assumed' ? claims[id] : null, claimed_value: null };
  }
  const eligible = ids.filter(id => criteria[id].disclosure === 'verified' && scoreCriterion(findCriterion(RUBRIC, id), { state: 'verified', value: criteria[id].true_value, citation: 'simulation' }, AS_OF) === 3);
  check(eligible.length >= 2, `${candidate.id}: fewer than two verified passing items for appendix placement`);
  const placement = stream('placement'), reserved = new Set();
  while (reserved.size < 2) reserved.add(eligible.splice(placement.int(0, eligible.length - 1), 1)[0]);
  const sectionCounts = new Map();
  ids.forEach(id => {
    const entry = criteria[id];
    if (entry.disclosure === 'missing') return;
    entry.buried = reserved.has(id) || stream(`${id}:placement`).bernoulli(traits.burying);
    entry.file = fileFor(id);
    const prefix = entry.buried ? 9 : 1, key = `${entry.file}:${prefix}`;
    const next = (sectionCounts.get(key) ?? 0) + 1;
    sectionCounts.set(key, next);
    entry.section = `${prefix}.${next}`;
  });
  return { supplier_id: candidate.id, commodity: candidate.commodity, seed, criteria };
}
export async function simulateCandidates(seed) {
  const world = sampleWorld(seed), sheets = new Map();
  for (const candidate of world.candidates) {
    if (!sheets.has(candidate.commodity)) sheets.set(candidate.commodity, JSON.parse(await readFile(new URL(`../data/requirements/${candidate.commodity}.json`, import.meta.url), 'utf8')));
  }
  return world.candidates.map(candidate => simulateCandidate(candidate, sheets.get(candidate.commodity), seed));
}
export async function writeCandidateFacts(seed, outputDirectory) {
  check(typeof outputDirectory === 'string' && outputDirectory.length > 0, 'Output directory required');
  const facts = await simulateCandidates(seed);
  await mkdir(outputDirectory, { recursive: true });
  for (const fact of facts) await writeFile(join(outputDirectory, `${fact.supplier_id}.json`), JSON.stringify(fact, null, 2) + '\n');
  return facts;
}
export function summarizeCandidate(fact) {
  const counts = { verified: 0, assumed: 0, missing: 0 };
  for (const entry of Object.values(fact.criteria)) counts[entry.disclosure]++;
  return `${fact.supplier_id}: Cpk=${fact.criteria['2.ctq_cpk'].true_value.toFixed(4)} GRR=${fact.criteria['3.grr'].true_value.toFixed(4)}% capacity=${fact.criteria['6.capacity_ratio'].true_value.toFixed(4)} verified=${counts.verified} assumed=${counts.assumed} missing=${counts.missing}`;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  check(args.length === 4 && args[0] === '--seed' && /^\d+$/.test(args[1]) && args[2] === '--out' && args[3].length > 0, 'Usage: node sim/candidate.mjs --seed <uint32> --out <facts-directory>');
  for (const fact of await writeCandidateFacts(Number(args[1]), args[3])) console.log(summarizeCandidate(fact));
}
