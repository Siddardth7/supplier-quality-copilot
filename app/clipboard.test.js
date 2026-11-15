// Shared clipboard behavior and asynchronous selection boundaries (issue 140).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyWithFallback } from './clipboard.js';

test('issue 140: clipboard success writes exact text once without selection or stale checks', async () => {
  const text = 'First line\n"quoted" & <text>';
  const writes = [];
  const result = await copyWithFallback(text, {
    write: async value => {
      writes.push(value);
    },
    select() {
      assert.fail('successful copy must not select');
    },
    current() {
      assert.fail('success keeps previous stale semantics');
    }
  });
  assert.equal(result, 'copied');
  assert.deepEqual(writes, [text]);
});

test('issue 140: denied, synchronous-throw and missing clipboard use one selection fallback', async () => {
  for (const write of [
    async () => {
      throw Error('denied');
    },
    () => {
      throw Error('missing clipboard');
    },
    undefined
  ]) {
    let selected = 0, current = 0;
    const result = await copyWithFallback('payload', {
      write,
      select() {
        selected++;
      },
      current() {
        current++;
        return true;
      }
    });
    assert.equal(result, 'selected');
    assert.equal(selected, 1);
    assert.equal(current, 1);
  }
});

test('issue 140: pending rejected copy selects the current target at fallback time', async () => {
  let reject;
  const pending = new Promise((_, no) => {
    reject = no;
  });
  const old = { id: 'old' }, fresh = { id: 'fresh' };
  let target = old;
  const selections = [];
  const result = copyWithFallback('payload', {
    write: () => pending,
    select() {
      selections.push(target);
    }
  });
  target = fresh;
  reject(Error('denied'));
  assert.equal(await result, 'selected');
  assert.deepEqual(selections, [fresh]);
});

test('issue 140: disconnected pending copy is stale and never selects', async () => {
  let reject;
  const pending = new Promise((_, no) => {
    reject = no;
  });
  let connected = true, selected = 0;
  const result = copyWithFallback('payload', {
    write: () => pending,
    select() {
      selected++;
    },
    current: () => connected
  });
  connected = false;
  reject(Error('denied'));
  assert.equal(await result, 'stale');
  assert.equal(selected, 0);
});
