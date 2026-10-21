// shot.mjs — ad-hoc frame capture for the detail pass (not part of the gates).
// Establishes the site, then the two framings detail is actually judged from.
//
// Usage: node tools/shot.mjs [style] [palette] [framing]
//   style   tower | courtyard | heritage     (default heritage — the pitched-roof style)
//   palette gold | sage | ember | moon       (default gold)
//   framing fit | court | roof | all         (default all)
// Frames land in review/ as shot-<framing>-<style>-<w>.png.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'review');
const PORT = 5205;
const PW = 'C:/Users/clementy/Downloads/email-automation/browser/node_modules/playwright-core';
const STYLE = process.argv[2] || 'heritage';
const PALETTE = process.argv[3] || 'gold';
const FRAMING = process.argv[4] || 'all';

const server = spawn(process.execPath, [join(ROOT, 'serve.js')], {
  env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((r) => setTimeout(r, 700));
const chromium = createRequire(join(PW, 'package.json'))('playwright-core').chromium;
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox', '--hide-scrollbars'],
});
await mkdir(OUT, { recursive: true });

const shots = [
  { tag: 'wide', w: 2509, h: 1186 },
  { tag: 'std', w: 1280, h: 800 },
];
for (const s of shots) {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__hb && window.__hb.view, null, { timeout: 20000 });
  await page.click('#startDemo');
  await page.waitForTimeout(300);
  await page.click('#choicesPreset .choice:nth-child(1)');
  await page.waitForTimeout(1600);

  // Exact look, no easing to wait out, and no walking agents differing between frames.
  await page.evaluate(([st, pal]) => {
    const sess = window.__hb.session, v = window.__hb.view;
    sess.style = st; sess.palette = pal;
    v.setPalette(pal);
    v.setStyle(st);
    v.rebuild(sess);
    v.agents.setVisible(false);
    document.getElementById('ui').style.display = 'none';
  }, [STYLE, PALETTE]);
  await page.waitForTimeout(600);

  const frames = [
    ['fit', () => { window.__hb.view.fit(); }],
    ['court', () => { window.__hb.view.focusOn(0, 8, 26, 0.9); }],
    ['roof', () => { window.__hb.view.focusOn(6, -2, 20, 1.02); }],
  ];
  for (const [name, move] of frames) {
    if (FRAMING !== 'all' && FRAMING !== name) continue;
    await page.evaluate(move);
    await page.evaluate(() => window.__hb.view.snap());
    await page.waitForTimeout(400);
    await writeFile(join(OUT, `shot-${name}-${STYLE}-${s.tag}.png`), await page.screenshot());
  }
  console.log(`${s.tag}: ${errs.length} errors ${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}
await browser.close();
server.kill();
