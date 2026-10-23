// textures.mjs — fetch, verify and size the photographic surface maps.
//
// The canvas-drawn maps gave every surface the right COLOUR and the wrong STRUCTURE: no
// procedural slab, slate or sand survives a side-by-side with the FLORA reference renders.
// These are real scanned surfaces from Poly Haven (CC0, no attribution required; credited
// in assets/textures/SOURCES.md anyway). This tool is the only way an image enters
// assets/textures/, so every file traces to an asset id, a map, a resolution and an md5.
//
//   node tools/textures.mjs            fetch anything missing, then size it
//   node tools/textures.mjs --force    re-fetch and re-size everything
//
// Sizing runs in headless Chrome (no image library is vendored and there is no local
// Python): each map is drawn 3x3 tiled and the centre cropped, so the filter sees wrapped
// neighbours at the edges and the tile stays seamless after the downscale.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'textures');
const CACHE = join(ROOT, 'review', 'ph-src');   // git-ignored originals
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PW = 'C:/Users/clementy/Downloads/email-automation/browser/node_modules/playwright-core';
const FORCE = process.argv.includes('--force');
const QUALITY = 0.85;

/**
 * The set, and why each one. `px` is the shipped edge; `kind` is the Poly Haven map key.
 * Must stay in step with PHOTO in js/render/materials.js (the runtime list).
 */
//
// `mod` turns a diffuse photograph into a MODULATOR, the same contract every canvas map in
// materials.js already follows: the map carries structure, the material colour carries the
// MO palette. Per pixel, chroma is pulled toward grey by `sat`, then the pixel is
// re-centred on `target` (the average colour of the drawn map it replaces, so the material
// colours tuned against those maps stay calibrated) with its spread scaled by `contrast`.
// Without this the precast paving would arrive brown with blue stains, and the palette and
// ivory gates would be measuring Poly Haven's photographer rather than the brand.
//
// Sizes are set by the cameras, not by the source: the closest framing (court) puts ~3 cm
// of ground in a screen pixel, so a 512 px map over a 5-7.5 m tile is already at or past
// screen resolution. 1024 px doubled the bytes for detail no camera in the app can show.
const SET = [
  { file: 'paving-diff.jpg', id: 'precast_stone_paving', kind: 'Diffuse', px: 512, mod: { target: '#EEE8DC', contrast: 0.6, sat: 0.1 }, why: 'plinth, aprons, forecourt, paths' },
  { file: 'paving-nor.jpg', id: 'precast_stone_paving', kind: 'nor_gl', px: 256, why: 'slab chamfer and joint relief' },
  { file: 'slate-diff.jpg', id: 'roof_slates_03', kind: 'Diffuse', px: 512, mod: { target: '#DCD6C8', contrast: 1.7, sat: 0.1, highpass: 0.08 }, why: 'every pitched roof' },
  { file: 'slate-nor.jpg', id: 'roof_slates_03', kind: 'nor_gl', px: 256, why: 'slate course relief' },
  { file: 'sand-diff.jpg', id: 'aerial_sand', kind: 'Diffuse', px: 512, mod: { target: '#E2D9C5', contrast: 0.75, sat: 0, highpass: 0.04 }, why: 'open ground beyond the plot' },
  { file: 'gravel-diff.jpg', id: 'gravel_floor_02', kind: 'Diffuse', px: 256, mod: { target: '#D9D6CD', contrast: 0.9, sat: 0.1 }, why: 'flat-roof ballast' },
  { file: 'planting-diff.jpg', id: 'leafy_grass', kind: 'Diffuse', px: 256, mod: { target: '#BDD3C3', contrast: 1.0, sat: 0.4 }, why: 'roof gardens and beds' },
  { file: 'plaster-diff.jpg', id: 'white_plaster_02', kind: 'Diffuse', px: 256, mod: { target: '#F6F6F6', contrast: 0.6, sat: 0 }, why: 'render grain, multiplied into the facade drawing' },
];

const exists = (p) => access(p).then(() => true, () => false);
const md5 = (buf) => createHash('md5').update(buf).digest('hex');
const getJson = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} ${r.status} — halt, do not substitute`);
  return r.json();
};

await mkdir(OUT, { recursive: true });
await mkdir(CACHE, { recursive: true });

// 1. Originals: 1k JPEG from the Poly Haven files API, md5-checked against the API's hash.
const info = new Map();
for (const s of SET) {
  if (!info.has(s.id)) {
    const [files, meta] = await Promise.all([
      getJson(`https://api.polyhaven.com/files/${s.id}`),
      getJson(`https://api.polyhaven.com/info/${s.id}`),
    ]);
    info.set(s.id, { files, meta });
  }
  const entry = info.get(s.id).files[s.kind]?.['1k']?.jpg;
  if (!entry) throw new Error(`${s.id}: no 1k jpg for ${s.kind} — halt, do not substitute`);
  s.src = join(CACHE, `${s.id}_${s.kind}_1k.jpg`);
  if (!FORCE && await exists(s.src) && md5(await readFile(s.src)) === entry.md5) continue;
  const res = await fetch(entry.url);
  if (!res.ok) throw new Error(`${entry.url} ${res.status} — halt, do not substitute`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (md5(buf) !== entry.md5) throw new Error(`${s.id} ${s.kind}: md5 mismatch`);
  await writeFile(s.src, buf);
  console.log(`  fetched ${s.id} ${s.kind} (${(buf.length / 1024).toFixed(0)}KB)`);
}

// 2. Size in Chrome: wrap-aware downscale, JPEG re-encode.
const chromium = createRequire(join(PW, 'package.json'))('playwright-core').chromium;
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
let total = 0;
try {
  for (const s of SET) {
    const b64 = (await readFile(s.src)).toString('base64');
    const out = await page.evaluate(async ([data, px, q, mod]) => {
      const img = new Image();
      img.src = `data:image/jpeg;base64,${data}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = c.height = px * 3;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) g.drawImage(img, x * px, y * px, px, px);
      const o = document.createElement('canvas');
      o.width = o.height = px;
      const og = o.getContext('2d');
      og.drawImage(c, px, px, px, px, 0, 0, px, px);
      if (mod) {
        const id = og.getImageData(0, 0, px, px);
        const d = id.data;
        // High-pass: subtract a wrap-blurred copy so tonal blobs larger than `highpass`
        // (as a fraction of the tile) go. On a tiled 400 m ground plane, those blobs are
        // what the eye locks onto as a stamped repeat; the grain and ripples survive.
        if (mod.highpass) {
          const r = Math.max(1, Math.round(px * mod.highpass));
          const b = document.createElement('canvas');
          b.width = b.height = px * 3;
          const bg = b.getContext('2d');
          for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) bg.putImageData(id, x * px, y * px);
          const b2 = document.createElement('canvas');
          b2.width = b2.height = px * 3;
          const b2g = b2.getContext('2d');
          b2g.filter = `blur(${r}px)`;
          b2g.drawImage(b, 0, 0);
          const lo = b2g.getImageData(px, px, px, px).data;
          let m = [0, 0, 0];
          for (let i = 0; i < lo.length; i += 4) for (let k = 0; k < 3; k++) m[k] += lo[i + k];
          m = m.map((v) => v / (lo.length / 4));
          for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, d[i + k] - lo[i + k] + m[k]));
        }
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        const meanL = sum / (d.length / 4);
        // Re-centre each channel on the target, with the chroma that `sat` keeps measured
        // against the photo's own mean, so a stain stays a stain but the field is on-brand.
        const T = [1, 3, 5].map((o) => parseInt(mod.target.slice(o, o + 2), 16));
        const cm = [0, 0, 0];
        for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) cm[k] += d[i + k];
        for (let k = 0; k < 3; k++) cm[k] /= d.length / 4;
        for (let i = 0; i < d.length; i += 4) {
          const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          for (let k = 0; k < 3; k++) {
            const chroma = (d[i + k] - l) - (cm[k] - meanL);
            const v = (l - meanL) + chroma * mod.sat;
            d[i + k] = Math.max(0, Math.min(255, Math.round(T[k] + v * mod.contrast)));
          }
        }
        og.putImageData(id, 0, 0);
      }
      return o.toDataURL('image/jpeg', q).split(',')[1];
    }, [b64, s.px, QUALITY, s.mod || null]);
    const buf = Buffer.from(out, 'base64');
    total += buf.length;
    s.bytes = buf.length;
    await writeFile(join(OUT, s.file), buf);
    console.log(`  ${s.file.padEnd(20)}${String(s.px).padStart(6)}px${(buf.length / 1024).toFixed(1).padStart(8)}KB  <- ${s.id} ${s.kind}`);
  }
} finally {
  await browser.close();
}

// 3. Provenance, written by the tool so it can never drift from the files.
const rows = SET.map((s) => {
  const m = info.get(s.id).meta;
  const dims = (m.dimensions || []).map((d) => `${(d / 1000).toFixed(2)} m`).join(' x ');
  return `| \`${s.file}\` | [${s.id}](https://polyhaven.com/a/${s.id}) | ${s.kind} | ${s.px}px | ${dims} | ${Object.keys(m.authors || {}).join(', ')} | ${(s.bytes / 1024).toFixed(1)} KB | ${s.why} |`;
});
await writeFile(join(OUT, 'SOURCES.md'), [
  '# Surface textures — sources and licence',
  '',
  'Generated by `node tools/textures.mjs`; do not edit by hand. Every file is a scanned surface',
  'from [Poly Haven](https://polyhaven.com), licensed **CC0 1.0** (public domain, no attribution',
  'required — credited here anyway). Originals are the 1k JPEGs from the Poly Haven files API,',
  'md5-verified against the API, then downscaled wrap-aware in headless Chrome and re-encoded at',
  `JPEG quality ${QUALITY}. The runtime (js/render/materials.js) uses each diffuse as a`,
  'brightness-normalised modulator, so the MO palette still comes from the material colours.',
  '',
  '| File | Poly Haven asset | Map | Shipped | Real-world size | Authors | Bytes | Used for |',
  '|---|---|---|---|---|---|---|---|',
  ...rows,
  '',
  `Total: ${(total / 1024).toFixed(1)} KB, fetched after the first frame (not on the critical path).`,
  '',
].join('\n'));
console.log(`\n  ${SET.length} maps, ${(total / 1024).toFixed(1)}KB -> assets/textures/`);
