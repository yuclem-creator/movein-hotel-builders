// sig.mjs — measure two frames the way a FLORA reference is judged.
//
// The acceptance test for a FLORA reference is not "does it look better", it is "is it still
// THIS building". A picture that re-invents the layout is a worse reference than one that
// keeps the massing and only changes the surfaces, so the test has to be a number. Four
// numbers, all measured off the same 64x32 luminance grid, which makes them independent of
// image size and of the renderer:
//
//   structure  Pearson correlation of the two luminance signatures. This is the one that
//              matters. Measured calibration: a faithful reference pass of the same camera
//              through a different renderer scores 0.791, a relight of the same camera
//              (day vs dusk) 0.493, a different camera 0.042. A reference is accepted at
//              0.75 or above.
//   colour     mean absolute RGB difference per channel. A relight moves it; a redesign
//              moves it much further.
//   detail     ratio of edge energy (mean |gradient|) — how much more surface detail the
//              second frame carries than the first. INFORMATIONAL ONLY, and read it with the
//              numbers next to it: measured on the hall references it tracked the GROUND, not
//              the building. A reference that kept the dark slate, added hip and ridge caps,
//              fascia, finial, window reveals, sills, downpipes and a plinth scored 0.92x,
//              because it also smoothed our noisy paving; a reference that added nothing but
//              invented scrub on the apron scored 1.40x. Do not gate on this number.
//   shadow     ratio of the darkest decile to the mean luminance — how much deeper the
//              shadows got.
//
// Decoding happens in the browser: there is no image library installed for node, and the
// same offscreen-canvas path is what capture-check.mjs already relies on.
//
// Usage: node tools/sig.mjs <a.png> <b.png> [--min 0.75] [--max-colour 30] [--json]
// Exit code 1 when a gate is given and not met. The acceptance rule for a reference is
// structure >= 0.75 AND colour <= 30 (docs/ARCH-FIDELITY-PLAN.md); --min alone checks only the
// first, so pass both when the answer decides whether a reference is used.
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { createRequire } from 'node:module';

const PW = 'C:/Users/clementy/Downloads/email-automation/browser/node_modules/playwright-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const GRID = { w: 64, h: 32 };

const argv = process.argv.slice(2);
// Positional arguments only: a flag's VALUE (`--min 0.75`) is not a filename, or the tool
// refuses to run.
const files = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
const asJson = argv.includes('--json');
const minIndex = argv.indexOf('--min');
const MIN = minIndex >= 0 ? Number(argv[minIndex + 1]) : null;
const maxColourIndex = argv.indexOf('--max-colour');
const MAXC = maxColourIndex >= 0 ? Number(argv[maxColourIndex + 1]) : null;

if (files.length !== 2) {
  console.log('usage: node tools/sig.mjs <a.png> <b.png> [--min 0.75] [--max-colour 30] [--json]');
  process.exitCode = 2;
} else {
  const asUrl = (buf, name) => `data:image/${/\.jpe?g$/i.test(name) ? 'jpeg' : 'png'};base64,`
    + buf.toString('base64');

  const chromium = createRequire(`${PW}/package.json`)('playwright-core').chromium;
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-gpu-sandbox', '--no-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.goto('about:blank');
    const sample = (url) => page.evaluate(async ([src, gw, gh]) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = gw; c.height = gh;
      const ctx2d = c.getContext('2d');
      ctx2d.drawImage(img, 0, 0, gw, gh);
      const d = ctx2d.getImageData(0, 0, gw, gh).data;
      const r = [], g = [], b = [], lum = [];
      for (let i = 0; i < d.length; i += 4) {
        r.push(d[i]); g.push(d[i + 1]); b.push(d[i + 2]);
        // Rec. 709 luma: the eye's own weighting, so "detail" means what it looks like.
        lum.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
      }
      return { r, g, b, lum };
    }, [url, GRID.w, GRID.h]);

    const A = await sample(asUrl(await readFile(files[0]), files[0]));
    const B = await sample(asUrl(await readFile(files[1]), files[1]));
    await browser.close();

    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    const pearson = (a, b) => {
      const ma = mean(a), mb = mean(b);
      let num = 0, da = 0, db = 0;
      for (let i = 0; i < a.length; i++) {
        const x = a[i] - ma, y = b[i] - mb;
        num += x * y; da += x * x; db += y * y;
      }
      return num / Math.sqrt(da * db || 1);
    };
    const meanAbs = (a, b) => mean(a.map((v, i) => Math.abs(v - b[i])));
    // Edge energy: |dx| + |dy| over the grid, the last row and column excluded so the frame
    // edge is not counted as detail.
    const edges = (lum) => {
      let s = 0, n = 0;
      for (let y = 0; y < GRID.h - 1; y++) {
        for (let x = 0; x < GRID.w - 1; x++) {
          const i = y * GRID.w + x;
          s += Math.abs(lum[i + 1] - lum[i]) + Math.abs(lum[i + GRID.w] - lum[i]);
          n++;
        }
      }
      return s / n;
    };
    const shadow = (lum) => {
      const sorted = [...lum].sort((a, b) => a - b);
      const dark = mean(sorted.slice(0, Math.max(1, Math.round(sorted.length * 0.1))));
      return dark / (mean(sorted) || 1);
    };

    const structure = pearson(A.lum, B.lum);
    const colour = { r: meanAbs(A.r, B.r), g: meanAbs(A.g, B.g), b: meanAbs(A.b, B.b) };
    // The colour gate is on the worst channel, not the mean of three: a reference that leaves
    // red alone and moves blue by 40 has changed the palette.
    const colourMax = Math.max(colour.r, colour.g, colour.b);
    const detail = { a: edges(A.lum), b: edges(B.lum) };
    const shadowD = { a: shadow(A.lum), b: shadow(B.lum) };
    const gates = [];
    if (MIN !== null) gates.push(structure >= MIN);
    if (MAXC !== null) gates.push(colourMax <= MAXC);
    const pass = gates.length ? gates.every(Boolean) : null;

    if (asJson) {
      console.log(JSON.stringify({
        a: basename(files[0]), b: basename(files[1]),
        structure: +structure.toFixed(4),
        colour: { r: +colour.r.toFixed(2), g: +colour.g.toFixed(2), b: +colour.b.toFixed(2) },
        detail: { a: +detail.a.toFixed(2), b: +detail.b.toFixed(2), ratio: +(detail.b / detail.a).toFixed(3) },
        shadow: { a: +shadowD.a.toFixed(3), b: +shadowD.b.toFixed(3), ratio: +(shadowD.b / shadowD.a).toFixed(3) },
        min: MIN, maxColour: MAXC, colourMax: +colourMax.toFixed(2), pass,
      }, null, 2));
    } else {
      console.log(`A  ${basename(files[0])}`);
      console.log(`B  ${basename(files[1])}`);
      console.log(`structure  ${structure.toFixed(3)}   (0.042 different camera, 0.493 relight, 0.791 faithful)`);
      console.log(`colour     r ${colour.r.toFixed(1)}  g ${colour.g.toFixed(1)}  b ${colour.b.toFixed(1)}   (mean |delta| per channel)`);
      console.log(`detail     A ${detail.a.toFixed(1)}  B ${detail.b.toFixed(1)}  ratio ${(detail.b / detail.a).toFixed(2)}x   (informational: tracks ground texture, not construction detail)`);
      console.log(`shadow     A ${shadowD.a.toFixed(3)}  B ${shadowD.b.toFixed(3)}  ratio ${(shadowD.b / shadowD.a).toFixed(2)}x`);
      if (MIN !== null) console.log(`${structure >= MIN ? 'PASS' : 'FAIL'}  structure >= ${MIN}  (measured ${structure.toFixed(3)})`);
      if (MAXC !== null) console.log(`${colourMax <= MAXC ? 'PASS' : 'FAIL'}  colour <= ${MAXC}  (worst channel ${colourMax.toFixed(1)})`);
      if (pass !== null) console.log(pass ? 'REFERENCE ACCEPTED' : 'REFERENCE REJECTED');
    }
    process.exitCode = pass === false ? 1 : 0;
  } catch (err) {
    console.log(`sig threw: ${err.stack || err.message}`);
    process.exitCode = 2;
  }
}
