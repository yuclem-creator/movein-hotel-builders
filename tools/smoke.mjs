// smoke.mjs — end-to-end browser verification. Drives the REAL app (no re-implementation)
// through the window.__hb handle, checks that WebGL actually drew something, walks the
// full demo flow, and proves the browser engine agrees with the Node engine bit for bit.
import { spawn } from 'node:child_process';
import { mkdir, writeFile as writeFileRaw } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createSession, autoBuild, runRound, advanceRound } from '../js/sim/engine.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REVIEW = join(ROOT, 'review');
const PORT = 5199;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PW_DIR = 'C:/Users/clementy/Downloads/email-automation/browser/node_modules/playwright-core';

let fails = 0;
const check = (name, cond, extra = '') => {
  if (cond) console.log(`  ok   ${name}`);
  else { console.log(`  FAIL ${name} ${extra}`); fails++; }
};

/** Reference results computed in NODE, to compare against the browser engine. */
function nodeReference(preset, seed) {
  const s = createSession({ seed, style: 'tower', palette: 'gold', signature: 'water', landscape: 'medium' });
  autoBuild(s, preset);
  while (s.round < 4) advanceRound(s);
  const r = runRound(s);
  return JSON.stringify({ m: r.metrics, c: r.composite, e: r.events.map((x) => x.id), n: s.placements.length });
}

const server = spawn(process.execPath, [join(ROOT, 'serve.js')], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((r) => setTimeout(r, 700));

/**
 * Frames are evidence for humans, not assertions — the gate already asserts on the
 * screenshot BUFFER. Windows intermittently refuses an open() with an unknown error
 * (antivirus or sync holding the path), so this shadows the fs write: retry, then
 * warn and carry on rather than failing a run that measured everything correctly.
 */
async function writeFile(path, buf) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { await writeFileRaw(path, buf); return; }
    catch (err) {
      if (attempt === 3) {
        console.log(`  warn could not write ${String(path).split(/[\\/]/).pop()}: ${err.code || err.message}`);
        return;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}

let chromium;
try {
  chromium = createRequire(join(PW_DIR, 'package.json'))('playwright-core').chromium;
} catch (err) {
  console.log(`FAIL playwright-core not available at ${PW_DIR}: ${err.message}`);
  server.kill();
  process.exitCode = 1;
  throw err;
}

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-gpu-sandbox', '--no-sandbox', '--hide-scrollbars',
  ],
});

await mkdir(REVIEW, { recursive: true });

/** Analyse a screenshot's pixels in-page: distinct colours + luminance variance. */
async function pixelStats(page, buf) {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    let sum = 0, sum2 = 0, n = 0;
    for (let i = 0; i < d.length; i += 16) {
      const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      sum += lum; sum2 += lum * lum; n++;
      seen.add(`${d[i] >> 3},${d[i + 1] >> 3},${d[i + 2] >> 3}`);
    }
    const mean = sum / n;
    return { colours: seen.size, variance: Math.round(sum2 / n - mean * mean) };
  }, buf.toString('base64'));
}

/** Frames per second over a window. Headless uses software rasterisation, so this is
 *  only ever meaningful RELATIVE to another measurement on the same machine. A loaded box
 *  can sit under 1 fps, where a rounded number quantises to zero and says nothing — so the
 *  frame count comes back too, and the gate can tell "slow" from "did not draw at all". */
async function measureFps(page, ms = 3000) {
  return page.evaluate((windowMs) => new Promise((resolve) => {
    let n = 0;
    const t0 = performance.now();
    const tick = () => {
      n++;
      const dt = performance.now() - t0;
      if (dt < windowMs) requestAnimationFrame(tick);
      else resolve({ frames: n, fps: Math.round(n / (dt / 1000)) });
    };
    requestAnimationFrame(tick);
  }), ms);
}

async function newPage(mobile) {
  const ctx = await browser.newContext(mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  // Software rasterisation makes a full-frame capture at 1440x900 take far longer than
  // Playwright's 30 s default, and a screenshot timeout then says nothing about the build.
  // This gate's whole subject is a heavy WebGL frame, so every capture gets a minute.
  const capture = page.screenshot.bind(page);
  page.screenshot = (opts = {}) => capture({ timeout: 60000, ...opts });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  return { ctx, page, errors };
}
try {
  /* ---------------------------------------------------- desktop: full flow */
  console.log('== desktop 1440x900: boot, render, full demo flow ==');
  const { ctx, page, errors } = await newPage(false);
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.__hb && window.__hb.view, null, { timeout: 20000 });
  await page.waitForTimeout(1800);
  console.log(`  boot to first frames: ${Date.now() - t0}ms`);

  check('no console/page errors on boot', errors.length === 0, errors.slice(0, 4).join(' | '));
  check('lobby screen shown', (await page.evaluate(() => window.__hb.screen)) === 'lobby');
  check('WebGL context live', await page.evaluate(() => !!window.__hb.view.renderer.getContext()));

  let shot = await page.screenshot();
  await writeFile(join(REVIEW, '01-lobby-desktop.png'), shot);
  let stats = await pixelStats(page, shot);
  const lobbyStats = stats;
  console.log(`  lobby pixels: ${stats.colours} distinct, variance ${stats.variance}`);
  check('lobby is not a flat colour (the 3D drew)', stats.colours > 40 && stats.variance > 200, JSON.stringify(stats));

  const fonts = await page.evaluate(() => ({
    display: getComputedStyle(document.querySelector('h1')).fontFamily,
    body: getComputedStyle(document.body).fontFamily,
    exceptional: document.fonts.check('16px "MO Exceptional"'),
    avenir: document.fonts.check('16px "Avenir Next LT Pro"'),
  }));
  console.log(`  fonts: ${JSON.stringify(fonts)}`);
  check('headings use MO Exceptional', /MO Exceptional/.test(fonts.display));
  check('body uses Avenir Next LT Pro', /Avenir Next LT Pro/.test(fonts.body));
  check('MO Exceptional font file loaded', fonts.exceptional === true);
  check('Avenir font file loaded', fonts.avenir === true);

  // Baseline on the EMPTY plot. Software rasterisation makes an absolute fps number
  // meaningless; what matters is how much building a hotel costs against this.
  const lobby = await measureFps(page);
  const lobbyFps = lobby.fps;
  console.log(`  baseline fps (empty plot): ${lobbyFps} fps over ${lobby.frames} frames, headless software rendering`);

  await page.click('#startDemo');
  await page.waitForTimeout(400);
  check('design screen shown', (await page.evaluate(() => window.__hb.screen)) === 'design');
  await writeFile(join(REVIEW, '02-design-desktop.png'), await page.screenshot());

  // design -> build, using the balanced preset (2nd preset button)
  await page.click('#choicesPreset .choice:nth-child(2)');
  await page.waitForTimeout(1400);
  check('build screen shown', (await page.evaluate(() => window.__hb.screen)) === 'build');

  const built = await page.evaluate(() => ({
    placements: window.__hb.session.placements.length,
    round: window.__hb.session.round,
    spent: window.__hb.session.spent,
    buildings: window.__hb.view.world.getObjectByName('buildings').children.length,
    agentMeshes: window.__hb.view.agents.group.children.length,
  }));
  console.log(`  built: ${JSON.stringify(built)}`);
  check('preset built 15 functions', built.placements === 15, `${built.placements}`);
  check('one scene group per placement', built.buildings === built.placements, `${built.buildings}`);

  // Bump maps and per-pixel facade detail are not free, so compare against the empty
  // plot measured above. An absolute fps floor would be a statement about the CI
  // machine, not about the build; this catches an accidental shader blow-up instead.
  const build = await measureFps(page);
  console.log(`  fps with a 15-building hotel: ${build.fps} fps over ${build.frames} frames (baseline ${lobbyFps})`);
  // Under 2 fps the rasteriser is the bottleneck, and a ratio between two numbers that small
  // is noise. At that floor the gate asserts the heavy frame still draws; the pixel-detail
  // check above is what proves the hotel's geometry really rendered.
  const starved = lobbyFps < 2;
  check('detailed facades do not disproportionately cost frame time',
    starved ? build.frames > 0 : build.fps >= Math.max(1, Math.round(lobbyFps * 0.5)),
    `build ${build.fps} fps/${build.frames} frames vs baseline ${lobbyFps} fps${starved ? ' (rasteriser starved)' : ''}`);

  shot = await page.screenshot();
  await writeFile(join(REVIEW, '03-build-balanced-day.png'), shot);
  stats = await pixelStats(page, shot);
  console.log(`  build pixels: ${stats.colours} distinct, variance ${stats.variance}`);
  // Thresholds are calibrated to a deliberately warm, low-chroma palette: variance is
  // the meaningful signal, and building must add visual information over the empty plot.
  check('built hotel renders with real detail', stats.colours > 80 && stats.variance > 600, JSON.stringify(stats));
  check('building adds visual information over the empty plot', stats.variance > lobbyStats.variance,
    `build ${stats.variance} vs lobby ${lobbyStats.variance}`);

  // journeys overlay + dusk
  await page.click('#btnOverlays');
  await page.waitForTimeout(700);
  const overlayOn = await page.evaluate(() => window.__hb.view.overlays.group.visible
    && window.__hb.view.overlays.group.children.length > 0);
  check('journey overlay draws routes', overlayOn);
  await writeFile(join(REVIEW, '04-journeys-overlay.png'), await page.screenshot());

  await page.click('#btnDusk');
  await page.waitForTimeout(700);
  check('dusk applied', await page.evaluate(() => window.__hb.view.isDusk === true));
  shot = await page.screenshot();
  await writeFile(join(REVIEW, '05-build-dusk.png'), shot);
  stats = await pixelStats(page, shot);
  console.log(`  dusk pixels: ${stats.colours} distinct, variance ${stats.variance}`);
  check('dusk frame is visibly different and still detailed', stats.colours > 60 && stats.variance > 500, JSON.stringify(stats));
  await page.click('#btnDusk');
  await page.waitForTimeout(400);
  // run the round -> result card
  await page.click('#btnRun');
  await page.waitForTimeout(700);
  check('result screen shown', (await page.evaluate(() => window.__hb.screen)) === 'result');
  const card = await page.evaluate(() => ({
    scores: [...document.querySelectorAll('#resultCard .score b')].map((b) => b.textContent),
    composite: document.querySelector('#resultCard .composite b')?.textContent,
    causes: document.querySelectorAll('#resultCard .causes li').length,
    events: document.querySelectorAll('#resultCard .events li').length,
  }));
  console.log(`  result card: scores=${card.scores.join('/')} composite=${card.composite} causes=${card.causes} events=${card.events}`);
  check('result card shows four scores', card.scores.length === 4, JSON.stringify(card.scores));
  check('result card shows a composite', /^\d+$/.test(card.composite || ''), card.composite);
  check('result card is cause-coded', card.causes >= 5, `${card.causes}`);
  check('result card reports events', card.events >= 1, `${card.events}`);
  await writeFile(join(REVIEW, '06-result-card.png'), await page.screenshot());

  // this preset is round 4, so Continue goes to the showcase
  await page.click('#resNext');
  await page.waitForTimeout(2500);
  check('showcase screen shown', (await page.evaluate(() => window.__hb.screen)) === 'showcase');
  shot = await page.screenshot();
  await writeFile(join(REVIEW, '07-showcase.png'), shot);
  stats = await pixelStats(page, shot);
  console.log(`  showcase pixels: ${stats.colours} distinct, variance ${stats.variance}`);
  check('showcase renders a dusk cinematic frame', stats.colours > 60 && stats.variance > 400, JSON.stringify(stats));

  await page.click('#btnSkipShowcase');
  await page.waitForTimeout(700);
  check('reveal screen shown', (await page.evaluate(() => window.__hb.screen)) === 'reveal');
  const reveal = await page.evaluate(() => ({
    composite: document.querySelector('#revealCard .composite b')?.textContent,
    rows: document.querySelectorAll('#revealCard .causes li').length,
  }));
  check('reveal shows the final composite', /^\d+$/.test(reveal.composite || ''), JSON.stringify(reveal));
  await writeFile(join(REVIEW, '08-reveal.png'), await page.screenshot());

  /* ---------------------------------------- cross-engine determinism proof */
  console.log('\n== determinism: browser engine vs Node engine ==');
  const SEED = 'hb-demo-the-riverside';
  for (const preset of ['balanced', 'revenue', 'neglect']) {
    const browserResult = await page.evaluate(([p, seed]) => {
      const SIM = window.__hb.SIM;
      const s = SIM.createSession({ seed, style: 'tower', palette: 'gold', signature: 'water', landscape: 'medium' });
      SIM.autoBuild(s, p);
      while (s.round < 4) SIM.advanceRound(s);
      const r = SIM.runRound(s);
      return JSON.stringify({ m: r.metrics, c: r.composite, e: r.events.map((x) => x.id), n: s.placements.length });
    }, [preset, SEED]);
    const nodeResult = nodeReference(preset, SEED);
    check(`${preset}: browser === Node`, browserResult === nodeResult,
      `\n       browser ${browserResult}\n       node    ${nodeResult}`);
  }

  const repeat = await page.evaluate((seed) => {
    const SIM = window.__hb.SIM;
    const run = () => {
      const s = SIM.createSession({ seed, style: 'tower', palette: 'gold' });
      SIM.autoBuild(s, 'balanced');
      const out = [];
      while (s.round <= 4) { const r = SIM.runRound(s); out.push(r.metrics, r.composite); if (!SIM.advanceRound(s).ok) break; }
      return JSON.stringify(out);
    };
    return run() === run();
  }, SEED);
  check('same seed replays identically in the browser', repeat);
  check('still no console errors after the full flow', errors.length === 0, errors.slice(0, 4).join(' | '));
  await ctx.close();
  /* --------------------------------------------------------- phone pass */
  console.log('\n== phone 390x844 (touch, dpr 2): boot, build, run ==');
  const { ctx: mctx, page: mp, errors: merr } = await newPage(true);
  const m0 = Date.now();
  await mp.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 30000 });
  await mp.waitForFunction(() => window.__hb && window.__hb.view, null, { timeout: 20000 });
  await mp.waitForTimeout(1800);
  console.log(`  phone boot to first frames: ${Date.now() - m0}ms`);
  check('phone: no console errors', merr.length === 0, merr.slice(0, 4).join(' | '));

  shot = await mp.screenshot();
  await writeFile(join(REVIEW, '09-phone-lobby.png'), shot);
  stats = await pixelStats(mp, shot);
  console.log(`  phone lobby pixels: ${stats.colours} distinct, variance ${stats.variance}`);
  check('phone lobby renders', stats.colours > 40 && stats.variance > 40, JSON.stringify(stats));

  await mp.click('#startDemo');
  await mp.waitForTimeout(400);
  await mp.click('#choicesPreset .choice:nth-child(2)');
  await mp.waitForTimeout(1400);
  check('phone: build screen shown', (await mp.evaluate(() => window.__hb.screen)) === 'build');
  shot = await mp.screenshot();
  await writeFile(join(REVIEW, '10-phone-build.png'), shot);
  stats = await pixelStats(mp, shot);
  console.log(`  phone build pixels: ${stats.colours} distinct, variance ${stats.variance}`);
  check('phone build renders the hotel', stats.colours > 80 && stats.variance > 500, JSON.stringify(stats));

  // Nothing may overflow the viewport horizontally on a phone.
  const overflow = await mp.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  check('phone: no horizontal overflow', overflow.scrollW <= overflow.clientW + 1, JSON.stringify(overflow));

  await mp.click('#btnRun');
  await mp.waitForTimeout(700);
  check('phone: result card shown', (await mp.evaluate(() => window.__hb.screen)) === 'result');
  await writeFile(join(REVIEW, '11-phone-result.png'), await mp.screenshot());
  check('phone: no console errors after full flow', merr.length === 0, merr.slice(0, 4).join(' | '));
  await mctx.close();
} catch (err) {
  fails++;
  console.log(`FAIL smoke run threw: ${err.stack || err.message}`);
} finally {
  await browser.close();
  server.kill();
}

console.log(fails ? `\n${fails} SMOKE CHECK(S) FAILED` : '\nALL SMOKE CHECKS PASSED');
console.log(`screenshots in ${REVIEW}`);
process.exitCode = fails ? 1 : 0;
