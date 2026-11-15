import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { resolvePath, serve } from './serve.mjs';

test('resolvePath keeps requests inside the root', () => {
  const root = '/srv/repo/';
  assert.equal(resolvePath('/app/index.html', root), '/srv/repo/app/index.html');
  assert.equal(resolvePath('/', root), '/srv/repo/');
  // URL parsing already drops dot segments, so these stay inside the root.
  for (const p of ['/../etc/passwd', '/%2e%2e/etc/passwd', '/app/../../etc/passwd']) assert.ok(resolvePath(p, root).startsWith(root), p);
  // Encoded slashes survive URL parsing and decode into a real escape: refused.
  for (const bad of ['/..%2f..%2fetc/passwd', '/app/..%2f..%2f..%2frepo-evil', '/%E0%A4%A']) assert.equal(resolvePath(bad, root), null, bad);
  // Dotfiles are refused after decoding, including through an encoded slash.
  for (const dot of ['/.git/HEAD', '/app%2f..%2f.git/HEAD', '/app%2F..%2F.gitignore', '/a/.pipeline/spec.md']) assert.equal(resolvePath(dot, root), null, dot);
});

test('resolvePath refuses a sibling directory that shares the root name as a prefix', () => {
  for (const root of ['/srv/repo/', '/srv/repo']) {
    assert.equal(resolvePath('/..%2frepo-evil/x', root), null, root);
    assert.equal(resolvePath('/app/..%2f..%2frepo-evil', root), null, root);
    assert.equal(resolvePath('/app/x', root), '/srv/repo/app/x', root);
  }
});

test('serves app files with module MIME types, 404s the rest, and survives a burst of parallel requests', async t => {
  const server = serve(0);
  await once(server, 'listening');
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const html = await fetch(`${base}/app/`);
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-type'), /^text\/html/);
  const js = await fetch(`${base}/app/main.js`);
  assert.match(js.headers.get('content-type'), /^text\/javascript/);
  assert.equal((await fetch(`${base}/data/nope.json`)).status, 404);
  assert.equal((await fetch(`${base}/..%2f..%2fetc/passwd`)).status, 404);
  const burst = await Promise.all(Array.from({ length: 40 }, () => fetch(`${base}/app/main.js`).then(r => r.status)));
  assert.deepEqual(new Set(burst), new Set([200]));
});

test('redirects a folder without its trailing slash, hides dotfiles, and refuses a non-local Host', async t => {
  const server = serve(0);
  await once(server, 'listening');
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const r = await fetch(`${base}/app`, { redirect: 'manual' });
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), '/app/');
  for (const p of ['/.git/HEAD', '/.gitignore', '/app/.hidden', '/%2egit/HEAD', '/app%2f..%2f.git/HEAD', '/app%2F..%2F.gitignore']) assert.equal((await fetch(base + p)).status, 404, p);
  const q = await fetch(`${base}/app?data=../dev-data/`, { redirect: 'manual' });
  assert.equal(q.headers.get('location'), '/app/?data=../dev-data/', 'redirect keeps the query');
  // Raw path, so Node sends exactly "/.//app" (a URL string would be sent as "//app" and 404 with no Location).
  const { request } = await import('node:http');
  const raw = (path, headers = {}) => new Promise((done, fail) => request({ host: '127.0.0.1', port: server.address().port, path, headers },
    (res) => { res.resume(); done(res); }).on('error', fail).end());
  const dotSlash = await raw('/.//app');
  assert.equal(dotSlash.statusCode, 301);
  assert.equal(dotSlash.headers.location, '/app/', 'same-origin redirect, never //app/');
  const status = (await raw('/app/', { host: 'evil.example' })).statusCode;
  assert.equal(status, 404);
  assert.equal((await fetch(`http://localhost:${server.address().port}/app/`)).status, 200);
});
