// input-check.mjs — can a human actually USE the thing?
//
// The other gates prove the render is right and the simulation is deterministic. None
// of them proved the pointer reaches the canvas: an invisible full-viewport screen
// stacked over the scene breaks every orbit and every click while every pixel assertion
// still passes. This drives the real app the way a first-time user does — start, pick a
// function, orbit, zoom, click the site, press Reset view — and fails on the first thing
// that does not respond.
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'review');
const PORT = 5207;
const PW = 'C:/Users/clementy/Downloads/email-automation/browser/node_modules/playwright-core';

let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};

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

// Three real window shapes, including a tall external display: "nothing responds" is
// what a layout that overflows at one size looks like.
const VIEWPORTS = [
  { w: 1280, h: 800, tag: 'laptop' },
  { w: 1440, h: 900, tag: 'macbook' },
  { w: 1920, h: 1080, tag: 'desktop' },
];


for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  // A full-frame screenshot of the 1920x1080 scene is rasterised on the CPU and can exceed
  // Playwright's 30 s default when the machine is busy — that surfaced as a screenshot
  // TimeoutError at the end of the desktop pass, not as anything wrong with the app.
  page.setDefaultTimeout(60000);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__hb && window.__hb.view, null, { timeout: 20000 });
  await page.waitForTimeout(600);

  console.log(`\n== ${vp.tag} ${vp.w}x${vp.h} ==`);

  /** What is actually on top at two points in the scene, and which screens are visible. */
  const probe = () => page.evaluate(() => {
    const at = (x, y) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return 'none';
      const cls = el.className && typeof el.className === 'string' ? `.${el.className.split(' ').filter(Boolean).join('.')}` : '';
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls}`;
    };
    const vis = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), pe: cs.pointerEvents };
    };
    return {
      screen: [...document.querySelectorAll('[data-screen]')].filter((s) => !s.hidden).map((s) => s.dataset.screen).join(','),
      centre: at(innerWidth / 2, innerHeight / 2),
      quarter: at(innerWidth * 0.25, innerHeight * 0.3),
      ui: vis(document.getElementById('ui')),
      scroll: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, vw: innerWidth, vh: innerHeight },
    };
  });

  let p = await probe();
  check('lobby is the only screen on boot', p.screen === 'lobby', p.screen);
  // The lobby is meant to be modal, so the scene need not be exposed yet — but its own
  // Start button must be hittable, or the app is dead on arrival.
  const startHit = await page.evaluate(() => {
    const b = document.getElementById('startDemo');
    const r = b.getBoundingClientRect();
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return el ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}` : 'none';
  });
  check('the Start button is hittable', startHit === 'button#startDemo', startHit);
  check('no page scroll (a scrolling page breaks drag and pinch)',
    p.scroll.w <= p.scroll.vw + 1 && p.scroll.h <= p.scroll.vh + 1,
    `${p.scroll.w}x${p.scroll.h} vs ${p.scroll.vw}x${p.scroll.vh}`);
  check('the UI root lets pointer events through', p.ui && p.ui.pe === 'none', p.ui && p.ui.pe);

  // Start demo. If this click does nothing, nothing else can work.
  await page.click('#startDemo');
  await page.waitForTimeout(500);
  p = await probe();
  check('Start demo reaches the design screen', p.screen === 'design', p.screen);

  // Preset -> build. The build screen must let the pointer through to the scene.
  await page.click('#choicesPreset .choice:nth-child(1)');
  await page.waitForTimeout(1400);
  p = await probe();
  check('a preset reaches the build screen', p.screen === 'build', p.screen);
  check('the build screen lets the pointer reach the canvas', p.centre.startsWith('canvas'),
    `centre=${p.centre} quarter=${p.quarter}`);

  // Orbit: a real drag across the middle of the scene must change the camera.
  const theta = () => page.evaluate(() => window.__hb.view.rig.theta);
  const t0 = await theta();
  const cx = Math.round(vp.w / 2), cy = Math.round(vp.h / 2);
  await page.mouse.move(cx - 160, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy + 20, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const t1 = await theta();
  check('dragging orbits the model', Math.abs(t1 - t0) > 0.05, `theta ${t0.toFixed(3)} -> ${t1.toFixed(3)}`);

  // Zoom: wheel over the scene.
  const r0 = await page.evaluate(() => window.__hb.view.rig.radius);
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(400);
  const r1 = await page.evaluate(() => window.__hb.view.rig.radius);
  check('the wheel zooms', Math.abs(r1 - r0) > 1, `radius ${r0.toFixed(1)} -> ${r1.toFixed(1)}`);

  // Reset view.
  await page.click('#btnFit');
  await page.waitForTimeout(800);
  const r2 = await page.evaluate(() => window.__hb.view.rig.radius);
  check('Reset view returns to the establishing frame', Math.abs(r2 - 80) < 12, `radius ${r2.toFixed(1)}`);

  // Pick a function from the tray, then tap the plot to place it. Done on a custom build:
  // a preset spends the whole budget, which correctly disables the tray.
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__hb && window.__hb.view, null, { timeout: 20000 });
  await page.click('#startDemo');
  await page.waitForTimeout(400);
  await page.click('#designContinue');
  await page.waitForTimeout(1400);
  const custom = await page.evaluate(() => ({
    screen: window.__hb.screen,
    budget: window.__hb.SIM.availableBudget(window.__hb.session),
    enabled: document.querySelectorAll('.tray .fn:not([disabled])').length,
  }));
  check('a custom build starts with credits and an enabled tray',
    custom.screen === 'build' && custom.enabled > 0, JSON.stringify(custom));

  const trayBtn = await page.$('.tray .fn:not([disabled])');
  check('the function tray offers at least one enabled function', !!trayBtn);
  if (trayBtn) {
    const label = (await trayBtn.innerText()).split('\n')[0];
    await trayBtn.click();
    await page.waitForTimeout(400);
    const armed = await page.evaluate(() => ({
      pressed: document.querySelector('.tray .fn[aria-pressed="true"]')?.innerText.split('\n')[0] || null,
      hint: document.getElementById('trayHint').textContent.slice(0, 60),
    }));
    check('clicking a function arms it', armed.pressed === label, `${label} -> ${JSON.stringify(armed)}`);

    const before = await page.evaluate(() => window.__hb.session.placements.length);
    // Find points that are BOTH on the canvas and over a buildable cell: the tray sits
    // across the bottom of the frame, so a blind click at 80% height lands on the UI.
    const spots = await page.evaluate(() => {
      const v = window.__hb.view;
      const out = [];
      for (const fy of [0.5, 0.55, 0.6, 0.65, 0.7, 0.45]) {
        for (const fx of [0.5, 0.4, 0.6, 0.3, 0.7]) {
          const x = innerWidth * fx, y = innerHeight * fy;
          const el = document.elementFromPoint(x, y);
          if (!el || el.id !== 'scene') continue;
          const nx = (x / innerWidth) * 2 - 1, ny = -(y / innerHeight) * 2 + 1;
          if (v.groundCell(nx, ny)) out.push({ x: Math.round(x), y: Math.round(y) });
        }
      }
      return out.slice(0, 6);
    });
    check('the plot exposes tappable ground under the pointer', spots.length > 0, `${spots.length} candidate points`);
    let after = before;
    for (const s of spots) {
      await page.mouse.click(s.x, s.y);
      await page.waitForTimeout(500);
      after = await page.evaluate(() => window.__hb.session.placements.length);
      if (after > before) break;
    }
    check('tapping the plot places the armed function', after > before, `${before} -> ${after} placements`);

    // Customisation: the panel must offer real controls, and each must actually change
    // the building it claims to. Shrinking and add-ons are used because they cannot be
    // blocked by a neighbour — the point here is the wiring, not the placement rules.
    const panel = await page.evaluate(() => ({
      visible: !document.getElementById('selectedPanel').hidden,
      groups: [...document.querySelectorAll('#customise .customise-group h3')].map((h) => h.textContent),
      chips: document.querySelectorAll('#customise .chip').length,
    }));
    check('selecting a building opens Customise with its four groups',
      panel.visible && panel.groups.length === 4 && panel.chips >= 10, JSON.stringify(panel));

    const clickChip = (label) => page.evaluate((t) => {
      const b = [...document.querySelectorAll('#customise .chip')].find((x) => x.querySelector('b')?.textContent === t);
      if (!b) return 'missing';
      if (b.disabled) return 'disabled';
      b.click();
      return 'clicked';
    }, label);

    const snapshot = () => page.evaluate(() => {
      const p = window.__hb.session.placements[0];
      return { w: p.w, h: p.h, size: p.size, storeys: p.storeyDelta || 0, addons: [...(p.addons || [])], spent: window.__hb.session.spent };
    });

    const s0 = await snapshot();
    const compact = await clickChip('Compact');
    await page.waitForTimeout(450);
    const s1 = await snapshot();
    check('the Compact size narrows the building and refunds the difference',
      compact === 'clicked' && s1.w < s0.w && s1.spent < s0.spent,
      `${compact} w ${s0.w}->${s1.w}, spent ${s0.spent}->${s1.spent}`);

    // The storey control is a stepper (two .btn buttons), not a chip.
    const taller = await page.evaluate(() => {
      const b = [...document.querySelectorAll('#customise .stepper button')].pop();
      if (!b) return 'missing';
      if (b.disabled) return 'disabled';
      b.click();
      return 'clicked';
    });
    await page.waitForTimeout(450);
    const s2 = await snapshot();
    check('the storey stepper adds a storey', taller === 'clicked' && s2.storeys === s1.storeys + 1,
      `${taller} ${s1.storeys}->${s2.storeys}`);

    const addon = await clickChip('Green Roof');
    await page.waitForTimeout(450);
    const s3 = await snapshot();
    check('an add-on is added and recorded on the building',
      addon === 'clicked' && s3.addons.includes('green'),
      `${addon} ${JSON.stringify(s3.addons)}`);

    const screenOf = (col, row) => page.evaluate(([c, r]) => {
      const v = window.__hb.view;
      const V = v.camera.position.constructor;
      const x = (c + 0.5) * 4 - 24;
      const z = (r + 0.5) * 4 - 18;
      const p = new V(x, 0, z).project(v.camera);
      return { x: Math.round((p.x * 0.5 + 0.5) * innerWidth), y: Math.round((-p.y * 0.5 + 0.5) * innerHeight) };
    }, [col, row]);

    const screenOfPlot = (col0, row0, cols, rows) => page.evaluate(([c0, r0, w, h]) => {
      const v = window.__hb.view;
      const V = v.camera.position.constructor;
      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
          const x = (c0 + c + 0.5) * 4 - 24;
          const z = (r0 + r + 0.5) * 4 - 18;
          const p = new V(x, 0, z).project(v.camera);
          const sx = Math.round((p.x * 0.5 + 0.5) * innerWidth);
          const sy = Math.round((-p.y * 0.5 + 0.5) * innerHeight);
          if (sx < 12 || sy < 12 || sx > innerWidth - 12 || sy > innerHeight - 12) continue;
          const el = document.elementFromPoint(sx, sy);
          if (el && el.id === 'scene') return { x: sx, y: sy };
        }
      }
      return null;
    }, [col0, row0, cols, rows]);

    // --- land: Expand site must show what is for sale, price it, and let the new ground
    // be built on. Credits are topped up first so this measures the flow, not the budget.
    await page.evaluate(() => { window.__hb.session.released += 400; });
    await page.evaluate(() => { const v = window.__hb.view; v.fit(); v.snap(); });
    await page.waitForTimeout(350);
    await page.click('#btnExpand');
    await page.waitForTimeout(400);
    const expand = await page.evaluate(() => ({
      armed: document.getElementById('btnExpand').getAttribute('aria-pressed'),
      offers: !!window.__hb.view.scene.getObjectByName('plotOffers')?.visible,
    }));
    check('Expand site shows the land that is for sale', expand.armed === 'true' && expand.offers, JSON.stringify(expand));

    const westPt = await screenOfPlot(-4, 0, 4, 9);
    check('the West Plot is on screen to tap', !!westPt, westPt ? `${westPt.x},${westPt.y}` : 'off screen');
    await page.mouse.click(westPt.x, westPt.y);
    await page.waitForTimeout(350);
    const quote = await page.evaluate(() => ({
      open: !document.getElementById('plotPanel').hidden,
      label: document.getElementById('plotLabel').textContent,
      note: document.getElementById('plotNote').textContent,
    }));
    check('tapping a dashed plot quotes its price and upkeep',
      quote.open && quote.label === 'West Plot' && /60 credits/.test(quote.note) && /2 upkeep/.test(quote.note),
      JSON.stringify(quote));

    const beforeBuy = await page.evaluate(() => ({
      spent: window.__hb.session.spent,
      radius: window.__hb.view.rig.radius,
    }));
    await page.click('#plotBuy');
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__hb.view.snap());
    const bought = await page.evaluate(() => ({
      plots: window.__hb.session.plots.map((p) => p.id),
      spent: window.__hb.session.spent,
      offers: !!window.__hb.view.scene.getObjectByName('plotOffers')?.visible,
      radius: window.__hb.view.rig.radius,
      tx: window.__hb.view.rig.tx,
      closed: document.getElementById('plotPanel').hidden,
    }));
    check('Buying the West Plot deducts 60 credits and takes it off the market',
      bought.plots.includes('west') && bought.spent === beforeBuy.spent + 60 && bought.closed && !bought.offers,
      JSON.stringify(bought));
    // Frame the owned land, not a fixed radius: fit() solves for a projected fill of 0.78,
    // so the radius it lands on depends on the viewport aspect (80 -> 81.8 at 1280, 61.5 ->
    // 74.2 at 1920). Asserting "radius > 84" therefore failed at every size for a camera
    // that was framing correctly. What must hold is that the shot moved onto the new land
    // and pulled back to take it in.
    check('the camera re-frames on the land the team now owns',
      bought.tx < -1 && bought.radius > beforeBuy.radius * 1.005,
      `tx ${bought.tx.toFixed(1)}, radius ${beforeBuy.radius.toFixed(1)} -> ${bought.radius.toFixed(1)}`);

    const plotTray = await page.$('.tray .fn:not([disabled])');
    await plotTray.click();
    await page.waitForTimeout(300);
    const plotPt = await screenOfPlot(-4, 0, 4, 9);
    check('bought land is on screen to build on', !!plotPt);
    await page.mouse.click(plotPt.x, plotPt.y);
    await page.waitForTimeout(600);
    const onLand = await page.evaluate(() => window.__hb.session.placements.some((p) => p.col < 0));
    check('a building can be placed on bought land', onLand, `${onLand}`);

    // The scene must still own the centre of the screen with the panel open and tall.
    p = await probe();
    check('the canvas stays topmost with Customise open', p.centre.startsWith('canvas'), p.centre);

    await page.screenshot({ path: join(OUT, `30-interaction-${vp.tag}.png`) });

    // ---- manpower: the roster must be reachable and must actually write the session ----
    // A building is selected at this point (its Customise panel is on screen), which is the
    // exact state in which the roster used to be unreachable: the tool flipped a hidden flag,
    // the button still claimed "pressed", and two clicks changed nothing on screen.
    await page.click('#btnManpower');
    await page.waitForTimeout(400);
    const handed = await page.evaluate(() => ({
      roster: !document.getElementById('mpPanel').hidden,
      customise: !document.getElementById('selectedPanel').hidden,
      pressed: document.getElementById('btnManpower').getAttribute('aria-pressed'),
      selected: window.__hb.session.selectedUid,
    }));
    check('the roster tool takes the column over from Customise',
      handed.roster && !handed.customise && handed.selected === null, JSON.stringify(handed));
    check('the tool reports pressed only while the roster is on screen',
      handed.pressed === 'true', handed.pressed);

    await page.click('#btnManpower');
    await page.waitForTimeout(350);
    const off = await page.evaluate(() => ({
      hidden: document.getElementById('mpPanel').hidden,
      pressed: document.getElementById('btnManpower').getAttribute('aria-pressed'),
    }));
    check('the tool toggles the roster off again', off.hidden && off.pressed === 'false', JSON.stringify(off));
    await page.click('#btnManpower');   // reopen for the checks below
    await page.waitForTimeout(350);

    const mp = await page.evaluate(() => {
      const el = document.getElementById('mpPanel');
      const row = document.querySelector('.mp-row');
      const rect = el.getBoundingClientRect();
      return {
        open: !el.hidden && rect.width > 200,
        rows: document.querySelectorAll('.mp-row').length,
        label: row && row.querySelector('.mp-rowhead b').textContent,
        counts: row ? [...row.querySelectorAll('.mp-counts b')].map((b) => Number(b.textContent)) : [],
        total: document.getElementById('mpTotal').textContent,
        tiers: document.querySelectorAll('#mpTraining .chip').length,
      };
    });
    check('the manpower panel opens with one row per cluster',
      mp.open && mp.rows === 4 && mp.tiers === 3, JSON.stringify(mp));
    check('each row states the requirement it was built from',
      mp.label === 'Rooms Division' && mp.counts.length === 2 && mp.counts[0] > 0,
      JSON.stringify(mp));
    check('the roster prices itself in illustrative HK$',
      /^HK\$ [\d,]+$/.test(mp.total), mp.total);

    const needRooms = await page.evaluate(() => window.__hb.SIM.manpowerRequirement(window.__hb.session).rooms);
    await page.click('.mp-step[data-cluster="rooms"][data-step="1"]');
    await page.waitForTimeout(300);
    const over = await page.evaluate(() => ({
      staffing: window.__hb.session.staffing.rooms,
      // Both <b> elements are the last child of their own span, so b:last-child would
      // match the required count. Target the planned span explicitly.
      planned: Number(document.querySelector('.mp-row .mp-counts span:last-child b').textContent),
    }));
    check('the + stepper hires one head into the session',
      over.staffing === needRooms + 1 && over.planned === needRooms + 1,
      JSON.stringify({ needRooms, over }));

    await page.click('.mp-step[data-cluster="rooms"][data-step="-1"]');
    await page.waitForTimeout(350);
    const back = await page.evaluate(() => ({
      staffing: window.__hb.session.staffing.rooms,
      keys: Object.keys(window.__hb.session.staffing),
    }));
    // One step back from need+1 lands exactly on the requirement, and that must DELETE
    // the key: a stored value equal to the requirement would freeze the headcount and
    // break the neutrality guarantee.
    check('stepping back to the requirement leaves the cluster untouched',
      back.staffing === undefined && back.keys.length === 0, JSON.stringify(back));

    await page.click('#mpTraining .chip[data-tier="1"]');
    await page.waitForTimeout(350);
    const trained = await page.evaluate(() => ({
      training: window.__hb.session.training,
      tier: document.querySelector('#mpTraining .chip[aria-pressed="true"] b').textContent,
      total: document.getElementById('mpTotal').textContent,
    }));
    check('choosing a training tier is recorded and priced',
      trained.training === 1 && trained.tier === 'Foundation' && /^HK\$ /.test(trained.total),
      JSON.stringify(trained));

    await page.screenshot({ path: join(OUT, `31-manpower-${vp.tag}.png`) });
  }

  check('no console or page errors while driving the UI', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

// ---- phone and tablet: the roster has to work where a classroom actually is. The panel
// is closed below 1200px (the hotel owns the screen), so on these sizes the ONLY way in is
// the Manpower plan tool — and it must open to a panel whose own steppers are hittable and
// that does not sit under the tray.
for (const [w, h, tag] of [[390, 844, 'phone'], [1024, 768, 'tablet']]) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true, isMobile: tag === 'phone',
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);   // the phone sheet is a full-frame capture too
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__hb && window.__hb.view, null, { timeout: 20000 });
  await page.waitForTimeout(500);

  console.log(`\n== ${tag} ${w}x${h} ==`);

  await page.click('#startDemo');
  await page.waitForTimeout(450);
  await page.click('#choicesPreset .choice:nth-child(1)');
  await page.waitForTimeout(1500);

  const closed = await page.evaluate(() => {
    const btn = document.getElementById('btnManpower').getBoundingClientRect();
    const hit = document.elementFromPoint(btn.x + btn.width / 2, btn.y + btn.height / 2);
    return {
      open: !document.getElementById('mpPanel').hidden,
      buttonHit: hit ? `${hit.tagName.toLowerCase()}${hit.id ? `#${hit.id}` : ''}` : 'none',
    };
  });
  check(`${tag}: the roster starts closed so the hotel owns the screen`, !closed.open);
  check(`${tag}: the Manpower plan tool is hittable`, closed.buttonHit === 'button#btnManpower', closed.buttonHit);

  await page.click('#btnManpower');
  await page.waitForTimeout(450);
  const opened = await page.evaluate(() => {
    const panel = document.getElementById('mpPanel');
    const r = panel.getBoundingClientRect();
    const tray = document.querySelector('.tray-wrap').getBoundingClientRect();
    const btn = document.querySelector('.mp-step[data-cluster="rooms"][data-step="1"]');
    const b = btn ? btn.getBoundingClientRect() : null;
    const hit = b ? document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2) : null;
    return {
      open: !panel.hidden,
      rows: document.querySelectorAll('.mp-row').length,
      inViewport: r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1,
      clearOfTray: r.bottom <= tray.top + 1,
      w: Math.round(r.width),
      panelBottom: Math.round(r.bottom),
      trayTop: Math.round(tray.top),
      stepHit: hit ? `${hit.tagName.toLowerCase()}${hit.className ? `.${String(hit.className).split(' ')[0]}` : ''}` : 'none',
      need: window.__hb.SIM.manpowerRequirement(window.__hb.session).rooms,
      // There must always be a visible way OUT of the roster: the close control on the phone
      // sheet, or the tool button that opened it where the column is not covered.
      exits: ['mpClose', 'btnManpower'].filter((id) => {
        const el = document.getElementById(id);
        if (!el || !el.getClientRects().length) return false;
        const b = el.getBoundingClientRect();
        const at = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
        return at === el || el.contains(at);
      }).length,
    };
  });
  check(`${tag}: the tool opens the roster with every cluster`, opened.open && opened.rows === 4, JSON.stringify(opened));
  check(`${tag}: the roster fits inside the screen`, opened.inViewport, `${opened.w}px wide`);
  check(`${tag}: the roster sits clear of the tray`, opened.clearOfTray,
    `ends ${opened.panelBottom}, tray starts ${opened.trayTop}`);
  check(`${tag}: a stepper in the roster is hittable`, opened.stepHit === 'button.mp-step', opened.stepHit);
  check(`${tag}: the roster always leaves a way out`, opened.exits >= 1, `${opened.exits} exit(s)`);

  await page.click('.mp-step[data-cluster="rooms"][data-step="1"]');
  await page.waitForTimeout(350);
  const written = await page.evaluate(() => window.__hb.session.staffing.rooms);
  check(`${tag}: the stepper writes the session at this size`, written === opened.need + 1,
    `${opened.need} -> ${written}`);

  if (tag === 'phone') {
    // The sheet spans the screen here, so it covers the very tool button that opened it.
    // Without its own way out the roster could be opened and never closed.
    const closable = await page.evaluate(() => {
      const b = document.getElementById('mpClose');
      const r = b.getBoundingClientRect();
      const hit = r.width ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) : null;
      return {
        visible: r.width > 0,
        hit: hit ? `${hit.tagName.toLowerCase()}${hit.id ? `#${hit.id}` : ''}` : 'none',
      };
    });
    check('phone: the sheet carries its own close control', closable.visible, JSON.stringify(closable));
    check('phone: the close control is hittable', closable.hit === 'button#mpClose', closable.hit);

    await page.click('#mpClose');
    await page.waitForTimeout(400);
    const shut = await page.evaluate(() => ({
      hidden: document.getElementById('mpPanel').hidden,
      hotelVisible: document.elementFromPoint(innerWidth / 2, innerHeight * 0.45).tagName.toLowerCase() === 'canvas',
    }));
    check('phone: closing the sheet puts the hotel back', shut.hidden && shut.hotelVisible, JSON.stringify(shut));

    await page.click('#btnManpower');   // reopen, so the frame still shows the roster
    await page.waitForTimeout(400);
  } else {
    const closeHidden = await page.evaluate(() =>
      getComputedStyle(document.getElementById('mpClose')).display === 'none');
    check(`${tag}: no second close control beside a visible tool button`, closeHidden);
  }

  await page.screenshot({ path: join(OUT, `32-manpower-${tag}.png`) });
  check(`${tag}: no console or page errors with the roster open`, errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

await browser.close();
server.kill();
console.log(fails === 0 ? '\nALL INTERACTION CHECKS PASSED' : `\n${fails} INTERACTION CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
