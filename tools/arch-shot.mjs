// arch-shot.mjs — one building archetype, alone, from four fixed cameras.
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
//   3. shoots four fixed cameras — corner, close, facade and roof.
//      Global sun/hemi lighting is retained; missing lights, water or textures fail closed.
//
// Usage: node tools/arch-shot.mjs [massing] [style] [palette] [dusk]
//   massing  rooms | public | kiosk | spa | pool | hall | boh | plant | shed | people
//            (default hall — the largest roof on the plot, so the roof pass has content)
//   style    tower | courtyard | heritage   (default heritage)
//   palette  gold | sage | ember | moon     (default gold)
//   dusk     pass `dusk` to shoot the dusk look
// Frames and machine-readable pre-flight reports land in review/arch-v2/.
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { assertReferenceTextures } from './arch-scene.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// v2 preserves the under-lit historical frames in review/arch untouched.
const OUT = join(ROOT, 'review', 'arch-v2');
const EXPECTED_TEXTURES = (await readdir(join(ROOT, 'assets', 'textures'))).filter((f) => /\.jpg$/i.test(f));
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
    // Shared with arch-check: isolate world content, not unnamed global lights.
    const { isolateArchitecture, architectureBounds, waterVisibility } = await import('/tools/arch-scene.mjs');
    const lights = isolateArchitecture(v);
    const shown = v.world.children.filter((o) => o.visible).map((o) => o.name);
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
    const bounds = architectureBounds(g, p, v.kit);
    const water = waterVisibility(g, v.kit);
    if (['pool', 'spa'].includes(massing) && (!water.length || water.some((x) => !x.visible))) {
      throw new Error(`Water is occluded in ${massing}: ${JSON.stringify(water)}`);
    }
    // Frame solid geometry, excluding the large contact-shadow plane.
    const box = new THREE.Box3(new THREE.Vector3(...bounds.world.min), new THREE.Vector3(...bounds.world.max));
    const size = box.getSize(new THREE.Vector3());
    const ctr = box.getCenter(new THREE.Vector3());
    const span = Math.max(size.x, size.z);
    // Fixed evidence camera parameters may exceed the interactive orbit limits.
    // Framing is based on solid bounds, not the footprint or the contact-shadow decal.
    const cams = [
      { tag: 'corner', radius: clamp(span * 1.15, 11, 40), phi: 0.78, ty: box.max.y * 0.55 },
      { tag: 'close', radius: clamp(span * 0.80, 8, 28), phi: 1.02, ty: box.max.y * 0.40 },
      // Wall-dominated detail camera. Distances are presentation choices, not footprint
      // measurements; authored, local-solid and world-solid dimensions are reported separately.
      // phi 1.48 exceeds the gameplay orbit limit only for this evidence camera.
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
      cams, shown, strays, hid, bounds, lights, water,
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
      if (EXPECTED_TEXTURES.every((name) => tex.loaded.includes(name)) || tex.failed.length) break;
      await page.waitForTimeout(500);
    }
    assertReferenceTextures(tex, EXPECTED_TEXTURES);
    console.log(`  physical plot ${info.bounds.plotMetres.join(' x ')} m; body ${info.bounds.authoredBodyMetres.join(' x ')} m`);
    console.log(`  local solid bounds ${info.bounds.local.size.map((n) => n.toFixed(2)).join(' x ')} m`);
    console.log(`  lights ${JSON.stringify(info.lights)}; water ${JSON.stringify(info.water)}`);
    await writeFile(join(OUT, `${MASSING}-${STYLE}${DUSK ? '-dusk' : ''}.json`), JSON.stringify({ ...info, textures: tex }, null, 2));
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
