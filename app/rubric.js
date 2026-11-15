// Rubric, scorecard constants and the Stark Reference v1 policy, as data.
// Source of truth: docs/RUBRIC.md and docs/SCORECARD.md. app/parity.test.js fails
// until this file and those docs agree; change both in the same commit.
//
// Data only: no functions, no scoring logic. Every export survives a JSON round trip.
// Consumers (the engine, the UI, the agent) must treat these objects as read-only.
//
// Number rules are band lists evaluated first match wins: every row but the last is
// { op, x, score } with op one of '>=' '<=' '>' '<'; the last row is { score } (the else).
// The op carries which side of an edge a value falls on (RUBRIC.md § Band edges).
//
// Scorecard limits: direction 'lower' means Good if x <= good, Watch if good < x <= watch,
// Bad if x > watch. Direction 'higher' means Good if x >= good, Watch if watch <= x < good,
// Bad if x < watch. Percent metrics are stored as percent (5 means 5%), DPPM as an integer.
// Keys ending _over_days mean strictly greater than.

const BOOL = { true: 3, false: 0 };

export const RUBRIC = {
  risk_classes: ['High', 'Medium', 'Low'],

  categories: [
    { n: 1, name: 'Quality system' },
    { n: 2, name: 'Process control' },
    { n: 3, name: 'Measurement' },
    { n: 4, name: 'Reliability & validation' },
    { n: 5, name: 'Traceability' },
    { n: 6, name: 'Capacity & ramp' },
    { n: 7, name: 'Change control' },
    { n: 8, name: 'Sub-tier management' },
    { n: 9, name: 'Supply risk' },
  ],

  // The `4.<test>` row of the Criteria table: each commodity-required test is a
  // category 4 knockout. Not a criterion itself; the tests come from `tests`.
  test_criterion: { cat: 4, knockout: true },

  // RUBRIC.md § Criteria, doc order, without the `4.<test>` row.
  criteria: [
    { id: '1.cert_current', cat: 1, knockout: true, type: 'date',
      requirement: 'Expiry date of the quality-system certificate',
      rule: { ge_as_of: 3, lt_as_of: 0 } },
    { id: '1.cert_scope', cat: 1, knockout: true, type: 'bool',
      requirement: 'Cert is ISO 9001, AS9100 or IATF 16949, and its scope covers the process that makes this part',
      rule: { ...BOOL } },
    { id: '1.internal_audit', cat: 1, knockout: false, type: 'bool',
      requirement: 'Internal audit program in place', rule: { ...BOOL } },
    { id: '1.capa', cat: 1, knockout: false, type: 'bool',
      requirement: 'Documented CAPA process', rule: { ...BOOL } },
    { id: '1.calibration', cat: 1, knockout: false, type: 'bool',
      requirement: 'Calibration program covering production gauges', rule: { ...BOOL } },
    { id: '2.pfmea', cat: 2, knockout: false, type: 'bool',
      requirement: 'Current PFMEA for this part', rule: { ...BOOL } },
    { id: '2.control_plan', cat: 2, knockout: false, type: 'bool',
      requirement: 'Control plan covers every CTQ', rule: { ...BOOL } },
    { id: '2.ctq_cpk', cat: 2, knockout: true, type: 'number',
      requirement: "Lowest Cpk across the part's CTQs",
      rule: [{ op: '>=', x: 1.33, score: 3 }, { op: '>=', x: 1.00, score: 1 }, { score: 0 }] },
    { id: '2.spc', cat: 2, knockout: false, type: 'bool',
      requirement: 'SPC in use on CTQs', rule: { ...BOOL } },
    { id: '3.grr', cat: 3, knockout: true, type: 'number',
      requirement: 'Highest Gage R&R across CTQ gauges, % of tolerance',
      rule: [{ op: '<=', x: 10, score: 3 }, { op: '<=', x: 30, score: 1 }, { score: 0 }] },
    { id: '3.inspection_method', cat: 3, knockout: false, type: 'bool',
      requirement: 'Inspection method suited to the tolerance (CMM, AOI, X-ray)', rule: { ...BOOL } },
    { id: '4.method_criteria', cat: 4, knockout: false, type: 'bool',
      requirement: 'Test methods and acceptance criteria stated for the required tests', rule: { ...BOOL } },
    { id: '4.sample_size', cat: 4, knockout: false, type: 'bool',
      requirement: 'Sample sizes for the required tests justified (statistical basis or a cited standard)',
      rule: { ...BOOL } },
    { id: '5.lot_trace', cat: 5, knockout: true, knockout_risk: ['High'], type: 'bool',
      requirement: 'Lot or serial traceability to raw material', rule: { ...BOOL } },
    { id: '5.records_retention', cat: 5, knockout: false, type: 'number',
      requirement: 'Quality-record retention, years',
      rule: [{ op: '>=', x: 10, score: 3 }, { op: '>=', x: 5, score: 1 }, { score: 0 }] },
    { id: '5.nc_segregation', cat: 5, knockout: false, type: 'bool',
      requirement: 'Nonconforming material identified and segregated', rule: { ...BOOL } },
    { id: '6.capacity_ratio', cat: 6, knockout: false, type: 'number',
      requirement: 'Demonstrated capacity ÷ forecast peak demand',
      rule: [{ op: '>=', x: 1.2, score: 3 }, { op: '>=', x: 1.0, score: 2 }, { op: '>=', x: 0.8, score: 1 }, { score: 0 }] },
    { id: '6.lead_time', cat: 6, knockout: false, type: 'bool',
      requirement: 'Quoted lead time meets the need date', rule: { ...BOOL } },
    { id: '6.ramp_plan', cat: 6, knockout: false, type: 'bool',
      requirement: 'Ramp plan with dates and added capacity', rule: { ...BOOL } },
    { id: '7.pcn_notice', cat: 7, knockout: false, type: 'number',
      requirement: 'PCN notice period, days',
      rule: [{ op: '>=', x: 90, score: 3 }, { op: '>=', x: 30, score: 1 }, { score: 0 }] },
    { id: '7.change_approval', cat: 7, knockout: false, type: 'bool',
      requirement: 'No process, site or sub-tier change without customer approval', rule: { ...BOOL } },
    { id: '8.subtier_named', cat: 8, knockout: false, type: 'bool',
      requirement: 'Critical sub-tier suppliers named', rule: { ...BOOL } },
    { id: '8.flowdown', cat: 8, knockout: false, type: 'bool',
      requirement: 'Requirements flowed down to sub-tier', rule: { ...BOOL } },
    { id: '8.subtier_certs', cat: 8, knockout: false, type: 'bool',
      requirement: 'Certificates on file for the critical sub-tier', rule: { ...BOOL } },
    { id: '9.second_source', cat: 9, knockout: false, type: 'bool',
      requirement: 'A second qualified source exists for this part',
      rule: { true: 3, false: 1 } },
    { id: '9.region_risk', cat: 9, knockout: false, type: 'enum',
      requirement: "Risk of the manufacturing site's region",
      rule: { low: 3, medium: 2, high: 1 } },
    { id: '9.financial_health', cat: 9, knockout: false, type: 'enum',
      requirement: 'Financial health indicator',
      rule: { healthy: 3, watch: 1, distressed: 0 } },
  ],

  // RUBRIC.md § Test catalog, doc order.
  tests: [
    { id: '4.leak_test', name: 'Leak test', passes_when: 'Helium leak rate at or below the stated spec', type: 'bool', rule: { ...BOOL } },
    { id: '4.burst_pressure', name: 'Burst / proof pressure', passes_when: 'Holds the stated multiple of max operating pressure', type: 'bool', rule: { ...BOOL } },
    { id: '4.cleanliness', name: 'Internal cleanliness', passes_when: 'Particle count within the stated limit (ISO 16232 style)', type: 'bool', rule: { ...BOOL } },
    { id: '4.material_cert', name: 'Material certificate', passes_when: 'Cert traceable to the lot and matching the drawing material', type: 'bool', rule: { ...BOOL } },
    { id: '4.thermal_cycling', name: 'Thermal cycling / HTOL', passes_when: 'Passes the stated cycles or hours with no failure', type: 'bool', rule: { ...BOOL } },
    { id: '4.coolant_compat', name: 'Coolant compatibility', passes_when: 'Wetted materials shown compatible with the system coolant', type: 'bool', rule: { ...BOOL } },
    { id: '4.cycle_life', name: 'Connect / disconnect cycle life', passes_when: 'Meets the rated cycle count with leak test still passing', type: 'bool', rule: { ...BOOL } },
    { id: '4.pressure_drop', name: 'Pressure drop', passes_when: 'Within spec at rated flow', type: 'bool', rule: { ...BOOL } },
    { id: '4.spill_volume', name: 'Spill on disconnect', passes_when: 'Within spec', type: 'bool', rule: { ...BOOL } },
    { id: '4.burn_in', name: 'Burn-in', passes_when: 'Burn-in run at stated conditions, fallout within limit', type: 'bool', rule: { ...BOOL } },
    { id: '4.efficiency', name: 'Efficiency vs load', passes_when: 'Meets the efficiency curve across the load range', type: 'bool', rule: { ...BOOL } },
    { id: '4.halt', name: 'HALT', passes_when: 'Margins to operating and destruct limits reported', type: 'bool', rule: { ...BOOL } },
    { id: '4.derating', name: 'Component derating', passes_when: 'Derating analysis against a stated policy', type: 'bool', rule: { ...BOOL } },
    { id: '4.ipc610_class', name: 'Workmanship, IPC-A-610', passes_when: 'Built and inspected to the class on the drawing', type: 'bool', rule: { ...BOOL } },
    { id: '4.aoi_xray', name: 'AOI and BGA X-ray', passes_when: 'AOI on every board and X-ray on BGAs, results within criteria', type: 'bool', rule: { ...BOOL } },
    { id: '4.ict_fct', name: 'In-circuit / functional test', passes_when: 'Coverage stated and every shipped board passes', type: 'bool', rule: { ...BOOL } },
    { id: '4.ionic_contam', name: 'Ionic contamination', passes_when: 'Within the stated limit', type: 'bool', rule: { ...BOOL } },
    { id: '4.msl', name: 'Moisture sensitivity handling', passes_when: 'J-STD-033 controls in place', type: 'bool', rule: { ...BOOL } },
    { id: '4.conformal_coat', name: 'Conformal coating', passes_when: 'Thickness and coverage inspected', type: 'bool', rule: { ...BOOL } },
    { id: '4.fai', name: 'First article inspection', passes_when: 'Share of drawing characteristics covered, 0–1', type: 'number',
      rule: [{ op: '>=', x: 1.0, score: 3 }, { op: '>=', x: 0.9, score: 2 }, { op: '>=', x: 0.5, score: 1 }, { score: 0 }] },
    { id: '4.cmm_report', name: 'CMM report', passes_when: 'Flatness and every CTQ dimension measured and in tolerance', type: 'bool', rule: { ...BOOL } },
    { id: '4.surface_finish', name: 'Surface finish', passes_when: 'Ra measured and within the drawing', type: 'bool', rule: { ...BOOL } },
    { id: '4.insertion_loss', name: 'Insertion / return loss', passes_when: 'Within spec on every channel', type: 'bool', rule: { ...BOOL } },
    { id: '4.workmanship_620', name: 'Workmanship, IPC/WHMA-A-620', passes_when: 'Built and inspected to the class on the drawing', type: 'bool', rule: { ...BOOL } },
    { id: '4.bend_flex', name: 'Bend / flex', passes_when: 'Passes the stated cycles with loss still in spec', type: 'bool', rule: { ...BOOL } },
    { id: '4.coating_thickness', name: 'Coating thickness', passes_when: 'Within the drawing range', type: 'bool', rule: { ...BOOL } },
    { id: '4.salt_spray', name: 'Salt spray', passes_when: 'Passes the stated hours (ASTM B117 style)', type: 'bool', rule: { ...BOOL } },
    { id: '4.process_audit', name: 'Process audit', passes_when: 'Audit done, no open major finding', type: 'bool', rule: { ...BOOL } },
    { id: '4.esd_program', name: 'ESD control program', passes_when: 'Program in place (ANSI/ESD S20.20 style), no open major finding', type: 'bool', rule: { ...BOOL } },
    { id: '4.fpy_data', name: 'First-pass yield data', passes_when: 'Months of FPY data available', type: 'number',
      rule: [{ op: '>=', x: 6, score: 3 }, { op: '>=', x: 3, score: 1 }, { score: 0 }] },
    { id: '4.mes_trace', name: 'MES traceability', passes_when: 'Serial-level build records in an MES', type: 'bool', rule: { ...BOOL } },
    { id: '4.training_records', name: 'Operator training records', passes_when: 'Records current for the stations building this part', type: 'bool', rule: { ...BOOL } },
  ],

  // RUBRIC.md § Commodity profiles, doc order.
  commodities: [
    { key: 'cold_plate', name: 'Cold plate / coolant manifold', risk: 'High',
      required: ['4.leak_test', '4.burst_pressure', '4.cleanliness', '4.material_cert'],
      nice: ['4.thermal_cycling', '4.coolant_compat'] },
    { key: 'quick_disconnect', name: 'Quick-disconnect coupling', risk: 'High',
      required: ['4.leak_test', '4.cycle_life', '4.pressure_drop'],
      nice: ['4.spill_volume'] },
    { key: 'power_module', name: 'Power conversion module', risk: 'High',
      required: ['4.burn_in', '4.thermal_cycling', '4.efficiency'],
      nice: ['4.halt', '4.derating'] },
    { key: 'pcba', name: 'High-layer PCBA', risk: 'Medium',
      required: ['4.ipc610_class', '4.aoi_xray', '4.ict_fct', '4.ionic_contam'],
      nice: ['4.msl', '4.conformal_coat'] },
    { key: 'machined_part', name: 'Precision machined part', risk: 'Medium',
      required: ['4.fai', '4.cmm_report', '4.material_cert'],
      nice: ['4.surface_finish'] },
    { key: 'optics_cable', name: 'Optics / cable assembly', risk: 'Medium',
      required: ['4.insertion_loss', '4.workmanship_620'],
      nice: ['4.bend_flex'] },
    { key: 'sheet_metal', name: 'Rack sheet metal', risk: 'Low',
      required: ['4.fai', '4.coating_thickness'],
      nice: ['4.salt_spray'] },
    { key: 'contract_mfg', name: 'Contract manufacturer (system build)', risk: 'High',
      required: ['4.process_audit', '4.esd_program', '4.fpy_data', '4.mes_trace'],
      nice: ['4.training_records'] },
  ],
};

// RUBRIC.md § Team scoring policy and SCORECARD.md § Composite and tier (Policy).
export const STARK_REFERENCE = {
  id: 'stark-reference',
  version: 1,
  name: 'Stark Reference v1',
  qualification: {
    weights: { 1: 15, 2: 15, 3: 10, 4: 15, 5: 10, 6: 10, 7: 8, 8: 7, 9: 10 },
    approve: 85,
    conditional: 70,
    knockouts_off: [],
  },
  scorecard: {
    weights: { dppm: 30, escape: 20, repeat_nc: 15, scar_aging: 15, otd: 20 },
    limits: {
      dppm: { good: 500, watch: 2000 },
      escape: { good: 5, watch: 15 },
      repeat_nc: { good: 10, watch: 25 },
      scar_aging: { good: 0, watch: 25 },
      otd: { good: 95, watch: 85 },
    },
    tiers: { A: 85, B: 70, C: 50 },
  },
};

// SCORECARD.md fixed constants (not part of a policy) and metric descriptors.
export const SCORECARD = {
  months: 18,
  baseline_months: 6,
  band_points: { good: 1, watch: 0.5, bad: 0 },
  metrics: {
    dppm: { name: 'DPPM', direction: 'lower', window_months: 3 },
    escape: { name: 'Escape rate', direction: 'lower', window_months: 6 },
    repeat_nc: { name: 'Repeat NC rate', direction: 'lower', window_months: 6, lookback_days: 180 },
    scar_aging: { name: 'SCAR aging', direction: 'lower', window_months: null, age_over_days: 30 }, // null = snapshot at month end
    otd: { name: 'On-time delivery', direction: 'higher', window_months: 3 },
  },
  tier_order: ['A', 'B', 'C', 'D'],
  pchart: { sigma: 3 },
  alerts: {
    types: ['ucl', 'run7', 'tier_drop', 'scar_aging', 'metric_bad'],
    run_points: 7,
    scar_aging_over_days: 60,
  },
};
