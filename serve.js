// serve.js — zero-dependency static server for local development and for the
// Playwright smoke test. GitHub Pages serves the same files in production; this
// exists only so `node serve.js` works with nothing installed.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.PORT || 5173);

/**
 * The addresses a phone on the same network can actually reach. A join card built from
 * `127.0.0.1` scans perfectly and opens nothing, because on a phone that address is the
 * phone — so the board asks for this list instead of trusting `location`.
 */
const lanAddresses = () => Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal)
  .map((a) => a.address);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/**
 * A share published by `tools/share.mjs` is only useful while it answers. The free tunnel
 * service drops sessions, and a card that carries a dead address fails exactly the way a
 * loopback card does — silently, at the worst moment. Two seconds buys the truth.
 */
async function shareIsLive(url) {
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(2000), redirect: 'follow' });
    return res.ok;
  } catch {
    return false;
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';

    if (pathname === '/__lan') {
      // `share` is a public HTTPS address published by tools/share.mjs, when the room's
      // network isolates devices and a laptop address cannot be reached by a phone.
      const published = await readFile(join(ROOT, 'share-url.txt'), 'utf8')
        .then((text) => text.trim())
        .catch(() => '');
      const live = published ? await shareIsLive(published) : false;
      const body = JSON.stringify({
        port: PORT,
        lan: lanAddresses(),
        share: live ? published : null,
        shareStale: Boolean(published) && !live,
      });
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store',
      });
      res.end(body);
      return;
    }

    // Path traversal must not escape the project root.
    const filePath = resolve(join(ROOT, normalize(pathname)));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; }

    const s = await stat(filePath).catch(() => null);
    if (!s || !s.isFile()) { res.writeHead(404).end('Not found'); return; }

    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500).end(`Server error: ${err.message}`);
  }
});

// Bind IPv4 explicitly. Node's default is `::`, which on this machine showed up as an
// IPv6-only listener — fine for a laptop browser, one more thing to blame for a phone that
// cannot open a card. `0.0.0.0` answers every IPv4 interface and nothing else is needed.
server.listen(PORT, '0.0.0.0', () => {
  console.log(`MOVEin Hotel Builders -> http://127.0.0.1:${PORT}/`);
  const lan = lanAddresses();
  for (const ip of lan) console.log(`  phones on this network -> http://${ip}:${PORT}/`);
  if (!lan.length) console.log('  no network card found: join cards will only open on this laptop');
  console.log(`serving ${ROOT}`);
});
