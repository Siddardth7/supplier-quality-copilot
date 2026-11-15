import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCpk, sampleStatistics, computeAverageRangeGrr, GRR_METHOD } from './measurements.mjs';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
const study = (offsets, noise) => Array.from({ length: 10 }, (_, p) => offsets.map(a => noise.map(t => p + a + t)));

test('Cpk uses sample n minus one, limiting side and retains negative values', () => {
  assert.deepEqual(sampleStatistics([1, 2, 3]), { n: 3, mean: 2, s: 1 });
  near(computeCpk([1, 2, 3], 0, 5).cpk, 2 / 3);
  near(computeCpk([6, 7, 8], 0, 5).cpk, -2 / 3);
  near(computeCpk([1, 2, 3], 0, 3).cpk, 1 / 3);
});
test('Average Range uses verified sigma constants, correction and tolerance denominator', () => {
  const readings = study([-1, 0, 1], [-0.1, 0, 0.1]);
  const result = computeAverageRangeGrr(readings, 0, 10);
  const ev = 0.2 * 0.5908, avVariance = (2 * 0.5231) ** 2 - ev ** 2 / 30;
  assert.equal(GRR_METHOD.k1, 0.5908); assert.equal(GRR_METHOD.k2, 0.5231);
  near(result.average_range, 0.2); near(result.appraiser_mean_range, 2);
  near(result.ev, ev); near(result.av_variance, avVariance); near(result.av, Math.sqrt(avVariance));
  near(result.sigma_grr, Math.sqrt(ev ** 2 + avVariance));
  near(result.percent_tolerance, 60 * Math.sqrt(ev ** 2 + avVariance));
  assert.equal(result.method.reference, 'III-B pp.116–120, Figure III-B16; p.123');
});
test('Average Range clamps negative reproducibility and flags ranges without changing readings', () => {
  const repeatOnly = computeAverageRangeGrr(study([0, 0, 0], [-1, 0, 1]), 0, 10);
  assert.ok(repeatOnly.av_variance < 0); assert.equal(repeatOnly.av, 0);
  near(repeatOnly.percent_tolerance, 60 * 2 * 0.5908);
  assert.equal(computeAverageRangeGrr(study([0, 0, 0], [0, 0, 0]), 0, 10).percent_tolerance, 0);
  const readings = study([0, 0, 0], [0, 0, 0]); readings[0][0][2] = 10;
  const before = structuredClone(readings), result = computeAverageRangeGrr(readings, 0, 10);
  assert.deepEqual(readings, before);
  near(result.range_ucl, 2.58 / 3);
  assert.deepEqual(result.out_of_control, [{ part: 1, appraiser: 1 }]);
});
test('measurement inputs reject malformed studies nonfinite values and undefined Cpk', () => {
  for (const xs of [[], [1], [1, NaN], [1, Infinity]]) assert.throws(() => sampleStatistics(xs), /finite observations/);
  assert.throws(() => computeCpk([1, 1], 0, 2), /nonzero/);
  for (const bounds of [[2, 2], [2, 1], [0, Infinity]]) assert.throws(() => computeCpk([1, 2], ...bounds), /tolerance/);
  for (const bad of [[], study([0, 0], [0, 0, 0]), study([0, 0, 0], [0, 0]), study([0, 0, 0], [0, NaN, 0])]) assert.throws(() => computeAverageRangeGrr(bad, 0, 10), /10 parts/);
});
