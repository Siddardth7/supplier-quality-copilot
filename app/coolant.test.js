// Coolant Loop particles (issue 178, DS-FR-09, DS-NFR-03): pure helpers and startCoolant over hand-made fakes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LANES, COUNT_WIDE, COUNT_NARROW, NARROW_PX, DPR_CAP, MAX_DT,
  particleCount, canvasSize, makeParticles, advance, laneY, position, readFlow, startCoolant,
} from './coolant.js';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} != ${b}`);

test('constants are the documented budget', () => {
  assert.deepEqual([LANES, COUNT_WIDE, COUNT_NARROW, NARROW_PX, DPR_CAP, MAX_DT], [7, 110, 50, 760, 1.5, 50]);
});

test('particleCount: 50 under 760 px, 110 from 760 px', () => {
  assert.equal(particleCount(390), 50);
  assert.equal(particleCount(759), 50);
  assert.equal(particleCount(760), 110);
  assert.equal(particleCount(1280), 110);
});

test('canvasSize: DPR capped at 1.5, floored at 1, missing DPR is 1, sizes rounded', () => {
  assert.deepEqual(canvasSize(1280, 800, 1), { width: 1280, height: 800, scale: 1 });
  assert.deepEqual(canvasSize(1280, 800, 1.25), { width: 1600, height: 1000, scale: 1.25 });
  assert.deepEqual(canvasSize(1280, 800, 1.5), { width: 1920, height: 1200, scale: 1.5 });
  assert.deepEqual(canvasSize(1280, 800, 1.51), { width: 1920, height: 1200, scale: 1.5 });
  assert.deepEqual(canvasSize(1280, 800, 2), { width: 1920, height: 1200, scale: 1.5 });
  assert.deepEqual(canvasSize(100, 50, 3), { width: 150, height: 75, scale: 1.5 });
  for (const dpr of [0, undefined, null, NaN, 0.5]) assert.deepEqual(canvasSize(100, 50, dpr), { width: 100, height: 50, scale: 1 }, String(dpr));
  assert.deepEqual(canvasSize(100, 50, 3, 2), { width: 200, height: 100, scale: 2 }, 'cap is a parameter');
  assert.deepEqual(canvasSize(101, 33, 1.5), { width: 152, height: 50, scale: 1.5 }, 'Math.round of 151.5 and 49.5');
});

test('makeParticles: count, lane range, tint rule, x in [0,1), v and r from rand', () => {
  const seq = [0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.999999, 0.999999, 0.999999, 0.999999, 0.2, 3 / 7, 0.1, 0.9];
  let i = 0;
  const ps = makeParticles(4, () => seq[i++ % seq.length]);
  assert.equal(ps.length, 4);
  assert.deepEqual(ps.map((p) => p.lane), [0, 3, 6, 3]);
  assert.deepEqual(ps.map((p) => p.tint), [1, 1, 1, 1], 'lanes 0, 3, 6 are tinted');
  near(ps[0].v, 0.0006); near(ps[0].r, 0.6);
  near(ps[1].v, 0.0006 + 0.5 * 0.0016); near(ps[1].r, 0.6 + 0.5 * 1.8);
  for (const p of ps) assert.ok(p.x >= 0 && p.x < 1 && Number.isInteger(p.lane));
  const laneSeq = [0, 1, 2, 3, 4, 5, 6].flatMap((k) => [0.5, k / LANES + 1e-9, 0.5, 0.5]);  // rand order: x, lane, v, r
  let j = 0;
  const lanes = makeParticles(LANES, () => laneSeq[j++]);
  assert.deepEqual(lanes.map((p) => p.lane), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(lanes.map((p) => p.tint), [1, 0, 0, 1, 0, 0, 1]);
  assert.equal(makeParticles(0).length, 0);
  const random = makeParticles(COUNT_WIDE);
  assert.equal(random.length, 110);
  for (const p of random) assert.ok(p.lane >= 0 && p.lane <= 6 && p.x >= 0 && p.x < 1 && p.tint === (p.lane % 3 === 0 ? 1 : 0));
  assert.equal(makeParticles(1, () => 1)[0].lane, 6, 'lane clamped even if rand returns 1');
});

test('advance: v per 16.7 ms, dt clamped to [0, 50] ms, wraps at exactly 1.05', () => {
  near(advance(0, 0.01, 16.7), 0.01);
  near(advance(0, 0.01, 50), 0.01 * 50 / 16.7);
  near(advance(0, 0.01, 51), 0.01 * 50 / 16.7, 'just over the clamp');
  near(advance(0, 0.01, 60000), 0.01 * 50 / 16.7, 'tab back from a long pause: no jump');
  assert.equal(advance(0.3, 0.01, -100), 0.3, 'negative dt does not move backwards');
  assert.equal(advance(1.05, 0, 0), 0, 'exactly 1.05 wraps');
  assert.equal(advance(1.0499, 0, 0), 1.0499, 'just under 1.05 stays');
  near(advance(1.04, 0.0167, 16.7), 1.04 + 0.0167 - 1.05, 'wrap subtracts 1.05');
});

test('laneY and position', () => {
  assert.equal(laneY(0, 1000), 120);
  near(laneY(6, 1000), 900);
  const p = { x: 0.25, lane: 2, v: 0.001, r: 1, tint: 0 };
  const a = position(p, 1400, 800, 1000);
  assert.deepEqual(position(p, 1400, 800, 1000), a, 'deterministic');
  assert.equal(a.x, 200);
  near(a.y, 1000 * (0.12 + 2 * 0.13) + Math.sin(0.25 * 9 + 1 + 2) * 26);
});

test('readFlow: trims, parses alpha, null when either colour is empty', () => {
  const style = (o) => (n) => o[n];
  assert.deepEqual(readFlow(style({ '--flow-1': ' cyan ', '--flow-2': 'violet', '--flow-alpha': ' .55' })), { a: 'cyan', b: 'violet', alpha: 0.55 });
  assert.deepEqual(readFlow(style({ '--flow-1': 'cyan', '--flow-2': 'violet' })), { a: 'cyan', b: 'violet', alpha: null });
  assert.equal(readFlow(style({ '--flow-1': '', '--flow-2': 'violet' })), null);
  assert.equal(readFlow(style({ '--flow-1': 'cyan', '--flow-2': '  ' })), null);
  assert.equal(readFlow(style({})), null);
});

/** A fake browser: canvas + 2d context that records calls, rAF queue, listeners, matchMedia and computed style. */
const fakeBrowser = ({ width = 1280, height = 800, dpr = 2, reduced = false, matchMedia = true, hidden = false, ctx = true, flow = {} } = {}) => {
  const calls = { raf: 0, cancel: [], clear: 0, arcs: [], fills: [], transform: [] };
  const queue = new Map();
  let id = 0;
  const listeners = { doc: {}, win: {} };
  const on = (bag) => (t, fn) => { (bag[t] ??= []).push(fn); };
  const styles = { '--flow-1': ' a1 ', '--flow-2': 'b1', '--flow-alpha': '.55', ...flow };
  const context = {
    clearRect: () => { calls.clear += 1; },
    setTransform: (...a) => calls.transform.push(a),
    beginPath() {}, arc: (x, y, r) => calls.arcs.push({ x, y, r }),
    fill() { calls.fills.push(this.fillStyle); },
    fillStyle: '',
  };
  const canvas = { width: 0, height: 0, getContext: (k) => (k === '2d' && ctx ? (typeof ctx === 'object' ? ctx : context) : null) };
  const motion = { matches: reduced, listeners: [], addEventListener(t, fn) { if (t === 'change') this.listeners.push(fn); } };
  const doc = {
    hidden, documentElement: {},
    getElementById: (n) => (n === 'coolant' ? canvas : null),
    addEventListener: on(listeners.doc),
  };
  const win = {
    innerWidth: width, innerHeight: height, devicePixelRatio: dpr,
    getComputedStyle: () => ({ getPropertyValue: (n) => styles[n] ?? '' }),
    requestAnimationFrame: (fn) => { calls.raf += 1; queue.set(++id, fn); return id; },
    cancelAnimationFrame: (n) => { calls.cancel.push(n); queue.delete(n); },
    addEventListener: on(listeners.win),
    ...(matchMedia ? { matchMedia: (q) => { assert.equal(q, '(prefers-reduced-motion: reduce)'); return motion; } } : {}),
  };
  const fire = (bag, t) => { for (const fn of listeners[bag][t] ?? []) fn(); };
  /** Run every queued frame once with timestamp t. */
  const frame = (t) => { const due = [...queue]; queue.clear(); for (const [, fn] of due) fn(t); return due.length; };
  return { doc, win, canvas, calls, queue, styles, motion, fire, frame, setMotion(m) { motion.matches = m; for (const fn of motion.listeners) fn(); } };
};

test('startCoolant never throws: bare call in Node, null doc/win -> unsupported', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  assert.equal(startCoolant(), 'unsupported');
  assert.equal(startCoolant({ doc: null }), 'unsupported');
  assert.equal(startCoolant({ doc: fakeBrowser().doc, win: null }), 'unsupported');
});

test('no #coolant canvas, no 2d context, or empty flow tokens -> unsupported, no frame scheduled', () => {
  const noCanvas = fakeBrowser();
  noCanvas.doc.getElementById = () => null;
  assert.equal(startCoolant(noCanvas), 'unsupported');
  const noCtx = fakeBrowser({ ctx: false });
  assert.equal(startCoolant(noCtx), 'unsupported');
  const noTokens = fakeBrowser({ flow: { '--flow-1': '' } });
  assert.equal(startCoolant(noTokens), 'unsupported');
  for (const b of [noCanvas, noCtx, noTokens]) assert.equal(b.calls.raf, 0);
});

test('getContext throwing -> failed, warns, no throw', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const b = fakeBrowser();
  b.canvas.getContext = () => { throw new Error('context lost'); };
  let r;
  assert.doesNotThrow(() => { r = startCoolant(b); });
  assert.equal(r, 'failed');
  assert.equal(warn.mock.callCount(), 1);
});

test('reduced motion -> reduced: canvas cleared, no rAF ever requested', () => {
  const b = fakeBrowser({ reduced: true });
  assert.equal(startCoolant(b), 'reduced');
  assert.equal(b.calls.raf, 0);
  assert.ok(b.calls.clear >= 1, 'canvas cleared');
  b.fire('doc', 'visibilitychange');               // visible again must not start it either
  assert.equal(b.calls.raf, 0);
});

test('normal start: one rAF, canvas sized at DPR cap 1.5, 110 particles per frame in two token colours', () => {
  const b = fakeBrowser({ width: 1280, height: 800, dpr: 3 });
  assert.equal(startCoolant(b), 'started');
  assert.equal(b.calls.raf, 1);
  assert.deepEqual([b.canvas.width, b.canvas.height], [1920, 1200]);
  assert.deepEqual(b.calls.transform.at(-1), [1.5, 0, 0, 1.5, 0, 0]);
  b.frame(1000);
  assert.equal(b.calls.arcs.length, 110);
  assert.equal(b.calls.clear, 1, 'cleared every frame (no trails)');
  assert.deepEqual([...new Set(b.calls.fills)].sort(), ['a1', 'b1'], 'colours from --flow-1 (trimmed) and --flow-2');
  assert.equal(b.calls.raf, 2, 'the frame schedules the next one');
});

test('narrow screen: 50 particles per frame', () => {
  const b = fakeBrowser({ width: 390, height: 844, dpr: 3 });
  startCoolant(b);
  b.frame(1000);
  assert.equal(b.calls.arcs.length, 50);
});

test('no matchMedia -> treated as not reduced, started', () => {
  const b = fakeBrowser({ matchMedia: false });
  assert.equal(startCoolant(b), 'started');
  assert.equal(b.calls.raf, 1);
});

test('starting while the tab is hidden schedules nothing until it becomes visible', () => {
  const b = fakeBrowser({ hidden: true });
  assert.equal(startCoolant(b), 'started');
  assert.equal(b.calls.raf, 0);
  b.doc.hidden = false;
  b.fire('doc', 'visibilitychange');
  assert.equal(b.calls.raf, 1);
});

test('hidden tab cancels the frame and schedules nothing; visible resumes once with no dt jump', () => {
  const b = fakeBrowser();
  startCoolant(b);
  b.frame(1000);
  b.frame(1016);
  const before = b.calls.arcs.slice(-COUNT_WIDE).map((a) => a.x);
  b.doc.hidden = true;
  b.fire('doc', 'visibilitychange');
  assert.equal(b.calls.cancel.length, 1);
  assert.equal(b.queue.size, 0, 'nothing pending while hidden');
  const raf = b.calls.raf;
  b.fire('doc', 'visibilitychange');               // still hidden
  assert.equal(b.calls.raf, raf);
  b.doc.hidden = false;
  b.fire('doc', 'visibilitychange');
  b.fire('doc', 'visibilitychange');               // a duplicate visible event must not start a second loop
  assert.equal(b.calls.raf, raf + 1);
  b.frame(61016);                                   // 60 s later
  assert.deepEqual(b.calls.arcs.slice(-COUNT_WIDE).map((a) => a.x), before, 'first frame after resume moves nothing (dt 0)');
});

test('themechange re-reads --flow-1/--flow-2; empty tokens keep the old colours', () => {
  const b = fakeBrowser();
  startCoolant(b);
  b.styles['--flow-1'] = 'a2'; b.styles['--flow-2'] = 'b2';
  b.fire('doc', 'themechange');
  b.calls.fills.length = 0;
  b.frame(1000);
  assert.deepEqual([...new Set(b.calls.fills)].sort(), ['a2', 'b2']);
  b.styles['--flow-1'] = '';
  b.fire('doc', 'themechange');
  b.calls.fills.length = 0;
  b.frame(1016);
  assert.deepEqual([...new Set(b.calls.fills)].sort(), ['a2', 'b2']);
});

test('reduced-motion setting changing at runtime stops and restarts the loop', () => {
  const b = fakeBrowser();
  startCoolant(b);
  const clears = b.calls.clear;
  b.setMotion(true);
  assert.equal(b.calls.cancel.length, 1);
  assert.equal(b.queue.size, 0);
  assert.ok(b.calls.clear > clears, 'canvas cleared when motion turns off');
  b.setMotion(false);
  assert.equal(b.queue.size, 1, 'restarted without reload');
  const b2 = fakeBrowser({ reduced: true });
  startCoolant(b2);
  b2.setMotion(false);
  assert.equal(b2.calls.raf, 1, 'reduced at load, then turned off: starts');
});

test('resize is coalesced through one rAF and recounts particles on a width-class change', () => {
  const b = fakeBrowser({ width: 1280, dpr: 1 });
  startCoolant(b);
  const raf = b.calls.raf;
  b.win.innerWidth = 500; b.win.innerHeight = 400;
  b.fire('win', 'resize'); b.fire('win', 'resize'); b.fire('win', 'resize');
  assert.equal(b.calls.raf, raf + 1, 'three resizes, one rAF');
  b.frame(1000);                                     // runs the resize and the animation frame
  assert.deepEqual([b.canvas.width, b.canvas.height], [500, 400]);
  b.calls.arcs.length = 0;
  b.frame(1016);
  assert.equal(b.calls.arcs.length, 50);
  b.fire('win', 'resize');
  assert.equal(b.calls.raf, raf + 1 + 2 + 1, 'after the coalesced resize ran, a new resize schedules again (1 resize + 2 ticks + 1 resize)');
});

test('a draw error stops the loop with a warning and never throws', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const b = fakeBrowser();
  startCoolant(b);
  b.canvas.getContext('2d').arc = () => { throw new Error('draw'); };
  assert.doesNotThrow(() => b.frame(1000));
  assert.equal(b.queue.size, 0, 'loop stopped');
  assert.equal(warn.mock.callCount(), 1);
});
