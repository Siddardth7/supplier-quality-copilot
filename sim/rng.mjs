import { validateSeed } from './seed.mjs';

function finiteNumber(value, name) {
  if (typeof value !== 'number') {
    throw new TypeError(`${name} must be a number`);
  }
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite`);
  }
}

export function makeRng(seed) {
  validateSeed(seed);
  let state = seed;

  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32;
  }

  function uniform(min, max) {
    finiteNumber(min, 'Uniform minimum');
    finiteNumber(max, 'Uniform maximum');
    const width = max - min;
    if (min > max || !Number.isFinite(width)) {
      throw new RangeError('Uniform bounds must be ordered with a finite span');
    }
    return min === max ? min : min + width * next();
  }

  function normal(mean, sd) {
    finiteNumber(mean, 'Normal mean');
    finiteNumber(sd, 'Normal standard deviation');
    if (sd < 0) {
      throw new RangeError('Normal standard deviation must be nonnegative');
    }
    if (sd === 0) return mean;
    const previousState = state;
    const radius = Math.sqrt(-2 * Math.log(1 - next()));
    const angle = 2 * Math.PI * next();
    const value = mean + sd * (radius * Math.cos(angle));
    if (!Number.isFinite(value)) {
      state = previousState;
      throw new RangeError('Normal draw exceeds the finite numeric range');
    }
    return value;
  }

  function int(min, max) {
    finiteNumber(min, 'Integer minimum');
    finiteNumber(max, 'Integer maximum');
    const width = max - min + 1;
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max
        || !Number.isSafeInteger(width) || width > 2 ** 32) {
      throw new RangeError('Integer bounds must be safe, ordered and span at most 4294967296 values');
    }
    return min === max ? min : min + Math.floor(next() * width);
  }

  function pick(values) {
    if (!Array.isArray(values) || values.length === 0) {
      throw new TypeError('Choices must be a nonempty array');
    }
    return values[int(0, values.length - 1)];
  }

  function bernoulli(probability) {
    finiteNumber(probability, 'Bernoulli probability');
    if (probability < 0 || probability > 1) {
      throw new RangeError('Bernoulli probability must be between 0 and 1');
    }
    if (probability === 0) return false;
    if (probability === 1) return true;
    return next() < probability;
  }

  function poisson(lambda) {
    finiteNumber(lambda, 'Poisson mean');
    if (lambda < 0) {
      throw new RangeError('Poisson mean must be nonnegative');
    }
    if (lambda === 0) return 0;
    let count = 0;
    let elapsed = -Math.log(1 - next());
    while (elapsed <= lambda) {
      count += 1;
      elapsed -= Math.log(1 - next());
    }
    return count;
  }

  return { next, uniform, normal, int, pick, bernoulli, poisson };
}
