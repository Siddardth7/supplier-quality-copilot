// Scrub check (issue 48, SHIP-FR-01): run scrub.mjs in throwaway git repos with invented terms only.
// Never reads the real .scrub-terms.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTerms } from './scrub.mjs';

const SCRIPT = fileURLToPath(new URL('scrub.mjs', import.meta.url));
const TMP = tmpdir();
// ponytail: ceiling stops git walking up from the temp dir into some enclosing repo.
// core.abbrev=12 makes git's own short ids longer than 7, so a %h-based commit line would fail test 3.
const ENV = { ...process.env, GIT_CEILING_DIRECTORIES: TMP,
  GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.abbrev', GIT_CONFIG_VALUE_0: '12' };
const G = ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null'];

function repo(t, { init = true } = {}) {
  const dir = mkdtempSync(join(TMP, 'sqc-scrub-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => {
    const r = spawnSync('git', [...G, ...args], { cwd: dir, encoding: 'utf8', env: ENV });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  if (init) git('init', '-q');
  const write = (name, text) => writeFileSync(join(dir, name), text);
  const commit = (msg, files = {}) => {
    for (const [n, text] of Object.entries(files)) write(n, text);
    git('add', '-A');
    git('commit', '-q', '--allow-empty', '-m', msg);
    return git('rev-parse', 'HEAD');
  };
  const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: 'utf8', env: ENV });
  return { dir, git, write, commit, run };
}
const lines = (r) => r.stdout.trim().split('\n');
const last = (r) => lines(r).at(-1);

test('1 clean tree: exit 0, last line scrub: 0 hits', (t) => {
  const { write, commit, run } = repo(t);
  write('.scrub-terms', 'zorblax\n');
  commit('init', { 'a.txt': 'nothing here\n' });
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'scrub: 0 hits\n');
});

test('2 tree hit is case-insensitive and printed as tree  path:line: text', (t) => {
  const { write, commit, run } = repo(t);
  write('.scrub-terms', 'zorblax\n');
  commit('init', { 'a.txt': 'line one\nthe ZorBlax unit\n' });
  const r = run();
  assert.equal(r.status, 1);
  assert.deepEqual(lines(r), ['tree  a.txt:2:the ZorBlax unit', 'scrub: 1 hits']);
});

test('2b a line hit by several terms counts once; an uncommitted edit to a tracked file is scanned', (t) => {
  const { write, commit, run } = repo(t);
  write('.scrub-terms', 'zorblax\nquuxcorp\n');
  commit('init', { 'a.txt': 'clean\n' });
  write('a.txt', 'zorblax and Quuxcorp\n'); // tracked, edited, not committed
  const r = run();
  assert.equal(r.status, 1);
  assert.deepEqual(lines(r), ['tree  a.txt:1:zorblax and Quuxcorp', 'scrub: 1 hits']);
});

test('3 commit-message hit with a clean tree: exit 1, commit <sha7>  subject (tab kept), one line per commit', (t) => {
  const { write, commit, run } = repo(t);
  write('.scrub-terms', 'zorblax\nquuxcorp\n');
  commit('init', { 'a.txt': 'clean\n' });
  const sha = commit('mention ZORBLAX\tand QuuxCorp', { 'b.txt': 'clean too\n' });
  const r = run();
  assert.equal(r.status, 1);
  assert.deepEqual(lines(r), [`commit ${sha.slice(0, 7)}  mention ZORBLAX\tand QuuxCorp`, 'scrub: 1 hits']);
});

test('3b commit messages match terms literally: metacharacters are not regex', (t) => {
  const { write, commit, run } = repo(t);
  write('.scrub-terms', 'q.x*(y)\n');
  commit('init qaxxy', { 'a.txt': 'clean\n' });
  let r = run();
  assert.equal(r.status, 0, r.stdout);
  const sha = commit('see Q.X*(Y) here');
  r = run();
  assert.equal(r.status, 1);
  assert.deepEqual(lines(r), [`commit ${sha.slice(0, 7)}  see Q.X*(Y) here`, 'scrub: 1 hits']);
});

test('4 history-only hit: default run exit 0, --history exit 1 with history <sha7>:path:line: text', (t) => {
  const { write, commit, run } = repo(t);
  write('.scrub-terms', 'zorblax\n');
  const first = commit('init', { 'a.txt': 'ok\nold zorblax line\n' });
  commit('tidy', { 'a.txt': 'ok\n' });
  const plain = run();
  assert.equal(plain.status, 0, plain.stdout);
  assert.equal(plain.stdout, 'scrub: 0 hits\n');
  const h = run('--history');
  assert.equal(h.status, 1);
  assert.deepEqual(lines(h), [`history ${first.slice(0, 7)}:a.txt:2:old zorblax line`, 'scrub: 1 hits']);
});

test('4b every ref is scanned: a side branch\'s message and, with --history, its blob', (t) => {
  const { write, git, commit, run } = repo(t);
  write('.scrub-terms', 'zorblax\n');
  commit('init', { 'a.txt': 'clean\n' });
  git('switch', '-q', '-c', 'side');
  const side = commit('side zorblax note', { 'b.txt': 'zorblax\n' });
  git('switch', '-q', '-');
  const plain = run();
  assert.equal(plain.status, 1);
  assert.deepEqual(lines(plain), [`commit ${side.slice(0, 7)}  side zorblax note`, 'scrub: 1 hits']);
  const h = run('--history');
  assert.equal(h.status, 1, h.stderr);
  assert.deepEqual(lines(h), [`commit ${side.slice(0, 7)}  side zorblax note`, `history ${side.slice(0, 7)}:b.txt:1:zorblax`, 'scrub: 2 hits']);
});

test('5 missing term file, and a file of only comments and blanks: exit 2, nothing on stdout', (t) => {
  const { write, commit, run } = repo(t);
  commit('init', { 'a.txt': 'zorblax\n' });
  let r = run();
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /scrub: \.scrub-terms missing/);
  write('.scrub-terms', '# zorblax\n\n   \n\t\n#\n');
  r = run();
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /scrub: \.scrub-terms has no terms/);
});

test('5b git failure (not a repo) exits 2, not 1', (t) => {
  const { write, run } = repo(t, { init: false });
  write('.scrub-terms', 'zorblax\n');
  write('a.txt', 'zorblax\n');
  const r = run();
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /^scrub: .*not a git repository/);
});

test('6 a commented-out term does not match; blank and whitespace lines do not match everything', (t) => {
  const { write, commit, run } = repo(t);
  write('.scrub-terms', '# quuxcorp\n\n   \nzorblax\n\n');
  commit('init', { 'a.txt': 'quuxcorp here\nplain text\nanything at all\n' });
  const r = run('--history');
  assert.equal(r.status, 0, r.stdout);
  assert.equal(r.stdout, 'scrub: 0 hits\n');
});

test('7 an untracked file containing a term is not reported', (t) => {
  const { write, commit, run } = repo(t);
  write('.scrub-terms', 'zorblax\n');
  commit('init', { 'a.txt': 'clean\n' });
  write('notes.txt', 'zorblax\n');
  const r = run();
  assert.equal(r.status, 0, r.stdout);
  assert.equal(r.stdout, 'scrub: 0 hits\n');
});

test('8 .scrub-terms itself is not reported even when force-tracked, in tree or history', (t) => {
  const { write, git, commit, run } = repo(t);
  write('.scrub-terms', 'zorblax\n');
  write('.gitignore', '.scrub-terms\n');
  git('add', '-f', '.scrub-terms');
  commit('init', { 'a.txt': 'clean\n' });
  assert.equal(git('ls-files', '.scrub-terms'), '.scrub-terms');
  const r = run('--history');
  assert.equal(r.status, 0, r.stdout);
  assert.equal(r.stdout, 'scrub: 0 hits\n');
});

test('9 regex metacharacters and an en dash match literally', (t) => {
  const { write, commit, run } = repo(t);
  write('.scrub-terms', '-q.x*(y) – z\n');
  commit('init', { 'a.txt': 'qaxxy z\n-qaxxy) – z\nsee -Q.X*(Y) – Z here\n' });
  const r = run();
  assert.equal(r.status, 1);
  assert.deepEqual(lines(r), ['tree  a.txt:3:see -Q.X*(Y) – Z here', 'scrub: 1 hits']);
});

test('10 a CRLF term file parses (no trailing \\r in terms)', (t) => {
  const { write, commit, run } = repo(t);
  write('.scrub-terms', '# list\r\nzorblax\r\n\r\nquuxcorp\r\n');
  commit('init', { 'a.txt': 'a zorblax\nb\nc Quuxcorp\n' });
  const r = run();
  assert.equal(r.status, 1);
  assert.deepEqual(lines(r), ['tree  a.txt:1:a zorblax', 'tree  a.txt:3:c Quuxcorp', 'scrub: 2 hits']);
});

test('11 parseTerms trims, drops blanks and # comments, dedupes', () => {
  assert.deepEqual(parseTerms(''), []);
  assert.deepEqual(parseTerms('\n  \n\t\r\n'), []);
  assert.deepEqual(parseTerms('# a\n  #b\nzorblax\r\n  Quuxcorp  \nzorblax\n'), ['zorblax', 'Quuxcorp']);
  assert.deepEqual(parseTerms('a # not a comment'), ['a # not a comment']);
});

test('history scan crosses the 100-rev chunk boundary', (t) => {
  const { write, git, commit, run } = repo(t);
  write('.scrub-terms', 'zorblax\n');
  const first = commit('init', { 'a.txt': 'zorblax\n' });
  commit('clean', { 'a.txt': 'ok\n' });
  // 101 more empty commits put the hit commit at rev-list index 102, in the second chunk.
  for (let i = 0; i < 101; i++) git('commit', '-q', '--allow-empty', '-m', `e${i}`);
  const h = run('--history');
  assert.equal(h.status, 1, h.stderr);
  assert.deepEqual(lines(h), [`history ${first.slice(0, 7)}:a.txt:1:zorblax`, 'scrub: 1 hits']);
  assert.equal(last(run()), 'scrub: 0 hits');
});
