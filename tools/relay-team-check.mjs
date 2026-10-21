// relay-team-check.mjs — the cross-device proof.
//
// Two independent browser contexts. Contexts do not share storage and have no BroadcastChannel
// between them, so if a placement crosses from one to the other it went through Supabase and
// nothing else. That is the only way to demonstrate "three phones, one hotel" without three
// phones.
//
//   node tools/relay-team-check.mjs [room]        # reads net.json (or HB_SB_URL / HB_SB_ANON)
//
// Not part of `npm run verify`: it needs a live project.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { encodeNet } from '../js/classroom/join.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5206;
const BASE = `http://127.0.0.1:${PORT}`;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PW_DIR = 'C:/Users/clementy/Downloads/email-automation/browser/node_modules/playwright-core';
const chromium = createRequire(join(PW_DIR, 'package.json'))('playwright-core').chromium;
const room = (process.argv[2] || 'HB24').toUpperCase();

let fails = 0;
const check = (name, ok, extra = '') => {
  console.log(ok ? `  ok   ${name}${extra ? ` — ${extra}` : ''}` : `  FAIL ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const file = await readFile(join(ROOT, 'net.json'), 'utf8').catch(() => null);
const cfg = file ? JSON.parse(file) : null;
const url = cfg?.url || process.env.HB_SB_URL;
const key = cfg?.anonKey || process.env.HB_SB_ANON;
if (!url || !key) {
  console.error('no relay configured: add net.json (url + anonKey) or set HB_SB_URL / HB_SB_ANON');
  process.exit(2);
}
const payload = encodeNet(url, key);
console.log(`== relay: ${url} · room ${room} ==`);

const server = spawn(process.execPath, [join(ROOT, 'serve.js')], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore',
});
await sleep(900);

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

async function device(label) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });   // separate profile
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  await page.goto(`${BASE}/index.html?room=${room}&team=Relay&mins=8&net=${payload}`, { waitUntil: 'load', timeout: 40000 });
  await page.waitForFunction(() => window.__hb && window.__hb.view, null, { timeout: 30000 });
  await page.click('#startDemo');
  await page.waitForFunction(() => window.__hb.screen === 'design', null, { timeout: 15000 });
  await page.click('#designContinue');
  await page.waitForFunction(() => window.__hb.screen === 'build', null, { timeout: 15000 });
  await sleep(600);
  return { ctx, page, errors };
}

const read = (page) => page.evaluate(() => ({
  n: window.__hb.session.placements.length,
  uids: window.__hb.session.placements.map((p) => p.uid),
  chip: document.querySelector('#teamChip').hidden ? '' : document.querySelector('#teamChip').textContent,
  bus: window.__hb.team?.kind,
  leader: window.__hb.team?.leader,
}));

try {
  const a = await device('A');
  const b = await device('B');
  await sleep(2500);   // presence + one poll cycle

  const seenA = await read(a.page);
  check('the device was configured by the card it opened', seenA.bus === 'supabase', String(seenA.bus));
  check('two independent profiles see each other', /2 in this hotel/.test(seenA.chip), seenA.chip);

  const placed = await a.page.evaluate(() => {
    const spot = window.__hb.SIM.findSpot(window.__hb.session, 'rooms');
    const res = window.__hb.placeAt('rooms', spot.col, spot.row);
    return res && res.ok;
  });
  check('the lead can place a building', placed);

  // The follower polls; give it two cycles plus slack.
  let far = null;
  for (let i = 0; i < 12; i++) {
    await sleep(500);
    far = await read(b.page);
    if (far.n === 1) break;
  }
  check('the placement crosses to the other profile through the relay', far.n === 1, `n=${far.n}`);
  check('and carries the same uid', far.uids.join() === 'p1', far.uids.join());

  check('no page errors on either profile',
    [...a.errors, ...b.errors].length === 0, [...a.errors, ...b.errors].slice(0, 2).join(' | '));

  await a.ctx.close();
  await b.ctx.close();
} catch (err) {
  fails++;
  console.log(`  FAIL ${err.message}`);
} finally {
  await browser.close();
  server.kill();
}

console.log(fails ? `\n${fails} RELAY TEAM CHECK(S) FAILED` : '\nRELAY TEAM CHECKS PASSED');
process.exitCode = fails ? 1 : 0;
