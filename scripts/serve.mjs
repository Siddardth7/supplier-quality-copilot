// Local static server for the workbench: node scripts/serve.mjs [port]  →  http://localhost:8000/app/
// Serves the repo root (the app fetches ../data/ and ../design/tokens.css). Node built-ins only.
// ponytail: exists because `python3 -m http.server` queues 5 connections, and a cold browser load of the
// app's ES modules resets some of them (#37). Node's default backlog (511) doesn't. GitHub Pages serves prod.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.pdf': 'application/pdf' };

/** Map a request path to a file under ROOT, or null if it escapes the root or names a dotfile
 *  (.git, .pipeline, .scrub-terms). Checked after decoding and normalizing, so %2f tricks can't slip past. */
export function resolvePath(urlPath, root = ROOT) {
  let path;
  try { path = decodeURIComponent(new URL(urlPath, 'http://x').pathname); } catch { return null; }
  const file = normalize(join(root, path));
  const base = root.endsWith(sep) ? root : root + sep;
  if (!(file + sep).startsWith(base)) return null;
  return relative(root, file).split(sep).some((seg) => seg.startsWith('.')) ? null : file;
}

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

export function serve(port = 8000, root = ROOT) {
  return createServer(async (req, res) => {
    const notFound = () => { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Not found'); };
    // Only a local Host (blocks DNS-rebinding reads). resolvePath refuses escapes and dotfiles.
    if (!LOCAL_HOST.test(req.headers.host ?? '')) return notFound();
    const url = new URL(req.url, 'http://x');
    let file = resolvePath(req.url, root);
    try {
      if (!file) return notFound();
      if ((await stat(file)).isDirectory()) {
        // /app -> /app/ so the page's relative URLs resolve (#37 review F3).
        // Location is rebuilt from the resolved file, so it is always same-origin (no //host); the query is kept.
        if (!url.pathname.endsWith('/')) {
          const rel = relative(root, file).split(sep).map(encodeURIComponent).join('/');
          res.writeHead(301, { location: `/${rel ? `${rel}/` : ''}${url.search}` });
          return res.end();
        }
        file = join(file, 'index.html');
      }
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      notFound();
    }
  }).listen(port, '127.0.0.1');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.argv[2] ?? 8000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) { console.error('Usage: node scripts/serve.mjs [port]'); process.exit(2); }
  serve(port).on('listening', () => console.log(`Serving ${ROOT} at http://localhost:${port}/app/`));
}
