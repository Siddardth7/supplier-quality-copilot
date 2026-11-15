import { Buffer } from 'node:buffer';

export function validateSeed(seed) {
  if (typeof seed !== 'number') {
    throw new TypeError('Seed must be a number');
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('Seed must be an unsigned 32-bit integer');
  }
}

export function subSeed(worldSeed, label) {
  validateSeed(worldSeed);
  if (typeof label !== 'string') {
    throw new TypeError('Seed label must be a string');
  }
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(`${worldSeed}:${label}`, 'utf8')) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }
  return hash;
}
