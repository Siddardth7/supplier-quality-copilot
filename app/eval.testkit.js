// Hand-made data/eval.json fixtures for the Eval view (issue 111). Built with the real agent/eval.mjs buildReport and
// renderJson, so a change to the report's shape breaks the view's tests (UIE-AC-01). Synthetic: Stark Industries buyer,
// supplier IDs SUP-01 and SUP-02 only, real world numbers and packet file names so QA deep links reach real packets.
import { buildReport, renderJson } from '../agent/eval.mjs';

const row = (supplier_id, criterion_id, cls, outcome, o = {}) => ({ supplier_id, criterion_id, cls, outcome,
  expected_state: 'verified', expected_value: null, expected_citation: null,
  got_state: null, got_value: null, got_citation: null, citation_match: null, ...o });

// One world's candidates. catches: verified catches for SUP-01 (vary it to give two runs different counts).
function candidates(catches) {
  const caught = Array.from({ length: catches }, (_, i) => row('SUP-01', i === 0 ? '2.ctq_cpk' : `cat.${i}`, 'gap', 'catch', {
    expected_value: 1.12, expected_citation: 'capability_study.md §1.1', got_state: 'verified', got_value: 1.12,
    got_citation: 'capability_study.md §1.1', citation_match: i % 2 === 0 }));
  return [
    { supplier_id: 'SUP-01', status: 'scored', decision_agrees: true, rows: [
      ...caught,
      row('SUP-01', '6.ramp_plan', 'gap', 'partial', { expected_state: 'assumed', expected_citation: 'cover_letter.md §1.1', got_state: 'missing' }),
      row('SUP-01', '3.grr', 'gap', 'miss', { expected_value: 32.5, expected_citation: 'msa.md §1.1', got_state: 'verified', got_value: 8.2,
        got_citation: 'msa.md §1.1' }),
      row('SUP-01', '8.subtier_named', 'gap', 'miss', { expected_state: 'missing', got_state: 'verified', got_value: true, got_citation: 'subtier.md §1.1' }),
      row('SUP-01', '1.capa', 'clean', 'false_alarm', { expected_value: true, expected_citation: 'quality_manual.md §1.1', got_state: 'verified',
        got_value: false, got_citation: 'quality_manual.md §1.1' }),
      ...Array.from({ length: 18 }, (_, i) => row('SUP-01', `ok.${i}`, 'clean', 'ok')),
    ] },
    { supplier_id: 'SUP-02', status: 'invalid', decision_agrees: false, rows: [
      row('SUP-02', '2.ctq_cpk', 'gap', 'miss', { expected_value: 1.325, expected_citation: 'capability_study.md §1.1' }),
      ...Array.from({ length: 5 }, (_, i) => row('SUP-02', `ok.${i}`, 'clean', 'ok')),
    ] },
  ];
}

const HOLD = [{ supplier_id: 'SUP-01', status: 'scored', decision_agrees: null, rows: [
  row('SUP-01', '7.pcn_notice', 'gap', 'miss', { expected_value: 30, expected_citation: 'pcn_policy.md §1.1', got_state: 'verified', got_value: 90,
    got_citation: 'pcn_policy.md §1.1' }),
] }];

/** One run, exactly as `node agent/eval.mjs --json` prints it, parsed.
 *  worlds: scored world numbers; demo: a demo world number or null; holdout: worlds that carry the hold-out trap;
 *  refuse: { world: reason } for refused worlds; catches: verified catches per world for SUP-01. */
export function report({ run_id = '2026-11-20a', model = 'claude-sonnet-5-5', sha = 'abc1234', worlds = [101, 102, 103, 104], demo = null,
  holdout = [101], refuse = {}, catches = 1 } = {}) {
  const results = [...worlds, ...(demo === null ? [] : [demo])].sort((a, b) => a - b).map((world) => (refuse[world]
    ? { world, refused: refuse[world] }
    : { world, refused: null, holdout_refused: null, models: [model], skill_shas: [sha], candidates: candidates(catches),
      holdout: holdout.includes(world) ? HOLD : [] }));
  for (const w of Object.keys(refuse).map(Number)) if (!results.some((r) => r.world === w)) results.push({ world: w, refused: refuse[w] });
  results.sort((a, b) => a.world - b.world);
  return JSON.parse(renderJson(buildReport({ run_id, demo, results })));
}

/** One complete Sonnet run on 101-104 with demo world 93 and a hold-out trap. */
export const FIXTURE_ONE = { runs: [report({ demo: 93 })] };

/** Sonnet complete (run 1), Opus complete (run 2, more catches), Sonnet re-test on 105-108 (run 3). */
export const FIXTURE_MANY = { runs: [
  report({ demo: 93 }),
  report({ run_id: '2026-11-21a', model: 'claude-opus-5-5', catches: 3 }),
  report({ run_id: '2026-11-28b', sha: 'def5678', worlds: [105, 106, 107, 108], holdout: [], catches: 2 }),
] };

/** First Sonnet run scored 101-102 only (incomplete), then a later complete Sonnet run. */
export const FIXTURE_INCOMPLETE = { runs: [
  report({ run_id: '2026-11-19a', worlds: [101, 102], refuse: { 103: 'answer_key.json does not match answer_key.sha256' } }),
  report({ run_id: '2026-11-20a', catches: 2 }),
] };

/** loadData-style Results. */
export const ok = (value) => ({ ok: true, value, path: 'data/eval.json' });
export const failed = (message, kind = 'fetch') => ({ ok: false, error: { path: 'data/eval.json', message, kind } });
