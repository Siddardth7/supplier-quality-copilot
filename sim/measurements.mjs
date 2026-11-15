// AIAG MSA Fourth Edition, III-B pp.116–120 (Fig.III-B16), p.123.
// Constants estimate one sigma, not a six-sigma study spread. Fixed 10×3×3 design.
export const GRR_METHOD = Object.freeze({
  name: 'AIAG Average & Range', edition: 4, reference: 'III-B pp.116–120, Figure III-B16; p.123',
  parts: 10, appraisers: 3, trials: 3, k1: 0.5908, k2: 0.5231, d4: 2.58,
});
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const range = values => Math.max(...values) - Math.min(...values);
const check = (ok, message) => { if (!ok) throw new TypeError(message); };
function tolerance(lsl, usl) {
  check(Number.isFinite(lsl) && Number.isFinite(usl) && usl > lsl && Number.isFinite(usl - lsl), 'Invalid tolerance bounds');
  return usl - lsl;
}
export function sampleStatistics(observations) {
  check(Array.isArray(observations) && observations.length >= 2 && observations.every(Number.isFinite), 'At least two finite observations required');
  const average = mean(observations);
  const s = Math.sqrt(observations.reduce((sum, x) => sum + (x - average) ** 2, 0) / (observations.length - 1));
  check(Number.isFinite(average) && Number.isFinite(s), 'Nonfinite sample statistics');
  return { n: observations.length, mean: average, s };
}
export function computeCpk(observations, lsl, usl) {
  tolerance(lsl, usl);
  const statistics = sampleStatistics(observations);
  check(statistics.s > 0, 'Cpk requires nonzero sample variation');
  const cpk = Math.min(usl - statistics.mean, statistics.mean - lsl) / (3 * statistics.s);
  check(Number.isFinite(cpk), 'Nonfinite Cpk');
  return { ...statistics, cpk };
}
export function computeAverageRangeGrr(study, lsl, usl) {
  const span = tolerance(lsl, usl);
  check(Array.isArray(study) && study.length === 10 && study.every(part => Array.isArray(part)
    && part.length === 3 && part.every(readings => Array.isArray(readings) && readings.length === 3
      && readings.every(Number.isFinite))), 'GRR study must be finite [10 parts][3 appraisers][3 trials]');
  const ranges = study.map(part => part.map(range));
  const average_range = mean(ranges.flat());
  const appraiser_means = [0, 1, 2].map(a => mean(study.flatMap(part => part[a])));
  const appraiser_mean_range = range(appraiser_means);
  const ev = average_range * GRR_METHOD.k1;
  const av_variance = (appraiser_mean_range * GRR_METHOD.k2) ** 2 - ev ** 2 / (10 * 3);
  const av = Math.sqrt(Math.max(0, av_variance));
  const sigma_grr = Math.hypot(ev, av);
  const percent_tolerance = 600 * sigma_grr / span;
  check([average_range, appraiser_mean_range, ev, av_variance, av, sigma_grr, percent_tolerance].every(Number.isFinite), 'Nonfinite GRR statistics');
  const range_ucl = GRR_METHOD.d4 * average_range;
  const out_of_control = ranges.flatMap((part, p) => part.flatMap((r, a) => r > range_ucl ? [{ part: p + 1, appraiser: a + 1 }] : []));
  return { method: { ...GRR_METHOD }, tolerance: span, ranges, average_range, appraiser_means,
    appraiser_mean_range, ev, av_variance, av, sigma_grr, percent_tolerance,
    range_ucl, out_of_control };
}
