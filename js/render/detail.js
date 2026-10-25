// detail.js — shared construction detail. Geometry ONLY: no scoring, no placement, no picking.
//
// Why a separate file: the fidelity plan builds one small set of reusable parts (plinth, eave,
// hip cap, column trim) and applies them across archetypes, instead of hand-writing the same
// box four times in massing.js. The builders are deliberately conservative — they articulate
// what is already there and never change a footprint, a storey count or a roof pitch.
//
// Three rules every builder here follows, each learned from a gate or a defect:
//   1. Nothing is merged across materials. Draw calls are kept flat by INSTANCING repeats
//      (one InstancedMesh per material per building), because visual-check counts
//      accent-coloured meshes and a merged multi-material blob would break its contract.
//   2. Thin trim sets userData.noShadow, which buildMassing's final traverse honours. Without
//      that, a 6 cm band casts a shadow the size of its own bounding box.
//   3. Parts are placed ON the existing geometry (roof base plane, shaft ends). Half of each
//      cap is buried in the seam it sits on, so no cap can float or leave a gap.
import * as THREE from '../../vendor/three/three.module.min.js';

/**
 * Roof trim: the eave fascia, the dark soffit and the hip/ridge capping.
 *
 * Two meshes, not four, because that is what the draw-call budget allows. The soffit and the
 * caps are both boxes in kit.roofDark, so they are ONE InstancedMesh; only the accent fascia
 * needs its own material and therefore its own call. Measured with tools/perf.mjs: splitting
 * them cost +11.8% draw calls on the revenue preset, which breaches the +10% limit, and the
 * limit is a stop condition rather than a preference.
 *
 * `h` is the wall head, i.e. the roof's base plane. `roofW/roofD` are the ROOF's footprint (the
 * caller's own overhang), `roofY` is hipRoof's mesh position and `rise` its height, so the caps
 * land on the real seams. The endpoints mirror hipRoof's construction exactly; a square plan
 * collapses the ridge to an apex, which is correct for pavilions and kiosks.
 */
export function roofDetail(g, { h, roofW, roofD, rise, roofY }, kit, make) {
  const fascia = make.box(roofW + 0.06, 0.10, roofD + 0.06, kit.accent, 0, h - 0.05, 0);
  fascia.userData.noShadow = true;
  g.add(fascia);

  const alongX = roofW >= roofD;
  const W = alongX ? roofW : roofD, D = alongX ? roofD : roofW;
  const hw = W / 2, hd = D / 2;
  const ridge = Math.max(0, hw - hd);
  const y0 = -rise / 2, y1 = rise / 2;
  const seams = [];
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) seams.push([[sx * hw, y0, sz * hd], [sx * ridge, y1, 0]]);
  }
  if (ridge > 0.05) seams.push([[-ridge, y1, 0], [ridge, y1, 0]]);

  const count = seams.length + 1;                     // + the soffit slab
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), kit.roofDark, count);
  const m = new THREE.Matrix4(), pos = new THREE.Vector3(), quat = new THREE.Quaternion();
  const scale = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const CAP = { length: 0.34, width: 0.16, height: 0.13 };   // metres; half buried in the seam
  // Instance 0: the soffit, a thin slab just under the eave so the roof reads as having depth.
  pos.set(0, h - 0.145, 0);
  quat.identity();
  scale.set(roofW - 0.02, 0.07, roofD - 0.02);
  mesh.setMatrixAt(0, m.compose(pos, quat, scale));
  seams.forEach(([from, to], i) => {
    a.set(...from); b.set(...to);
    dir.subVectors(b, a);
    const len = Math.max(dir.length(), 0.05);
    quat.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.normalize());
    pos.addVectors(a, b).multiplyScalar(0.5);
    scale.set(len + CAP.length, CAP.height, CAP.width);
    mesh.setMatrixAt(i + 1, m.compose(pos, quat, scale));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = false;            // thin trim: never worth a shadow-map entry
  mesh.receiveShadow = true;
  mesh.userData.noShadow = true;
  // The seams above are in hipRoof's OWN local space (its base plane is y = -rise/2 around its
  // centre), so the batch must be lifted to wherever the caller placed that roof. Without this
  // the caps would be built correctly and then sit on the ground.
  mesh.position.y = roofY;
  if (!alongX) mesh.rotation.y = Math.PI / 2;   // match hipRoof's own axis convention
  g.add(mesh);
}

/**
 * Base and capital for EXISTING columns, as one instanced batch.
 *
 * `columns` is [{ x, z, base, top, r }] taken from the caller's own column loop, so the count,
 * the spacing and the shaft heights are whatever the archetype already builds — this adds a
 * square plinth and abacus to each shaft and moves nothing. A square plinth under a round shaft
 * is the heritage convention and lets the stone texture tile correctly, which a squashed
 * cylinder ring would not.
 */
export function columnTrim(g, columns, kit, make) {
  if (!columns.length) return;
  const r = columns[0].r;
  const plinthW = r * 3.1, plinthH = 0.11;
  const abacusW = r * 2.9, abacusH = 0.09;
  const geo = make.tile(new THREE.BoxGeometry(plinthW, plinthH, plinthW), kit.paving);
  const mesh = new THREE.InstancedMesh(geo, kit.paving, columns.length * 2);
  const m = new THREE.Matrix4(), pos = new THREE.Vector3(), quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  columns.forEach((c, i) => {
    pos.set(c.x, c.base + plinthH / 2, c.z);
    scale.set(1, 1, 1);
    mesh.setMatrixAt(i * 2, m.compose(pos, quat, scale));
    pos.set(c.x, c.top - abacusH / 2, c.z);
    scale.set(abacusW / plinthW, abacusH / plinthH, abacusW / plinthW);
    mesh.setMatrixAt(i * 2 + 1, m.compose(pos, quat, scale));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = false;            // a 9-11 cm band is not worth a shadow-map entry
  mesh.receiveShadow = true;
  mesh.userData.noShadow = true;
  g.add(mesh);
}
