// capture-check.mjs — proves the Capture panel shows THE TEAM'S OWN HOTEL and cannot lie.
//
// This gate replaced a stills gate. The panel it used to test shipped three pre-baked
// photographs of a demo build, so the only honest thing the app could do with them was
// label them "not your hotel" — and the gate's job was to hold that label in place. The
// panel now renders the live scene instead (view.capture), which makes a stronger and far
// more falsifiable claim, so this gate asserts it:
//   1. nothing is fetched from the network — the image is a data: URL produced on the
//      click, so a 404, a missing file or a stale asset cannot be the thing on screen;
//   2. the frame has real content (colour spread and variance off a decoded sample), not
//      a blank buffer, which is exactly what a broken toDataURL would give;
//   3. it is rendered larger than the screen it was taken from;
//   4. it names the hotel and team THIS session typed — a demo render cannot do that;
//   5. it is dismissible three ways, because it covers the whole viewport.
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5211;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PW = 'C:/Users/clementy/Downloads/email-automation/browser/node_modules/playwright-core';

// Typed into the lobby before the build, then looked for in the capture's own labels: a
// demo render cannot contain a name this session invented.
const HOTEL = 'Marina Bay Verify';
const TEAM = 'Gate Team';
const VIEW = { width: 1280, height: 800 };

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
  const ctx = await browser.newContext({ viewport: VIEW });
  const page = await ctx.newPage();
  const errors = [];
  const imageRequests = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  // Any image request outside assets/textures/ would mean a baked render crept back in.
  // The surface maps are the one carve-out: they are materials (slate, paving, sand), never
  // a picture of a hotel, and they are traced file by file in assets/textures/SOURCES.md.
  // They are counted separately so the gate still proves they are the ONLY images.
  const textureRequests = [];
  page.on('request', (r) => {
    if (r.resourceType() !== 'image' && !/\.(jpe?g|png|webp)$/i.test(r.url())) return;
    if (r.url().startsWith('data:')) return;
    const path = new URL(r.url()).pathname;
    if (/^\/assets\/textures\/[a-z-]+\.jpg$/.test(path)) textureRequests.push(path.split('/').pop());
    else imageRequests.push(path.split('/').pop());
  });
  page.setDefaultTimeout(45000);

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__hb && window.__hb.view, null, { timeout: 20000 });
  await page.fill('#hotelName', HOTEL);
  await page.fill('#teamName', TEAM);
  await page.click('#startDemo');
  await page.waitForTimeout(400);
  // The tool row only exists once a style is chosen: before that the HUD is still the
  // start screen and every tool measures 0x0. Same route the smoke pass takes.
  await page.click('#choicesPreset .choice:nth-child(1)');
  await page.waitForTimeout(1500);

  const before = await page.evaluate(() => ({
    hidden: document.getElementById('capture').hidden,
    src: document.getElementById('captureImg').getAttribute('src'),
    pressed: document.getElementById('btnCapture').getAttribute('aria-pressed'),
  }));
  console.log(`  before open: hidden=${before.hidden} src=${before.src} requests=${imageRequests.length}`);
  check('the capture panel starts closed', before.hidden === true);
  check('its tool button starts unpressed', before.pressed === 'false', before.pressed);
  check('no image file is requested before it is opened',
    before.src === null && imageRequests.length === 0, JSON.stringify(imageRequests));

  // The capture renders the whole scene at twice the pixel ratio: give it room.
  await page.click('#btnCapture');
  await page.waitForFunction(() => {
    const i = document.getElementById('captureImg');
    return i.getAttribute('src') && i.complete && i.naturalWidth > 0;
  }, null, { timeout: 120000 });

  const opened = await page.evaluate(() => {
    const img = document.getElementById('captureImg');
    const save = document.getElementById('captureSave');
    return {
      hidden: document.getElementById('capture').hidden,
      pressed: document.getElementById('btnCapture').getAttribute('aria-pressed'),
      w: img.naturalWidth, h: img.naturalHeight, alt: img.alt,
      srcKind: (img.getAttribute('src') || '').slice(0, 22),
      bytes: (img.getAttribute('src') || '').length,
      note: document.getElementById('captureNote').textContent.replace(/\s+/g, ' ').trim(),
      size: document.getElementById('captureSize').textContent.trim(),
      saveHref: (save.getAttribute('href') || '').slice(0, 22),
      saveName: save.getAttribute('download'),
    };
  });
  console.log(`  opened: ${opened.w}x${opened.h}, data URL ${(opened.bytes / 1024).toFixed(0)}KB, save as "${opened.saveName}"`);

  check('the panel opens with the captured frame', opened.hidden === false && opened.w > 0 && opened.h,
    JSON.stringify({ hidden: opened.hidden, w: opened.w, h: opened.h }));
  check('the image is generated, not fetched (a data URL, zero image requests)',
    opened.srcKind === 'data:image/jpeg;base64' && imageRequests.length === 0,
    JSON.stringify({ srcKind: opened.srcKind, requests: imageRequests }));
  const tex = await page.evaluate(() => window.__hb.view.texturesReady());
  console.log(`  surface maps: ${textureRequests.length} requested, ${tex.loaded.length} loaded, ${tex.failed.length} failed`);
  check('the only images fetched are the surface maps, and every one loaded',
    textureRequests.length === tex.loaded.length && tex.loaded.length >= 8 && tex.failed.length === 0,
    JSON.stringify({ requested: textureRequests, failed: tex.failed }));
  check('the capture is larger than the screen it was taken from',
    opened.w >= VIEW.width * 1.8 && opened.h >= VIEW.height * 1.8, `${opened.w}x${opened.h}`);
  check('the JPEG carries real bytes', opened.bytes > 20000, `${opened.bytes} chars`);
  check('it names the hotel and team this session typed',
    opened.alt.includes(HOTEL) && opened.alt.includes(TEAM), opened.alt);
  check('the note says it is the team\'s own build, not a pre-drawn one',
    /your own build/i.test(opened.note) && opened.note.includes(HOTEL)
    && /nothing here is pre-drawn/i.test(opened.note), opened.note);
  check('the note states the rendered size', /^\d+ × \d+ JPEG$/.test(opened.size), opened.size);
  check('the save link hands over the same image with a file name',
    opened.saveHref === 'data:image/jpeg;base64' && /\.jpg$/.test(opened.saveName || ''),
    JSON.stringify({ saveHref: opened.saveHref, saveName: opened.saveName }));
  check('the tool button reports pressed while the panel is open', opened.pressed === 'true', opened.pressed);


  // Decode the capture and measure it: a blank or corrupted buffer is the failure this
  // catches, and it is the one a "did the panel open" check cannot see.
  const stats = await page.evaluate(() => {
    const img = document.getElementById('captureImg');
    const c = document.createElement('canvas');
    c.width = 320; c.height = 200;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    let sum = 0, sum2 = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
      seen.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
      sum += v; sum2 += v * v; n++;
    }
    const mean = sum / n;
    return { colours: seen.size, variance: Math.round(sum2 / n - mean * mean), mean: Math.round(mean) };
  });
  console.log(`  decoded sample: ${stats.colours} colours, variance ${stats.variance}, mean ${stats.mean}`);
  check('the captured frame has real content (the hotel, not a blank buffer)',
    stats.colours > 40 && stats.variance > 200, JSON.stringify(stats));

  await page.click('#captureClose');
  check('the close control dismisses it',
    (await page.evaluate(() => document.getElementById('capture').hidden)) === true);

  await page.click('#btnCapture');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  check('Escape dismisses it',
    (await page.evaluate(() => document.getElementById('capture').hidden)) === true);

  await page.click('#btnCapture');
  await page.waitForTimeout(300);
  await page.mouse.click(8, 792);   // the scrim, outside the frame
  check('a click on the scrim dismisses it',
    (await page.evaluate(() => document.getElementById('capture').hidden)) === true);

  check('no console errors during the capture pass', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (err) {
  fails++;
  console.log(`FAIL capture pass threw: ${err.stack || err.message}`);
} finally {
  await browser.close();
  server.kill();
}

console.log(fails ? `\n${fails} CAPTURE CHECK(S) FAILED` : '\nALL CAPTURE CHECKS PASSED');
process.exitCode = fails ? 1 : 0;

