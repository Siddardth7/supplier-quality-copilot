// Eval view (issue 111; PRD-13 UIE-FR-01..08; DESIGN-SPEC 4.8, 4.9; decisions 137-144). Pure: no DOM, no fetch.
// Renders data/eval.json, the committed `node agent/eval.mjs --json` output of every published run, verbatim: rates are
// the file's own strings and counts its own integers. Nothing is recomputed, rounded or judged here.
import { esc, errorPanel } from './html.js';
import { formatHash, parseHash } from './route.js';
import { parseCitation } from './criteria.js';
import { checkEval } from './data.js';
import { routeLine } from './shell.js';

const EVAL_MD = '../docs/EVAL.md';  // the served repo root holds docs/ beside app/ (decision 143)
const SONNET = 'claude-sonnet-5-5';  // PRD-13 UIE-FR-02: the headline model
const SETS = ['Headline', 'Demo', 'Re-test', 'Hold-out'];  // eval.mjs groups, always in this order: select by index
// PRD-04 §5: "Catch rate ... the target is ≥ 90%" and "False alarm ... target ≤ 5%". Keyed by eval.mjs's target names.
const TARGETS = { catch_ge_90: '≥ 90%', false_alarm_le_5: '≤ 5%' };
const VERDICT = { PASS: ['ok', 'PASS'], FAIL: ['bad', 'FAIL'] };
const OUTCOME = { miss: ['bad', 'Miss'], partial: ['amber', 'Partial'], false_alarm: ['bad', 'False alarm'] };
const STATUS = { invalid: 'packet invalid', missing: 'no extraction file' };

const has = (models, s) => models.some((m) => String(m).includes(s));
const isSonnet = (r) => has(r.report.models, SONNET) && !has(r.report.models, 'claude-opus');
const rate = (r) => (r === null || r === undefined ? 'n/a' : r);
const plural = (n, one, many) => (n === 1 ? one : many);

/** One published run for display. report: one eval.mjs --json object; n: its 1-based position in the file. */
export function runView(report, n) {
  const date = /^(\d{4}-\d{2}-\d{2})/.exec(report.run_id)?.[1] ?? null;  // decision 137: the date is in the run id, or not recorded
  const worlds = [...new Set(report.groups.flatMap((g) => g.worlds))].sort((a, b) => a - b);
  const label = has(report.models, 'claude-opus') ? 'Opus comparison'
    : worlds.length && worlds.every((w) => w >= 105 && w <= 108) ? 'Re-test'
      : has(report.models, 'claude-sonnet') ? 'Sonnet' : report.models.join(', ') || 'No model recorded';
  return { n, run_id: report.run_id, date, models: report.models.join(', ') || 'none', skillShas: report.skill_shas.join(', ') || 'none',
    worlds, complete: report.headline_complete === true, label, report };
}

// E3 / AGENT-FR-09: the first complete Sonnet run, never the best or the latest. Without one, the first Sonnet run that
// scored any of 101-104, shown INCOMPLETE (decision 138). index is 0-based, or null when no Sonnet run is published.
function pickHeadline(runs) {
  let i = runs.findIndex((r) => r.complete && isSonnet(r));
  if (i < 0) i = runs.findIndex((r) => isSonnet(r) && r.report.groups[0].worlds.length > 0);
  return i < 0 ? { index: null, complete: false } : { index: i, complete: runs[i].complete };
}

/** loadData's eval.json Result -> view state. undefined: still loading; null (no Result, old fixtures) or a 404: none. */
export function evalState(file) {
  if (file === undefined) return { kind: 'loading' };
  if (file === null) return { kind: 'none' };
  if (!file.ok) {
    const e = file.error;
    return e?.kind === 'fetch' && /^HTTP 404$/.test(e.message) ? { kind: 'none' } : { kind: 'error', error: e };
  }
  try { checkEval(file.value); } catch (e) { return { kind: 'error', error: { path: file.path, message: e.message, kind: 'data' } }; }
  if (!file.value.runs.length) return { kind: 'none' };
  const runs = file.value.runs.map((r, i) => runView(r, i + 1));
  return { kind: 'ready', runs, headline: pickHeadline(runs) };
}

const footer = `<p class="eval-footer"><a class="text-link" href="${EVAL_MD}">Full write-up: docs/EVAL.md ↗</a></p>`;

// Decision 140: two sentences, no digits (UIE-FR-07, UIE-AC-05).
const EMPTY = '<section class="panel" aria-labelledby="eval-empty-title"><p class="eyebrow" id="eval-empty-title">EVAL</p>'
  + '<p class="eval-empty">No published run yet</p>'
  + '<p class="eval-method">Four frozen simulated worlds the agent has never seen are scored against a locked answer key. '
  + 'A run is published here only after <code>node agent/eval.mjs</code> has counted its catches, misses and false alarms.</p></section>';

function verdict(v) {
  const [tone, word] = Object.hasOwn(VERDICT, String(v)) ? VERDICT[v] : ['muted', 'INCOMPLETE'];
  return `<span class="badge ${tone}">${word}</span>`;
}

function stat(label, value, num, den, target, judged) {
  const t = target ? `target ${TARGETS[target]}` : 'no target';
  const word = target ? verdict(judged) : '';
  const sr = `${label}: ${rate(value)}, ${num} of ${den}, ${t}${target ? `, ${word.replace(/<[^>]+>/g, '')}` : ''}.`;
  return `<li class="stat"><span class="sr-only">${esc(sr)}</span><span class="stat-body" aria-hidden="true">`
    + `<span class="stat-label">${label}</span><strong class="stat-value mono">${esc(rate(value))}</strong>`
    + `<span class="stat-counts mono">${esc(num)} of ${esc(den)}</span><span class="stat-target">${t}${word ? ` ${word}` : ''}</span></span></li>`;
}

function headlinePanel(run) {
  const g = run.report.groups[0];
  const c = g.counts;
  const t = run.complete ? g.targets ?? {} : {};  // a headline missing a world is never judged (PRD-04 §5)
  const head = [run.complete ? 'FIRST COMPLETE RUN' : 'FIRST SONNET RUN (INCOMPLETE)', run.models, run.date, `skill ${run.skillShas}`]
    .filter(Boolean).join(' · ');
  const missing = g.incomplete ?? [];
  const refused = run.report.refused.map((r) => `<li>Refused: world ${esc(r.world)}${r.part === 'world' ? '' : ` ${esc(r.part)}`} (${esc(r.reason)})</li>`);
  return '<section class="panel eval-headline" aria-labelledby="eval-headline-title">'
    + `<p class="eyebrow" id="eval-headline-title">${esc(head)}</p>`
    + (missing.length ? `<p class="status-line" role="status">Incomplete: world(s) ${esc(missing.join(', '))} refused or absent. Targets are not judged.</p>` : '')
    + '<ul class="stats">'
    + stat('Caught', g.rates.catch, c.catch, c.gap, 'catch_ge_90', t.catch_ge_90)
    + stat('False alarms', g.rates.false_alarm, c.false_alarm, c.clean, 'false_alarm_le_5', t.false_alarm_le_5)
    + stat('Decisions agree', g.rates.decision, c.agree, c.cand, null)
    + stat('Cited correctly', g.rates.citation, c.cite_hit, c.cite_den, null)
    + '</ul>'
    + (c.clean_unassessed > 0 ? `<p class="quiet">${esc(c.clean_unassessed)} clean rows of unusable packets were not assessed and are left out of the false-alarm rate.</p>` : '')
    + (refused.length ? `<ul class="eval-refused">${refused.join('')}</ul>` : '')
    + '</section>';
}

const td = (label, body, cls = '') => `<td data-label="${label}"${cls ? ` class="${cls}"` : ''}>${body}</td>`;
const head = (cols) => `<thead><tr>${cols.map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead>`;
const WORLD_COLS = ['World', 'Gaps', 'Caught', 'Partial', 'Missed', 'False alarms', 'Decisions agree'];

function worldRow(label, k, catchRate, group, { falseAlarms = true } = {}) {
  return `<tr data-group="${group}"><th scope="row">${label}</th>${td('Gaps', esc(k.gap), 'num')}`
    + td('Caught', `${esc(k.catch)} <small class="mono">${esc(rate(catchRate))}</small>`, 'num')
    + td('Partial', esc(k.partial), 'num') + td('Missed', esc(k.miss), 'num')
    + td('False alarms', falseAlarms ? esc(k.false_alarm) : 'n/a', 'num')
    + td('Decisions agree', k.cand > 0 ? `${esc(k.agree)} of ${esc(k.cand)}` : 'n/a', 'num') + '</tr>';
}
const notRun = (label, group) => `<tr data-group="${group}"><th scope="row">${label}</th><td colspan="6" class="quiet">not run</td></tr>`;

// Decisions 139, 141: always the headline run; 101-104 from the pooled group's per_world, then demo and hold-out apart.
function worldsPanel(run) {
  const [g, demo, , hold] = run.report.groups;
  const rows = g.per_world.map((w) => worldRow(esc(w.world), w.counts, w.rates.catch, 'headline')).join('');
  const demoRow = demo.worlds.length ? worldRow(`Demo world ${esc(demo.worlds[0])}`, demo.counts, demo.rates.catch, 'demo') : notRun('Demo world', 'demo');
  // Hold-out traps are gap rows by construction: eval.mjs reports no false alarms or decisions for them.
  const holdRow = hold.worlds.length ? worldRow('Hold-out traps', hold.counts, hold.rates.catch, 'holdout', { falseAlarms: false }) : notRun('Hold-out traps', 'holdout');
  return '<section class="panel" aria-labelledby="eval-worlds-title">'
    + `<p class="eyebrow" id="eval-worlds-title">PER WORLD (run ${run.n})</p>`
    + `<div class="table-wrap"><table class="eval-table eval-worlds"><caption class="sr-only">Per world, run ${run.n}</caption>${head(WORLD_COLS)}`
    + `<tbody>${rows || '<tr><td colspan="7" class="quiet">No world of 101 to 104 was scored.</td></tr>'}</tbody>`
    + `<tbody class="apart">${demoRow}${holdRow}</tbody></table></div></section>`;
}

function runsPanel(s, selected, ctx) {
  const items = s.runs.map((r) => {
    const href = formatHash({ view: 'eval', role: ctx.role, policy: ctx.policy, run: r.n });
    const tags = (s.headline.index === r.n - 1 ? ' <span class="badge ink">Headline</span>' : '')
      // Incomplete: scored some of 101-104 but not all. A re-test on 105-108 never claims 101-104, so it carries no badge.
      + (!r.complete && r.report.groups[0].worlds.length ? ' <span class="badge muted">Incomplete</span>' : '');
    const refused = r.report.refused.length ? ` · ${r.report.refused.length} refused` : '';
    return `<li><a class="text-link" href="${esc(href)}"${r.n === selected ? ' aria-current="true"' : ''}>Run ${r.n} · ${esc(r.label)}</a>${tags}`
      + `<span class="eval-run-meta"><span class="mono">${esc(r.run_id)}</span> · ${esc(r.models)} · ${r.date ? `<span class="mono">${esc(r.date)}</span>` : 'date not recorded'}`
      + ` · skill <span class="mono">${esc(r.skillShas)}</span> · worlds <span class="mono">${esc(r.worlds.join(', ') || 'none')}</span>${refused}</span></li>`;
  }).join('');
  return `<section class="panel" aria-labelledby="eval-runs-title"><p class="eyebrow" id="eval-runs-title">RUNS (${s.runs.length})</p>`
    + `<ol class="eval-runs">${items}</ol></section>`;
}

/** eval.mjs value -> text: strings, numbers and booleans as written (never rounded), objects as JSON. */
function val(v) {
  if (v === null || v === undefined) return '<span class="quiet">none</span>';
  return esc(typeof v === 'object' ? JSON.stringify(v) : String(v));
}

// UIE-FR-06: the answer key's citation opens that section; no citation opens the packet's file list (decision 142).
function docCell(m, run, ctx) {
  const c = parseCitation(m.expected_citation);
  const href = formatHash({ view: 'eval', role: ctx.role, policy: ctx.policy, supplier: m.supplier_id, doc: c?.doc, sec: c?.sec, run, world: m.world });
  const text = c ? `${c.doc} §${c.sec}` : 'Packet files';
  const p = parseHash(href).params;
  if (!p.world || !p.supplier || p.world !== m.world || p.supplier !== m.supplier_id) return `<span class="quiet">${esc(text)}</span>`;  // not a routable packet
  return `<a class="text-link" data-citation href="${esc(href)}">${esc(text)} ↗</a>`;
}

const MISS_COLS = ['Set', 'World', 'Supplier', 'Criterion', 'Outcome', 'Expected', 'Found', 'Document'];

function missRow(m, run, ctx) {
  const [tone, word] = Object.hasOwn(OUTCOME, String(m.outcome)) ? OUTCOME[m.outcome] : ['muted', String(m.outcome)];
  const tag = Object.hasOwn(STATUS, String(m.status)) ? ` <span class="quiet">${STATUS[m.status]}</span>` : '';
  const found = m.got_state === null || m.got_state === undefined ? '<span class="quiet">nothing found</span>' : `${esc(m.got_state)} ${val(m.got_value)}`;
  return `<tr data-id="${esc(`${run}|${m.world}|${m.supplier_id}|${m.criterion_id}|${m.outcome}`)}">`
    + td('Set', SETS[m.set]) + td('World', esc(m.world), 'mono') + td('Supplier', esc(m.supplier_id), 'mono')
    + td('Criterion', esc(m.criterion_id), 'mono') + td('Outcome', `<span class="badge ${tone}">${esc(word)}</span>${tag}`)
    + td('Expected', `${esc(m.expected_state)} ${val(m.expected_value)}`) + td('Found', found)
    + td('Document', docCell(m, run, ctx)) + '</tr>';
}

function missPanel(run, ctx) {
  const rows = run.report.groups.flatMap((g, set) => g.misses.map((m) => ({ ...m, set })));
  const title = `EVERY MISS, PARTIAL AND FALSE ALARM (run ${run.n}) · ${rows.length}`;
  return '<section class="panel" aria-labelledby="eval-misses-title">'
    + `<p class="eyebrow" id="eval-misses-title">${title}</p>`
    + `<p class="quiet">The written reason for each is in <a class="text-link" href="${EVAL_MD}">docs/EVAL.md ↗</a>.</p>`
    + (rows.length
      ? `<div class="table-wrap"><table class="eval-table eval-misses"><caption class="sr-only">Every miss, partial and false alarm, run ${run.n}</caption>`
        + `${head(MISS_COLS)}<tbody>${rows.map((m) => missRow(m, run.n, ctx)).join('')}</tbody></table></div>`
      : '<p class="quiet">No misses, partials or false alarms in this run.</p>')
    + '</section>';
}

/** The Eval body after the view head. ctx: { role, params } from main.js; reads params.run and params.policy. */
export function renderEval(model, ctx = {}) {
  if (!model) return '<p class="quiet">Loading data…</p>';
  const s = evalState(model.evalRuns ?? null);
  if (s.kind === 'loading') return '<p class="quiet">Loading data…</p>';
  // An Eval world/supplier pair that is not a published miss (issue 163): Not found above the page, in every state.
  const nf = ctx.notFound ? routeLine(ctx) : '';
  if (s.kind === 'none') return `<div class="eval">${nf}${EMPTY}${footer}</div>`;
  if (s.kind === 'error') return `<div class="eval">${nf}<div class="status">${errorPanel(s.error)}</div>${footer}</div>`;
  const c = { role: ctx.role ?? 'senior', policy: ctx.params?.policy };
  const want = ctx.params?.run;
  const fallback = (s.headline.index ?? 0) + 1;  // decision 139: the headline run, else run 1
  const selected = want >= 1 && want <= s.runs.length ? want : fallback;
  const note = want !== undefined && selected !== want
    ? `<p class="status-line" role="status">Run ${esc(want)} is not published; showing run ${selected}.</p>` : '';
  const hl = s.headline.index === null ? null : s.runs[s.headline.index];
  return '<div class="eval">' + nf
    + (hl ? headlinePanel(hl) + worldsPanel(hl) : '<p class="quiet">No Sonnet run on worlds 101-104 is published yet.</p>')
    + runsPanel(s, selected, c)
    + note
    + missPanel(s.runs[selected - 1], c)
    + footer + '</div>';
}
