// Geometry/pre-flight regression checks: no browser, no synthetic screenshots, no score changes.
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.min.js';
import { buildMassing } from '../js/render/massing.js';
import { FUNCTION_BY_ID } from '../js/sim/catalogue.js';
import { isolateArchitecture, assertArchitectureLighting, assertReferenceTextures, architectureBounds, waterVisibility } from './arch-scene.mjs';
let fails = 0, checks = 0;
function check(name, action) {
  checks++;
  try { action(); console.log(`ok ${name}`); }
  catch (e) { fails++; console.error(`FAIL ${name}: ${e.message}`); }
}
const scene = new THREE.Scene(), world = new THREE.Group();
world.name = 'world'; scene.add(world);
const sun = new THREE.DirectionalLight(0xffffff, 4.3), hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 0.4);
scene.add(sun, hemi, sun.target, new THREE.PointLight());
for (const name of ['buildings', 'terrain', 'paths', 'landscape', 'ghost']) {
  const g = new THREE.Group(); g.name = name; world.add(g);
}
check('isolation keeps unnamed sun/hemi, hides furniture', () => {
  const lights = isolateArchitecture({ scene, world });
  assert.equal(lights.length, 2);
  assert.ok(sun.visible && hemi.visible);
  assert.equal(world.getObjectByName('landscape').visible, false);
  assert.equal(world.getObjectByName('ghost').visible, false);
  assert.equal(world.getObjectByName('buildings').visible, true);
  assert.equal(scene.children.find((o) => o.isPointLight).visible, false);
});
check('missing or hidden lighting fails closed', () => {
  sun.visible = false;
  assert.throws(() => assertArchitectureLighting(scene), /DirectionalLight/);
  sun.visible = true;
});
check('missing or failed texture fails closed', () => {
  assert.throws(() => assertReferenceTextures({ loaded: [], failed: [] }, ['slate.jpg']), /incomplete/);
  assert.throws(() => assertReferenceTextures({ loaded: ['slate.jpg'], failed: ['x'] }, ['slate.jpg']), /incomplete/);
  assertReferenceTextures({ loaded: ['slate.jpg'], failed: [] }, ['slate.jpg']);
});
// Untextured kit substitutes only the materials: production geometry and raycasting run unchanged.
const materials = new Map();
const kit = new Proxy({}, { get: (_, name) => {
  if (name === 'makeFacade') return () => new THREE.MeshStandardMaterial();
  if (!materials.has(name)) { const m = new THREE.MeshStandardMaterial(); m.name = String(name); materials.set(name, m); }
  return materials.get(name);
} });
for (const style of ['heritage', 'courtyard', 'tower']) {
  for (const fnId of ['pool', 'spa']) {
    for (const swapped of [false, true]) {
      // Real placement geometry, not a reimplementation of the slab calculation.
      const fn = FUNCTION_BY_ID[fnId];
      const placement = { uid: `${fnId}-${style}`, fnId, col: 4, row: 3, w: swapped ? fn.h : fn.w, h: swapped ? fn.w : fn.h, addons: [] };
      const before = JSON.stringify(placement);
      const g = buildMassing(placement, style, kit);
      check(`${fnId}/${style}/${swapped ? 'swapped' : 'normal'} water remains exposed`, () => {
        const probes = waterVisibility(g, kit);
        assert.equal(probes.length, 1);
        assert.ok(probes.every((p) => p.visible), JSON.stringify(probes));
      });
      check(`${fnId}/${style}/${swapped ? 'swapped' : 'normal'} placement unchanged, bounds exclude contact`, () => {
        assert.equal(JSON.stringify(placement), before);
        const b = architectureBounds(g, placement, kit);
        assert.deepEqual(b.plotMetres, [placement.w * 4, placement.h * 4]);
        assert.ok(b.local.size[0] < placement.w * 4 + 1);
        assert.equal(g.userData.uid, placement.uid);
      });
      g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
  }
}
// Roof trim must sit UNDER the roof it belongs to. This is the regression test for a real defect:
// the soffit was first built in the roof's local frame but the batch was lifted to the roof's
// position, so a full-footprint slab ended up ABOVE the hall roof. Every other check passed it
// (bounds, lighting, water, picking) — a floating slab is geometrically legal and visually absurd,
// which is precisely why it needs an assertion rather than a reviewer's eye.
for (const [style, fnId] of [['heritage', 'rooms'], ['heritage', 'front'], ['heritage', 'ballroom']]) {
  const fn = FUNCTION_BY_ID[fnId];
  const placement = { uid: `${fnId}-trim`, fnId, col: 4, row: 3, w: fn.w, h: fn.h, addons: [] };
  const g = buildMassing(placement, style, kit);
  check(`${fnId}/${style} roof trim stays under the roof`, () => {
    g.updateMatrixWorld(true);
    let roofTop = -Infinity, trimTop = -Infinity, soffitY = null;
    const box = new THREE.Box3(), world = new THREE.Matrix4(), instance = new THREE.Matrix4();
    g.traverse((o) => {
      if (!o.isMesh) return;
      const isTrim = o.userData.noShadow === true && o.isInstancedMesh && o.material === kit.roofDark;
      if (o.material === kit.roofSlate) {
        o.geometry.computeBoundingBox();
        roofTop = Math.max(roofTop, box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld).max.y);
      }
      if (isTrim) {
        o.geometry.computeBoundingBox();
        trimTop = Math.max(trimTop, box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld).max.y);
        // Instance 0 is the soffit: its centre must be below the wall head, not above the roof.
        o.getMatrixAt(0, instance);
        soffitY = new THREE.Vector3().setFromMatrixPosition(world.multiplyMatrices(o.matrixWorld, instance)).y;
      }
    });
    assert.ok(Number.isFinite(roofTop) && Number.isFinite(trimTop), 'expected both a hip roof and roof trim');
    assert.ok(soffitY !== null, 'expected an instanced trim batch');
    assert.ok(trimTop <= roofTop + 0.02, `trim rises above the roof: trim ${trimTop.toFixed(2)} vs roof ${roofTop.toFixed(2)}`);
    assert.ok(soffitY < roofTop - 0.1, `soffit is not under the roof: ${soffitY.toFixed(2)}`);
  });
  g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
}
console.log(`${checks - fails}/${checks} ARCH CHECKS PASSED`);
process.exitCode = fails ? 1 : 0;
