import test from 'node:test';
import assert from 'node:assert/strict';
import { subSeed } from './seed.mjs';

test('subSeed matches independent UTF-8 FNV-1a vectors', () => {
  for (const [seed, label, expected] of [
    [101, 'SUP-07', 3789004585],
    [0, 'SUP-01', 2358511055],
    [4294967295, 'ACT-06', 718703349],
    [101, '', 513409807],
    [101, 'Δ', 343320517],
  ]) {
    assert.equal(subSeed(seed, label), expected);
    assert.equal(subSeed(seed, label), subSeed(seed, label));
  }
  assert.notEqual(subSeed(101, 'SUP-01'), subSeed(101, 'SUP-02'));
  assert.notEqual(subSeed(101, 'SUP-01'), subSeed(102, 'SUP-01'));
  assert.notEqual(subSeed(1, '23'), subSeed(12, '3'));
});

test('subSeed rejects invalid seed and label types without coercion', () => {
  for (const seed of [undefined, null, '101', true, 1n, [], {}, -1, 0.5,
    4294967296, NaN, Infinity, -Infinity]) {
    assert.throws(() => subSeed(seed, 'SUP-01'), /Seed/);
  }
  for (const label of [undefined, null, 101, true, 1n, [], {}]) {
    assert.throws(() => subSeed(101, label), /label/);
  }
});
