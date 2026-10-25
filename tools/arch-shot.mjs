// arch-shot.mjs — one building archetype, alone, from three fixed cameras.
//
// Why this exists: the architectural work is judged against FLORA reference renders, and a
// reference is only usable if it shows ONE building. The site-wide framings in shot.mjs show
// the whole hotel, so a FLORA pass over them re-invents the neighbours and the layout along
// with the architecture — which makes the result useless as a target for one archetype's
// detail. This tool therefore:
//   1. builds a preset, then keeps exactly ONE placement of the requested archetype;
//   2. hides everything that is furniture rather than building (grid, plots, offers, ghost,
//      selection, landscape, signature, the heritage pavilion, agents, overlays, glows).
//      Terrain and paving stay, so the building keeps its ground contact and cast shadow;
//   3. shoots three fixed cameras — a 3/4 view, a close 3/4 view and a roof view.
//
// Usage: node tools/arch-shot.mjs [massing] [style] [palette] [dusk]
//   massing  rooms | public | kiosk | spa | pool | hall | boh | plant | shed | people
//            (default hall — the largest roof on the plot, so the roof pass has content)
//   style    tower | courtyard | heritage   (default heritage)
//   palette  gold | sage | ember | moon     (default gold)
//   dusk     pass `dusk` to shoot the dusk look
// Frames land in review/arch/<massing>-<style>-<cam>.png.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'review', 'arch');
const PORT = 5207;
const PW = 'C:/Users/clementy/Downloads/email-automation/browser/node_modules/playwright-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const MASSING = process.argv[2] || 'hall';
const STYLE = process.argv[3] || 'heritage';
const PALETTE = process.argv[4] || 'gold';
const DUSK = process.argv[5] === 'dusk';
// 16:10 and 1600 px wide: enough pixels that a FLORA pass keeps the window and roof detail
// instead of smoothing it away, and one aspect ratio for every archetype so the frames can
// be compared side by side without rescaling.
const VIEW = { width: 1600, height: 1000 };

// Which preset actually contains the archetype. Asking for a massing type the preset lacks
// used to be a silently empty frame, so the mapping is explicit and printed.
const PRESET_FOR = {
  rooms: 'balanced', public: 'balanced', kiosk: 'balanced', boh: 'balanced',
  shed: 'balanced', plant: 'balanced', people: 'balanced',
  hall: 'revenue', spa: 'neglect', pool: 'neglect',
};
const PRESET = PRESET_FOR[MASSING] || 'balanced';

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

  // Build the preset, isolate one placement, hide the furniture, measure the box. All of it
  // in one evaluate so no half-built state can be photographed.
  const info = await page.evaluate(async ([massing, style, palette, dusk, preset]) => {
    const THREE = await import('/vendor/three/three.module.min.js');
    const { FUNCTION_BY_ID } = await import('/js/sim/catalogue.js');
    const sess = window.__hb.session;
    const v = window.__hb.view;
    // Local to the page: the node-side scope is not visible inside this callback.
    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

    const built = window.__hb.SIM.autoBuild(sess, preset);
    sess.style = style;
    sess.palette = palette;
    v.setPalette(palette);
    v.setStyle(style);

    const p = sess.placements.find((x) => (FUNCTION_BY_ID[x.fnId] || {}).massing === massing);
    if (!p) {
      const have = [...new Set(sess.placements.map((x) => (FUNCTION_BY_ID[x.fnId] || {}).massing))];
      return { ok: false, reason: `preset "${preset}" built no ${massing} archetype`, have };
    }

    // A shallow copy, not a mutation: the session keeps its own layout, and rebuild() is
    // handed a session that contains exactly the building under inspection.
    const iso = Object.assign({}, sess, { placements: [p], selectedUid: null });
    v.setGrid(false);
    v.rebuild(iso);
    // Anything that is a tool or a neighbour rather than this building. Set AFTER rebuild,
    // because rebuild re-adds the landscape, the signature and the plots.
    const KEEP = new Set(['world', 'buildings', 'paths', 'terrain']);
    const shown = [];
    for (const holder of [v.scene, v.world]) {
      for (const child of holder.children) {
        if (!KEEP.has(child.name)) child.visible = false;
        else shown.push(child.name);
      }
    }
    v.agents.setVisible(false);
    // Named site furniture that lives INSIDE a group we keep: the service-yard gate is a
    // 2.2 m goalpost on the north apron, and in a one-building frame it is the only other
    // vertical object in shot, which is exactly the thing a reference must not contain.
    const HIDE = ['serviceYard'];
    const hid = [];
    for (const n of HIDE) {
      const o = v.world.getObjectByName(n);
      if (o) { o.visible = false; hid.push(n); }
    }
    if (dusk) v.setDusk(true); else v.setDusk(false);

    const g = v.world.getObjectByName('buildings').children[0];
    const box = new THREE.Box3().setFromObject(g);
    const size = box.getSize(new THREE.Vector3());
    const ctr = box.getCenter(new THREE.Vector3());
    const span = Math.max(size.x, size.z);
    // applyRig() does not clamp the radius, so these can go below the [26, 118] orbit limit
    // the pointer is held to. phi stays inside the pointer's own [0.42, 1.24]. The radii are
    // deliberately tight: a reference frame that is mostly empty paving gives a FLORA pass
    // nothing to work on, and the FLORA pass is the whole point of the frame.
    const cams = [
      { tag: 'corner', radius: clamp(span * 1.15, 11, 40), phi: 0.78, ty: box.max.y * 0.55 },
      { tag: 'close', radius: clamp(span * 0.80, 8, 28), phi: 1.02, ty: box.max.y * 0.40 },
      // Facade-dominated and low. This exists because of a measured failure: in the `close`
      // frame the roof plane fills most of the picture, so when FLORA re-toned the slate the
      // luminance signature moved 0.497 — a structure score that says "different building"
      // about a frame where only the surface changed. A wall-dominated frame puts the layout
      // (window rhythm, wall/paving boundary) back in charge of the signature, so the score
      // measures the building rather than the tone of one plane.
      //
      // Getting that frame took two tries. The first attempt (radius 0.62 span, phi 1.18) was
      // still all roof: at 13 m from centre the camera is INSIDE the footprint radius of a 21 m
      // building, so the near roof edge is metres away and fills the view. It has to stand
      // clear of the building and look along the wall instead, which for a 5 m hall on a 21 m
      // footprint means phi near 1.48 (about 5 degrees above horizontal) and radius near 1.45
      // span, putting the eye at roughly eave height: the wall owns the frame and the roof
      // shows as a shallow band. phi 1.48 is past the pointer's own 1.24 limit, which is fine
      // here only because applyRig() does not clamp.
      //
      // Radius is 1.15 span, not 1.45: a 5 m wall on a 21 m footprint subtends about 15 degrees
      // at 30 m, so a wider stand-off frames mostly sky and paving and the wall ends up a thin
      // band in the middle. At 24 m the facade fills the frame width and the signature is
      // window rhythm and wall/paving boundary, which is the whole point of the frame.
      { tag: 'facade', radius: clamp(span * 1.15, 10, 50), phi: 1.48, ty: box.max.y * 0.45 },
      { tag: 'roof', radius: clamp(span * 1.25, 12, 44), phi: 0.50, ty: box.max.y * 0.95 },
    ];
    // Everything still visible in the frame, so the tool can prove it hid the neighbours
    // rather than merely intending to. A stray object here is a stray object in the
    // reference, and a reference is only worth generating if it shows one building.
    const strays = [];
    for (const name of ['paths', 'terrain']) {
      const o = v.world.getObjectByName(name);
      if (!o) continue;
      const b = new THREE.Box3().setFromObject(o);
      strays.push({ name, children: o.children.length, top: +b.max.y.toFixed(2) });
    }
    v.render();
    document.getElementById('ui').style.display = 'none';
    const toast = document.getElementById('toast');
    if (toast) toast.hidden = true;

    return {
      ok: true, built, fnId: p.fnId, uid: p.uid, col: p.col, row: p.row, w: p.w, h: p.h,
      centre: { x: +ctr.x.toFixed(2), z: +ctr.z.toFixed(2) },
      box: { x: +size.x.toFixed(2), y: +size.y.toFixed(2), z: +size.z.toFixed(2), top: +box.max.y.toFixed(2) },
      cams, shown, strays, hid,
      calls: v.renderer.info.render.calls, triangles: v.renderer.info.render.triangles,
    };
  }, [MASSING, STYLE, PALETTE, DUSK, PRESET]);

  if (!info.ok) {
    console.log(`FAIL ${info.reason}; preset had: ${(info.have || []).join(', ')}`);
    fails++;
  } else {
    // Photographic surface maps arrive after the first frame: never shoot a half-swapped
    // scene. The retries exist because a slow machine can still be decoding them.
    let tex = { loaded: [], failed: [] };
    for (let i = 0; i < 20; i++) {
      tex = await page.evaluate(() => window.__hb.view.texturesReady());
      if (tex.loaded.length >= 8) break;
      await page.waitForTimeout(500);
    }
    console.log(`${MASSING}/${STYLE}/${PALETTE}${DUSK ? '/dusk' : ''} — ${info.fnId} at `
      + `col ${info.col} row ${info.row} (${info.w}x${info.h} cells), ${PRESET} preset built `
      + `${info.built.placed}`);
    console.log(`  size ${info.box.x} x ${info.box.y} x ${info.box.z} m, roof at ${info.box.top} m, `
      + `centre ${info.centre.x}, ${info.centre.z}`);
    console.log(`  textures loaded ${tex.loaded.length}, failed ${tex.failed.length} ${tex.failed.join(' ')}`);
    console.log(`  kept visible: ${info.shown.join(', ')}; hidden inside them: ${info.hid.join(', ') || 'none'}`);
    for (const s of info.strays) console.log(`  ${s.name}: ${s.children} children, top ${s.top} m`);
    console.log(`  draw calls ${info.calls}, triangles ${info.triangles}`);

    for (const cam of info.cams) {
      await page.evaluate((c) => {
        const v = window.__hb.view;
        v.focusOn(c.cx, c.cz, c.radius, c.phi, c.ty);
        v.snap();
      }, { cx: info.centre.x, cz: info.centre.z, radius: cam.radius, phi: cam.phi, ty: cam.ty });
      await page.waitForTimeout(350);
      const file = join(OUT, `${MASSING}-${STYLE}-${cam.tag}${DUSK ? '-dusk' : ''}.png`);
      await writeFile(file, await page.screenshot());
      console.log(`  ${cam.tag.padEnd(6)} radius ${cam.radius.toFixed(1)} phi ${cam.phi} `
        + `ty ${cam.ty.toFixed(1)} -> ${file.replace(ROOT, '.')}`);
    }
    console.log(`  ${errs.length} console errors ${errs.slice(0, 2).join(' | ')}`);
    if (errs.length) fails++;
  }
} catch (err) {
  fails++;
  console.log(`FAIL arch-shot threw: ${err.stack || err.message}`);
} finally {
  await browser.close();
  server.kill();
}

console.log(fails ? `\nARCH SHOT FAILED (${fails})` : '\nARCH SHOT OK');
process.exitCode = fails ? 1 : 0;
