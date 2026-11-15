import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from './rng.mjs';

test('next matches independent mulberry32 vectors and bounds', () => {
  for (const [seed, expected] of [
    [0, [1144304738, 1416247, 958946056, 627933444, 2007157716]],
    [101, [582603121, 3284799363, 2321895009, 2761734473, 1649615189]],
    [4294967295, [3850105811, 813802916, 3073704848, 4054706436, 3630262831]],
  ]) {
    const rng = makeRng(seed);
    assert.deepEqual(expected.map(() => rng.next() * 2 ** 32), expected);
    for (let index = 0; index < 1000; index += 1) {
      const value = rng.next();
      assert.ok(value >= 0 && value < 1);
    }
  }
});

test('RNG instances and destructured mixed-method streams are independent', () => {
  function sequence(rng) {
    const { next, uniform, normal, int, pick, bernoulli, poisson } = rng;
    return [next(), uniform(-3, 7), normal(10, 2), int(-5, 5),
      pick(['a', 'b', 'c']), bernoulli(0.4), poisson(8), next()];
  }
  const first = makeRng(101);
  const second = makeRng(101);
  assert.deepEqual(sequence(first), sequence(second));
  sequence(makeRng(999));
  assert.deepEqual(sequence(first), sequence(second));
  assert.notDeepEqual(sequence(makeRng(101)), sequence(makeRng(102)));
});

test('uniform integer and pick draws honor endpoints and preserve choices', () => {
  assert.equal(makeRng(0).uniform(-10, -2), -10 + 8 * (1144304738 / 2 ** 32));
  assert.equal(makeRng(0).int(0, 4294967295), 1144304738);
  const rng = makeRng(101);
  const integers = new Set();
  const choices = Object.freeze(['low', 'medium', 'high']);
  const selected = new Set();
  for (let index = 0; index < 1000; index += 1) {
    const value = rng.uniform(-3, 7);
    assert.ok(value >= -3 && value < 7);
    integers.add(rng.int(-1, 1));
    selected.add(rng.pick(choices));
  }
  assert.deepEqual([...integers].sort(), [-1, 0, 1]);
  assert.deepEqual([...selected].sort(), ['high', 'low', 'medium']);
  assert.deepEqual(choices, ['low', 'medium', 'high']);
});

test('normal uses Box-Muller and produces varying finite normal draws', () => {
  const expected = 10 + 2 * Math.sqrt(-2 * Math.log(1 - 1144304738 / 2 ** 32))
    * Math.cos(2 * Math.PI * (1416247 / 2 ** 32));
  assert.equal(makeRng(0).normal(10, 2), expected);
  const rng = makeRng(101);
  const draws = Array.from({ length: 10000 }, () => rng.normal(0, 1));
  assert.ok(draws.every(Number.isFinite));
  const mean = draws.reduce((sum, value) => sum + value, 0) / draws.length;
  const variance = draws.reduce((sum, value) => sum + (value - mean) ** 2, 0) / draws.length;
  assert.ok(Math.abs(mean) < 0.08, 'heuristic mean tolerance 0.08');
  assert.ok(Math.abs(variance - 1) < 0.1, 'heuristic variance tolerance 0.1');
});

test('bernoulli uses strict probability threshold and boolean outputs', () => {
  const firstDraw = 1144304738 / 2 ** 32;
  assert.equal(makeRng(0).bernoulli(firstDraw), false);
  assert.equal(makeRng(0).bernoulli(firstDraw + Number.EPSILON), true);
  const rng = makeRng(101);
  assert.deepEqual(new Set(Array.from({ length: 100 }, () => rng.bernoulli(0.5))),
    new Set([true, false]));
});

test('poisson follows exponential arrivals at small and moderate means', () => {
  assert.equal(makeRng(0).poisson(0.5), 2);
  const rng = makeRng(101);
  const draws = Array.from({ length: 2000 }, () => rng.poisson(8));
  assert.ok(draws.every(value => Number.isInteger(value) && value >= 0));
  const mean = draws.reduce((sum, value) => sum + value, 0) / draws.length;
  assert.ok(Math.abs(mean - 8) < 0.5, 'heuristic mean tolerance 0.5');
  assert.ok(new Set(draws).size > 1);
  for (const seed of [0, 101, 4294967295]) {
    const count = makeRng(seed).poisson(1000);
    assert.ok(Number.isInteger(count) && count > 800 && count < 1200,
      'heuristic moderate-mean interval 800..1200');
  }
});

test('degenerate RNG draws pin values without consuming the stream', () => {
  const rng = makeRng(101);
  const item = { name: 'pinned' };
  assert.equal(rng.uniform(-2, -2), -2);
  assert.equal(rng.int(-2, -2), -2);
  assert.equal(rng.normal(-2, 0), -2);
  assert.equal(rng.pick([item]), item);
  assert.equal(rng.bernoulli(0), false);
  assert.equal(rng.bernoulli(1), true);
  assert.equal(rng.poisson(0), 0);
  assert.equal(rng.next(), makeRng(101).next());
});

test('invalid RNG arguments and overflow reject without advancing state', () => {
  const calls = [
    ['uniform', [2, 1]], ['uniform', [-Number.MAX_VALUE, Number.MAX_VALUE]],
    ['normal', [0, -1]], ['normal', [Number.MAX_VALUE, Number.MAX_VALUE]],
    ['int', [0.5, 2]], ['int', [0, 2.5]], ['int', [2, 1]],
    ['int', [0, 4294967296]], ['int', [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]],
    ['int', [0, Number.MAX_SAFE_INTEGER + 1]],
    ['pick', [[]]], ['pick', ['abc']], ['pick', [null]],
    ['bernoulli', [-Number.EPSILON]], ['bernoulli', [1 + Number.EPSILON]],
    ['poisson', [-Number.EPSILON]],
  ];
  for (const value of [undefined, null, '1', true, 1n, [], {}, NaN, Infinity, -Infinity]) {
    for (const method of ['uniform', 'normal', 'int']) {
      calls.push([method, [value, 1]], [method, [0, value]]);
    }
    calls.push(['bernoulli', [value]], ['poisson', [value]]);
  }
  for (const [method, args] of calls) {
    const rng = makeRng(0);
    assert.throws(() => rng[method](...args), { name: /^(Type|Range)Error$/ }, method);
    assert.equal(rng.next(), makeRng(0).next(), `${method} preserves state`);
  }
});

test('makeRng rejects seeds outside the unsigned 32-bit contract', () => {
  for (const seed of [undefined, null, '101', true, 1n, [], {}, -1, 0.5,
    4294967296, NaN, Infinity, -Infinity]) {
    assert.throws(() => makeRng(seed), /Seed/);
  }
});
