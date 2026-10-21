// fetch-vendor.mjs — pull the exact vendored runtime deps into the repo.
// Nothing in this app loads from a CDN at runtime: everything is local and
// committed, so a venue Wi-Fi that blocks jsdelivr cannot break a session.
// Re-run only when bumping a version; it verifies size + parseability.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const FILES = [
  {
    url: 'https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.min.js',
    out: 'vendor/three/three.module.min.js',
    minBytes: 300_000,
  },
  {
    // NOTE: r186's three.module.min.js hard-codes `from"./three.core.js"`, so the
    // vendored core file MUST be named three.core.js even though its contents are
    // the minified build. Naming it .min.js would 404 at runtime. Do not "tidy" this.
    url: 'https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.core.min.js',
    out: 'vendor/three/three.core.js',
    minBytes: 300_000,
  },
];

let failed = 0;
for (const f of FILES) {
  const dest = join(root, f.out);
  await mkdir(dirname(dest), { recursive: true });
  const res = await fetch(f.url);
  if (!res.ok) { console.error(`FAIL ${res.status} ${f.url}`); failed = 1; continue; }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < f.minBytes) { console.error(`FAIL too small (${buf.length}B) ${f.out}`); failed = 1; continue; }
  await writeFile(dest, buf);
  const txt = await readFile(dest, 'utf8');
  // A truncated or HTML error page would silently break the importmap at runtime.
  if (/^\s*</.test(txt) || !/export/.test(txt)) { console.error(`FAIL not a JS module: ${f.out}`); failed = 1; continue; }
  console.log(`ok ${f.out} ${(buf.length / 1024).toFixed(1)}KB`);
}

// Verify every relative import inside the vendored module resolves to a file we
// actually vendored — a missing sibling is a blank canvas at runtime, not a build error.
const mod = await readFile(join(root, 'vendor/three/three.module.min.js'), 'utf8');
const specs = [...mod.matchAll(/from\s*"\.\/([^"]+)"/g)].map((m) => m[1]);
console.log('relative imports:', specs.length ? specs.join(', ') : '(none)');
for (const s of new Set(specs)) {
  try { await readFile(join(root, 'vendor/three', s)); console.log(`  resolves: ${s}`); }
  catch { console.error(`  FAIL unresolved sibling import: ${s}`); failed = 1; }
}

process.exit(failed);
