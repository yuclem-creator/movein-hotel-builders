// class-check.mjs — the classroom path, on the devices a pilot actually uses.
//
// The pilot runs on phones and tablets, in a room with no server. This gate drives that
// path end to end: a scanned link (room + team + clock), classroom rules (no starting
// hotels), autosave and resume, the build clock, four rounds, the score code, and the
// board that reads it. A laptop browser cannot tell you whether a phone can finish a
// session; this is the closest a headless run gets.
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { readScoreCode } from '../js/classroom/join.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5201;
const BASE = `http://127.0.0.1:${PORT}`;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PW_DIR = 'C:/Users/clementy/Downloads/email-automation/browser/node_modules/playwright-core';

let fails = 0;
const check = (name, cond, extra = '') => {
  if (cond) console.log(`  ok   ${name}`);
  else { console.log(`  FAIL ${name} ${extra}`); fails++; }
};

const server = spawn(process.execPath, [join(ROOT, 'serve.js')], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((r) => setTimeout(r, 700));

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

// The tablet frame renders at 1x. Nothing this gate measures — tray clipping, hit targets,
// scroll width, the score code's position above the fold — depends on device pixel ratio:
// they are all CSS pixels. What dpr 2 does buy is four times the rasterisation, and this gate
// renders in software (SwiftShader, see the launch args below). Measured on this machine at
// 1024x768: dpr 1 gives ~2.1 fps and acknowledges a tray click in 1.2 s; dpr 2 gives ~0.1 fps
// and acknowledged the same click in 3.8 s once and 37.9 s on a loaded machine. The 30 s action
// timeout then fails on a step whose element is topmost, unanimated and unobstructed — a gate
// failing on rasteriser throughput, not on the classroom path. Phones keep 2x: their backing
// store is small enough that it never showed this.
const VIEWPORTS = [
  { label: 'phone portrait', viewport: { width: 390, height: 844 }, touch: true, dpr: 2 },
  { label: 'phone landscape', viewport: { width: 844, height: 390 }, touch: true, dpr: 2 },
  { label: 'tablet 1024x768', viewport: { width: 1024, height: 768 }, touch: true, dpr: 1 },
];

async function newPage(vp) {
  const ctx = await browser.newContext({
    viewport: vp.viewport,
    deviceScaleFactor: vp.dpr,
    isMobile: vp.touch,
    hasTouch: vp.touch,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  // A latency margin, not a loosened assertion. This renderer is software and shared, so an
  // action can queue behind frames for seconds (see the dpr note above); 45 s is far past
  // anything the product does, so a real hang still fails the gate.
  page.setDefaultTimeout(45000);
  return { ctx, page, errors };
}

const joinPath = (team) => `${BASE}/?room=HB24&team=${encodeURIComponent(team)}&mins=1`;

try {
  /* ------------------------------------------------- layout at three sizes */
  for (const vp of VIEWPORTS) {
    console.log(`== ${vp.label}: join, classroom rules, clock, layout ==`);
    const { ctx, page, errors } = await newPage(vp);
    await page.goto(joinPath('Blue Team'), { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => window.__hb && window.__hb.view, null, { timeout: 20000 });
    await page.waitForTimeout(700);

    const lobby = await page.evaluate(() => ({
      screen: window.__hb.screen,
      classroom: window.__hb.join.classroom,
      room: window.__hb.join.room,
      team: window.__hb.join.team,
      minutes: window.__hb.join.minutes,
      chip: !document.querySelector('#classChip').hidden,
      details: document.querySelector('#joinDetails').hidden,
      teamValue: document.querySelector('#teamName').value,
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    check(`${vp.label}: joined the room from the URL`, lobby.classroom && lobby.room === 'HB24'
      && lobby.team === 'Blue Team' && lobby.minutes === 1, JSON.stringify(lobby));
    check(`${vp.label}: lobby shows the room and pre-fills the team`,
      lobby.chip && lobby.details && lobby.teamValue === 'Blue Team', JSON.stringify(lobby));
    check(`${vp.label}: lobby does not scroll sideways`, lobby.scrollW <= lobby.clientW + 1,
      `${lobby.scrollW} vs ${lobby.clientW}`);

    await page.click('#startDemo');
    await page.waitForTimeout(400);
    const design = await page.evaluate(() => ({
      screen: window.__hb.screen,
      presetsHidden: document.querySelector('#presetBlock').hidden,
      noteShown: !document.querySelector('#classroomNote').hidden,
    }));
    check(`${vp.label}: a classroom session hides starting hotels and the sandbox`,
      design.screen === 'design' && design.presetsHidden && design.noteShown, JSON.stringify(design));

    await page.click('#designContinue');
    await page.waitForTimeout(900);
    const build = await page.evaluate(() => {
      const clock = document.querySelector('#clock');
      const rect = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) };
      };
      return {
        screen: window.__hb.screen,
        clockHidden: clock.hidden,
        clockText: document.getElementById('clockValue').textContent,
        clockState: clock.dataset.state,
        tray: rect('#tray'),
        run: rect('#btnRun'),
        vw: innerWidth,
        vh: innerHeight,
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      };
    });
    check(`${vp.label}: the build clock starts with the round`,
      build.screen === 'build' && !build.clockHidden && build.clockState === 'running'
      && /^0?1:00$|^0:5\d$/.test(build.clockText), JSON.stringify(build));
    check(`${vp.label}: the tray and the run button stay on screen`,
      build.tray && build.run && build.tray.right <= build.vw + 1 && build.run.right <= build.vw + 1
      && build.tray.bottom <= build.vh + 1 && build.run.bottom <= build.vh + 1,
      JSON.stringify({ tray: build.tray, run: build.run, vh: build.vh }));

    // A tray that fits the viewport can still clip its own contents: at 1024x768 the
    // wrapped third row used to disappear behind the 170px cap, and the Run button sat
    // over it. Measure the CARDS against the tray's box, not the tray against the screen.
    const clip = await page.evaluate(() => {
      const tray = document.querySelector('#tray');
      const t = tray.getBoundingClientRect();
      const buttons = [...tray.querySelectorAll('.fn')];
      const hidden = buttons.filter((b) => {
        const r = b.getBoundingClientRect();
        return r.top < t.top - 1 || r.bottom > t.bottom + 1;
      }).map((b) => b.querySelector('b').textContent);
      const run = document.querySelector('#btnRun').getBoundingClientRect();
      return { hidden, overlap: run.top < t.bottom - 1, count: buttons.length };
    });
    check(`${vp.label}: all 20 function cards are fully visible in the tray`,
      clip.count === 20 && clip.hidden.length === 0, JSON.stringify(clip));
    check(`${vp.label}: the Run button does not cover the tray`, !clip.overlap, JSON.stringify(clip));
    check(`${vp.label}: the build screen does not scroll sideways`,
      build.scrollW <= build.clientW + 1, `${build.scrollW} vs ${build.clientW}`);

    // A 1 s interval can slip under a starved renderer, so poll for the change rather than
    // sampling once, and require the number to actually fall — "differs" would also pass on
    // a clock that jumped forward or re-rendered.
    const startSec = await page.evaluate(() => {
      const [m, s] = document.getElementById('clockValue').textContent.trim().split(':').map(Number);
      return m * 60 + s;
    });
    const ticked = await page.waitForFunction((from) => {
      const [m, s] = document.getElementById('clockValue').textContent.trim().split(':').map(Number);
      return m * 60 + s < from;
    }, startSec, { timeout: 8000 }).then(() => true).catch(() => false);
    const nowSec = await page.evaluate(() => {
      const [m, s] = document.getElementById('clockValue').textContent.trim().split(':').map(Number);
      return m * 60 + s;
    });
    check(`${vp.label}: the clock counts down`, ticked, `${startSec}s -> ${nowSec}s`);

    check(`${vp.label}: no console or network errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  /* ------------------------------- full flow: place, save, resume, score code */
  console.log('== tablet: build, autosave, resume, four rounds, score code ==');
  const { ctx, page, errors } = await newPage(VIEWPORTS[2]);
  await page.goto(joinPath('Blue Team'), { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.__hb && window.__hb.view, null, { timeout: 20000 });
  await page.click('#startDemo');
  await page.waitForTimeout(400);
  await page.click('#designContinue');
  await page.waitForTimeout(1200);

  // Place two functions through the real UI, the way a team would.
  for (let n = 0; n < 2; n++) {
    const btn = await page.$('.tray .fn:not([disabled])');
    if (!btn) break;
    await btn.click();
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => window.__hb.session.placements.length);
    const spots = await page.evaluate(() => {
      const v = window.__hb.view;
      const out = [];
      for (const fy of [0.5, 0.55, 0.6, 0.65, 0.45]) {
        for (const fx of [0.5, 0.4, 0.6, 0.3, 0.7]) {
          const x = innerWidth * fx;
          const y = innerHeight * fy;
          const el = document.elementFromPoint(x, y);
          if (!el || el.id !== 'scene') continue;
          const nx = (x / innerWidth) * 2 - 1;
          const ny = -(y / innerHeight) * 2 + 1;
          if (v.groundCell(nx, ny)) out.push({ x: Math.round(x), y: Math.round(y) });
        }
      }
      return out.slice(0, 6);
    });
    for (const s of spots) {
      await page.mouse.click(s.x, s.y);
      await page.waitForTimeout(400);
      if (await page.evaluate(() => window.__hb.session.placements.length) > before) break;
    }
  }

  const placed = await page.evaluate(() => window.__hb.session.placements.length);
  check('a team can place functions on a tablet sized viewport', placed >= 1, `${placed} placed`);

  await page.waitForTimeout(900);   // the autosave is throttled by design
  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem('hb.v2.save.HB24.blue-team');
    return { exists: Boolean(raw), n: raw ? JSON.parse(raw).session.placements.length : -1 };
  });
  check('autosave writes the team slot with the placements',
    saved.exists && saved.n === placed, JSON.stringify(saved));

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__hb && window.__hb.view, null, { timeout: 20000 });
  await page.waitForTimeout(700);
  const offered = await page.evaluate(() => ({
    shown: !document.querySelector('#resumeCard').hidden,
    line: document.querySelector('#resumeLine').textContent,
  }));
  check('a reload offers the saved session back', offered.shown && /round 1/.test(offered.line),
    JSON.stringify(offered));

  await page.click('#resumeGo');
  await page.waitForTimeout(1500);
  const resumed = await page.evaluate(() => ({
    screen: window.__hb.screen,
    n: window.__hb.session.placements.length,
    round: window.__hb.session.round,
  }));
  check('resume restores the hotel and the round',
    resumed.screen === 'build' && resumed.n === placed && resumed.round === 1, JSON.stringify(resumed));

  for (let round = 1; round <= 4; round++) {
    await page.click('#btnRun');
    await page.waitForFunction(() => window.__hb.screen === 'result', null, { timeout: 15000 });
    await page.waitForTimeout(400);
    const next = await page.evaluate(() => document.querySelector('#resNext').textContent);
    check(`round ${round} scores and offers the next step`,
      round === 4 ? /See your hotel/.test(next) : new RegExp(`round ${round + 1}`).test(next), next);
    await page.click('#resNext');
    if (round < 4) {
      await page.waitForFunction(() => window.__hb.screen === 'build', null, { timeout: 15000 });
      await page.waitForTimeout(300);
    }
  }

  await page.waitForFunction(() => window.__hb.screen === 'showcase', null, { timeout: 20000 });
  await page.click('#btnSkipShowcase');
  await page.waitForFunction(() => window.__hb.screen === 'reveal', null, { timeout: 20000 });

  const code = await page.evaluate(() => document.querySelector('#codeValue').value);
  const parsed = readScoreCode(code);
  check('the reveal prints a readable score code', parsed !== null, code.slice(0, 28));

  // The code is the hand-in artifact: a team must not have to hunt for it below two
  // screens of scorecard. It sits under the composite, so assert it is on the first
  // screen at tablet size, copy button included.
  const fold = await page.evaluate(() => {
    const box = (sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom) };
    };
    return { code: box('#codeValue'), copy: box('#codeCopy'), vh: innerHeight };
  });
  check('the score code and Copy sit on the first screen of the reveal',
    fold.code.top >= 0 && fold.code.bottom <= fold.vh && fold.copy.bottom <= fold.vh,
    JSON.stringify(fold));

  // The card still carries the round-by-round breakdown below the fold, and a tablet draws
  // no scrollbar. class-check asserts the cue is wired and sits above the text (position:
  // sticky on .card::after, toggled by main.js), so a stylesheet edit cannot quietly turn a
  // sliced line back into the only hint that there is more.
  //
  // Transitions are switched off before measuring. This gate renders in software, and here a
  // 140 ms fade was measured taking 5.8 s of wall clock — a timing-based assertion would be
  // flaky for a reason that has nothing to do with the product. With transitions off,
  // getComputedStyle reports the cascade's intended value, which is what the gate is about.
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
  await page.waitForTimeout(50);

  const cue = await page.evaluate(() => {
    const el = document.querySelector('#revealCard');
    const after = getComputedStyle(el, '::after');
    return {
      scrolls: el.scrollHeight > el.clientHeight + 4,
      overflowY: getComputedStyle(el).overflowY,
      marked: el.classList.contains('is-more'),
      sticky: after.position,
      fade: after.backgroundImage.includes('gradient'),
      opacity: Number(after.opacity),
      geometry: [el.scrollTop, el.clientHeight, el.scrollHeight],
    };
  });
  check('a reveal that scrolls says so (a sticky fade, not a sliced line)',
    cue.scrolls && cue.overflowY === 'auto' && cue.marked && cue.sticky === 'sticky'
    && cue.fade && cue.opacity > 0.5,
    JSON.stringify(cue));

  // Evidence on demand: HB_SHOTS=1 node tools/class-check.mjs rewrites the tablet frame
  // without a throwaway screenshot script. Off by default — a gate should not write.
  if (process.env.HB_SHOTS === '1') {
    await writeFile(join(ROOT, 'review', '75-class-reveal-tablet.png'), await page.screenshot());
  }

  // At the end of the card the cue must retire: a fade that stays put at the bottom of a
  // finished list hides the last line of the scorecard it was pointing at. Scroll the way the
  // browser does and let the app's own handler see the event — real wheel input never reaches
  // this page (the renderer is starved, measured above), and scrolling a container to its end
  // is the state that matters, not the gesture that got it there.
  await page.evaluate(() => {
    const el = document.querySelector('#revealCard');
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(120);
  const tail = await page.evaluate(() => {
    const el = document.querySelector('#revealCard');
    return {
      geometry: [el.scrollTop, el.clientHeight, el.scrollHeight],
      marked: el.classList.contains('is-more'),
      opacity: Number(getComputedStyle(el, '::after').opacity),
    };
  });
  check('the fade retires at the end of the card',
    tail.geometry[0] + tail.geometry[1] >= tail.geometry[2] - 8 && !tail.marked && tail.opacity < 0.5,
    JSON.stringify(tail));

  const engine = await page.evaluate(() => ({
    composite: window.__hb.session.history[3].composite,
    metrics: window.__hb.session.history[3].metrics,
    placements: window.__hb.session.placements.length,
  }));
  check('the code matches the session it came from',
    parsed && parsed.composite === engine.composite && parsed.metrics.fan === engine.metrics.fan
    && parsed.placements === engine.placements,
    JSON.stringify({ parsed, engine }));
  check('the played-through session still has its save',
    await page.evaluate(() => Boolean(localStorage.getItem('hb.v2.save.HB24.blue-team'))));

  /* ------------------------------------------------------- facilitator board */
  console.log('== facilitator board: join cards and the ranking ==');
  await page.goto(`${BASE}/board.html`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(700);
  const cards = await page.evaluate(() => ({
    n: document.querySelectorAll('#cards .card').length,
    svg: document.querySelectorAll('#cards svg').length,
    link: document.querySelector('#cards .card .link')?.textContent || '',
    room: document.querySelector('#cards .card .code')?.textContent || '',
  }));
  check('the board prints one join card per team', cards.n === 6 && cards.svg === 6, JSON.stringify(cards));
  check('each card carries room, team and clock in its link',
    cards.link.includes('room=HB24') && cards.link.includes('team=') && cards.link.includes('mins=8')
    && cards.room === 'HB24', cards.link);

  // A card built from 127.0.0.1 scans perfectly and opens nothing: on a phone that address is
  // the phone. The board must either adopt the laptop's network address or say plainly that
  // these cards are laptop-only. Silence is the one outcome that wastes a session.
  const lan = await fetch(`${BASE}/__lan`).then((r) => r.json()).catch(() => null);
  check('the dev server offers a phone-reachable address',
    Boolean(lan) && Number.isFinite(lan.port) && Array.isArray(lan.lan), JSON.stringify(lan));
  await page.waitForTimeout(400);   // the adoption is a request, not a render
  const reach = await page.evaluate(() => ({
    link: document.querySelector('#cards .card .link')?.textContent || '',
    foot: document.querySelector('#cardsFoot').textContent,
  }));
  const offline = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(reach.link);
  const share = lan && typeof lan.share === 'string' && lan.share ? lan.share.replace(/\/$/, '') : '';
  check('join cards point somewhere a phone can open',
    lan && lan.lan.length
      ? !offline && (share ? reach.link.startsWith(share) : reach.link.includes(lan.lan[0]))
      : offline && /point at this laptop/.test(reach.foot),
    JSON.stringify({ link: reach.link, lan: lan && lan.lan, share, foot: reach.foot.slice(0, 60) }));

  // The facilitator types the names today and reloads the page tomorrow. The names are
  // their own work, so they must come back with the cards that carry them — room, team
  // count and clock already did.
  await page.fill('#names', 'Blue Team\nGreen\nGold');
  await page.dispatchEvent('#names', 'change');
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(600);
  const named = await page.evaluate(() => ({
    names: document.querySelector('#names').value,
    first: document.querySelector('#cards .card b')?.textContent || '',
    n: document.querySelectorAll('#cards .card').length,
  }));
  check('join-card team names survive a reload',
    named.names.split('\n').filter(Boolean).length === 3 && named.first === 'Blue Team' && named.n === 6,
    JSON.stringify(named));

  await page.click('#tabBoard');
  await page.fill('#paste', `${code}\nthis-is-not-a-code`);
  await page.click('#addCodes');
  await page.waitForTimeout(400);
  const board = await page.evaluate(() => ({
    rows: document.querySelectorAll('#boardBody tr').length,
    team: document.querySelector('#boardBody tr .team b')?.textContent || '',
    comp: Number(document.querySelector('#boardBody tr .comp')?.textContent || NaN),
  }));
  check('a pasted score code lands on the board with the right team',
    board.rows === 1 && board.team === 'Blue Team', JSON.stringify(board));
  check('the board shows the composite the team saw', board.comp === engine.composite,
    `${board.comp} vs ${engine.composite}`);

  await page.fill('#paste', code);
  await page.click('#addCodes');
  await page.waitForTimeout(400);
  const dedupe = await page.evaluate(() => ({
    rows: document.querySelectorAll('#boardBody tr').length,
    note: document.querySelector('#boardFoot').textContent,
  }));
  check('re-pasting a code does not duplicate the team', dedupe.rows === 1, JSON.stringify(dedupe));
  check('board page: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  await ctx.close();
} catch (err) {
  fails++;
  console.log(`  FAIL the classroom flow threw: ${err.message}`);
} finally {
  await browser.close();
  server.kill();
}

console.log(fails ? `\n${fails} CLASSROOM CHECK FAILURE(S)` : '\nCLASSROOM CHECKS PASSED');
process.exitCode = fails ? 1 : 0;
