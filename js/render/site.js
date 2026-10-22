// site.js — the fixed context the hotel is judged against: the plot, the arrival
// court, the service yard, the river frontage, the heritage pavilion and the
// landscape. These are facts of the site, not player choices, and they are what
// makes the same footprint score differently in different positions.
import * as THREE from '../../vendor/three/three.module.min.js';
import { SITE, SIGNATURES, LANDSCAPES, PLOTS } from '../sim/catalogue.js';
import { tileToMaterial, tilePlaneUV, footprintCentre, tileConeUV } from './massing.js';
import { hash1 } from './materials.js';

const W = SITE.cols * SITE.cell;   // 48
const D = SITE.rows * SITE.cell;   // 36
const PAD = 5;                     // apron around the buildable plot

export const cellCentre = (col, row) => ({
  x: (col + 0.5) * SITE.cell - W / 2,
  z: (row + 0.5) * SITE.cell - D / 2,
});

/**
 * A point just outside a building's entrance, on the side facing the arrival court.
 * Lives here (not in agents.js) because the paving, the walk routes and the queue all
 * need the same front door: one definition, or paths and people drift apart.
 */
export function doorPoint(p) {
  const c = footprintCentre(p);
  const a = cellCentre(SITE.arrival.col, SITE.arrival.row);
  const dx = a.x - c.x, dz = a.z - c.z;
  const len = Math.hypot(dx, dz) || 1;
  const push = Math.max(p.w, p.h) * SITE.cell * 0.5 + 0.9;
  return new THREE.Vector3(c.x + (dx / len) * push, 0, c.z + (dz / len) * push);
}

function mesh(geo, mat, x = 0, y = 0, z = 0, shadow = true) {
  // Same UV rule as the buildings: without it the plinth and aprons get one tile of
  // paving stretched across the whole site.
  const m = new THREE.Mesh(tileToMaterial(geo, mat), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

/** Rectangle outline as a line loop, used for the plot edge and the yard. */
function rectLine(w, d, mat, y = 0.03) {
  const hw = w / 2, hd = d / 2;
  const pts = [
    new THREE.Vector3(-hw, y, -hd), new THREE.Vector3(hw, y, -hd),
    new THREE.Vector3(hw, y, hd), new THREE.Vector3(-hw, y, hd),
    new THREE.Vector3(-hw, y, -hd),
  ];
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
}

/** The build grid. Only shown while building; hidden for the showcase. */
export function buildGrid(kit) {
  const pts = [];
  for (let c = 0; c <= SITE.cols; c++) {
    const x = c * SITE.cell - W / 2;
    pts.push(new THREE.Vector3(x, 0.02, -D / 2), new THREE.Vector3(x, 0.02, D / 2));
  }
  for (let r = 0; r <= SITE.rows; r++) {
    const z = r * SITE.cell - D / 2;
    pts.push(new THREE.Vector3(-W / 2, 0.02, z), new THREE.Vector3(W / 2, 0.02, z));
  }
  const g = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), kit.gridLine);
  g.name = 'grid';
  return g;
}

/** Ground, river, plot plinth, arrival court, service yard. */
export function buildTerrain(kit) {
  const g = new THREE.Group();
  g.name = 'terrain';

  // Surrounding ground, below the plinth so the plot reads as a model.
  const ground = mesh(new THREE.PlaneGeometry(400, 400), kit.ground, 0, -0.62, 0, false);
  ground.rotation.x = -Math.PI / 2;
  g.add(ground);

  // River along the view edge (east): the reason the east frontage is premium. The
  // revetment and the far bank give the water a real shoreline instead of letting it
  // bleed into the ground plane, and stop two long lines running off the frame.
  //
  // The river gets its OWN tile size (20 m, not the kit's 6 m). At 6 m a 76 x 260 m
  // stretch of water repeats 13 x 43 times, so at the establishing camera every wavelet
  // mips down to a flat average and the canal reads as a sheet of painted card — which
  // is exactly what the review frame showed. Wind lanes want tens of metres.
  const river = new THREE.Mesh(
    tilePlaneUV(new THREE.PlaneGeometry(76, 260), 76, 260, 20),
    kit.water,
  );
  river.position.set(79, -0.5, 0);
  river.rotation.x = -Math.PI / 2;
  river.receiveShadow = true;
  g.add(river);
  g.add(mesh(new THREE.BoxGeometry(10, 0.5, 260), kit.lawn, 36, -0.42, 0, false));
  g.add(mesh(new THREE.BoxGeometry(1.2, 1.2, 260), kit.roofDark, 40.4, -0.35, 0, false));
  g.add(mesh(new THREE.BoxGeometry(6, 0.7, 260), kit.lawn, 119, -0.3, 0, false));

  // The plot: an ivory plinth with a gold edge.
  g.add(mesh(new THREE.BoxGeometry(W + PAD * 2, 0.6, D + PAD * 2), kit.paving, 0, -0.3, 0, false));
  g.add(rectLine(W + PAD * 2 - 0.2, D + PAD * 2 - 0.2, kit.goldLine, 0.012));

  // Arrival court (south): darker apron, driveway, bollards so it reads as a drop-off.
  const a = cellCentre(SITE.arrival.col, SITE.arrival.row);
  g.add(mesh(new THREE.BoxGeometry(SITE.cell * 3.4, 0.12, SITE.cell * 2.6), kit.pavingDark, a.x, 0.06, a.z + 1.2, false));
  g.add(mesh(new THREE.BoxGeometry(SITE.cell * 1.6, 0.14, 14), kit.pavingDark, a.x, 0.07, a.z + 9, false));
  g.add(rectLine(SITE.cell * 3.2, SITE.cell * 2.4, kit.goldLine, 0.14).translateX(a.x).translateZ(a.z + 1.2));
  for (let i = -2; i <= 2; i++) {
    if (i === 0) continue;
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.7, 8), kit.gold, a.x + i * 1.5, 0.35, a.z + 2.6));
  }

  // Service yard (north): utilitarian apron, gate posts, a marked holding area.
  const sv = cellCentre(SITE.service.col, SITE.service.row);
  g.add(mesh(new THREE.BoxGeometry(SITE.cell * 4, 0.12, SITE.cell * 2.2), kit.pavingDark, sv.x, 0.06, sv.z - 1, false));
  g.add(mesh(new THREE.BoxGeometry(SITE.cell * 1.8, 0.14, 12), kit.pavingDark, sv.x, 0.07, sv.z - 8, false));
  for (const dx of [-2.6, 2.6]) {
    g.add(mesh(new THREE.BoxGeometry(0.26, 2.2, 0.26), kit.gold, sv.x + dx, 1.1, sv.z - 2.2));
    g.add(mesh(new THREE.BoxGeometry(0.34, 0.1, 0.34), kit.warm, sv.x + dx, 2.24, sv.z - 2.2));
  }
  g.add(mesh(new THREE.BoxGeometry(5.5, 0.16, 0.2), kit.accent, sv.x, 2.2, sv.z - 2.2));

  return g;
}
/** Grid lines over one owned plot, so the buildable cells are legible on new land. */
function plotGrid(plot, kit) {
  const pts = [];
  const x0 = plot.col * SITE.cell - W / 2, x1 = (plot.col + plot.w) * SITE.cell - W / 2;
  const z0 = plot.row * SITE.cell - D / 2, z1 = (plot.row + plot.h) * SITE.cell - D / 2;
  for (let c = 0; c <= plot.w; c++) {
    const x = x0 + c * SITE.cell;
    pts.push(new THREE.Vector3(x, 0.02, z0), new THREE.Vector3(x, 0.02, z1));
  }
  for (let r = 0; r <= plot.h; r++) {
    const z = z0 + r * SITE.cell;
    pts.push(new THREE.Vector3(x0, 0.02, z), new THREE.Vector3(x1, 0.02, z));
  }
  return new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), kit.gridLine);
}

/**
 * Owned land: the same plinth and gold edge as the main plot, plus its own grid. It has
 * to look like land the hotel owns, not a patch of grass a building happens to stand on.
 */
export function buildPlots(session, kit) {
  const g = new THREE.Group();
  g.name = 'plots';
  for (const plot of (session && session.plots) || []) {
    const w = plot.w * SITE.cell, d = plot.h * SITE.cell;
    const x = (plot.col + plot.w / 2) * SITE.cell - W / 2;
    const z = (plot.row + plot.h / 2) * SITE.cell - D / 2;
    // Top face at y = 0, exactly level with the main plinth. The riverside deck reads
    // as a deck: same level, different paving.
    const deck = plot.id === 'riverside' ? kit.path : kit.paving;
    g.add(mesh(new THREE.BoxGeometry(w + 1.2, 0.6, d + 1.2), deck, x, -0.3, z, false));
    const edge = rectLine(w + 1.0, d + 1.0, kit.goldLine, 0.012);
    edge.position.set(x, 0, z);
    g.add(edge);
    g.add(plotGrid(plot, kit));
  }
  return g;
}

/** Land for sale: dashed outlines only, shown while the Expand site tool is armed. */
export function buildPlotOffers(session, kit) {
  const g = new THREE.Group();
  g.name = 'plotOffers';
  for (const plot of PLOTS) {
    if (((session && session.plots) || []).some((o) => o.id === plot.id)) continue;
    const w = plot.w * SITE.cell, d = plot.h * SITE.cell;
    const x = (plot.col + plot.w / 2) * SITE.cell - W / 2;
    const z = (plot.row + plot.h / 2) * SITE.cell - D / 2;
    const line = rectLine(w + 1.0, d + 1.0, kit.plotOutline, 0.05);
    line.position.set(x, 0, z);
    // Required by LineDashedMaterial: without line distances the dashes collapse.
    line.computeLineDistances();
    g.add(line);
  }
  return g;
}

/**
 * The heritage pavilion. Fixed, protected, and deliberately finer than anything a
 * team can build: it is the thing a plan must respect, not demolish.
 */
export function buildHeritage(kit) {
  const g = new THREE.Group();
  g.name = 'heritage';
  const h = SITE.heritage;
  const c = { x: (h.col + h.w / 2) * SITE.cell - W / 2, z: (h.row + h.h / 2) * SITE.cell - D / 2 };
  const w = h.w * SITE.cell - 1.4;
  const d = h.h * SITE.cell - 1.4;
  const body = 2.4;

  g.add(mesh(new THREE.BoxGeometry(w, 0.3, d), kit.pavingDark, c.x, 0.15, c.z));
  g.add(mesh(new THREE.BoxGeometry(w * 0.78, body, d * 0.78), kit.facadeGuest, c.x, body / 2 + 0.3, c.z));
  // Colonnade on all four sides: this is a pavilion, not a block.
  for (let i = 0; i < 4; i++) {
    const t = -w / 2 + (w / 3) * i;
    g.add(mesh(new THREE.CylinderGeometry(0.15, 0.18, body, 10), kit.paving, c.x + t, body / 2 + 0.3, c.z + d / 2));
    g.add(mesh(new THREE.CylinderGeometry(0.15, 0.18, body, 10), kit.paving, c.x + t, body / 2 + 0.3, c.z - d / 2));
  }
  for (let i = 0; i < 3; i++) {
    const t = -d / 2 + (d / 2) * i;
    g.add(mesh(new THREE.CylinderGeometry(0.15, 0.18, body, 10), kit.paving, c.x + w / 2, body / 2 + 0.3, c.z + t));
    g.add(mesh(new THREE.CylinderGeometry(0.15, 0.18, body, 10), kit.paving, c.x - w / 2, body / 2 + 0.3, c.z + t));
  }
  g.add(mesh(new THREE.BoxGeometry(w + 0.6, 0.24, d + 0.6), kit.gold, c.x, body + 0.42, c.z));
  // Tiled courses plus an eave fascia: a bare cone reads as a tent however good the
  // texture is, and this pavilion is the standard the team's buildings are judged on.
  g.add(mesh(new THREE.BoxGeometry(w * 1.12, 0.14, d * 1.12), kit.roofDark, c.x, body + 0.52, c.z));
  const roof = mesh(tileConeUV(new THREE.ConeGeometry(1, 1, 4), w * 1.06, d * 1.06, 2.1, kit.roofSlate), kit.roofSlate, c.x, body + 1.5, c.z);
  roof.scale.set(w * 0.82, 2.1, d * 0.82);
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.09, 1.1, 6), kit.gold, c.x, body + 3.0, c.z));
  g.add(mesh(new THREE.SphereGeometry(0.16, 10, 8), kit.gold, c.x, body + 3.6, c.z));

  g.traverse((o) => { o.userData.kind = 'heritage'; });
  return g;
}

/**
 * Landscape planting. Positions are deterministic (no Math.random) and confined to
 * cells that are never buildable, so planting can never contradict the simulation.
 */
export function buildLandscape(kit, landscapeId) {
  const g = new THREE.Group();
  g.name = 'landscape';
  const land = LANDSCAPES.find((l) => l.id === landscapeId) || LANDSCAPES[1];
  const spots = [];
  // East frontage promenade, then the west and south margins. The east side gets a
  // second rank so the river frontage reads as a planted promenade rather than a
  // hedge of identical lollipops on one line.
  for (let i = 0; i < land.trees; i++) {
    const t = i / Math.max(1, land.trees - 1);
    if (i % 3 !== 2) {
      spots.push({ x: W / 2 + 3.2, z: -D / 2 + 2 + t * (D - 4), s: 0.95 + (i % 4) * 0.12 });
      if (i % 2 === 0) spots.push({ x: W / 2 + 7.6, z: -D / 2 + 4 + t * (D - 8), s: 1.15 });
    } else if (i % 3 === 2 && i % 2 === 0) {
      spots.push({ x: -W / 2 - 3.2, z: -D / 2 + 3 + t * (D - 6), s: 0.9 + (i % 3) * 0.15 });
    } else {
      spots.push({ x: -W / 2 + 2 + t * (W - 4), z: D / 2 + 3.4, s: 0.85 + (i % 5) * 0.1 });
    }
  }

  // Trees are instanced: one trunk batch and one crown batch, five lobes per tree.
  // The naive version was two meshes per tree — 30+ trees of the same two geometries.
  //
  // Three lobes at +-0.4 of the crown radius overlapped almost completely, so every tree
  // resolved to a single ball on a stick — the most obvious non-photographic element in
  // the wide shot. Five lobes, spread out to the silhouette edge, squashed and rotated
  // independently, give an irregular outline that survives the establishing camera.
  const LOBES = 5;
  const trunkGeo = new THREE.CylinderGeometry(0.10, 0.15, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, kit.trunk, spots.length);
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), kit.foliage, spots.length * LOBES);
  trunks.castShadow = crowns.castShadow = true;
  trunks.receiveShadow = crowns.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  // Instance colour MULTIPLIES the material colour, so these stay near white: the
  // variation is a few percent of lightness, not a second palette. The spread has to be
  // wide enough to break the "row of identical lollipops" read at establishing scale,
  // which four near-white tints were not.
  const TINTS = ['#FFFFFF', '#DDEAE1', '#C9DCD1', '#F4F8F3', '#E8F1E6'];
  let k = 0;
  spots.forEach((sp, i) => {
    const th = 1.6 * sp.s;
    dummy.position.set(sp.x, -0.6, sp.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(sp.s, th, sp.s);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);

    // Offset, radius and squash per lobe. Deterministic per tree so a re-render matches.
    const lobes = [
      [0.00, 1.02, 0.00, 0.72, 1.00],
      [-0.62, 0.80, 0.20, 0.52, 0.86],
      [0.58, 0.84, -0.24, 0.56, 0.90],
      [0.16, 0.62, 0.52, 0.46, 0.82],
      [-0.28, 0.66, -0.50, 0.44, 0.88],
    ];
    for (let li = 0; li < lobes.length; li++) {
      const [dx, dy, dz, r, squash] = lobes[li];
      const j = hash1(i * 17 + li * 5);
      dummy.position.set(sp.x + dx * sp.s, -0.6 + dy * th * 0.62 + th * 0.42, sp.z + dz * sp.s);
      dummy.rotation.set((j - 0.5) * 0.5, (i * 1.7 + li * 2.1) % 6.28, (j - 0.5) * 0.5);
      dummy.scale.set(r * sp.s * (0.9 + j * 0.3), r * sp.s * squash, r * sp.s * (0.9 + (1 - j) * 0.3));
      dummy.updateMatrix();
      crowns.setMatrixAt(k, dummy.matrix);
      tint.set(TINTS[k % TINTS.length]);
      crowns.setColorAt(k, tint);
      k++;
    }
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
  g.add(trunks, crowns);

  // Lamp standards on the plinth margins, clear of every buildable cell. kit.warm is
  // driven by applyDusk, so the promenade lights itself at dusk for free.
  const lamps = [];
  for (let i = 0; i < 5; i++) lamps.push({ x: 26.6, z: -15 + i * 7.5 });
  for (const x of [-20, -12, 6, 14]) lamps.push({ x, z: 20.4 });
  const postGeo = new THREE.CylinderGeometry(0.055, 0.08, 2.4, 6);
  postGeo.translate(0, 1.2, 0);
  const posts = new THREE.InstancedMesh(postGeo, kit.gold, lamps.length);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 8, 6), kit.warm, lamps.length);
  posts.castShadow = true;
  lamps.forEach((l, i) => {
    dummy.position.set(l.x, 0, l.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    posts.setMatrixAt(i, dummy.matrix);
    dummy.position.set(l.x, 2.48, l.z);
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
  });
  posts.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  g.add(posts, heads);

  // Planters along two near margins: the cheapest signal that someone looks after the
  // site, and they break up the long straight edges.
  const pots = [{ x: -16, z: 20.4 }, { x: -8, z: 20.4 }, { x: 2, z: 20.4 }, { x: 10, z: 20.4 }, { x: -26.6, z: -8 }, { x: -26.6, z: 9 }];
  const potGeo = new THREE.CylinderGeometry(0.42, 0.34, 0.5, 10);
  potGeo.translate(0, 0.25, 0);
  const potMesh = new THREE.InstancedMesh(potGeo, kit.pavingDark, pots.length);
  const bushMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.46, 1), kit.foliage, pots.length);
  pots.forEach((p, i) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    potMesh.setMatrixAt(i, dummy.matrix);
    dummy.position.set(p.x, 0.92, p.z);
    dummy.scale.setScalar(0.85 + (i % 3) * 0.12);
    dummy.updateMatrix();
    bushMesh.setMatrixAt(i, dummy.matrix);
  });
  potMesh.instanceMatrix.needsUpdate = true;
  bushMesh.instanceMatrix.needsUpdate = true;
  g.add(potMesh, bushMesh);

  // Benches facing the river: seating is what turns a grass strip into a promenade.
  const seats = [-9, 0, 9];
  const seatMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.52, 0.09, 1.7), kit.trunk, seats.length);
  const legMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.42, 0.08), kit.ink, seats.length * 2);
  seats.forEach((z, i) => {
    dummy.position.set(37.2, 0.02, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    seatMesh.setMatrixAt(i, dummy.matrix);
    for (let e = 0; e < 2; e++) {
      dummy.position.set(37.2, -0.2, z + (e ? 0.7 : -0.7));
      dummy.updateMatrix();
      legMesh.setMatrixAt(i * 2 + e, dummy.matrix);
    }
  });
  seatMesh.instanceMatrix.needsUpdate = true;
  legMesh.instanceMatrix.needsUpdate = true;
  g.add(seatMesh, legMesh);
  return g;
}

/**
 * Paving from the arrival court to every building door, merged into ONE mesh.
 *
 * The routes are the simulation's own front doors (doorPoint), so the paths are
 * evidence of how the site is used rather than decoration drawn on top of it — and a
 * merged strip keeps the whole network at a single draw call.
 */
export function buildPaths(kit, placements) {
  if (!placements || !placements.length) return null;
  const a = cellCentre(SITE.arrival.col, SITE.arrival.row);
  const from = { x: a.x, z: a.z + 1.6 };
  const pos = [], uv = [];
  const HALF = 0.5;
  placements.forEach((p, n) => {
    const d = doorPoint(p);
    const dx = d.x - from.x, dz = d.z - from.z;
    const len = Math.hypot(dx, dz);
    if (len < 1.6) return;
    const nx = (-dz / len) * HALF, nz = (dx / len) * HALF;
    const y = 0.014 + n * 0.0006;   // stack, so converging paths never z-fight
    const v = len / 2.2;
    pos.push(
      from.x - nx, y, from.z - nz, from.x + nx, y, from.z + nz, d.x + nx, y, d.z + nz,
      from.x - nx, y, from.z - nz, d.x + nx, y, d.z + nz, d.x - nx, y, d.z - nz,
    );
    uv.push(0, 0, 1, 0, 1, v, 0, 0, 1, v, 0, v);
  });
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, kit.path);
  m.receiveShadow = true;
  m.userData.kind = 'path';
  return m;
}

/**
 * The team's signature element, sited on the arrival approach so it is the first
 * thing a guest sees. Four genuinely different objects, not four recoloured cubes.
 */
export function buildSignature(kit, signatureId) {
  const g = new THREE.Group();
  g.name = 'signature';
  const a = cellCentre(SITE.arrival.col, SITE.arrival.row);
  const x = a.x - SITE.cell * 2.4;
  const z = a.z + 1.4;
  const sig = SIGNATURES.find((s) => s.id === signatureId) || SIGNATURES[0];

  if (sig.id === 'water') {
    g.add(mesh(new THREE.BoxGeometry(5.2, 0.34, 3.2), kit.pavingDark, x, 0.17, z));
    g.add(mesh(new THREE.BoxGeometry(4.6, 0.2, 2.6), kit.water, x, 0.32, z));
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.BoxGeometry(0.3, 0.5 + i * 0.18, 0.3), kit.gold, x - 1.4 + i * 1.4, 0.4 + i * 0.09, z));
  } else if (sig.id === 'roof') {
    g.add(mesh(new THREE.BoxGeometry(4.6, 2.6, 3.4), kit.facadeGuest, x, 1.3, z));
    g.add(mesh(new THREE.BoxGeometry(5.0, 0.2, 3.8), kit.gold, x, 2.7, z));
    g.add(mesh(new THREE.BoxGeometry(4.2, 0.16, 2.8), kit.lawn, x, 2.86, z));
    for (let i = 0; i < 4; i++) g.add(mesh(new THREE.IcosahedronGeometry(0.42, 0), kit.foliage, x - 1.5 + i * 1.0, 3.2, z + (i % 2 ? 0.8 : -0.8)));
  } else if (sig.id === 'art') {
    g.add(mesh(new THREE.BoxGeometry(5.4, 0.3, 1.0), kit.pavingDark, x, 0.15, z));
    g.add(mesh(new THREE.BoxGeometry(5.0, 3.0, 0.3), kit.ink, x, 1.7, z));
    for (let i = 0; i < 5; i++) g.add(mesh(new THREE.BoxGeometry(0.16, 2.2 - Math.abs(i - 2) * 0.4, 0.1), kit.accent, x - 1.8 + i * 0.9, 1.7, z + 0.2));
    g.add(mesh(new THREE.BoxGeometry(5.2, 0.14, 0.4), kit.gold, x, 3.26, z));
  } else {
    // A lantern court reads as vertical and glowing. It used to be four short posts on
    // a pale slab, which at eye level looked much too close to the water feature.
    g.add(mesh(new THREE.BoxGeometry(5.2, 0.3, 3.6), kit.pavingDark, x, 0.15, z));
    for (let i = 0; i < 6; i++) {
      const px = x - 1.7 + (i % 3) * 1.7;
      const pz = z - 1.0 + Math.floor(i / 3) * 2.0;
      g.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.6, 8), kit.gold, px, 1.95, pz));
      g.add(mesh(new THREE.SphereGeometry(0.42, 12, 10), kit.warm, px, 3.95, pz));
    }
    for (const rz of [-1.0, 1.0]) {
      g.add(mesh(new THREE.BoxGeometry(3.6, 0.08, 0.08), kit.gold, x, 3.62, z + rz));
    }
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.08, 2.0), kit.gold, x - 1.7, 3.62, z));
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.08, 2.0), kit.gold, x + 1.7, 3.62, z));
  }

  g.traverse((o) => { o.userData.kind = 'signature'; });
  return g;
}
