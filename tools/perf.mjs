// perf.mjs — whole-scene performance baseline: draw calls and triangles for the real
// full-site builds, measured with the shadow map settled.
//
// Why this exists: arch-shot.mjs counts ONE isolated building, so it cannot tell us whether a
// detail pass made the hotel more expensive to draw. The plan's limits are stated against the
// full scene (calls <= +10%, triangles <= 2.5x), and the smoke gate only asserts a frame-rate
// RATIO under software rasterisation, which is not a cost measurement. This tool is the
// number the detail work is held to.
//
// Usage: node tools/perf.mjs [style] [palette] [label]
//   style    tower | courtyard | heritage   (default heritage)
//   palette  gold | sage | ember | moon     (default gold)
//   label    free-text tag recorded in the output (e.g. "before", "w1-sample")
// Prints one JSON object per preset to stdout and writes review/perf-<label>.json.
//
// Under SwiftShader these numbers are deterministic scene COUNTS, not timings: calls and
// triangles come from the renderer's own accounting, so they are meaningful on a CPU rasteriser.
// Frame RATE here is not, and is deliberately not reported.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'review');
const PORT = 5211;
const PW = 'C:/Users/clementy/Downloads/email-automation/browser/node_modules/playwright-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const VIEW = { width: 1440, height: 900 };

const STYLE = process.argv[2] || 'heritage';
const PALETTE = process.argv[3] || 'gold';
const LABEL = process.argv[4] || 'baseline';

const server = spawn(process.execPath, [join(ROOT, 'serve.js')], {
  env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((r) => setTimeout(r, 700));

const chromium = createRequire(join(PW, 'package.json'))('playwright-core').chromium;
const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox', '--hide-scrollbars'],
});

let fails = 0;
try {
  await mkdir(OUT, { recursive: true });
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.setDefaultTimeout(60000);
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__hb && window.__hb.view, null, { timeout: 30000 });
  await page.click('#startDemo');
  await page.waitForTimeout(300);

  const results = await page.evaluate(async ([style, palette]) => {
    const sess = window.__hb.session;
    const v = window.__hb.view;
    sess.style = style;
    sess.palette = palette;
    v.setPalette(palette);
    v.setStyle(style);

    /** Render until the shadow map has been baked, then read the renderer's own counters. */
    const measure = () => {
      // renderer.info resets on every render() call, so the read must follow the LAST render.
      v.render();
      v.render();
      v.render();
      const info = v.renderer.info.render;
      let meshes = 0, instanced = 0, instances = 0;
      v.world.traverse((o) => {
        if (!o.isMesh) return;
        meshes++;
        if (o.isInstancedMesh) { instanced++; instances += o.count; }
      });
      return { calls: info.calls, triangles: info.triangles, meshes, instanced, instances };
    };

    const out = [];
    // Empty plot first: it isolates the fixed site cost from the built hotel's.
    v.rebuild(Object.assign({}, sess, { placements: [] }));
    await new Promise((r) => requestAnimationFrame(() => r()));
    out.push({ preset: 'empty', ...measure() });

    for (const preset of ['balanced', 'revenue', 'neglect']) {
      window.__hb.SIM.autoBuild(sess, preset);
      v.rebuild(sess);
      await new Promise((r) => requestAnimationFrame(() => r()));
      out.push({ preset, placements: sess.placements.length, ...measure() });
    }
    return out;
  }, [STYLE, PALETTE]);

  const report = {
    label: LABEL, style: STYLE, palette: PALETTE,
    viewport: VIEW, note: 'calls/triangles are renderer counters; frame rate is not reported under SwiftShader',
    presets: results,
    consoleErrors: errs,
  };
  console.log(JSON.stringify(report, null, 2));
  await writeFile(join(OUT, `perf-${LABEL}.json`), JSON.stringify(report, null, 2));
  if (errs.length) { fails++; console.log(`FAIL ${errs.length} console error(s): ${errs.slice(0, 2).join(' | ')}`); }
} catch (err) {
  fails++;
  console.log(`FAIL perf threw: ${err.stack || err.message}`);
} finally {
  await browser.close();
  server.kill();
}

console.log(fails ? `\nPERF FAILED (${fails})` : '\nPERF OK');
process.exitCode = fails ? 1 : 0;
