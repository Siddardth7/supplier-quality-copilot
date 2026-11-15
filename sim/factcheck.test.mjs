import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, cp, symlink, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { containsText, parseSections, validateKeywords, DEFAULT_KEYWORDS, checkPacket, checkWorld, rewriteWorld, sanitizeFailures, requiredSupplierText } from './factcheck.mjs';
import { BANNER, appendRetryFeedback, compileBrief, writeBrief, ensureRetainedDirectory } from './brief.mjs';
import { writeCandidateFacts } from './candidate.mjs';
import { sampleWorld } from './world.mjs';
const hash = text => createHash('sha256').update(text).digest('hex');
function tiny(row = {}) {
  const fact = { criteria: { topic: { disclosure: 'verified', true_value: 1.12, file: 'quality_manual.md', section: '1.1', ...row } } };
  const rfq = `${BANNER}\n# 1 Buyer context\nprivate hidden 9.87 omitted widget`;
  const compiled = { files: ['quality_manual.md', 'rfq.md'], brief: `File quality_manual.md, section 1.1: Public topic\n--- BEGIN RFQ ---\n${rfq}\n--- END RFQ ---` };
  const texts = { 'quality_manual.md': `${BANNER}\n## 1.1 Public topic\nRecorded result: 1.12.\n`, 'rfq.md': rfq };
  return { fact, compiled, texts, options: { keywords: { topic: ['omitted widget'] } } };
}
const rules = result => result.failures.map(row => row.rule);
test('literal matching and heading extents pin numeric and hierarchical boundaries', () => {
  for (const text of ['11', '1.1', '-1', '1e2', 'x1', '1x']) assert.equal(containsText(text, 1), false, text);
  assert.equal(containsText('value: 1.', 1), true);
  assert.equal(containsText('Quality\n SYSTEM', 'quality system'), true);
  assert.equal(containsText('a+b', 'a+b'), true);
  assert.equal(containsText('axb', 'a+b'), false);
  const sections = parseSections('# 1 Parent\nparent\n## 1.1 Child\nchild\n## 1.10 Peer\npeer\n# Other\nend');
  assert.deepEqual(sections.map(row => row.number), ['1', '1.1', '1.10']);
  assert.ok(sections[0].text.includes('child'));
  assert.equal(sections[1].text.trim(), 'child');
  assert.equal(sections[2].text.trim(), 'peer');
});
test('keyword catalog covers all commodity profiles and rejects ambiguous phrases', () => {
  assert.equal(validateKeywords(DEFAULT_KEYWORDS), true);
  assert.throws(() => validateKeywords({ a: [] }, [{ ids: ['a'] }]), /keywords/);
  assert.throws(() => validateKeywords({ a: ['Thing', 'thing'] }, [{ ids: ['a'] }]), /Duplicate/);
  assert.throws(() => validateKeywords({ a: ['leak test'], b: ['pressure leak test'] }, [{ ids: ['a', 'b'] }]), /overlap/);
  assert.equal(validateKeywords({ a: ['same'], b: ['same'] }, [{ ids: ['a'] }, { ids: ['b'] }]), true);
});
test('verified evidence must have exact public value in exact file and section', () => {
  for (const value of [false, 0, '2027-01-01', 'Low', 1.123456789]) {
    const f = tiny({ true_value: value });
    f.texts['quality_manual.md'] = `${BANNER}\n## 1.1 Topic\nRecorded result: ${value}.`;
    assert.equal(checkPacket(f.fact, f.compiled, f.texts, f.options).passed, true);
    f.texts['quality_manual.md'] = `${BANNER}\n## 1.10 Other\nRecorded result: ${value}.`;
    assert.ok(rules(checkPacket(f.fact, f.compiled, f.texts, f.options)).includes('verified_value'));
  }
  const f = tiny();
  f.texts['quality_manual.md'] = `${BANNER}\n## 1.1 Topic\n1.13`;
  assert.ok(rules(checkPacket(f.fact, f.compiled, f.texts, f.options)).includes('verified_value'));
});
test('assumed statements enforce exact claim public values and conservative hidden truth', () => {
  for (const claimed_value of [false, 0, null]) {
    const f = tiny({ disclosure: 'assumed', claim: 'Monitoring is used.', claimed_value, true_value: 9.87 });
    f.texts['quality_manual.md'] = `${BANNER}\n## 1.1 Topic\nMonitoring is used. ${claimed_value ?? ''}`;
    assert.equal(checkPacket(f.fact, f.compiled, f.texts, f.options).passed, true);
    f.texts['quality_manual.md'] += '\n9.87';
    assert.ok(rules(checkPacket(f.fact, f.compiled, f.texts, f.options)).includes('assumed_hidden_value'));
  }
  const f = tiny({ disclosure: 'assumed', claim: 'Monitoring is used.', claimed_value: false, true_value: false });
  f.texts['quality_manual.md'] = `${BANNER}\n## 1.1 Topic\nMonitoring is used. false`;
  assert.equal(checkPacket(f.fact, f.compiled, f.texts, f.options).passed, true);
  f.texts['quality_manual.md'] = `${BANNER}\n## 1.1 Topic\nOther wording.`;
  assert.deepEqual(rules(checkPacket(f.fact, f.compiled, f.texts, f.options)), ['assumed_claim', 'assumed_value']);
});
test('missing topics scan every supplier file but RFQ is context and scrub remains literal', () => {
  const f = tiny({ disclosure: 'missing', true_value: 'SECRET', file: null, section: null });
  assert.equal(checkPacket(f.fact, f.compiled, f.texts, f.options).passed, true);
  f.texts['quality_manual.md'] += '\nOMITTED WIDGET';
  assert.ok(rules(checkPacket(f.fact, f.compiled, f.texts, f.options)).includes('missing_mentioned'));
  f.texts['quality_manual.md'] = `${BANNER}\n## 1.1 Topic\nNo details.`;
  f.options.scrubTerms = ['a+b', ''];
  f.texts['rfq.md'] += '\na+b';
  const result = checkPacket(f.fact, f.compiled, f.texts, f.options);
  assert.ok(rules(result).includes('scrub'));
  assert.equal(JSON.stringify(result).includes('a+b'), false);
});
test('packet structure rejects extra missing files banners duplicate headings RFQ edits and private text', () => {
  for (const [expected, alter] of [
    ['extra_file', f => { f.texts['extra.md'] = BANNER; }],
    ['missing_file', f => { delete f.texts['quality_manual.md']; }],
    ['banner', f => { f.texts['quality_manual.md'] = f.texts['quality_manual.md'].replace(BANNER, 'bad'); }],
    ['headings', f => { f.texts['quality_manual.md'] += '\n## 1.1 Duplicate\n'; }],
    ['rfq', f => { f.texts['rfq.md'] += 'edited'; }],
    ['private_vocabulary', f => { f.texts['quality_manual.md'] += '\nrubric'; }],
  ]) { const f = tiny(); alter(f); assert.ok(rules(checkPacket(f.fact, f.compiled, f.texts, f.options)).includes(expected), expected); }
  assert.throws(() => checkPacket(tiny().fact, { files: ['../bad.md'], brief: '' }, {}, tiny().options));
});
test('retry feedback is allowlisted public actions only and exact attempt briefs never overwritten', async () => {
  const f = tiny();
  const feedback = sanitizeFailures([{ rule: 'verified_value', criterion: '2.ctq_cpk', file: 'quality_manual.md', section: '1.1', detail: 'PRIVATE_SECRET 9.87' }, { rule: 'scrub', file: '../private', detail: 'SECRET' }], f.compiled);
  const corrected = appendRetryFeedback(f.compiled, feedback);
  assert.doesNotMatch(corrected.brief.slice(f.compiled.brief.length), /PRIVATE_SECRET|9.87|2\.ctq_cpk|SECRET/);
  assert.throws(() => appendRetryFeedback(f.compiled, [{ action: 'restore_value', file: '../bad', section: null }]));
  assert.throws(() => appendRetryFeedback(f.compiled, [{ action: 'restore_value', detail: 'PRIVATE_SECRET' }]));
  assert.throws(() => appendRetryFeedback(f.compiled, [{ action: 'arbitrary text', file: null, section: null }]));
});
async function worldFixture() {
  const root = await mkdtemp(join(tmpdir(), 'sqc-factcheck-'));
  const facts = await writeCandidateFacts(101, join(root, 'facts'));
  for (const fact of facts) {
    for (const row of Object.values(fact.criteria)) Object.assign(row, { disclosure: 'missing', file: null, section: null });
    await writeFile(join(root, 'facts', `${fact.supplier_id}.json`), JSON.stringify(fact));
  }
  return { root, facts };
}
async function publishClean(world, id) {
  const compiled = await writeBrief(world, id);
  const directory = join(world, 'packets', id);
  await mkdir(directory, { recursive: true });
  for (const file of compiled.files) await writeFile(join(directory, file), file === 'rfq.md' ? compiled.brief.split('--- BEGIN RFQ ---\n')[1].split('\n--- END RFQ ---')[0] : `${BANNER}\nSupplier introduction.\n`);
}
test('world reports missing packets deterministically and rejects linked packet files', async () => {
  const { root } = await worldFixture();
  try {
    const first = await checkWorld(root);
    assert.equal(first.status, 'failed');
    assert.equal(first.suppliers.length, 9);
    assert.ok(first.suppliers.every(row => row.attempts[0].failures[0].rule === 'packet_missing'));
    const bytes = await readFile(join(root, 'factcheck.json'), 'utf8');
    assert.deepEqual(await checkWorld(root), first);
    assert.equal(await readFile(join(root, 'factcheck.json'), 'utf8'), bytes);
    await publishClean(root, 'SUP-01');
    assert.equal((await checkWorld(root)).suppliers[0].status, 'passed');
    await rm(join(root, 'packets', 'SUP-01', 'cover_letter.md'));
    await symlink(join(root, 'packets', 'SUP-01', 'rfq.md'), join(root, 'packets', 'SUP-01', 'cover_letter.md'));
    assert.ok((await checkWorld(root)).suppliers[0].attempts[0].failures.some(row => row.rule === 'unsafe_file'));
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('clean existing world invokes no writer and retry succeeds preserving prompts hashes and facts', async () => {
  const { root, facts } = await worldFixture();
  try {
    for (const fact of facts) await publishClean(root, fact.supplier_id);
    let calls = 0;
    const writer = async () => { calls++; throw new Error('must not call'); };
    assert.equal((await rewriteWorld(root, { model: 'fake-model', writer })).status, 'passed');
    assert.equal(calls, 0);
    await rm(join(root, 'packets', 'SUP-01'), { recursive: true });
    const original = await readFile(join(root, 'facts', 'SUP-01.json'), 'utf8');
    const result = await rewriteWorld(root, { model: 'fake-model', writer: async (world, id, options) => {
      calls++;
      assert.equal(options.model, 'fake-model');
      assert.ok(Array.isArray(options.feedback));
      await publishClean(world, id);
      return { provenance: { suppliers: { [id]: [{ version: 'fake-version' }] } } };
    } });
    assert.equal(result.status, 'passed');
    assert.equal(calls, 1);
    const attempt = result.suppliers[0].attempts[1];
    assert.equal(attempt.writer_version, 'fake-version');
    assert.equal(hash(await readFile(join(root, attempt.brief_path))), attempt.brief_sha256);
    assert.equal(await readFile(join(root, 'facts', 'SUP-01.json'), 'utf8'), original);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('writer exceptions exhaust exactly four calls retain sanitized evidence and stop later suppliers', async () => {
  const { root } = await worldFixture();
  try {
    let calls = 0;
    const report = await rewriteWorld(root, { model: 'fake-model', writer: async () => { calls++; throw new Error('PRIVATE_FAILURE 9.87 rubric'); } });
    assert.equal(calls, 4);
    assert.equal(report.status, 'failed');
    assert.equal(report.suppliers[0].attempts.length, 5);
    assert.ok(report.suppliers.slice(1).every(row => row.status === 'not_checked'));
    assert.doesNotMatch(JSON.stringify(report.suppliers.flatMap(row => row.attempts.flatMap(attempt => attempt.failures))), /PRIVATE_FAILURE|9\.87|rubric/);
    for (const record of report.suppliers[0].attempts.slice(1)) {
      const brief = await readFile(join(root, record.brief_path), 'utf8');
      assert.equal(hash(brief), record.brief_sha256);
      assert.doesNotMatch(brief, /PRIVATE_FAILURE|rubric|\b[1-9]\.[a-z][a-z0-9_]*\b/);
      assert.equal(record.error, 'PRIVATE_FAILURE 9.87 rubric');
      assert.equal(record.failures[0].rule, 'writer_failure');
      assert.equal(record.failures[0].detail, 'Writer invocation or output validation failed.');
    }
    assert.deepEqual(JSON.parse(await readFile(join(root, 'factcheck.json'))), report);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('attempt-specific briefs are exclusive and preserve base brief and feedback boundary', async () => {
  const { root } = await worldFixture();
  try {
    const original = await writeBrief(root, 'SUP-01');
    const feedback = [{ action: 'repair_structure', file: 'cover_letter.md', section: null }];
    const retry = await writeBrief(root, 'SUP-01', { feedback, attempt: 1 });
    assert.equal(retry.briefPath, 'briefs/SUP-01.attempt-1.md');
    assert.ok(retry.brief.includes('Document corrections'));
    assert.equal(await readFile(join(root, original.briefPath), 'utf8'), original.brief);
    await assert.rejects(writeBrief(root, 'SUP-01', { feedback, attempt: 1 }), { code: 'EEXIST' });
    await assert.rejects(writeBrief(root, 'SUP-01', { feedback }));
    await assert.rejects(writeBrief(root, 'SUP-01', { attempt: 5 }));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('failed writer output is archived before next retry succeeds with sanitized feedback', async () => {
  const { root, facts } = await worldFixture();
  try {
    for (const fact of facts.slice(1)) await publishClean(root, fact.supplier_id);
    let calls = 0;
    const report = await rewriteWorld(root, { model: 'fake-model', writer: async (world, id, options) => {
      calls++;
      await publishClean(world, id);
      if (calls === 1) await writeFile(join(world, 'packets', id, 'cover_letter.md'), `${BANNER}\nregistration expiry`);
      else assert.ok(options.feedback.some(row => row.action === 'remove_unlisted'));
      return {};
    } });
    assert.equal(calls, 2);
    assert.equal(report.status, 'passed');
    assert.ok(report.suppliers[0].attempts[1].failures.some(row => row.rule === 'missing_mentioned'));
    assert.ok((await readFile(join(root, 'factcheck-attempts', 'SUP-01', 'attempt-1', 'packet', 'cover_letter.md'), 'utf8')).includes('registration expiry'));
    assert.deepEqual(report.suppliers[0].attempts[2].failures, []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('retained directory helper rejects traversal nondirectories and linked ancestors but accepts canonical world aliases', async () => {
  const { root } = await worldFixture();
  const outside = await mkdtemp(join(tmpdir(), 'sqc-retained-outside-'));
  try {
    const alias = join(outside, 'world-alias');
    await symlink(root, alias);
    const created = await ensureRetainedDirectory(alias, ['safe', 'nested']);
    assert.ok(created.endsWith('/safe/nested'));
    await writeFile(join(root, 'not-directory'), 'untouched');
    await assert.rejects(ensureRetainedDirectory(root, ['not-directory']), /Unsafe retained directory/);
    for (const segments of [['..'], ['../escape'], ['/absolute'], ['a/b'], ['.'], [null]]) await assert.rejects(ensureRetainedDirectory(root, segments), /Invalid retained/);
    await symlink(outside, join(root, 'linked'));
    await assert.rejects(ensureRetainedDirectory(root, ['linked', 'created']), /Unsafe retained directory/);
    assert.deepEqual((await readdir(outside)).sort(), ['world-alias']);
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});
test('linked archive or briefs ancestor rejects before writer calls moves or external writes', async () => {
  for (const segments of [['briefs'], ['factcheck-attempts'], ['factcheck-attempts', 'SUP-01'], ['factcheck-attempts', 'SUP-01', 'attempt-1']]) {
    const { root } = await worldFixture();
    const outside = await mkdtemp(join(tmpdir(), 'sqc-retained-outside-'));
    try {
      await writeFile(join(outside, 'sentinel'), 'external-original');
      await publishClean(root, 'SUP-01');
      await writeFile(join(root, 'packets', 'SUP-01', 'cover_letter.md'), `${BANNER}\nregistration expiry`);
      const original = await readFile(join(root, 'packets', 'SUP-01', 'cover_letter.md'), 'utf8');
      if (segments[0] === 'briefs') await rm(join(root, 'briefs'), { recursive: true });
      if (segments.length > 1) await mkdir(join(root, ...segments.slice(0, -1)), { recursive: true });
      await symlink(outside, join(root, ...segments));
      let calls = 0;
      await assert.rejects(rewriteWorld(root, { model: 'fake', writer: async () => { calls++; } }));
      assert.equal(calls, 0);
      assert.equal(await readFile(join(root, 'packets', 'SUP-01', 'cover_letter.md'), 'utf8'), original);
      assert.deepEqual(await readdir(outside), ['sentinel']);
      assert.equal(await readFile(join(outside, 'sentinel'), 'utf8'), 'external-original');
    } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
  }
});
test('final default brief symlink cannot truncate its target and attempt parent links are refused', async () => {
  const { root } = await worldFixture();
  const outside = await mkdtemp(join(tmpdir(), 'sqc-brief-outside-'));
  try {
    const target = join(outside, 'original.md');
    await writeFile(target, 'external-original');
    await mkdir(join(root, 'briefs'));
    await symlink(target, join(root, 'briefs', 'SUP-01.md'));
    await assert.rejects(writeBrief(root, 'SUP-01'), { code: 'ELOOP' });
    assert.equal(await readFile(target, 'utf8'), 'external-original');
    await rm(join(root, 'briefs'), { recursive: true });
    await symlink(outside, join(root, 'briefs'));
    await assert.rejects(writeBrief(root, 'SUP-01', { attempt: 1 }), /Unsafe retained directory/);
    assert.deepEqual(await readdir(outside), ['original.md']);
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test('retry attempt link introduced after first writer call is refused before another call or external write', async () => {
  const { root } = await worldFixture();
  const outside = await mkdtemp(join(tmpdir(), 'sqc-attempt-outside-'));
  try {
    await writeFile(join(outside, 'sentinel'), 'untouched');
    let calls = 0;
    await assert.rejects(rewriteWorld(root, { model: 'fake', writer: async () => {
      calls++;
      await symlink(outside, join(root, 'factcheck-attempts', 'SUP-01', 'attempt-2'));
      throw new Error('first failure');
    } }), /Prior retained attempt evidence exists/);
    assert.equal(calls, 1);
    assert.deepEqual(await readdir(outside), ['sentinel']);
    assert.equal(await readFile(join(outside, 'sentinel'), 'utf8'), 'untouched');
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

function collisionFixture(value) {
  const f = tiny({ disclosure: 'assumed', true_value: value, claimed_value: null, claim: 'Monitoring is used.' });
  f.fact.criteria.other = { disclosure: 'verified', true_value: value, file: 'quality_manual.md', section: '1.2' };
  f.options.keywords.other = ['Other public topic'];
  f.compiled.brief = f.compiled.brief.replace('--- BEGIN RFQ ---', `File quality_manual.md, section 1.2: Other public topic\nRecorded result: ${value}.\n--- BEGIN RFQ ---`);
  f.texts['quality_manual.md'] = `${BANNER}\n## 1.1 Public topic\nMonitoring is used.\n## 1.2 Other public topic\nRecorded result: ${value}.\n`;
  return f;
}
test('hidden booleans and enums are unscannable alongside required verified values', () => {
  for (const value of [true, false, 'healthy']) {
    const f = collisionFixture(value);
    const result = checkPacket(f.fact, f.compiled, f.texts, f.options);
    assert.equal(result.passed, true);
    assert.deepEqual(result.unscannable, [{ rule: 'assumed_hidden_value', criterion: 'topic', reason: typeof value === 'boolean' ? 'boolean_value' : 'enum_value' }]);
  }
});
test('required numeric and date collisions are unscannable but gratuitous results still fail', () => {
  for (const value of [9.87, '2027-01-01']) {
    const f = collisionFixture(value);
    const result = checkPacket(f.fact, f.compiled, f.texts, f.options);
    assert.equal(result.passed, true);
    assert.deepEqual(result.unscannable, [{ rule: 'assumed_hidden_value', criterion: 'topic', reason: 'required_text_collision' }]);
    delete f.fact.criteria.other;
    f.compiled.brief = f.compiled.brief.replace(`File quality_manual.md, section 1.2: Other public topic\nRecorded result: ${value}.\n`, '');
    f.texts['quality_manual.md'] = `${BANNER}\n## 1.1 Public topic\nMonitoring is used. Additional result: ${value}.\n`;
    assert.ok(rules(checkPacket(f.fact, f.compiled, f.texts, f.options)).includes('assumed_hidden_value'));
  }
});
test('missing keyword collisions skip only mandated synonyms and exclude omission and RFQ text', () => {
  const f = collisionFixture(1.12);
  Object.assign(f.fact.criteria.topic, { disclosure: 'missing', file: null, section: null });
  f.options.keywords.topic = ['Other public topic', 'gratuitous mention'];
  let result = checkPacket(f.fact, f.compiled, f.texts, f.options);
  assert.equal(result.passed, true);
  assert.deepEqual(result.unscannable, [{ rule: 'missing_mentioned', criterion: 'topic', keyword: 'Other public topic', reason: 'required_text_collision' }]);
  f.texts['quality_manual.md'] += 'gratuitous mention';
  assert.ok(rules(checkPacket(f.fact, f.compiled, f.texts, f.options)).includes('missing_mentioned'));
  const excluded = { brief: 'File quality_manual.md, section 1.1: Allowed\nRecorded result: 1.12.\nOmit the following topics:\nSECRET omission\n--- BEGIN RFQ ---\nSECRET buyer\n--- END RFQ ---' };
  assert.equal(requiredSupplierText(excluded).includes('SECRET'), false);
  const rfqOnly = { brief: 'File quality_manual.md, section 1.1: Allowed\nRecorded result: 1.12.\n--- BEGIN RFQ ---\nSECRET buyer\n--- END RFQ ---' };
  assert.equal(requiredSupplierText(rfqOnly).includes('SECRET'), false);
});
async function publishRequired(world, id) {
  const compiled = await writeBrief(world, id);
  const directory = join(world, 'packets', id);
  await mkdir(directory, { recursive: true });
  const authored = compiled.brief.split('Omit the following topics')[0];
  const blocks = [...authored.matchAll(/^File ([a-z][a-z0-9_]*\.md), section ([0-9.]+): ([^\n]+)\n([\s\S]*?)(?=^File |$(?![\s\S]))/gm)];
  for (const file of compiled.files) {
    const text = file === 'rfq.md' ? compiled.brief.split('--- BEGIN RFQ ---\n')[1].split('\n--- END RFQ ---')[0] : BANNER + '\n' + blocks.filter(match => match[1] === file).map(match => `## ${match[2]} ${match[3]}\n${match[4]}`).join('');
    await writeFile(join(directory, file), text);
  }
}
test('unscannable metadata persists through existing checks and successful rewrite attempts', async () => {
  const { root, facts } = await worldFixture();
  try {
    const first = facts[0];
    Object.assign(first.criteria['2.spc'], { disclosure: 'assumed', true_value: true, claimed_value: null, claim: 'Monitoring is used.', file: 'quality_manual.md', section: '1.1' });
    Object.assign(first.criteria['1.internal_audit'], { disclosure: 'verified', true_value: true, file: 'quality_manual.md', section: '1.2' });
    await writeFile(join(root, 'facts', 'SUP-01.json'), JSON.stringify(first));
    for (const fact of facts) await publishRequired(root, fact.supplier_id);
    const checked = await checkWorld(root);
    assert.equal(checked.status, 'passed');
    const metadata = checked.suppliers[0].attempts[0].unscannable;
    assert.ok(metadata.some(row => row.criterion === '2.spc' && row.reason === 'boolean_value'));
    let calls = 0;
    const clean = await rewriteWorld(root, { model: 'fake', writer: async () => { calls++; } });
    assert.equal(calls, 0);
    assert.deepEqual(clean.suppliers[0].attempts[0].unscannable, metadata);
    await rm(join(root, 'packets', 'SUP-01'), { recursive: true });
    const rewritten = await rewriteWorld(root, { model: 'fake', writer: async (world, id) => { calls++; await publishRequired(world, id); } });
    assert.equal(rewritten.status, 'passed');
    assert.equal(calls, 1);
    assert.deepEqual(rewritten.suppliers[0].attempts[1].unscannable, metadata);
    assert.deepEqual(JSON.parse(await readFile(join(root, 'factcheck.json'))).suppliers[0].attempts[1].unscannable, metadata);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('private writer errors retain bounded diagnostics without entering retry feedback', async () => {
  for (const thrown of [new Error('PRIVATE_DIAGNOSTIC rubric 2.ctq_cpk ' + 'x'.repeat(600)), 'raw-string failure']) {
    const { root } = await worldFixture();
    try {
      const report = await rewriteWorld(root, { model: 'fake', writer: async () => { throw thrown; } });
      const expected = String(thrown?.message ?? thrown).slice(0, 500);
      const persisted = JSON.parse(await readFile(join(root, 'factcheck.json')));
      for (const attempt of persisted.suppliers[0].attempts.slice(1)) {
        assert.equal(attempt.error, expected);
        assert.ok(attempt.error.length <= 500);
        const brief = await readFile(join(root, attempt.brief_path), 'utf8');
        assert.doesNotMatch(brief, /PRIVATE_DIAGNOSTIC|raw-string failure|rubric|2\.ctq_cpk/);
        assert.deepEqual(sanitizeFailures(attempt.failures, tiny().compiled), [{ action: 'repair_structure', file: null, section: null }]);
      }
      assert.equal(report.suppliers[0].attempts.length, 5);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});
