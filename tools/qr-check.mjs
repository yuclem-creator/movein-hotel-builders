// qr-check.mjs — a QR that does not scan is the one failure a classroom cannot recover
// from: thirty people pointing phones at a card that does nothing. So the encoder is
// checked twice: structurally on every run (finders, timing, format areas, capacity
// boundaries), and by DECODING it with an independent decoder when one is installed.
//
// The decoder is a dev-only package, not a runtime dependency:
//   npm install --prefix tools/.qrdeps jsqr
// Without it the structural checks still run and the decode step says so out loud.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { qrMatrix, qrSvg } from '../js/qr/qr.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let fails = 0;
const check = (name, cond, extra = '') => {
  if (cond) console.log(`  ok   ${name}`);
  else { console.log(`  FAIL ${name} ${extra}`); fails++; }
};

/* ------------------------------------------------------------- structure */

console.log('== structure ==');
const sample = qrMatrix('https://example.com/?room=HB24&team=Blue', { ecc: 'M' });
const { size, modules } = sample;

check('module count follows the version formula', size === 17 + 4 * sample.version,
  `v${sample.version} -> ${size}`);
check('mask is one of the eight', sample.mask >= 0 && sample.mask <= 7, String(sample.mask));

const finderAt = (r0, c0) => {
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      const ring = r === 0 || r === 6 || c === 0 || c === 6;
      const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      if (modules[r0 + r][c0 + c] !== (ring || core ? 1 : 0)) return false;
    }
  }
  return true;
};
check('top-left finder pattern', finderAt(0, 0));
check('top-right finder pattern', finderAt(0, size - 7));
check('bottom-left finder pattern', finderAt(size - 7, 0));
check('dark module is set', modules[size - 8][8] === 1);

let timingOk = true;
for (let i = 8; i < size - 8; i++) {
  const want = i % 2 === 0 ? 1 : 0;
  if (modules[6][i] !== want || modules[i][6] !== want) timingOk = false;
}
check('timing patterns alternate on row and column 6', timingOk);

// Format information must be readable in both copies (they carry the same 15 bits).
const readFormat = () => {
  const bits = [];
  for (let i = 0; i < 6; i++) bits.push(modules[i][8]);
  bits.push(modules[7][8], modules[8][8], modules[8][7]);
  for (let i = 5; i >= 0; i--) bits.push(modules[8][i]);
  return bits.join('');
};
const readFormatCopy = () => {
  const bits = [];
  for (let i = 0; i < 8; i++) bits.push(modules[8][size - 1 - i]);
  for (let i = 0; i < 7; i++) bits.push(modules[size - 7 + i][8]);
  return bits.join('');
};
check('both format-information copies agree', readFormat() === readFormatCopy());
check('format information is not all zeros', readFormat().includes('1'));

/* ------------------------------------------------------------- capacity */

console.log('\n== capacity boundaries (ECC M) ==');
check('14 bytes still fits version 1', qrMatrix('x'.repeat(14), { ecc: 'M' }).version === 1);
check('15 bytes moves to version 2', qrMatrix('x'.repeat(15), { ecc: 'M' }).version === 2);
check('213 bytes is the version 10 ceiling', qrMatrix('x'.repeat(213), { ecc: 'M' }).version === 10);
let threw = false;
try { qrMatrix('x'.repeat(214), { ecc: 'M' }); } catch { threw = true; }
check('214 bytes refuses rather than truncating', threw);

let badEcc = false;
try { qrMatrix('x', { ecc: 'Z' }); } catch { badEcc = true; }
check('an unknown ECC level throws', badEcc);

const a = JSON.stringify(qrMatrix('same input', { ecc: 'M' }).modules);
const b = JSON.stringify(qrMatrix('same input', { ecc: 'M' }).modules);
check('encoding is deterministic', a === b);

/* ------------------------------------------------------------------ svg */

console.log('\n== svg ==');
const svg = qrSvg('https://example.com', { module: 6, margin: 4 });
const dim = (qrMatrix('https://example.com').size + 8) * 6;
check('viewBox includes a four-module quiet zone', svg.includes(`viewBox="0 0 ${dim} ${dim}"`), `expected ${dim}`);
check('the SVG declares a role for screen readers', svg.includes('role="img"'));
check('every dark run is drawn as a path', svg.includes('<path d="M'));

/* --------------------------------------------------------------- decode */

console.log('\n== decode (independent decoder) ==');
const candidates = [
  join(ROOT, 'tools/.qrdeps/node_modules/jsqr'),
  join(process.env.TEMP || '', 'qrval/node_modules/jsqr'),
];
let jsQR = null;
for (const dir of candidates) {
  if (!existsSync(dir)) continue;
  try {
    jsQR = createRequire(join(dir, 'package.json'))('jsqr');
    break;
  } catch { /* try the next one */ }
}

if (!jsQR) {
  console.log('  SKIP no decoder installed — run: npm install --prefix tools/.qrdeps jsqr');
} else {
  const rasterise = (text, ecc) => {
    const grid = qrMatrix(text, { ecc });
    const quiet = 4;
    const scale = 4;
    const px = (grid.size + quiet * 2) * scale;
    const data = new Uint8ClampedArray(px * px * 4).fill(255);
    for (let r = 0; r < grid.size; r++) {
      for (let c = 0; c < grid.size; c++) {
        if (grid.modules[r][c] !== 1) continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const x = (c + quiet) * scale + dx;
            const y = (r + quiet) * scale + dy;
            const i = (y * px + x) * 4;
            data[i] = 0; data[i + 1] = 0; data[i + 2] = 0;
          }
        }
      }
    }
    return { data, px };
  };

  const cases = [
    ['http://127.0.0.1:5173/?room=HB24&team=Team%201&mins=8', 'M'],
    ['https://yuclem-creator.github.io/movein-hotel-builders/index.html?room=HB24&team=Blue%20Team&mins=8', 'M'],
    ['https://example.com/hotel-builders/index.html?room=ABCD&team=Rooms%20%26%20F%26B&mins=10', 'L'],
    ['HELLO', 'M'],
    ['x'.repeat(213), 'M'],
  ];
  for (const [text, ecc] of cases) {
    const { data, px } = rasterise(text, ecc);
    const res = jsQR(data, px, px, { inversionAttempts: 'dontInvert' });
    const label = text.length > 46 ? `${text.slice(0, 43)}…` : text;
    check(`decodes ${label} (ecc ${ecc})`, Boolean(res) && res.data === text,
      res ? `got ${String(res.data).slice(0, 40)}` : 'no symbol found');
  }
}

console.log(fails ? `\n${fails} QR CHECK FAILURE(S)` : '\nQR CHECKS PASSED');
process.exitCode = fails ? 1 : 0;
