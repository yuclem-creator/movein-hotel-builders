// stills-check.mjs — proves the photoreal stills are actually applied, and that they cannot
// break the first load. Three claims, all falsifiable:
//   1. nothing is fetched until the panel is opened (lazy attach, not lazy-load hints);
//   2. every image decodes — a 404 or a bad path must fail here, not in front of a class;
//   3. the panel is dismissible three ways, because it covers the whole viewport.
// The stills are renders of the DEMO build: the alt text and the panel note must keep saying
// so, and that is asserted too, because a photograph presented as the team's own hotel would
// be a factual claim the app cannot support.
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5211;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PW = 'C:/Users/clementy/Downloads/email-automation/browser/node_modules/playwright-core';

let fails = 0;
const check = (name, cond, extra = '') => {
  if (cond) console.log(`  ok   ${name}`);
  else { console.log(`  FAIL ${name} ${extra}`); fails++; }
};

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

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  const imageRequests = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.url().includes('/assets/stills/')) imageRequests.push(`${r.status()} ${r.url().split('/').pop()}`); });
  page.setDefaultTimeout(45000);

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__hb && window.__hb.view, null, { timeout: 20000 });
  await page.click('#startDemo');
  await page.waitForTimeout(400);
  // The tool row only exists once a style is chosen: before that the HUD is still the
  // start screen, and every tool measures 0x0. Same route the smoke pass takes.
  await page.click('#choicesPreset .choice:nth-child(1)');
  await page.waitForTimeout(1500);

  const before = await page.evaluate(() => ({
    hidden: document.getElementById('stills').hidden,
    srcs: [...document.querySelectorAll('#stills img')].map((i) => i.getAttribute('src')),
    pressed: document.getElementById('btnStills').getAttribute('aria-pressed'),
  }));
  console.log(`  before open: hidden=${before.hidden} srcs=${JSON.stringify(before.srcs)} fetched=${imageRequests.length}`);
  check('the stills panel starts closed', before.hidden === true);
  check('no still is fetched before the panel is opened',
    before.srcs.every((s) => !s) && imageRequests.length === 0, JSON.stringify(imageRequests));
  check('its tool button starts unpressed', before.pressed === 'false', before.pressed);

  await page.click('#btnStills');
  await page.waitForFunction(() => [...document.querySelectorAll('#stills img')]
    .every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 20000 });
  const opened = await page.evaluate(() => ({
    hidden: document.getElementById('stills').hidden,
    pressed: document.getElementById('btnStills').getAttribute('aria-pressed'),
    imgs: [...document.querySelectorAll('#stills img')].map((i) => ({
      w: i.naturalWidth, h: i.naturalHeight, alt: i.alt, src: i.getAttribute('src'),
    })),
    note: document.querySelector('.stills-note').textContent.replace(/\s+/g, ' ').trim(),
  }));
  console.log(`  opened: ${opened.imgs.length} images, sizes ${opened.imgs.map((i) => `${i.w}x${i.h}`).join(', ')}`);

  check('the panel opens with one figure per still', opened.hidden === false && opened.imgs.length === 3,
    JSON.stringify({ hidden: opened.hidden, n: opened.imgs.length }));
  check('every still decodes from its file (no 404, no broken path)',
    opened.imgs.every((i) => i.w > 0 && i.h > 0) && imageRequests.every((r) => r.startsWith('200')),
    JSON.stringify(imageRequests));
  check('every still carries alt text naming the demo build',
    opened.imgs.every((i) => /demo/i.test(i.alt)), JSON.stringify(opened.imgs.map((i) => i.alt)));
  check('the panel states that this is not the team\'s hotel',
    /demo/i.test(opened.note) && /not a live view/i.test(opened.note), opened.note);
  check('the tool button reports pressed while the panel is open', opened.pressed === 'true', opened.pressed);

  await page.click('#stillsClose');
  check('the close control dismisses it',
    (await page.evaluate(() => document.getElementById('stills').hidden)) === true);

  await page.click('#btnStills');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  check('Escape dismisses it',
    (await page.evaluate(() => document.getElementById('stills').hidden)) === true);

  await page.click('#btnStills');
  await page.waitForTimeout(300);
  await page.mouse.click(8, 792);   // the scrim, outside the grid
  check('a click on the scrim dismisses it',
    (await page.evaluate(() => document.getElementById('stills').hidden)) === true);

  check('no console errors during the stills pass', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (err) {
  fails++;
  console.log(`FAIL stills pass threw: ${err.stack || err.message}`);
} finally {
  await browser.close();
  server.kill();
}

console.log(fails ? `\n${fails} STILLS CHECK(S) FAILED` : '\nALL STILLS CHECKS PASSED');
process.exitCode = fails ? 1 : 0;
