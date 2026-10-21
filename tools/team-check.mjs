// team-check.mjs — two devices, one hotel.
//
// The local bus (BroadcastChannel) carries the same messages the Supabase bus will, so this
// gate proves the protocol and the UI wiring without a backend: two pages in one browser
// context, both joining the same room and team with collab=1, must hold the same hotel after
// any one of them acts. It is the gate that would have caught "teams are seeing different
// hotels", which is the failure this feature exists to prevent.
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5204;
const BASE = `http://127.0.0.1:${PORT}`;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PW_DIR = 'C:/Users/clementy/Downloads/email-automation/browser/node_modules/playwright-core';
const chromium = createRequire(join(PW_DIR, 'package.json'))('playwright-core').chromium;

let fails = 0;
const check = (name, cond, extra = '') => {
  if (cond) console.log(`  ok   ${name}`);
  else { console.log(`  FAIL ${name} ${extra}`); fails++; }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, [join(ROOT, 'serve.js')], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore',
});
await sleep(900);

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });

/** A device that has joined the room, picked a design and reached the build screen. */
async function device(label) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${label}: ${m.text()}`); });
  await page.goto(`${BASE}/index.html?room=HB24&team=Blue&mins=8&collab=1`, { waitUntil: 'load', timeout: 40000 });
  await page.waitForFunction(() => window.__hb && window.__hb.view, null, { timeout: 30000 });
  await page.click('#startDemo');
  await page.waitForFunction(() => window.__hb.screen === 'design', null, { timeout: 15000 });
  await page.click('#designContinue');
  await page.waitForFunction(() => window.__hb.screen === 'build', null, { timeout: 15000 });
  await sleep(400);
  return { page, errors };
}

/** Place through the intent path. `findSpot` keeps the gate out of canvas hit-testing, which
 *  input-check already owns; what is under test here is that a second device sees it. */
const placeOne = (page, fnId = 'rooms') => page.evaluate((f) => {
  const spot = window.__hb.SIM.findSpot(window.__hb.session, f);
  if (!spot) return null;
  const res = window.__hb.placeAt(f, spot.col, spot.row);
  return res && res.ok ? spot : null;
}, fnId);
const state = (page) => page.evaluate(() => {
  const s = window.__hb.session;
  return {
    n: s.placements.length,
    uids: s.placements.map((p) => p.uid),
    staffing: { ...s.staffing },
    round: s.round,
    spent: s.spent,
    screen: window.__hb.screen,
    chip: document.querySelector('#teamChip').hidden ? '' : document.querySelector('#teamChip').textContent,
  };
});


try {
  console.log('== two devices on one hotel ==');
  const a = await device('A');
  const b = await device('B');
  await sleep(1200);   // heartbeats: each device learns the other has joined

  const joined = await Promise.all([state(a.page), state(b.page)]);
  check('both devices know they are on the same hotel',
    /2 in this hotel/.test(joined[0].chip) && /2 in this hotel/.test(joined[1].chip),
    JSON.stringify(joined.map((s) => s.chip)));

  // A places; B must hold the same building, under the leader's uid.
  check('the lead device can place a building', Boolean(await placeOne(a.page)));
  await sleep(900);
  const afterPlace = await Promise.all([state(a.page), state(b.page)]);
  check('a placement on one device appears on the other',
    afterPlace[0].n === 1 && afterPlace[1].n === 1, JSON.stringify(afterPlace.map((s) => s.n)));
  check('and it carries the same uid on both',
    afterPlace[0].uids.join() === afterPlace[1].uids.join(), JSON.stringify(afterPlace.map((s) => s.uids)));
  check('so both devices spent the same credits',
    afterPlace[0].spent === afterPlace[1].spent, `${afterPlace[0].spent} vs ${afterPlace[1].spent}`);

  // B changes the roster; A must agree.
  await b.page.click('#btnManpower');
  await sleep(250);
  const step = await b.page.evaluate(() => {
    const btn = document.querySelector('#mpList button[data-cluster][data-step="1"]');
    if (!btn) return null;
    btn.click();
    return btn.dataset.cluster;
  });
  await sleep(900);
  const afterRoster = await Promise.all([state(a.page), state(b.page)]);
  check('a roster change on the second device lands on the first',
    Boolean(step) && JSON.stringify(afterRoster[0].staffing) === JSON.stringify(afterRoster[1].staffing),
    JSON.stringify({ step, a: afterRoster[0].staffing, b: afterRoster[1].staffing }));

  // A removes what it built; B must lose it too.
  await a.page.evaluate(() => {
    const s = window.__hb.session;
    if (s.placements.length) window.__hb.remove(s.placements[0].uid);
  });
  await sleep(900);
  const afterRemove = await Promise.all([state(a.page), state(b.page)]);
  check('a removal on the first device lands on the second',
    afterRemove[0].n === afterRemove[1].n, JSON.stringify(afterRemove.map((s) => s.n)));

  // A late joiner must adopt the hotel, not start an empty one.
  await placeOne(a.page);
  await sleep(700);
  const c = await device('C');
  await sleep(1500);
  const late = await state(c.page);
  const lead = await state(a.page);
  check('a late joiner adopts the hotel instead of building an empty one',
    late.n === lead.n && late.n > 0, JSON.stringify({ late: late.n, lead: lead.n }));
  check('and inherits the leader uids, so later intents address the same buildings',
    late.uids.join() === lead.uids.join(), JSON.stringify({ late: late.uids, lead: lead.uids }));

  // Running the round is an intent like any other: every device must score it the same.
  await a.page.click('#btnRun');
  await sleep(1800);
  const scored = await Promise.all([state(a.page), state(b.page), state(c.page)]);
  const composites = await Promise.all([a, b, c].map((d) => d.page.evaluate(
    () => (window.__hb.session.history.at(-1) || {}).composite ?? null)));
  check('running the round puts every device on the result screen',
    scored.every((s) => s.screen === 'result'), JSON.stringify(scored.map((s) => s.screen)));
  check('and every device scored the same round',
    composites[0] !== null && composites.every((v) => v === composites[0]), JSON.stringify(composites));
  check('no page errors on any device',
    [...a.errors, ...b.errors, ...c.errors].length === 0,
    [...a.errors, ...b.errors, ...c.errors].slice(0, 3).join(' | '));

  // A card can carry the relay pair, so a phone needs nothing typed into a console. The
  // decode is pure, and the effect is observable: the device stores the config it was given.
  const { parseNet, encodeNet } = await import('../js/classroom/join.js');
  const payload = encodeNet('https://example.supabase.co', 'anon-key-test');
  const parsed = parseNet(payload);
  check('a card can carry the relay configuration and it decodes',
    parsed && parsed.url === 'https://example.supabase.co' && parsed.anonKey === 'anon-key-test',
    JSON.stringify(parsed));
  check('a malformed relay payload is ignored rather than trusted', parseNet('not-base64!!') === null);

  // A relay-carrying card once exceeded the QR encoder's version ceiling at ECC M, and the
  // board silently fell back to a relay-less card — the failure looked like "cards ignore the
  // project". A realistic Pages link with a real-length publishable key must still encode.
  const { qrSvg } = await import('../js/qr/qr.js');
  const longCard = 'https://yuclem-creator.github.io/movein-hotel-builders/index.html'
    + `?room=HB24&team=Team%2012&mins=8&net=${encodeNet('https://bacagknsardeqikanbyi.supabase.co', `sb_publishable_${'x'.repeat(42)}`)}`;
  let fits = true;
  try { qrSvg(longCard, { module: 6 }); } catch { fits = false; }
  check('a relay-carrying card still fits the QR encoder', fits, `${longCard.length} bytes`);

  const cfg = await ctx.newPage();
  await cfg.goto(`${BASE}/index.html?room=HB24&team=Cfg&mins=8&collab=1&net=${payload}`,
    { waitUntil: 'load', timeout: 40000 });
  await cfg.waitForFunction(() => window.__hb && window.__hb.view, null, { timeout: 30000 });
  const stored = await cfg.evaluate(() => localStorage.getItem('hb.v2.net'));
  check('the device stores the relay it was handed', Boolean(stored && stored.includes('example.supabase.co')),
    String(stored).slice(0, 40));
  await cfg.close();

  await ctx.close();
} catch (err) {
  fails++;
  console.log(`  FAIL the team flow threw: ${err.message}`);
} finally {
  await browser.close();
  server.kill();
}

console.log(fails ? `\n${fails} TEAM CHECK FAILURE(S)` : '\nTEAM CHECKS PASSED');
process.exitCode = fails ? 1 : 0;


