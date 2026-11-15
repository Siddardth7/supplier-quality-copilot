// Scrub check (issue 48, SHIP-FR-01): node scripts/scrub.mjs [--history]  ->  exit 0 clean, 1 hits, 2 error.
// Reads ./.scrub-terms (gitignored, one term per line, # comments) and scans tracked files plus all commit
// messages; --history also scans every blob in every commit. Case-insensitive literal substrings. Node built-ins only.
// ponytail: file and folder names, binaries (git grep -I), issue/PR bodies (the public repo will have none) and author names are not scanned.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const EXCLUDE = ['--', '.', ':(exclude).scrub-terms'];
const CHUNK = 100; // ponytail: revs per git grep call, keeps argv under ARG_MAX as history grows

/** Terms from the list file: trimmed, no blanks (an empty pattern matches every line), no # comments, deduped. */
export function parseTerms(text) {
  return [...new Set(text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')))];
}

function fail(msg) { console.error(`scrub: ${msg}`); process.exit(2); }

function git(args, okCodes = [0]) {
  const r = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) fail(r.error.message);
  if (!okCodes.includes(r.status)) fail(r.stderr.trim() || `git ${args[0]} exited ${r.status}`);
  return r.stdout.split('\n').filter(Boolean);
}

function main(history) {
  if (!existsSync('.scrub-terms')) fail('.scrub-terms missing');
  const terms = parseTerms(readFileSync('.scrub-terms', 'utf8'));
  if (!terms.length) fail('.scrub-terms has no terms');
  const grep = ['grep', '-I', '-i', '-n', '-F', ...terms.flatMap((t) => ['-e', t])];
  // git grep exits 1 on no match; that is zero hits, not an error.
  const hits = git(grep.concat(EXCLUDE), [0, 1]).map((l) => `tree  ${l}`);
  const log = ['log', '--all', '-i', '-F', ...terms.map((t) => `--grep=${t}`), '--format=%H%x09%s'];
  for (const l of git(log)) hits.push(`commit ${l.slice(0, 7)}  ${l.slice(41)}`);
  if (history) {
    const revs = git(['rev-list', '--all']);
    for (let i = 0; i < revs.length; i += CHUNK) {
      for (const l of git(grep.concat(revs.slice(i, i + CHUNK), EXCLUDE), [0, 1])) hits.push(`history ${l.slice(0, 7)}${l.slice(40)}`);
    }
  }
  for (const h of hits) console.log(h);
  console.log(`scrub: ${hits.length} hits`);
  process.exitCode = hits.length ? 1 : 0; // not process.exit: piped stdout is async on macOS and could truncate
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.includes('--history'));
