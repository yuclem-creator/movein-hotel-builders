// massing.js — procedural architecture. Three styles produce three genuinely
// different silhouettes (not recoloured boxes), and every function archetype has
// its own shape so a plan reads at a glance: kitchen is a kitchen, plant is plant.
// Nothing is modelled offline; everything is generated from the placement data.
import * as THREE from '../../vendor/three/three.module.min.js';
import { FUNCTION_BY_ID, SITE } from '../sim/catalogue.js';
import { storeysFor } from '../sim/engine.js';
import { roofDetail, columnTrim } from './detail.js';

const C = SITE.cell;
const FLOOR = 1.5;
const MARGIN = 0.5; // gap between a footprint and the plot boundary

/** World size of one facade texture tile: the texture carries four storeys. */
const FACADE_TILE = 4 * FLOOR;

/**
 * Tile a BoxGeometry to match the material's declared world tile size. Exposed so
 * site.js applies the identical rule to the plinth, aprons and heritage pavilion —
 * if the two files disagree, paving and elevations tile at different scales.
 */
export function tileToMaterial(geo, mat) {
  if (!mat || !mat.map || !geo) return geo;
  const p = geo.parameters;
  const tile = (mat.userData && mat.userData.tileWorld) || FACADE_TILE;
  if (geo.type === 'BoxGeometry') return tileBoxUV(geo, p.width, p.height, p.depth, tile);
  // Ground, river and the arrival apron are planes: one 400-unit ground plane with a
  // single 0..1 UV would stretch one gravel tile across the whole horizon.
  if (geo.type === 'PlaneGeometry') return tilePlaneUV(geo, p.width, p.height, tile);
  return geo;
}

/** Rescale a PlaneGeometry's UVs into world/tile units, pairing with RepeatWrapping. */
export function tilePlaneUV(geo, w, h, tile = FACADE_TILE) {
  const uv = geo.attributes && geo.attributes.uv;
  if (!uv) return geo;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * h) / tile);
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * Rescale a BoxGeometry's UVs from 0..1-per-face into world/tile units, which pairs
 * with RepeatWrapping to give every face the same real-world texture scale whatever
 * the building's dimensions. BoxGeometry lays out four vertices per face in
 * px, nx, py, ny, pz, nz order.
 *
 * Without this, a facade gets ONE window stretched over its entire elevation — which
 * is the difference between a building and a coloured box.
 */
export function tileBoxUV(geo, w, h, d, tile = FACADE_TILE) {
  const uv = geo.attributes && geo.attributes.uv;
  if (!uv) return geo;
  const perFace = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6 && f * 4 < uv.count; f++) {
    const [su, sv] = perFace[f];
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      if (idx >= uv.count) break;
      uv.setXY(idx, uv.getX(idx) * su / tile, uv.getY(idx) * sv / tile);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * Any material carrying a texture declares its world tile size, so paving tiles as
 * paving and facades tile as elevations. Materials without a map need no UV work.
 */
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const geo = tileToMaterial(new THREE.BoxGeometry(w, h, d), mat);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(rt, rb, h, seg, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * Scale a pitched roof's UVs to world units. A ConeGeometry's UVs run 0..1 around the
 * perimeter and 0..1 base-to-apex, so a 3 m pavilion and a 14 m ballroom were given the
 * SAME number of tile courses: the big roof stretched its texture until the courses
 * vanished and it read as a corrugated lid. This is the cone equivalent of the box rule
 * in tileToMaterial — one course stays one size whatever the span. The base square of a
 * 0.78-scaled, 45 deg-turned 4-sided cone is 1.1w x 1.1d.
 */
export function tileConeUV(geo, w, d, h, mat) {
  const uv = geo.attributes && geo.attributes.uv;
  if (!uv) return geo;
  const tile = (mat.userData && mat.userData.tileWorld) || 3.2;
  const perim = 2.2 * (w + d);
  const slant = Math.hypot(h, 0.55 * (w + d) * 0.5);
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (uv.getX(i) * perim) / tile, (uv.getY(i) * slant) / tile);
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * Hip roof WITH a ridge, not a pyramid.
 *
 * The old version scaled a 4-sided cone. On a 14 m wing that forces all four slopes to
 * meet at one point, and at establishing scale the biggest roofs read as tents over
 * warehouses — the most obvious remaining tell in the review frames. A real hip roof
 * runs a ridge along the long axis; a square plan still collapses to an apex, which is
 * correct for pavilions and kiosks.
 *
 * Built long-axis-along-x and rotated for tall plans, so there is only one winding
 * convention to get right. UVs are in world metres / tileWorld, the same rule every box
 * and cone follows, so a course is the same size on a 3 m kiosk and a 16 m ballroom.
 *
 * Exported because site.js's heritage pavilion used a four-sided cone instead, whose UV
 * unwrap is RADIAL: the courses fanned out from the apex and every pavilion roof read as
 * a diamond. A square plan collapses this function to an apex, which is exactly right for
 * a pavilion — so the pavilion can have eave-parallel courses for free.
 */
export function hipRoof(w, d, h, mat, x = 0, y = 0, z = 0) {
  const tile = (mat.userData && mat.userData.tileWorld) || 3.2;
  const alongX = w >= d;
  const W = alongX ? w : d, D = alongX ? d : w;
  const hw = W / 2, hd = D / 2;
  const ridge = Math.max(0, hw - hd);
  const y0 = -h / 2, y1 = h / 2;
  const longSlant = Math.hypot(h, hd);
  const hipSlant = Math.hypot(h, ridge);
  const P = [], U = [];
  const tri = (a, b, c, ua, ub, uc) => {
    P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    U.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
  };
  // Two long slopes (+z, then -z).
  tri([-hw, y0, hd], [hw, y0, hd], [ridge, y1, 0], [-hw / tile, 0], [hw / tile, 0], [ridge / tile, longSlant / tile]);
  tri([-hw, y0, hd], [ridge, y1, 0], [-ridge, y1, 0], [-hw / tile, 0], [ridge / tile, longSlant / tile], [-ridge / tile, longSlant / tile]);
  tri([hw, y0, -hd], [-hw, y0, -hd], [-ridge, y1, 0], [hw / tile, 0], [-hw / tile, 0], [-ridge / tile, longSlant / tile]);
  tri([hw, y0, -hd], [-ridge, y1, 0], [ridge, y1, 0], [hw / tile, 0], [-ridge / tile, longSlant / tile], [ridge / tile, longSlant / tile]);
  // The two hipped ends.
  tri([hw, y0, hd], [hw, y0, -hd], [ridge, y1, 0], [hd / tile, 0], [-hd / tile, 0], [0, hipSlant / tile]);
  tri([-hw, y0, -hd], [-hw, y0, hd], [-ridge, y1, 0], [-hd / tile, 0], [hd / tile, 0], [0, hipSlant / tile]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  if (!alongX) m.rotation.y = Math.PI / 2;
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// The storey rule now lives in the simulation (engine.js), because customisation scores
// added storeys and the picture must not be able to disagree with the scorecard. It is
// re-exported here so render callers keep one import for massing helpers.
export { storeysFor };

/** Horizontal accent band that wraps a building — the sharpest brand signal we have. */
function bands(w, d, storeys, mat, y0 = FLOOR) {
  const g = new THREE.Group();
  for (let i = 1; i <= storeys; i++) {
    // 0.12 deep and 0.18 proud: the old 0.1 x 0.14 band washed out to a hairline at the
    // inspection camera, which is the zoom the palette is judged at.
    g.add(box(w + 0.18, 0.12, d + 0.18, mat, 0, y0 * i, 0));
  }
  return g;
}

/**
 * Per-building facade material. Every call returns a NEW material so fifteen walls
 * are not one flat tone: the lightness jitter is derived from the footprint, so it
 * is deterministic across rebuilds with no state to carry. Kit-shared materials are
 * only used for things that are not per-building (the heritage pavilion, ghosts).
 */
function facadeMat(kit, fn) {
  const role = fn.cat === 'B' ? 'B' : fn.cat === 'P' ? 'P' : 'G';
  const s = Math.abs(Math.round(buildCtx.w * 31 + buildCtx.d * 17 + buildCtx.x * 5));
  return kit.makeFacade(role, ((s % 7) - 3) / 130);   // -0.023 .. +0.023
}

/**
 * Construction-detail builders are handed the local `box` and the UV tiler rather than
 * importing them back from this module: a cycle between massing.js and detail.js would be
 * resolved by load order, and the one thing that must never depend on load order is geometry.
 */
const DETAIL = { box, tile: tileToMaterial };

/** Footprint of the placement currently being built; set by buildMassing. */
let buildCtx = { w: 1, d: 1, x: 0 };

/**
 * A flat roof that reads as a roof: a textured deck standing 6 cm proud of a gold coping
 * ring, so the edge catches a line of brand colour and the surface has a material. It
 * used to be one accent-coloured plate the size of the whole footprint, which made the
 * largest visible surface on a low block a flat tan lid with no texture at all — the
 * "unfinished box" the detail review called out.
 */
function copedRoof(g, w, d, h, kit) {
  // 0.22 m of exposed coping, not a hairline: the accent is the only place the palette
  // reads from the inspection camera, and it has to survive at this zoom.
  g.add(box(w + 0.6, 0.12, d + 0.6, kit.accent, 0, h + 0.06, 0));
  g.add(box(w + 0.02, 0.16, d + 0.02, kit.roof, 0, h + 0.12, 0));
  return h + 0.2;
}

/* ------------------------------------------------------- rooms wing, by style */

function roomsTower(w, d, storeys, kit, fn) {
  const g = new THREE.Group();
  const h = storeys * FLOOR;
  const mat = facadeMat(kit, fn);
  g.add(box(w, h, d, mat, 0, h / 2, 0));
  g.add(bands(w, d, storeys, kit.accent));
  // Setback crown: the top two floors pull in, so the silhouette is not a slab.
  if (storeys >= 4) {
    const ch = FLOOR * 1.6;
    g.add(box(w * 0.72, ch, d * 0.72, mat, 0, h + ch / 2, 0));
    copedRoof(g, w * 0.78, d * 0.78, h + ch, kit);
    g.add(cyl(0.06, 0.06, 1.6, 6, kit.gold, w * 0.3, h + ch + 0.98, d * 0.3));
    // Cap the mast. A bare 1.6 m gold rod ends in nothing and, once a planted deck hides
    // its foot, reads as a stick dropped in the shrubs; an 18 cm knob makes it a spire.
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), kit.gold);
    cap.position.set(w * 0.3, h + ch + 1.78, d * 0.3);
    g.add(cap);
  } else {
    copedRoof(g, w + 0.3, d + 0.3, h, kit);
  }
  // Glazed ground floor + porte-cochere slab on the arrival side.
  g.add(box(w * 0.94, FLOOR * 0.66, d * 0.94, kit.glass, 0, FLOOR * 0.36, 0));
  g.add(box(w * 0.5, 0.16, 1.5, kit.accent, 0, FLOOR * 0.95, d / 2 + 0.7));
  g.add(cyl(0.09, 0.09, FLOOR * 0.95, 8, kit.gold, -w * 0.2, FLOOR * 0.47, d / 2 + 1.3));
  g.add(cyl(0.09, 0.09, FLOOR * 0.95, 8, kit.gold, w * 0.2, FLOOR * 0.47, d / 2 + 1.3));
  // Balcony slabs on the arrival face. A rail painted into the texture vanishes at
  // this camera distance; a real slab edge is what makes a tower read as rooms.
  const bays = Math.max(2, Math.min(3, Math.round(w / 2.2)));
  for (let f = 1; f < storeys; f++) {
    for (let b = 0; b < bays; b += 2) {
      const bx = -w / 2 + (w / bays) * (b + 0.5);
      const bw = (w / bays) * 0.72;
      g.add(box(bw, 0.06, 0.3, kit.roofDark, bx, f * FLOOR, d / 2 + 0.17));
    }
  }
  return g;
}

function roomsCourtyard(w, d, storeys, kit, fn) {
  const g = new THREE.Group();
  const mat = facadeMat(kit, fn);
  const h = storeys * FLOOR;
  const wingD = Math.min(1.9, d * 0.3);
  const wingW = Math.min(1.9, w * 0.3);
  // Four wings around a garden court — the plan shape IS the style.
  g.add(box(w, h, wingD, mat, 0, h / 2, d / 2 - wingD / 2));
  g.add(box(w, h, wingD, mat, 0, h / 2, -d / 2 + wingD / 2));
  g.add(box(wingW, h, d - wingD * 2, mat, w / 2 - wingW / 2, h / 2, 0));
  g.add(box(wingW, h, d - wingD * 2, mat, -w / 2 + wingW / 2, h / 2, 0));
  g.add(bands(w, wingD, storeys, kit.accent).translateZ(d / 2 - wingD / 2));
  // Flat planted roof decks. Courtyard is the only low-rise style that never shows a
  // pitched roof: the tiled hip is exactly what made "Garden Resort" read as
  // "Traditional", and a bare facade-textured top face reads as an unfinished box from
  // the inspection camera, which looks down on these roofs.
  const decks = [
    [w, wingD, 0, d / 2 - wingD / 2],
    [w, wingD, 0, -d / 2 + wingD / 2],
    [wingW, d - wingD * 2, w / 2 - wingW / 2, 0],
    [wingW, d - wingD * 2, -w / 2 + wingW / 2, 0],
  ];
  for (const [dw, dd, dx, dz] of decks) {
    g.add(box(dw + 0.06, 0.12, dd + 0.06, kit.roofDark, dx, h + 0.06, dz));
    // Planting covers most of the deck, not a token strip: sage roofs are the style's
    // largest colour field seen from the inspection camera, and a token strip left the
    // two low-rise styles reading as the same grey mass.
    g.add(box(dw * 0.82, 0.14, dd * 0.72, kit.planting, dx, h + 0.18, dz));
  }
  g.add(box(w + 0.24, 0.16, wingD + 0.24, kit.gold, 0, h + 0.08, d / 2 - wingD / 2));
  g.add(box(w + 0.24, 0.16, wingD + 0.24, kit.gold, 0, h + 0.08, -d / 2 + wingD / 2));
  // The court itself: lawn, a water circle, one tree.
  const cw = Math.max(1, w - wingW * 2), cd = Math.max(1, d - wingD * 2);
  g.add(box(cw, 0.1, cd, kit.lawn, 0, 0.06, 0));
  g.add(cyl(Math.min(cw, cd) * 0.28, Math.min(cw, cd) * 0.28, 0.12, 24, kit.water, 0, 0.14, 0));
  g.add(cyl(0.12, 0.16, 1.1, 6, kit.trunk, cw * 0.28, 0.55, -cd * 0.24));
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 0), kit.foliage);
  crown.position.set(cw * 0.28, 1.5, -cd * 0.24);
  crown.castShadow = true;
  g.add(crown);
  return g;
}

function roomsHeritage(w, d, storeys, kit, fn) {
  const g = new THREE.Group();
  const mat = facadeMat(kit, fn);
  const h = storeys * FLOOR;
  g.add(box(w, h, d, mat, 0, h / 2, 0));
  g.add(bands(w, d, storeys, kit.accent));
  // Steep pitched roof over the whole footprint, with a gold ridge. The steepness is
  // what separates Heritage House from the flat, spread Courtyard Resort silhouette.
  g.add(hipRoof(w + 0.7, d + 0.7, 2.6, kit.roofSlate, 0, h + 1.3, 0));
  // GOLD AT THE APEX, NOT ALONG THE SLOPE. This was a 0.7d box at ridge height, and
  // because a hip roof is a pyramid, that box punched out through both slopes as a gold
  // stick lying on the roof. A small cap reads as a ridge finial and cannot intersect.
  g.add(box(0.36, 0.18, 0.36, kit.gold, 0, h + 2.62, 0));
  // Colonnade along the arrival face: the detail that reads "heritage" at 20m.
  const cols = Math.max(3, Math.round(w / 1.5));
  const shaftH = FLOOR * 1.05;
  const shaftY = FLOOR * 0.52;
  const columns = [];
  for (let i = 0; i < cols; i++) {
    const x = -w / 2 + (w / (cols - 1)) * i;
    const z = d / 2 + 0.55;
    g.add(cyl(0.14, 0.17, shaftH, 10, kit.paving, x, shaftY, z));
    columns.push({ x, z, base: shaftY - shaftH / 2, top: shaftY + shaftH / 2, r: 0.17 });
  }
  g.add(box(w + 0.6, 0.18, 1.4, kit.paving, 0, FLOOR * 1.08, d / 2 + 0.55));
  g.add(box(w + 0.7, 0.1, 1.5, kit.gold, 0, FLOOR * 1.2, d / 2 + 0.55));
  // Construction detail. Articulates the columns, eave and roof seams that are already here:
  // no footprint, storey, pitch or column-position change, and the parts are instanced so the
  // whole-scene draw-call budget measured by tools/perf.mjs is unaffected in practice.
  columnTrim(g, columns, kit, DETAIL);
  roofDetail(g, { h, roofW: w + 0.7, roofD: d + 0.7, rise: 2.6, roofY: h + 1.3 }, kit, DETAIL);
  return g;
}

/**
 * First-time facilitators do not read "Courtyard Resort" as a hotel architecture
 * type — and the wrong click costs them five minutes of "what did I just choose?"
 * The simulation is unchanged; the label is the only thing that moved. The MO canon
 * in the brief uses the original terms, so the catalogue retains them; this is the
 * UI vocabulary.
 */
export const STYLE_LABEL = { tower: 'Vertical Hotel', courtyard: 'Garden Resort', heritage: 'Traditional' };
export function styleLabel(id) { return STYLE_LABEL[id] || id; }

/** Height multiplier per style, so the same function reads differently in each style. */
const STYLE_H = { tower: 1.15, courtyard: 0.92, heritage: 0.8 };
const hMul = (style) => STYLE_H[style] ?? 1;

/**
 * Three genuinely different roof treatments, applied to EVERY archetype, not just
 * the rooms wing. A style that changes one building in fifteen is a colour swap,
 * not a style, and teams notice that immediately.
 */
function roofFor(g, style, w, d, h, kit) {
  // A stepped cornice under the cap: this is what makes a wall meet its roof like a
  // building rather than simply stop like a box.
  g.add(box(w + 0.5, 0.16, d + 0.5, kit.paving, 0, h - 0.14, 0));
  if (style === 'heritage' && !(buildCtx && buildCtx.flatRoof)) {
    g.add(hipRoof(w + 0.5, d + 0.5, 1.9, kit.roofSlate, 0, h + 0.95, 0));
    // Apex cap, not a ridge: see roomsHeritage — a long gold box at apex height cuts
    // straight through a pyramid roof.
    g.add(box(0.3, 0.16, 0.3, kit.gold, 0, h + 1.92, 0));
    g.add(box(w + 0.34, 0.1, d + 0.34, kit.accent, 0, h + 0.05, 0));
    // Roof trim lives HERE rather than at each call site, so every archetype that gets its
    // hip roof from this function (public, spa, people) is detailed by construction and a new
    // caller cannot forget it. Callers that build their own hipRoof call roofDetail themselves.
    // fascia:false — this branch already added an accent band at the eave just above.
    roofDetail(g, { h, roofW: w + 0.5, roofD: d + 0.5, rise: 1.9, roofY: h + 0.95, fascia: false }, kit, DETAIL);
  } else if (style === 'courtyard') {
    // Garden resort: a planted roof terrace under a pergola, not a pitched roof. The
    // green is what separates it from Traditional at a glance — two low-rise styles
    // with tan roofs were reading as the same building.
    g.add(box(w + 0.26, 0.2, d + 0.26, kit.accent, 0, h + 0.1, 0));
    g.add(box(w * 0.8, 0.12, d * 0.8, kit.planting, 0, h + 0.26, 0));
    g.add(box(w * 0.32, 0.1, d * 0.32, kit.paving, w * 0.18, h + 0.34, -d * 0.18));
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        g.add(cyl(0.05, 0.05, 1.0, 6, kit.paving, sx * w * 0.3, h + 0.76, -d * 0.28 + i * d * 0.28));
      }
      g.add(box(1.0, 0.05, d * 0.62, kit.paving, sx * w * 0.3, h + 1.28, 0));
    }
  } else {
    const base = copedRoof(g, w + 0.22, d + 0.22, h, kit);
    g.add(box(w * 0.3, 0.5, d * 0.3, kit.roofDark, -w * 0.2, base + 0.25, -d * 0.16));
    g.add(cyl(0.05, 0.05, 1.0, 6, kit.gold, w * 0.3, base + 0.5, d * 0.28));
  }
}

function publicBlock(w, d, storeys, kit, fn, style) {
  const g = new THREE.Group();
  const h = Math.max(FLOOR * 0.9, storeys * FLOOR * hMul(style));
  const mat = facadeMat(kit, fn);
  // A proud base course: the cheapest way to stop a wall meeting the ground flat.
  g.add(box(w + 0.32, 0.55, d + 0.32, kit.pavingDark, 0, 0.28, 0));
  g.add(box(w + 0.46, 0.1, d + 0.46, kit.accent, 0, 0.62, 0));
  g.add(box(w, h, d, mat, 0, h / 2, 0));
  g.add(box(w * 0.9, h * 0.62, 0.1, kit.glass, 0, h * 0.44, d / 2 + 0.03));
  g.add(bands(w, d, Math.max(1, Math.round(h / FLOOR)), kit.accent));
  roofFor(g, style, w, d, h, kit);

  if (style === 'heritage') {
    // A colonnade: the strongest silhouette cue at site scale.
    const cols = Math.max(3, Math.round(w / 1.6));
    const shaftH = h * 0.82;
    const shaftY = h * 0.41;
    const columns = [];
    for (let i = 0; i < cols; i++) {
      const x = -w / 2 + (w / (cols - 1)) * i;
      const z = d / 2 + 0.5;
      g.add(cyl(0.13, 0.16, shaftH, 10, kit.paving, x, shaftY, z));
      columns.push({ x, z, base: shaftY - shaftH / 2, top: shaftY + shaftH / 2, r: 0.16 });
    }
    g.add(box(w + 0.5, 0.16, 1.2, kit.paving, 0, h * 0.84, d / 2 + 0.5));
    g.add(box(w + 0.6, 0.1, 1.3, kit.gold, 0, h * 0.94, d / 2 + 0.5));
    // Detail on the columns, eave and roof seams already built above. roofFor() placed this
    // archetype's hip roof as hipRoof(w+0.5, d+0.5, 1.9) at h + 0.95, so the eave line is at h.
    // Column detail only: the roof trim is added inside roofFor() above, which owns this
    // archetype's hip roof. Adding it here as well would double the fascia and the caps.
    columnTrim(g, columns, kit, DETAIL);
  } else if (style === 'courtyard') {
    // A low garden wall and planting in front: reads as a resort, not a tower.
    g.add(box(w + 1.0, 0.5, 0.22, kit.paving, 0, 0.25, d / 2 + 1.1));
    for (let i = 0; i < 3; i++) {
      g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), kit.foliage)
        .translateX(-w * 0.3 + i * w * 0.3).translateY(0.62).translateZ(d / 2 + 0.7));
    }
    g.add(box(w * 0.42, 0.12, 1.4, kit.accent, 0, h * 0.86, d / 2 + 0.7));
  } else {
    // Tower: vertical fins and a taller glazed entrance.
    for (let i = 0; i < 3; i++) {
      g.add(box(0.12, h * 1.02, 0.12, kit.accent, -w * 0.3 + i * w * 0.3, h * 0.51, d / 2 + 0.08));
    }
    g.add(box(w * 0.4, 0.14, 1.5, kit.accent, 0, h * 0.9, d / 2 + 0.75));
    g.add(cyl(0.08, 0.08, h * 0.9, 8, kit.gold, -w * 0.16, h * 0.45, d / 2 + 1.35));
    g.add(cyl(0.08, 0.08, h * 0.9, 8, kit.gold, w * 0.16, h * 0.45, d / 2 + 1.35));
  }
  return g;
}

function kiosk(w, d, kit, fn, style) {
  const g = new THREE.Group();
  const h = FLOOR * 0.9 * hMul(style);
  g.add(box(w, h, d, facadeMat(kit, fn), 0, h / 2, 0));
  g.add(box(w * 0.86, h * 0.44, 0.08, kit.glass, 0, h * 0.6, d / 2 + 0.02));
  if (style === 'heritage') {
    g.add(hipRoof(w + 0.4, d + 0.4, 0.8, kit.roofSlate, 0, h + 0.4, 0));
    roofDetail(g, { h, roofW: w + 0.4, roofD: d + 0.4, rise: 0.8, roofY: h + 0.4 }, kit, DETAIL);
  } else {
    g.add(cyl(Math.max(w, d) * 0.72, Math.max(w, d) * 0.72, 0.12, 4, kit.gold, 0, h + 0.06, 0).rotateY(Math.PI / 4));
  }
  g.add(cyl(0.05, 0.05, 0.7, 6, kit.gold, 0, h + 0.75, 0));
  return g;
}

function spaBlock(w, d, kit, fn, style) {
  const g = new THREE.Group();
  const h = FLOOR * 1.1 * hMul(style);
  g.add(box(w * 0.72, h, d, facadeMat(kit, fn), -w * 0.14, h / 2, 0));
  roofFor(g, style, w * 0.72, d, h, kit);
  // Treatment courtyard: water, planting, a pergola.
  g.add(box(w * 0.3, 0.1, d * 0.9, kit.lawn, w * 0.34, 0.06, 0));
  g.add(box(w * 0.2, 0.14, d * 0.5, kit.water, w * 0.34, 0.12, -d * 0.14));
  for (let i = 0; i < 4; i++) {
    g.add(cyl(0.07, 0.07, 1.5, 6, kit.paving, w * 0.34, 0.75, -d * 0.36 + i * (d * 0.24)));
  }
  g.add(box(w * 0.26, 0.08, d * 0.86, kit.accent, w * 0.34, 1.54, 0));
  return g;
}

function poolTerrace(w, d, kit) {
  const g = new THREE.Group();
  g.add(box(w, 0.16, d, kit.pavingDark, 0, 0.08, 0));
  g.add(box(w * 0.66, 0.2, d * 0.62, kit.water, -w * 0.1, 0.16, 0));
  g.add(box(w * 0.68, 0.06, d * 0.64, kit.gold, -w * 0.1, 0.2, 0));
  // Loungers and parasols: small, but they give the terrace a scale cue.
  for (let i = 0; i < 3; i++) {
    const z = -d * 0.3 + i * (d * 0.3);
    g.add(box(0.7, 0.12, 0.34, kit.paving, w * 0.34, 0.24, z));
    g.add(cyl(0.04, 0.04, 1.1, 6, kit.trunk, w * 0.34, 0.7, z + 0.5));
    g.add(new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.34, 8), kit.accent).translateX(w * 0.34).translateY(1.36).translateZ(z + 0.5));
  }
  return g;
}

function hallBlock(w, d, kit, fn, style) {
  const g = new THREE.Group();
  const h = FLOOR * 1.9 * hMul(style);
  g.add(box(w, h, d, facadeMat(kit, fn), 0, h / 2, 0));
  g.add(box(w * 0.94, h * 0.5, 0.1, kit.glass, 0, h * 0.4, d / 2 + 0.03));
  // One long-span roof, no floor bands: this reads as a single volume.
  // The accent plate is the roof edge for the flat-roof styles. Heritage gets its own
  // eave from the hip roof below — a full-footprint slab at this height punched out
  // around the hip as a wide tan ring, and read as a deck under a small roof.
  if (style !== 'heritage') g.add(box(w + 0.3, 0.14, d + 0.3, kit.accent, 0, h + 0.07, 0));
  // The hall is the largest roof on the plot, so leaving it one tiled hip in every style
  // was the main reason Traditional and Garden Resort read as the same silhouette.
  if (style === 'heritage') {
    g.add(hipRoof(w + 1.0, d + 1.0, 2.6, kit.roofSlate, 0, h + 1.3, 0));
    // Apex finial only — a 0.72d gold bar here read as a gold stick on the roof.
    g.add(box(0.42, 0.2, 0.42, kit.gold, 0, h + 2.62, 0));
    // The hall builds its own roof rather than going through roofFor(), so it asks for the
    // same trim explicitly. No colonnade here, so there is no column detail to add.
    roofDetail(g, { h, roofW: w + 1.0, roofD: d + 1.0, rise: 2.6, roofY: h + 1.3 }, kit, DETAIL);
  } else if (style === 'courtyard') {
    // Planted garden roof: at roof level the hall becomes landscape, not a tiled ridge.
    g.add(box(w * 0.94, 0.14, d * 0.94, kit.roofDark, 0, h + 0.19, 0));
    g.add(box(w * 0.82, 0.16, d * 0.72, kit.planting, 0, h + 0.32, 0));
    g.add(box(w * 0.14, 0.36, d * 0.14, kit.paving, w * 0.28, h + 0.40, -d * 0.24));
    const bays = Math.max(2, Math.round(w / 2.4));
    for (let i = 0; i < bays; i++) {
      const x = -w * 0.34 + (i * w * 0.68) / (bays - 1);
      g.add(cyl(0.05, 0.05, 0.86, 6, kit.paving, x, h + 0.69, d * 0.3));
    }
    g.add(box(w * 0.78, 0.06, 0.9, kit.paving, 0, h + 1.12, d * 0.3));
  } else {
    // Deeper than it was: 1.4 over a 12 m span read as a lid on a box, not a roof.
    g.add(hipRoof(w + 0.6, d + 0.6, 2.0, kit.roofTile, 0, h + 1.0, 0));
  }
  return g;
}

function bohBlock(w, d, kit, fn, style) {
  const g = new THREE.Group();
  const h = FLOOR * 1.15 * hMul(style);
  g.add(box(w, h, d, facadeMat(kit, fn), 0, h / 2, 0));
  // Roller doors on the service face, louvred extractors on the roof.
  for (let i = 0; i < Math.max(1, Math.round(w / 2.2)); i++) {
    g.add(box(1.1, h * 0.72, 0.08, kit.ink, -w / 2 + 0.9 + i * 1.6, h * 0.36, -d / 2 - 0.02));
  }
  g.add(box(w + 0.2, 0.14, d + 0.2, kit.roof, 0, h + 0.07, 0));
  // Parapet ring, then a plant cluster: condensers, a duct run, a hatch. Two black
  // cubes on a slab is exactly what the first review pass called out.
  if (style === 'courtyard') {
    // Garden Resort plants every roof it can see, service wings included: at one storey
    // these plates are among the largest surfaces on the plot.
    g.add(box(w * 0.44, 0.12, d * 0.48, kit.planting, w * 0.22, h + 0.2, d * 0.16));
    g.add(box(w * 0.26, 0.14, d * 0.26, kit.foliage, w * 0.22, h + 0.22, d * 0.16));
  }
  for (const [sx, sz, sw, sd] of [[0, d / 2, w + 0.2, 0.14], [0, -d / 2, w + 0.2, 0.14], [w / 2, 0, 0.14, d + 0.2], [-w / 2, 0, 0.14, d + 0.2]]) {
    g.add(box(sw, 0.34, sd, kit.roofDark, sx, h + 0.24, sz));
  }
  for (let i = 0; i < 3; i++) {
    const ax = -w * 0.24 + i * w * 0.22;
    g.add(box(0.78, 0.44, 0.66, kit.roofDark, ax, h + 0.36, -d * 0.16));
    g.add(box(0.62, 0.05, 0.16, kit.ink, ax, h + 0.60, -d * 0.16));
  }
  g.add(box(0.24, 0.14, d * 0.5, kit.roofDark, w * 0.3, h + 0.2, d * 0.1));
  if (style === 'heritage') {
    // An eave band, not a plate: a full-footprint accent slab at this height showed
    // through around the hip as a wide tan ring, which is what made the biggest roofs
    // look inset into a deck. Two slim strips read as trim, and cannot show from above.
    g.add(box(w + 0.4, 0.1, 0.34, kit.gold, 0, h + 0.44, -d / 2 + 0.17));
    g.add(box(w + 0.4, 0.1, 0.34, kit.gold, 0, h + 0.44, d / 2 - 0.17));
  }
  return g;
}

function plantBlock(w, d, kit, fn, style) {
  const g = new THREE.Group();
  const h = FLOOR * 1.1 * hMul(style);
  g.add(box(w * 0.8, h, d, facadeMat(kit, fn), -w * 0.1, h / 2, 0));
  g.add(box(w * 0.82, 0.16, d * 1.02, kit.roof, -w * 0.1, h + 0.08, 0));
  if (style === 'courtyard') {
    g.add(box(w * 0.46, 0.12, d * 0.62, kit.planting, -w * 0.22, h + 0.21, 0));
    g.add(box(w * 0.26, 0.14, d * 0.34, kit.foliage, -w * 0.22, h + 0.23, 0));
  }
  g.add(box(w * 0.56, 0.42, 0.6, kit.roofDark, -w * 0.16, h + 0.37, d * 0.1));
  g.add(box(0.5, 0.05, 0.14, kit.ink, -w * 0.16, h + 0.6, d * 0.1));
  // Plant identity: tanks, a chimney, pipework. This is what makes "invisible" work visible.
  g.add(cyl(0.42, 0.42, 1.5, 12, kit.paving, w * 0.32, 0.75, -d * 0.2));
  g.add(cyl(0.34, 0.34, 1.2, 12, kit.paving, w * 0.32, 0.6, d * 0.22));
  g.add(cyl(0.16, 0.2, 2.2, 10, kit.ink, -w * 0.24, h + 1.1, -d * 0.26));
  g.add(cyl(0.07, 0.07, w * 0.5, 8, kit.accent, 0, h + 0.34, d * 0.3).rotateZ(Math.PI / 2));
  for (let i = 0; i < 3; i++) g.add(box(w * 0.16, 0.5, 0.06, kit.ink, -w * 0.3 + i * w * 0.24, h * 0.5, d / 2 + 0.03));
  return g;
}

function shedBlock(w, d, kit, fn, style) {
  const g = new THREE.Group();
  const h = FLOOR * 0.85 * hMul(style);
  g.add(box(w, h, d, facadeMat(kit, fn), 0, h / 2, 0));
  g.add(box(w * 0.9, h * 0.7, 0.08, kit.ink, 0, h * 0.35, d / 2 + 0.03));
  g.add(box(w + 0.2, 0.14, d + 0.2, kit.roof, 0, h + 0.07, 0));
  // Canopy over the yard side, plus pallet stacks for scale.
  g.add(box(w * 0.9, 0.1, 1.2, kit.accent, 0, h + 0.2, -d / 2 - 0.6));
  g.add(box(0.8, 0.5, 0.8, kit.trunk, -w * 0.24, 0.25, -d / 2 - 1.1));
  g.add(box(0.8, 0.5, 0.8, kit.trunk, w * 0.22, 0.25, -d / 2 - 1.1));
  return g;
}

function peopleBlock(w, d, kit, fn, style) {
  const g = new THREE.Group();
  const h = FLOOR * 1.05 * hMul(style);
  g.add(box(w * 0.86, h, d * 0.8, facadeMat(kit, fn), -w * 0.07, h / 2, -d * 0.1));
  roofFor(g, style, w * 0.86, d * 0.8, h, kit);
  g.add(box(w * 0.6, h * 0.5, 0.08, kit.glass, -w * 0.07, h * 0.42, -d * 0.1 + d * 0.4 + 0.03));
  // A sage band and a bench: People & Culture spaces are deliberately warmer.
  g.add(box(w * 0.88, 0.12, d * 0.82, kit.lawn, -w * 0.07, h * 0.72, -d * 0.1));
  g.add(box(1.1, 0.1, 0.34, kit.trunk, w * 0.3, 0.34, d * 0.24));
  g.add(box(1.1, 0.34, 0.08, kit.trunk, w * 0.3, 0.5, d * 0.38));
  return g;
}
/* ---------------------------------------------------------------- dispatcher */

/** World-space centre of a footprint (its origin cell is the top-left corner). */
export function footprintCentre(p) {
  return {
    x: (p.col + p.w / 2) * SITE.cell - (SITE.cols * SITE.cell) / 2,
    z: (p.row + p.h / 2) * SITE.cell - (SITE.rows * SITE.cell) / 2,
  };
}

/**
 * Build one placement. The group's local +Z is its "front"; we turn every building
 * to face the arrival court, which is why the plan reads as a real site rather
 * than a tray of blocks.
 */
export function buildMassing(placement, style, kit) {
  const fn = FUNCTION_BY_ID[placement.fnId];
  if (!fn) return new THREE.Group();
  // A per-building style variant overrides the session style for this building only,
  // so one wing can be traditional on a tower site without redrawing the whole hotel.
  const effStyle = placement.variant || style;
  const addons = placement.addons || [];
  const w = placement.w * SITE.cell - MARGIN;
  const d = placement.h * SITE.cell - MARGIN;
  // A green roof is a flat planted deck by definition, so it suppresses a pitched roof
  // rather than growing grass over slate (see roofFor).
  buildCtx = { w, d, x: placement.col + placement.row, flatRoof: addons.includes('green') };
  // Rendered height = the style's own storey rule plus the building's delta. Scoring uses
  // the function's default plus the delta, so changing style never moves the score.
  const storeys = Math.max(1, Math.min(12, storeysFor(fn, effStyle) + (placement.storeyDelta || 0)));
  let g;
  switch (fn.massing) {
    case 'rooms':
      g = effStyle === 'tower' ? roomsTower(w, d, storeys, kit, fn)
        : effStyle === 'courtyard' ? roomsCourtyard(w, d, storeys, kit, fn)
          : roomsHeritage(w, d, storeys, kit, fn);
      break;
    case 'public': g = publicBlock(w, d, storeys, kit, fn, effStyle); break;
    case 'kiosk': g = kiosk(w, d, kit, fn, effStyle); break;
    case 'spa': g = spaBlock(w, d, kit, fn, effStyle); break;
    case 'pool': g = poolTerrace(w, d, kit); break;
    case 'hall': g = hallBlock(w, d, kit, fn, effStyle); break;
    case 'boh': g = bohBlock(w, d, kit, fn, effStyle); break;
    case 'plant': g = plantBlock(w, d, kit, fn, effStyle); break;
    case 'shed': g = shedBlock(w, d, kit, fn, effStyle); break;
    case 'people': g = peopleBlock(w, d, kit, fn, effStyle); break;
    default: g = publicBlock(w, d, storeys, kit, fn, effStyle);
  }

  // Architecture trim. A bare box always reads as CG: a proud base course that meets the
  // ground is the cheapest cue that stops it. There used to be a second, "coping" plate
  // over the whole footprint here — it sat above whatever rooftop plant the archetype had
  // built (it was placed at the group's own max height plus 2 cm), so every flat-roofed
  // building came out as one grey lid with invisible plant under it. Every archetype now
  // caps itself: accent ring, hip roof, planted deck or membrane plate.
  g.updateMatrixWorld(true);
  // Low terraces already place water/loungers below 0.34 m. A full-height solid plinth
  // buried them (and the spa garden); keep a low foundation under those two archetypes.
  const baseHeight = fn.massing === 'pool' || fn.massing === 'spa' ? 0.08 : 0.34;
  g.add(box(w + 0.34, baseHeight, d + 0.34, kit.pavingDark, 0, baseHeight / 2, 0));

  // Contact darkening under the footprint, so the building sits ON the plinth rather
  // than floating a few centimetres above it. Skipped for the ghost: setGhost clones
  // and tints every mesh, and a tinted blob under a translucent preview reads as a
  // second footprint.
  if (placement.uid !== 'ghost') {
    const soft = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.36, d * 1.36), kit.contact);
    soft.rotation.x = -Math.PI / 2;
    soft.position.y = 0.02;
    soft.renderOrder = 1;
    g.add(soft);
  }

  // Add-ons go on last, so they sit on whatever height this archetype actually reached
  // rather than on a height the catalogue guessed.
  addAddons(g, placement, w, d, kit, fn);

  const c = footprintCentre(placement);
  g.position.set(c.x, 0, c.z);

  // Face the arrival court. atan2(dx, dz) maps local +Z onto the direction vector.
  const ax = (SITE.arrival.col + 0.5) * SITE.cell - (SITE.cols * SITE.cell) / 2;
  const az = (SITE.arrival.row + 0.5) * SITE.cell - (SITE.rows * SITE.cell) / 2;
  g.rotation.y = Math.atan2(ax - c.x, az - c.z);

  g.userData.uid = placement.uid;
  g.userData.fnId = placement.fnId;
  g.userData.kind = 'building';
  // Tag every descendant so one raycast hit resolves to the whole building, and
  // only shadow-cast the substantial volumes: ~15 buildings x every brass detail
  // would double the draw calls for nothing a phone can afford.
  g.traverse((o) => {
    o.userData.uid = placement.uid;
    o.userData.kind = 'building';
    if (o.isMesh) {
      // Trim opts out explicitly. geometry.parameters.height is absent on InstancedMesh and on
      // custom BufferGeometry, so without this flag a 7 cm fascia would cast a full-box shadow.
      if (o.userData.noShadow) o.castShadow = false;
      else {
        const h = o.geometry?.parameters?.height ?? 1;
        o.castShadow = h > 0.4;
      }
      o.receiveShadow = true;
    }
  });
  return g;
}

/**
 * Add-on geometry. Everything sits on the height the archetype actually reached, so a
 * terrace on a six-storey wing is not floating at the height of a shed. Materials are
 * the kit's own: a paid extra never introduces a new colour into the scene.
 */
function addAddons(g, placement, w, d, kit, fn) {
  const addons = placement.addons || [];
  if (!addons.length) return;
  g.updateMatrixWorld(true);
  // Measure in the group's own space. setFromObject() reports world coordinates, and this
  // group is positioned and rotated on the site, so the "crown" came out wherever the wing
  // happens to sit: every deck was shrunk to the width of the tallest finial and drawn
  // metres off the building, with only the planting bushes left hanging in mid-air beside
  // the roof. Each child is measured by its own local matrix instead.
  g.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    o.updateMatrix();
    o.geometry.computeBoundingBox();
  });
  const boxes = [];
  g.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    boxes.push(o.geometry.boundingBox.clone().applyMatrix4(o.matrix));
  });
  const all = new THREE.Box3();
  boxes.forEach((b) => all.union(b));
  const area = (b) => (b.max.x - b.min.x) * (b.max.z - b.min.z);
  // The roof surface is the highest child with a real footprint. A finial is a 6 cm
  // cylinder: letting it set the height floats the whole deck 1.7 m above the roof.
  const wide = boxes.filter((b) => area(b) > area(all) * 0.3);
  // ...and that child — not the union of everything up there — is what a deck can stand on.
  // A coping or drip ring is deliberately proud of the wall, so sizing to the union put the
  // kerb 0.2 m past the roof plate on every wing, and on a sloped roof it hung in the air
  // along the front edge. Ties go to the larger piece, which is the plate, not the ring.
  let roofBox = wide.length ? wide[0] : all;
  for (const b of wide) {
    const dy = b.max.y - roofBox.max.y;
    if (dy > 1e-4 || (Math.abs(dy) <= 1e-4 && area(b) > area(roofBox))) roofBox = b;
  }
  const top = wide.length ? roofBox.max.y : all.max.y;
  const useCrown = wide.length > 0;
  // 0.12 m of plate left showing on every side: a deck flush to the coping reads as a lid
  // dropped on the block, a small setback reads as a parapet.
  const pad = 0.12;
  const tw = useCrown ? Math.max(1, Math.min(w, roofBox.max.x - roofBox.min.x) - pad * 2) : w;
  const td = useCrown ? Math.max(1, Math.min(d, roofBox.max.z - roofBox.min.z) - pad * 2) : d;
  const cx = useCrown ? (roofBox.max.x + roofBox.min.x) / 2 : 0;
  const cz = useCrown ? (roofBox.max.z + roofBox.min.z) / 2 : 0;

  if (addons.includes('green')) {
    // A planted deck inside a low parapet: it has to read as a roof, not a lid. The kerb
    // slab is exactly the deck footprint — it used to be tw + 0.16, i.e. proud of its own
    // planting on a plate it had already been sized past. Planting at 0.9 leaves a 0.6 m
    // stone edge instead of the 1 m white picture frame the zoom crop showed.
    g.add(box(tw, 0.18, td, kit.paving, cx, top + 0.09, cz));
    g.add(box(tw * 0.9, 0.14, td * 0.9, kit.planting, cx, top + 0.25, cz));
    // Four shrubs, rounded and squashed: a 0-subdivision icosahedron in the darkest kit
    // green rendered as flat facets and the deck grew four grey boulders; smooth-shaded
    // spheres fixed the facets but read as pale topiary balls. Two lobes each, in the
    // textured planting material, reads as groundcover instead of as a shape.
    for (let i = 0; i < 4; i++) {
      const bx = cx + (i % 2 ? 1 : -1) * tw * 0.3, bz = cz + (i < 2 ? 1 : -1) * td * 0.28;
      for (let lobe = 0; lobe < 2; lobe++) {
        const r = (lobe ? 0.2 : 0.28) + (i % 2) * 0.05;
        const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), kit.planting);
        bush.scale.y = 0.78;
        bush.position.set(bx + lobe * 0.16, top + 0.4 + lobe * 0.04, bz - lobe * 0.1);
        g.add(bush);
      }
    }
    // The crown mast's foot starts 0.18 m above the plate, i.e. under this deck, so the
    // planting swallows its base. That is left alone on purpose: a paving collar around it
    // was tried and read as a sheet of paper lying on the grass — the mast now ends in a
    // gold knob (roomsTower), which is what makes it read as a spire rather than a stick.
  }

  if (addons.includes('terrace')) {
    // A terrace on a green roof sits on the planted deck and insets into it, so the
    // planting reads as a surround instead of being paved over. Both treatments are legal
    // together in the engine: at one height they z-fought, at full width they covered the
    // green entirely (a 0-bit change on screen). On a green roof it is laid in `path`, not
    // `paving`: pavingDark was tried first and is only 6% darker than the kerb the deck is
    // edged with, so the terrace still read as one white U-shape against it.
    const onGreen = addons.includes('green');
    const deckW = tw * (onGreen ? 0.58 : 0.92);
    const deckD = td * (onGreen ? 0.54 : 0.86);
    const base = onGreen ? top + 0.30 : top;
    const half = deckW / 2;
    g.add(box(deckW, 0.12, deckD, onGreen ? kit.path : kit.paving, cx, base + 0.06, cz));
    for (const sx of [-1, 1]) {
      // A planter, not a green cube: a paved box with a planting slab on top is what reads
      // as a planter at 20 m. The 0.6 m cube of bare foliage read as an air-conditioning
      // unit sitting on the deck.
      const px = cx + sx * half * 0.78, pz = cz + td * 0.20;
      // Seated on the terrace, not beside it: pz used to be +0.32 td, i.e. past the
      // terrace edge (half depth 0.27 td), so the box floated 0.11 m above the planting.
      g.add(box(0.6, 0.42, 0.6, kit.paving, px, base + 0.33, pz));
      g.add(box(0.5, 0.12, 0.5, kit.planting, px, base + 0.52, pz));
      g.add(cyl(0.05, 0.05, 1.1, 6, kit.trunk, cx + sx * half * 0.565, base + 0.67, cz - td * 0.18));
      g.add(cyl(0.85, 0.85, 0.09, 10, kit.ivory, cx + sx * half * 0.565, base + 1.26, cz - td * 0.18));
    }
  }

  if (addons.includes('solar')) {
    for (let i = 0; i < 3; i++) {
      const z = cz - td * 0.3 + i * td * 0.3;
      const panel = box(tw * 0.5, 0.06, td * 0.2, kit.glass, cx, top + 0.55, z);
      panel.rotation.x = -0.42;
      g.add(panel);
      g.add(box(tw * 0.52, 0.05, 0.06, kit.roofDark, cx, top + 0.28, z + td * 0.08));
    }
  }

  if (addons.includes('canopy')) {
    // Cantilevered over the +Z entrance, which is the face every building aims at arrival.
    const y = FLOOR * 1.6;
    g.add(box(w * 0.72, 0.14, 1.6, kit.paving, 0, y, d / 2 + 0.7));
    g.add(box(w * 0.72, 0.26, 0.14, kit.accent, 0, y - 0.04, d / 2 + 1.46));
  }

  if (addons.includes('seating')) {
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * w * 0.26;
      g.add(cyl(0.42, 0.42, 0.07, 10, kit.paving, x, 0.74, d / 2 + 0.85));
      g.add(cyl(0.05, 0.05, 0.74, 6, kit.trunk, x, 0.37, d / 2 + 0.85));
      g.add(cyl(0.04, 0.04, 1.3, 6, kit.trunk, x, 1.35, d / 2 + 0.85));
      g.add(cyl(0.62, 0.62, 0.07, 8, kit.ivory, x, 2.0, d / 2 + 0.85));
    }
  }
}

/** Ghost/preview massing: same shape, translucent, so a placement reads before commit. */
export function buildGhost(fnId, style, kit) {
  const fn = FUNCTION_BY_ID[fnId];
  if (!fn) return new THREE.Group();
  const p = { uid: 'ghost', fnId, col: 0, row: 0, w: fn.w, h: fn.h, rot: 0 };
  return buildMassing(p, style, kit);
}
