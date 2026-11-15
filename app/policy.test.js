// Active policy and the header chip (#37; DESIGN-SPEC 4.1 DS-FR-06, spec D4, SME decision 2: no caret).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePolicy, chipView, policyLabel } from './policy.js';
import { chip } from './shell.js';
import { STARK_REFERENCE } from './engine.js';

const custom = (name, version) => ({ ...STARK_REFERENCE, id: 'custom', name, version });

test('D4: no saved or shared policy resolves to the Stark reference', () => {
  assert.deepEqual(resolvePolicy(), { policy: STARK_REFERENCE, kind: 'reference' });
  assert.deepEqual(resolvePolicy({}), { policy: STARK_REFERENCE, kind: 'reference' });
});

test('D4: shared beats saved beats reference', () => {
  const saved = custom('Saved', 2), shared = custom('Shared', 3);
  assert.deepEqual(resolvePolicy({ saved }), { policy: saved, kind: 'saved' });
  assert.deepEqual(resolvePolicy({ shared }), { policy: shared, kind: 'shared' });
  assert.deepEqual(resolvePolicy({ saved, shared }), { policy: shared, kind: 'shared' });
});

test('DS-FR-06: the reference chip reads "Policy: Stark Reference v1" in cyan, version not doubled', () => {
  const v = chipView(resolvePolicy());
  assert.equal(v.label, `Policy: ${STARK_REFERENCE.name}`);
  assert.equal(v.label, 'Policy: Stark Reference v1');
  assert.doesNotMatch(v.label, /v1 v1/);
  assert.equal(v.tone, 'cyan');
  assert.equal(v.note, null);
});

test('DS-FR-06: a custom policy gets " v<version>" appended and an amber tone', () => {
  assert.deepEqual(chipView({ policy: custom('Team Strict', 3), kind: 'saved' }), { label: 'Policy: Team Strict v3', tone: 'amber', note: null });
  assert.deepEqual(chipView({ policy: custom('Team Strict', 3), kind: 'shared' }), { label: 'Policy: Team Strict v3', tone: 'amber', note: 'Shared, not saved' });
  // The de-duplication only fires on the matching version.
  assert.equal(chipView({ policy: custom('Strict v2', 3), kind: 'saved' }).label, 'Policy: Strict v2 v3');
  assert.equal(chipView({ policy: custom('Strict v3', 3), kind: 'saved' }).label, 'Policy: Strict v3');
  assert.equal(chipView({ policy: custom('Strict v13', 3), kind: 'saved' }).label, 'Policy: Strict v13 v3');
});

test('SME decision 2: chip markup has no caret and escapes the policy name', () => {
  const html = chip(resolvePolicy());
  assert.equal(html, 'Policy: Stark Reference v1');
  assert.doesNotMatch(html, /▾/);
  const shared = chip({ policy: custom('<img src=x onerror=alert(1)>', 1), kind: 'shared' });
  assert.doesNotMatch(shared, /<img/);
  assert.match(shared, /&lt;img src=x onerror=alert\(1\)&gt; v1/);
  assert.match(shared, /<span class="chip-note">Shared, not saved<\/span>/);
});

test('#40 policyLabel: the shared " v<version>" dedupe that chipView prints after "Policy: "', () => {
  assert.equal(policyLabel(STARK_REFERENCE), 'Stark Reference v1');
  assert.equal(policyLabel(custom('Team Strict', 3)), 'Team Strict v3');
  assert.equal(policyLabel(custom('Strict v3', 3)), 'Strict v3');
  assert.equal(policyLabel(custom('Strict v13', 3)), 'Strict v13 v3');
  for (const p of [STARK_REFERENCE, custom('Team Strict', 3), custom('Strict v3', 3)]) {
    assert.equal(chipView({ policy: p, kind: 'saved' }).label, `Policy: ${policyLabel(p)}`);
  }
});

// Tester addition (#40 QA): the dedupe needs the space; a name that merely ends in "v3" still gets " v3".
test('QA #40 policyLabel: "Teamv3" at version 3 is not treated as already versioned', () => {
  assert.equal(policyLabel({ name: 'Teamv3', version: 3 }), 'Teamv3 v3');
});
