// Guards the GitHub Pages entry (issue 49, SHIP-FR-03): the root page forwards to app/ and Jekyll is off.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

test('root index.html forwards to app/ with a relative URL and .nojekyll exists', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /http-equiv="refresh" content="0; url=app\/"/);
  assert.match(html, /location\.replace\('app\/' \+ location\.search \+ location\.hash\)/);  // keeps deep links
  assert.ok(existsSync(new URL('../.nojekyll', import.meta.url)));
});
