// engine.js — the whole simulation. PURE and ISOMORPHIC: no DOM, no three, no
// network, no Date.now(), no Math.random(). Same input => same output, in the
// browser and in Node. The renderer and UI are consumers of this file only.
import {
  SITE, FUNCTIONS, FUNCTION_BY_ID, ADJACENCY, REQUIRED, JOURNEYS, ROUNDS,
  EVENTS, SIGNATURES, LANDSCAPES, COMPOSITE_WEIGHTS, TOTAL_BUDGET,
  SIZES, STOREY_DELTA, ADDONS, ADDON_SCORE_CAP, ADDON_NOTE, HEIGHT_NOTE, STYLES,
  PLOTS, LAND_NOTE, PLOT_ONLY_NOTE,
  MANPOWER, MANPOWER_NOTE, MANPOWER_EVENTS,
} from './catalogue.js';
import { makeRng } from './rng.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const round1 = (v) => Math.round(v * 10) / 10;

/* ------------------------------------------------------------------ geometry */

/** Footprint size after rotation. rot is 0..3 quarter turns; 1 and 3 swap w/h. */
export function footprint(fnId, rot = 0) {
  const f = FUNCTION_BY_ID[fnId];
  if (!f) return { w: 1, h: 1 };
  const odd = (rot % 2) === 1;
  return { w: odd ? f.h : f.w, h: odd ? f.w : f.h };
}

/**
 * Storeys a function gets in a given style. This lives in the simulation, not the
 * renderer, because customisation scores added storeys: if the picture owned this
 * rule, the height a player sees and the height the scorecard counts could disagree.
 */
export function storeysFor(fn, style) {
  const base = fn.storeys ?? 1;
  if (style === 'tower') return Math.max(1, base);
  // Courtyard and heritage both cap at 2. Garden Resort is a single-storey pavilion
  // plan — wings around courts, all the height in the roof planting — while Traditional
  // is two storeys under a steep slate hip. Height is the cue a player reads first when
  // they switch style, so it has to differ even at low-rise.
  if (style === 'courtyard') return 1;
  return Math.max(1, Math.min(base, 2));
}

/** Storeys are only a design decision on wings and public blocks; a pool has none. */
function storeysCustomisable(fn) {
  return !!fn && (fn.massing === 'rooms' || fn.massing === 'public');
}

const sizeOf = (p) => SIZES.find((x) => x.id === (p.size || 'M')) || SIZES[1];

/**
 * Footprint of a PLACEMENT, not of a function: the chosen size moves the long side by
 * one cell and rotation swaps the sides. With the default size this is identical to
 * footprint(fnId, rot) — which is what keeps every existing preset's cells unchanged.
 */
export function footprintOf(p) {
  const f = FUNCTION_BY_ID[p.fnId];
  if (!f) return { w: 1, h: 1 };
  let w = f.w, h = f.h;
  const delta = sizeOf(p).delta;
  if (delta) {
    // The long side moves, so the building keeps its proportion instead of stretching.
    if (w >= h) w += delta;
    else h += delta;
  }
  const odd = ((p.rot ?? 0) % 2) === 1;
  return { w: odd ? h : w, h: odd ? w : h };
}

/** Storeys this placement is drawn and scored at (catalogue default plus its delta). */
export function storeysOf(p) {
  const f = FUNCTION_BY_ID[p.fnId];
  if (!f) return 1;
  if (!storeysCustomisable(f)) return f.storeys ?? 1;
  return Math.max(1, (f.storeys ?? 1) + (p.storeyDelta || 0));
}

/**
 * Area and storeys relative to the function's default: 1 and 1 for an untouched
 * building, which is why customisation changes nothing until a choice is made.
 */
export function scaleOf(p) {
  const f = FUNCTION_BY_ID[p.fnId];
  if (!f) return { areaFactor: 1, storeyFactor: 1 };
  const baseArea = f.w * f.h;
  const long = Math.max(f.w, f.h) + sizeOf(p).delta;
  const short = Math.min(f.w, f.h);
  const areaFactor = baseArea > 0 ? (long * short) / baseArea : 1;
  const storeyFactor = storeysCustomisable(f) ? storeysOf(p) / (f.storeys ?? 1) : 1;
  return { areaFactor, storeyFactor };
}

/** Whether an add-on can go on a function. Eligibility lives in the catalogue, not here. */
export function addonEligible(fnId, addonId) {
  const f = FUNCTION_BY_ID[fnId];
  const a = ADDONS.find((x) => x.id === addonId);
  if (!f || !a) return false;
  if (a.fnIds) return a.fnIds.includes(fnId);
  if (a.cats) return a.cats.includes(f.cat);
  if (Array.isArray(a.massing)) return a.massing.includes(f.massing);
  if (a.massing === 'any-but-pool') return f.massing !== 'pool';
  return true;
}

/** What one placement costs to build, at its current size, storeys and add-ons. */
export function costOf(p) {
  const f = FUNCTION_BY_ID[p.fnId];
  if (!f) return 0;
  const { areaFactor, storeyFactor } = scaleOf(p);
  let total = Math.round(f.cost * areaFactor * storeyFactor);
  for (const id of p.addons || []) {
    const a = ADDONS.find((x) => x.id === id);
    if (a) total += a.cost;
  }
  return total;
}

/** Every cell a placement covers, as "col,row" keys. */
export function cellsOf(p) {
  const out = [];
  for (let c = p.col; c < p.col + p.w; c++) {
    for (let r = p.row; r < p.row + p.h; r++) out.push(`${c},${r}`);
  }
  return out;
}

export function heritageCells() {
  const h = SITE.heritage;
  const out = [];
  for (let c = h.col; c < h.col + h.w; c++) {
    for (let r = h.row; r < h.row + h.h; r++) out.push(`${c},${r}`);
  }
  return out;
}

/** Cells that must stay clear for circulation: the arrival court and service yard. */
export function reservedCells() {
  return [`${SITE.arrival.col},${SITE.arrival.row}`, `${SITE.service.col},${SITE.service.row}`];
}

/**
 * Is every cell of this rect owned? Without a session it is the original fixed plot,
 * so every caller that predates sellable land (presets, pointer picking, the tools)
 * behaves exactly as it did. With a session, purchased plots extend the answer — the
 * base rect is no longer the boundary of the site, only the team's starting land.
 */
export function inBounds(col, row, w, h, s = null) {
  if (!s) return col >= 0 && row >= 0 && col + w <= SITE.cols && row + h <= SITE.rows;
  for (let c = col; c < col + w; c++) {
    for (let r = row; r < row + h; r++) if (!isOwned(s, c, r)) return false;
  }
  return true;
}

/** The base plot, plus any purchased plot covering this cell. */
export function isOwned(s, col, row) {
  if (col >= 0 && row >= 0 && col < SITE.cols && row < SITE.rows) return true;
  for (const plot of (s && s.plots) || []) {
    if (col >= plot.col && row >= plot.row && col < plot.col + plot.w && row < plot.row + plot.h) return true;
  }
  return false;
}

/** Every owned cell as "col,row" keys: what the grid, the plinth and the shadows span. */
export function ownedCells(s) {
  const out = new Set();
  for (let c = 0; c < SITE.cols; c++) for (let r = 0; r < SITE.rows; r++) out.add(`${c},${r}`);
  for (const plot of (s && s.plots) || []) {
    for (let c = plot.col; c < plot.col + plot.w; c++) {
      for (let r = plot.row; r < plot.row + plot.h; r++) out.add(`${c},${r}`);
    }
  }
  return out;
}

/** Bought land. Purchases are final, and the cost comes straight out of the budget. */
export function buyPlot(s, id) {
  const plot = PLOTS.find((p) => p.id === id);
  if (!plot) return { ok: false, reason: 'Unknown plot' };
  if ((s.plots || []).some((p) => p.id === id)) return { ok: false, reason: 'That land is already owned' };
  if (plot.cost > availableBudget(s)) {
    return { ok: false, reason: `Needs ${plot.cost} credits; ${availableBudget(s)} left` };
  }
  s.spent += plot.cost;
  if (!s.plots) s.plots = [];
  s.plots.push(plot);
  return { ok: true, plot };
}

/** The plot covering a cell that the team does NOT own yet, if any. */
export function forSaleAt(s, col, row) {
  return PLOTS.find((p) => !(s.plots || []).some((o) => o.id === p.id)
    && col >= p.col && row >= p.row && col < p.col + p.w && row < p.row + p.h) || null;
}

/** The owned plot covering a cell, if any. */
export function ownedPlotAt(s, col, row) {
  return (s.plots || []).find((p) => col >= p.col && row >= p.row && col < p.col + p.w && row < p.row + p.h) || null;
}

/** Bounding box of everything the team owns, in cells — what the camera must frame. */
export function ownedBounds(s) {
  let col0 = 0, row0 = 0, col1 = SITE.cols - 1, row1 = SITE.rows - 1;
  for (const plot of (s && s.plots) || []) {
    col0 = Math.min(col0, plot.col);
    row0 = Math.min(row0, plot.row);
    col1 = Math.max(col1, plot.col + plot.w - 1);
    row1 = Math.max(row1, plot.row + plot.h - 1);
  }
  return { col0, row0, col1, row1 };
}

/** Cell -> world position (centre of the cell, y = 0 ground plane). */
export function cellToWorld(col, row) {
  const c = SITE.cell;
  return {
    x: (col + 0.5) * c - (SITE.cols * c) / 2,
    z: (row + 0.5) * c - (SITE.rows * c) / 2,
  };
}

/** World position -> cell (used by pointer picking). Returns null outside the site. */
export function worldToCell(x, z) {
  const c = SITE.cell;
  const col = Math.floor((x + (SITE.cols * c) / 2) / c);
  const row = Math.floor((z + (SITE.rows * c) / 2) / c);
  if (!inBounds(col, row, 1, 1)) return null;
  return { col, row };
}

/** Chebyshev gap between two footprints (0 when they touch). */
export function gapBetween(p, q) {
  const dx = Math.max(0, Math.max(p.col - (q.col + q.w), q.col - (p.col + p.w)));
  const dz = Math.max(0, Math.max(p.row - (q.row + q.h), q.row - (p.row + p.h)));
  return Math.max(dx, dz);
}
/* ------------------------------------------------------------- hotel + state */

export function createSession(config = {}) {
  const seed = config.seed || 'hb-demo-seed';
  return {
    seed,
    teamName: config.teamName || 'Team One',
    hotelName: config.hotelName || 'The Riverside',
    style: config.style || 'tower',
    palette: config.palette || 'gold',
    signature: config.signature || 'water',
    landscape: config.landscape || 'medium',
    placements: [],
    round: 1,
    released: ROUNDS[0].allowance,
    spent: 0,
    usedEvents: [],
    history: [],
    selectedUid: null,
    nextUid: 1,
    // Sellable land and the team's monogram: empty by default, so a session that buys
    // nothing and types nothing behaves exactly as it did before those features existed.
    plots: [],
    monogram: config.monogram || '',
    // Manpower. `staffing` holds only the clusters a team has actually touched: an absent
    // cluster is rostered at requirement, which is why an untouched plan changes no score.
    staffing: {},
    training: 0,
    shortStreak: 0,
  };
}

export function availableBudget(s) {
  return s.released - s.spent;
}

/** Occupancy map excluding one uid (so a move can be validated against itself). */
function occupancy(s, excludeUid = null) {
  const set = new Set(heritageCells());
  for (const k of reservedCells()) set.add(k);
  for (const p of s.placements) {
    if (p.uid === excludeUid) continue;
    for (const k of cellsOf(p)) set.add(k);
  }
  return set;
}

/** Shared geometry/occupancy/budget test for any footprint — placing, moving, resizing. */
function blockerFor(s, fnId, col, row, w, h, excludeUid = null) {
  const f = FUNCTION_BY_ID[fnId];
  if (!f) return 'Unknown function';
  if (!inBounds(col, row, w, h, s)) return 'Outside the site boundary';
  const blocked = occupancy(s, excludeUid);
  const heritage = new Set(heritageCells());
  const reserved = new Set(reservedCells());
  for (const k of cellsOf({ col, row, w, h })) {
    if (heritage.has(k)) return 'The heritage pavilion cannot be built over';
    if (reserved.has(k)) return 'Keep the arrival court and service yard clear';
    if (blocked.has(k)) return 'Overlaps another function';
  }
  // Some land takes only certain functions: the riverside deck is guest-facing only.
  for (const plot of (s && s.plots) || []) {
    if (!plot.only) continue;
    const touches = col < plot.col + plot.w && col + w > plot.col && row < plot.row + plot.h && row + h > plot.row;
    if (touches && !plot.only.includes(fnId)) return PLOT_ONLY_NOTE;
  }
  if (excludeUid === null && f.cost > availableBudget(s)) {
    return `Needs ${f.cost} credits; ${availableBudget(s)} left`;
  }
  return null;
}

/** Why a placement is illegal, or null when it is legal. Strings are shown to players. */
export function placementBlocker(s, fnId, col, row, rot = 0, excludeUid = null) {
  const { w, h } = footprint(fnId, rot);
  return blockerFor(s, fnId, col, row, w, h, excludeUid);
}

/** Does this placement fit at a new position, at its own size and storeys? */
export function blockerAt(s, p, col, row) {
  return blockerFor(s, p.fnId, col, row, p.w, p.h, p.uid);
}

/**
 * Change a building's size, storeys, style variant or add-ons. Validated against the
 * real footprint and the real budget, so a resize that would overlap a neighbour is
 * refused rather than silently clipping it. Anchored at the same col/row: growth spends
 * the extra cells east/north.
 */
export function customise(s, uid, changes = {}, dryRun = false) {
  const p = s.placements.find((x) => x.uid === uid);
  if (!p) return { ok: false, reason: 'Nothing selected' };
  const f = FUNCTION_BY_ID[p.fnId];
  const next = { ...p, addons: [...(p.addons || [])] };

  if (changes.size !== undefined && changes.size !== (p.size || 'M')) {
    if (!SIZES.some((x) => x.id === changes.size)) return { ok: false, reason: 'Unknown size' };
    if (changes.size === 'S' && Math.max(f.w, f.h) < 2) return { ok: false, reason: 'This building is already at its smallest' };
    next.size = changes.size;
  }
  if (changes.storeyDelta !== undefined && changes.storeyDelta !== (p.storeyDelta || 0)) {
    if (!storeysCustomisable(f)) return { ok: false, reason: 'Storeys cannot change on this building' };
    const delta = Math.max(STOREY_DELTA.min, Math.min(STOREY_DELTA.max, Math.round(changes.storeyDelta)));
    if ((f.storeys ?? 1) + delta < 1) return { ok: false, reason: 'A building needs at least one storey' };
    next.storeyDelta = delta;
  }
  if (changes.variant !== undefined && changes.variant !== p.variant) {
    if (changes.variant !== null && !STYLES.some((x) => x.id === changes.variant)) {
      return { ok: false, reason: 'Unknown style' };
    }
    next.variant = changes.variant;
  }
  if (changes.toggle) {
    const id = changes.toggle;
    if (next.addons.includes(id)) {
      next.addons = next.addons.filter((x) => x !== id);
    } else {
      if (!addonEligible(p.fnId, id)) {
        const a = ADDONS.find((x) => x.id === id);
        return { ok: false, reason: `${a ? a.label : 'That add-on'} cannot go on a ${f.label}` };
      }
      next.addons.push(id);
    }
  }

  const dims = footprintOf(next);
  if (dims.w !== p.w || dims.h !== p.h) {
    const blocker = blockerFor(s, p.fnId, p.col, p.row, dims.w, dims.h, p.uid);
    if (blocker) return { ok: false, reason: blocker };
  }

  const before = costOf(p);
  const after = costOf(next);
  const diff = after - before;
  if (diff > 0 && diff > availableBudget(s)) {
    return { ok: false, reason: `Needs ${diff} credits; ${availableBudget(s)} left` };
  }
  // Rework costs money in both directions, the same rule as removing a building.
  const refund = diff < 0 ? Math.round(-diff * 0.7) : 0;
  // Dry run: the panel needs to know "would this work, and what would it cost" for a
  // control nobody has pressed yet. Same validation, no mutation.
  if (dryRun) return { ok: true, spent: diff > 0 ? diff : 0, refund, delta: diff, cost: after };

  p.size = next.size;
  p.storeyDelta = next.storeyDelta;
  p.variant = next.variant;
  p.addons = next.addons;
  p.w = dims.w;
  p.h = dims.h;
  s.spent += diff > 0 ? diff : -refund;
  return { ok: true, spent: diff > 0 ? diff : 0, refund, delta: diff, cost: after };
}

export function place(s, fnId, col, row, rot = 0) {
  const blocker = placementBlocker(s, fnId, col, row, rot);
  if (blocker) return { ok: false, reason: blocker };
  const { w, h } = footprint(fnId, rot);
  const p = {
    uid: `p${s.nextUid++}`, fnId, col, row, w, h, rot, round: s.round,
    // Customisation (size, storeys, style variant, add-ons) starts at the catalogue
    // default, so every existing preset keeps the exact footprint, cost and capacity
    // it had before the feature existed.
    size: 'M', storeyDelta: 0, variant: null, addons: [],
  };
  s.placements.push(p);
  s.spent += costOf(p);
  return { ok: true, placement: p };
}

export function movePlacement(s, uid, col, row) {
  const p = s.placements.find((x) => x.uid === uid);
  if (!p) return { ok: false, reason: 'Nothing selected' };
  // Validate against the placement's OWN footprint: a resized building still has to fit.
  const blocker = blockerFor(s, p.fnId, col, row, p.w, p.h, uid);
  if (blocker) return { ok: false, reason: blocker };
  p.col = col; p.row = row;
  return { ok: true, placement: p };
}

export function rotatePlacement(s, uid) {
  const p = s.placements.find((x) => x.uid === uid);
  if (!p) return { ok: false, reason: 'Nothing selected' };
  const rot = (p.rot + 1) % 4;
  const { w, h } = footprintOf({ fnId: p.fnId, size: p.size, rot });
  const blocker = blockerFor(s, p.fnId, p.col, p.row, w, h, uid);
  if (blocker) return { ok: false, reason: blocker };
  p.rot = rot; p.w = w; p.h = h;
  return { ok: true, placement: p };
}

export function removePlacement(s, uid) {
  const i = s.placements.findIndex((x) => x.uid === uid);
  if (i < 0) return { ok: false, reason: 'Nothing selected' };
  const [p] = s.placements.splice(i, 1);
  // Refund 70%: re-planning is possible but not free. Rework has a real cost.
  const refund = Math.round(costOf(p) * 0.7);
  s.spent -= refund;
  if (s.selectedUid === uid) s.selectedUid = null;
  return { ok: true, placement: p, refund };
}

export function advanceRound(s) {
  if (s.round >= ROUNDS.length) return { ok: false, reason: 'Final round reached' };
  s.round += 1;
  s.released += ROUNDS[s.round - 1].allowance;
  return { ok: true, round: s.round };
}

/** Function ids present, as a Set — used by events and the required checks. */
export function presentIds(s) {
  return new Set(s.placements.map((p) => p.fnId));
}

export function countOf(s, fnId) {
  return s.placements.filter((p) => p.fnId === fnId).length;
}

export function totalBudget() {
  return TOTAL_BUDGET;
}
/* --------------------------------------------------------------- pathfinding */

/** Blocked cells = every built footprint + the heritage pavilion. Walks must go round. */
export function blockedCells(s) {
  const set = new Set(heritageCells());
  for (const p of s.placements) for (const k of cellsOf(p)) set.add(k);
  return set;
}

const key = (c, r) => `${c},${r}`;
const parseKey = (k) => { const i = k.indexOf(','); return { col: +k.slice(0, i), row: +k.slice(i + 1) }; };
const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];

/**
 * The free cell beside a footprint that is nearest to a target rect — the "door".
 * Distance is Euclidean to the target's CENTRE: Manhattan-to-origin ties and then
 * picks a door facing the wrong way, which silently reports a 0-step walk.
 */
export function doorCell(rect, toward, blocked, s = null) {
  const own = new Set(cellsOf(rect));
  const tx = toward.col + (toward.w ?? 1) / 2;
  const tz = toward.row + (toward.h ?? 1) / 2;
  let best = null;
  for (const k of own) {
    const { col, row } = parseKey(k);
    for (const [dc, dr] of DIRS) {
      const c = col + dc, r = row + dr;
      if (!inBounds(c, r, 1, 1, s)) continue;
      const nk = key(c, r);
      if (blocked.has(nk) && !own.has(nk)) continue;
      const dx = c + 0.5 - tx, dz = r + 0.5 - tz;
      const d = dx * dx + dz * dz;
      if (!best || d < best.d - 1e-9 || (Math.abs(d - best.d) <= 1e-9 && (r < best.c.row || (r === best.c.row && c < best.c.col)))) {
        best = { c: { col: c, row: r }, d };
      }
    }
  }
  return best ? best.c : null;
}

/**
 * Shortest walk between two cells, as the cells themselves — the route the scorecard
 * counted, not a smoothed stand-in. BFS over four neighbours in a fixed order, so the
 * path is deterministic: the same layout always produces the same drawn route.
 * null when unreachable.
 */
export function bfsPath(from, to, blocked, s = null) {
  if (!from || !to) return null;
  const start = key(from.col, from.row);
  const goal = key(to.col, to.row);
  if (start === goal) return [{ col: from.col, row: from.row }];
  // Parent pointers rather than distances: one BFS answers both "how far" and "which
  // way", so the number on the scorecard and the line on the ground can never disagree.
  const parent = new Map([[start, null]]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    const { col, row } = parseKey(cur);
    for (const [dc, dr] of DIRS) {
      const c = col + dc, r = row + dr;
      if (!inBounds(c, r, 1, 1, s)) continue;
      const nk = key(c, r);
      if (nk !== goal && blocked.has(nk)) continue; // the goal may sit inside a footprint
      if (parent.has(nk)) continue;
      parent.set(nk, cur);
      if (nk === goal) {
        const path = [];
        for (let k = goal; k !== null; k = parent.get(k)) path.push(parseKey(k));
        return path.reverse();
      }
      queue.push(nk);
    }
  }
  return null;
}

/** BFS step count between two cells around obstacles. null when unreachable. */
export function bfsSteps(from, to, blocked, s = null) {
  const path = bfsPath(from, to, blocked, s);
  return path ? path.length - 1 : null;
}

const asRect = (o) => (o && o.w !== undefined ? o : { col: o.col, row: o.row, w: 1, h: 1 });

/**
 * The full walk between two placements (or a placement and a site point): the step
 * count the scorecard uses, plus the cells that produced it. One function, so a route
 * can never be drawn from a different measurement than the one that was scored.
 */
export function walkPath(s, a, b) {
  const blocked = blockedCells(s);
  const A = asRect(a), B = asRect(b);
  const da = doorCell(A, B, blocked, s);
  const db = doorCell(B, A, blocked, s);
  const path = bfsPath(da, db, blocked, s);
  return { steps: path ? path.length - 1 : null, path, from: da, to: db };
}

/** Walk distance in cells between two placements, or a placement and a site point. */
export function walkSteps(s, a, b) {
  return walkPath(s, a, b).steps;
}

/* ------------------------------------------------------------------ journeys */

export function activeJourneys(round) {
  return JOURNEYS.filter((j) => (j.introducedInRound ?? 1) <= round);
}

function sitePoint(tag) {
  if (tag === 'arrival') return asRect(SITE.arrival);
  if (tag === 'service') return asRect(SITE.service);
  return null;
}

/**
 * Resolve a journey against the built layout. Each stop is matched to the NEAREST
 * placement carrying that tag, measured from the previously resolved stop, so the
 * route is the one a colleague would actually walk. Unresolved stops are gaps.
 */
export function evaluateJourney(s, journey) {
  const stops = [];
  // One leg per pair of consecutive RESOLVED stops, carrying the cells that were
  // actually walked. A gap stop leaves `prev` untouched, which is exactly what keeps
  // the friction arithmetic identical to the version that had no paths at all.
  const legs = [];
  let prev = null;
  let prevIndex = -1;
  let friction = 0;
  let gaps = 0;
  let optionalHits = 0;
  for (let i = 0; i < journey.stops.length; i++) {
    const stop = journey.stops[i];
    const fixed = sitePoint(stop.tag);
    if (fixed) {
      const cell = { col: fixed.col, row: fixed.row };
      if (prev) {
        const walk = walkPath(s, prev.rect, fixed);
        const n = walk.steps;
        const added = n === null ? 12 : n;
        friction += added;
        legs.push({ fromIndex: prevIndex, toIndex: i, steps: n, path: walk.path, frictionAdded: added });
      }
      prev = { rect: fixed, cell };
      prevIndex = i;
      stops.push({ ...stop, resolved: true, fixed: true, uid: null, cell });
      continue;
    }
    const candidates = s.placements.filter((p) => p.fnId === stop.tag);
    if (!candidates.length) {
      if (!stop.optional) gaps += 1;
      stops.push({ ...stop, resolved: false, uid: null, cell: null });
      continue;
    }
    let best = null;
    for (const p of candidates) {
      const walk = prev ? walkPath(s, prev.rect, p) : { steps: 0, path: null };
      const n = walk.steps;
      const cost = n === null ? 99 : n;
      if (!best || cost < best.cost || (cost === best.cost && p.uid < best.p.uid)) best = { p, cost, n, path: walk.path };
    }
    const added = prev && best.n !== null ? best.n : 0;
    friction += added;
    if (prev) legs.push({ fromIndex: prevIndex, toIndex: i, steps: best.n, path: best.path, frictionAdded: added });
    prev = { rect: best.p, cell: { col: best.p.col, row: best.p.row } };
    prevIndex = i;
    if (stop.optional) optionalHits += 1;
    stops.push({ ...stop, resolved: true, uid: best.p.uid, cell: prev.cell, rect: best.p });
  }
  const ideal = journey.stops.length * 6;
  const gapWeight = journey.mandatory ? 26 : 20;
  const quality = clamp(100 - gaps * gapWeight - Math.max(0, friction - ideal) * 1.6 + optionalHits * 4, 0, 100);
  return { id: journey.id, label: journey.label, mandatory: !!journey.mandatory, stops, legs, friction: Math.round(friction), gaps, optionalHits, quality: Math.round(quality) };
}

/**
 * One journey in full, whether or not it is scored yet. The panel has to be able to
 * show "not scored until round 3" without inventing a number, so an inactive journey
 * still resolves against the layout — it just says so.
 */
export function journeyDetail(s, journeyId) {
  const journey = JOURNEYS.find((j) => j.id === journeyId);
  if (!journey) return null;
  const introducedInRound = journey.introducedInRound ?? 1;
  return {
    ...evaluateJourney(s, journey),
    metric: JOURNEY_METRIC[journey.id] ?? 'fan',
    active: introducedInRound <= s.round,
    introducedInRound,
  };
}

export function evaluateJourneys(s, round) {
  return activeJourneys(round).map((j) => evaluateJourney(s, j));
}
/* ------------------------------------------------------------------ adjacency */

const HERITAGE_RECT = { uid: 'heritage', fnId: 'heritage', ...SITE.heritage };

function ruleSide(s, id) {
  if (id === 'heritage') return [HERITAGE_RECT];
  return s.placements.filter((p) => p.fnId === id);
}

/** Every adjacency rule that fires, with distance decay so "near" is not a cliff edge. */
export function adjacencyHits(s) {
  const hits = [];
  for (const rule of ADJACENCY) {
    const aList = ruleSide(s, rule.a);
    const bList = ruleSide(s, rule.b);
    if (!aList.length || !bList.length) continue;
    let bestGap = Infinity;
    for (const a of aList) {
      for (const b of bList) {
        if (a.uid === b.uid) continue;
        const g = gapBetween(a, b);
        if (g < bestGap) bestGap = g;
      }
    }
    if (bestGap <= rule.radius) {
      const decay = 1 - (bestGap / (rule.radius + 1)) * 0.45;
      hits.push({
        a: rule.a, b: rule.b, gap: bestGap, metric: rule.metric, note: rule.note,
        delta: round1(rule.weight * decay),
      });
    }
  }
  return hits;
}

/** Required functions that are absent. `requires` means it only bites when the dependent exists. */
export function missingRequired(s) {
  const present = presentIds(s);
  return REQUIRED.filter((req) => !present.has(req.id) && (!req.requires || present.has(req.requires)));
}

export function capacityOf(s) {
  let keys = 0, covers = 0, seats = 0;
  for (const p of s.placements) {
    const f = FUNCTION_BY_ID[p.fnId];
    // Capacity follows the building that was actually paid for, not the catalogue
    // default: a Compact wing sells fewer keys, an Extended one more.
    const { areaFactor, storeyFactor } = scaleOf(p);
    keys += Math.round((f.keys ?? 0) * areaFactor * storeyFactor);
    covers += Math.round((f.covers ?? 0) * areaFactor * storeyFactor);
    seats += Math.round((f.seats ?? 0) * areaFactor * storeyFactor);
    for (const id of p.addons || []) {
      const a = ADDONS.find((x) => x.id === id);
      if (a && a.covers) covers += a.covers;
    }
  }
  return { keys, covers, seats };
}

/* ------------------------------------------------------------------ manpower */

/**
 * Demand this round, per department, measured against what was actually built. A hotel
 * does not roster for rooms it cannot fill or covers it cannot serve, so the demand
 * arithmetic is the same one the scorecard's capacity checks use — the roster and the
 * scorecard can never disagree about how many guests arrived.
 */
function manpowerDemand(s, round) {
  const r = ROUNDS[round - 1] ?? ROUNDS[ROUNDS.length - 1];
  const cap = capacityOf(s);
  const demandRooms = r.arrivals / 1.8;
  const demandCovers = r.arrivals * 0.75;
  const eventDemand = r.n >= 3 ? 120 : r.n === 2 ? 60 : 0;
  return {
    keys: Math.min(cap.keys, demandRooms),
    covers: Math.min(cap.covers, demandCovers),
    seats: eventDemand > 0 ? Math.min(cap.seats, eventDemand) : 0,
    guests: r.arrivals,
  };
}

/** Heads required per cluster: the labour ratios the operating model always implied. */
export function manpowerRequirement(s, round = s.round) {
  const d = manpowerDemand(s, round);
  const req = {};
  for (const c of MANPOWER.clusters) {
    const base = d[c.unit] ?? 0;
    req[c.id] = base > 0 ? Math.ceil(base / c.per) : 0;
  }
  return req;
}

/** Has this team taken charge of its roster at all? Events and the panel both read it. */
export function manpowerEngaged(s) {
  return !!s && ((s.training || 0) > 0 || Object.keys(s.staffing || {}).length > 0);
}

/**
 * The roster as it will be scored. A cluster the team never touched is planned at its
 * requirement — which is exactly what the operating model assumed before this layer
 * existed, so an untouched plan produces no ledger line and no score movement. Only a
 * deviation from requirement can move a score, in either direction.
 */
export function manpowerPlan(s, round = s.round) {
  const need = manpowerRequirement(s, round);
  const tier = MANPOWER.training[clamp(Math.round(s.training || 0), 0, MANPOWER.training.length - 1)];
  const clusters = [];
  let needTotal = 0, plannedTotal = 0, shortHeads = 0, excessHeads = 0;
  for (const c of MANPOWER.clusters) {
    const want = need[c.id];
    const set = s.staffing ? s.staffing[c.id] : undefined;
    const planned = set === undefined || set === null
      ? want
      : clamp(Math.round(set), 0, want * MANPOWER.maxMul);
    // Training makes each head more productive, so a trained team can roster below the
    // raw headcount requirement without the service dropping.
    const effective = planned * (1 + tier.uplift);
    const ratio = want > 0 ? clamp(effective / want, MANPOWER.shortFloor, 1) : 1;
    const short = want > 0 && effective < want;
    const excess = Math.max(0, planned - want);
    needTotal += want;
    plannedTotal += planned;
    if (short) shortHeads += Math.round(want - effective);
    excessHeads += excess;
    clusters.push({
      id: c.id, label: c.label, need: want, planned, effective: round1(effective),
      ratio: round1(ratio), short, excess,
    });
  }
  const shortFrac = needTotal > 0 ? shortHeads / needTotal : 0;
  return {
    clusters, requirement: need, needTotal, plannedTotal,
    shortHeads, excessHeads, shortFrac: round1(shortFrac),
    training: tier.id, trainingLabel: tier.label,
    payroll: plannedTotal * MANPOWER.payPerFteMonth * MANPOWER.months + tier.cost,
    engaged: manpowerEngaged(s),
  };
}

/** The most senior shortfall — the one the ledger names, so the cause is actionable. */
function worstShort(plan) {
  let worst = null;
  for (const c of plan.clusters) {
    if (!c.short) continue;
    if (!worst || c.need - c.effective > worst.need - worst.effective) worst = c;
  }
  return worst;
}

const shortNote = (c) => MANPOWER_NOTE.short
  .replace('{cluster}', c.label).replace('{planned}', String(c.planned)).replace('{need}', String(c.need));

export function footprintCells(s) {
  return s.placements.reduce((n, p) => n + p.w * p.h, 0);
}

/** Guest-facing functions on the river/garden frontage — a premium but finite asset. */
export function viewEdgeHits(s) {
  return s.placements.filter((p) => p.col + p.w - 1 >= SITE.viewEdgeCol && FUNCTION_BY_ID[p.fnId].cat === 'G');
}

/** Back-of-house functions correctly tucked against the service yard. */
export function serviceEdgeHits(s) {
  return s.placements.filter((p) => p.row === 0 && FUNCTION_BY_ID[p.fnId].cat === 'B');
}

function chain(s, nodes) {
  let steps = 0, missing = 0;
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1], b = nodes[i];
    if (!a || !b) { missing += 1; continue; }
    const n = walkSteps(s, a, b);
    steps += n === null ? 14 : n;
  }
  return { steps, missing };
}

/** The four walks that drive operating cost and colleague load. */
export function walkReport(s) {
  const first = (id) => s.placements.find((p) => p.fnId === id) || null;
  const arrival = asRect(SITE.arrival);
  const service = asRect(SITE.service);
  const front = first('front'), rooms = first('rooms');
  const guestArrival = front ? (walkSteps(s, arrival, front) ?? 99) : null;
  const roomWalk = front && rooms ? (walkSteps(s, front, rooms) ?? 99) : null;
  const goods = chain(s, [service, first('recv'), first('kitchen'), first('fnb')]);
  const colleague = chain(s, [service, first('locker'), first('canteen'), first('house')]);
  return { guestArrival, roomWalk, goods, colleague };
}
/* ------------------------------------------------------------------ scorecard */

/** Which scorecard line each journey lands on. */
const JOURNEY_METRIC = { arrival: 'fan', recovery: 'fan', linen: 'brand', goods: 'profit', colleague: 'colleague' };

export function compositeOf(metrics) {
  const c = COMPOSITE_WEIGHTS;
  return Math.round(metrics.fan * c.fan + metrics.profit * c.profit + metrics.colleague * c.colleague + metrics.brand * c.brand);
}

/**
 * Layout-only scorecard: what the built hotel is worth BEFORE this round's events.
 * Every point change is recorded as a cause with a code, so the result card can
 * always say WHY. Baseline plus cause deltas reconciles exactly to the raw score.
 */
export function evaluateLayout(s, round) {
  const r = ROUNDS[round - 1] ?? ROUNDS[ROUNDS.length - 1];
  const causes = [];
  const add = (metric, code, delta, note) => { if (delta) causes.push({ metric, code, delta: round1(delta), note }); };
  const present = presentIds(s);

  const hits = adjacencyHits(s);
  const missing = missingRequired(s);
  const cap = capacityOf(s);
  const walks = walkReport(s);
  const journeys = evaluateJourneys(s, round);
  const view = viewEdgeHits(s);
  const serviceEdge = serviceEdgeHits(s);
  const cells = footprintCells(s);
  // A solar array blunts a utility shock: those buildings count at half their footprint
  // for that event. With no arrays this is exactly the site's cell count.
  const solarCells = s.placements
    .filter((p) => (p.addons || []).some((id) => ADDONS.find((a) => a.id === id)?.halvesUtility))
    .reduce((n, p) => n + p.w * p.h, 0);

  const demandRooms = r.arrivals / 1.8;
  const demandCovers = r.arrivals * 0.75;
  const eventDemand = r.n >= 3 ? 120 : r.n === 2 ? 60 : 0;
  const roomEff = clamp(cap.keys / demandRooms, 0, 1);
  const fnbEff = clamp(cap.covers / demandCovers, 0, 1);
  const eventEff = eventDemand > 0 ? clamp(cap.seats / eventDemand, 0, 1) : 0;
  // The roster, as scored. Computed before the scorecard so the fan, profit and
  // colleague blocks all read the same plan: one roster, one set of consequences.
  const mp = manpowerPlan(s, round);
  const weakest = worstShort(mp);

  /* Fan Score */
  let fan = 52;
  add('fan', 'base:opening', 52, 'Opening position before design decisions are counted');
  for (const h of hits) if (h.metric === 'fan') { fan += h.delta; add('fan', `adj:${h.a}:${h.b}`, h.delta, h.note); }
  for (const m of missing) if (m.metric === 'fan') { fan -= m.penalty; add('fan', `missing:${m.id}`, -m.penalty, m.note); }
  if (walks.guestArrival !== null) {
    const d = walks.guestArrival;
    const delta = d <= 3 ? 8 : d <= 6 ? 3 : -Math.min(14, (d - 6) * 2);
    fan += delta;
    add('fan', 'walk:arrival', delta, d <= 6 ? 'Front Office is close to the arrival court' : 'Guests walk a long way from the arrival court to check in');
  }
  if (walks.roomWalk !== null) {
    const d = walks.roomWalk;
    const delta = d <= 6 ? 4 : -Math.min(10, (d - 6) * 1.5);
    fan += delta;
    add('fan', 'walk:rooms', delta, d <= 6 ? 'Rooms are a short walk from check-in' : 'Guests are walked a long way to their rooms');
  }
  if (roomEff < 1) { const delta = -Math.round((1 - roomEff) * 26); fan += delta; add('fan', 'cap:rooms', delta, 'Not enough rooms: guests queue or are turned away'); }
  if (fnbEff < 1) { const delta = -Math.round((1 - fnbEff) * 14); fan += delta; add('fan', 'cap:fnb', delta, 'Not enough covers: the restaurant turns guests away'); }
  const viewDelta = Math.min(10, view.length * 4);
  if (viewDelta) { fan += viewDelta; add('fan', 'edge:view', viewDelta, 'Guest-facing spaces look out over the river frontage'); }
  // A thin roster reaches the guest: queues at check-in, slow service, rooms not ready.
  if (mp.shortFrac > 0 && weakest) {
    const delta = -Math.round(mp.shortFrac * MANPOWER.shortFan);
    if (delta) { fan += delta; add('fan', 'manpower:short', delta, shortNote(weakest)); }
  }

  /* Profitability */
  let profit = 0;
  const roomRev = Math.round(46 * roomEff);
  const fnbRev = Math.round(20 * fnbEff);
  const eventRev = Math.round(10 * eventEff);
  profit += roomRev + fnbRev + eventRev;
  add('profit', 'rev:rooms', roomRev, roomEff >= 1 ? 'Room capacity met the demand this round' : `Only ${Math.round(roomEff * 100)}% of the rooms demanded could be sold`);
  add('profit', 'rev:fnb', fnbRev, fnbEff >= 1 ? 'Outlets covered the covers demanded' : `Only ${Math.round(fnbEff * 100)}% of the covers demanded could be served`);
  add('profit', 'rev:events', eventRev, eventEff >= 1 ? 'Event space captured the enquiries' : eventDemand ? `Only ${Math.round(eventEff * 100)}% of event enquiries could be taken` : 'No event enquiries this round');
  for (const h of hits) if (h.metric === 'profit') { profit += h.delta; add('profit', `adj:${h.a}:${h.b}`, h.delta, h.note); }
  for (const m of missing) if (m.metric === 'profit') { profit -= m.penalty; add('profit', `missing:${m.id}`, -m.penalty, m.note); }
  // Extra storeys cost money to run every round: height is not free once it is built.
  // Zero when nobody has added a storey, which is why the baseline does not move.
  const extraStoreys = s.placements.reduce((n, p) => n + Math.max(0, p.storeyDelta || 0), 0);
  const opCost = Math.round(Math.min(26, cells * 0.16 + s.placements.length * 0.35 + walks.goods.steps * 0.22 + extraStoreys * 0.3));
  profit -= opCost;
  add('profit', 'cost:operating', -opCost, `Running ${cells} cells of building and a ${walks.goods.steps}-step goods route`);
  const walkCost = Math.round(Math.min(12, Math.max(0, walks.colleague.steps - 12) * 0.6));
  if (walkCost) { profit -= walkCost; add('profit', 'cost:colleague-walk', -walkCost, 'Long colleague routes add paid hours that produce nothing'); }
  // Land costs money twice: once to buy, and every round to keep. Free plots (upkeep 0)
  // add nothing to the ledger, so an unexpanded site reconciles exactly as before.
  for (const plot of s.plots || []) {
    if (!plot.upkeep) continue;
    profit -= plot.upkeep;
    add('profit', `land:${plot.id}`, -plot.upkeep, LAND_NOTE.replace('{label}', plot.label));
  }
  // Manpower, scored as deviation from requirement. Understaffed clusters cannot sell
  // what they cannot serve; overstaffed ones pay for colleagues with nothing to do;
  // training costs points every season it runs. An untouched roster adds nothing here.
  const revOf = { rooms: roomRev, fnb: fnbRev, events: eventRev, front: 0 };
  for (const c of mp.clusters) {
    if (c.short) {
      const lost = Math.round((revOf[c.id] || 0) * (1 - c.ratio));
      if (lost) { profit -= lost; add('profit', `manpower:short:${c.id}`, -lost, shortNote(c)); }
    }
    if (c.excess) {
      const cost = c.excess * MANPOWER.overPoints;
      profit -= cost;
      add('profit', `manpower:over:${c.id}`, -cost,
        MANPOWER_NOTE.over.replace('{cluster}', c.label).replace('{excess}', String(c.excess)));
    }
  }
  if (mp.training > 0) {
    const t = MANPOWER.training[mp.training];
    profit -= t.points;
    add('profit', 'manpower:training', -t.points, MANPOWER_NOTE.training.replace('{tier}', t.label));
  }
  /* Colleague Engagement */
  let colleague = 46;
  add('colleague', 'base:opening', 46, 'Colleagues start neutral; the building shapes the shift');
  const peopleValue = { canteen: 9, train: 8, pc: 5, locker: 4 };
  for (const id of Object.keys(peopleValue)) {
    if (!present.has(id)) continue;
    colleague += peopleValue[id];
    add('colleague', `have:${id}`, peopleValue[id], `${FUNCTION_BY_ID[id].label} is on site`);
  }
  for (const h of hits) if (h.metric === 'colleague') { colleague += h.delta; add('colleague', `adj:${h.a}:${h.b}`, h.delta, h.note); }
  for (const m of missing) if (m.metric === 'colleague') { colleague -= m.penalty; add('colleague', `missing:${m.id}`, -m.penalty, m.note); }
  const cw = walks.colleague.steps;
  const loadDelta = round1(cw <= 12 ? 5 : -Math.min(18, (cw - 12) * 1.4));
  colleague += loadDelta;
  add('colleague', 'walk:colleague', loadDelta, cw <= 12 ? 'The colleague route is short: change, eat, then on shift' : 'Colleagues cross the site to change, eat and start shift');
  const workload = r.arrivals / 40;
  const peopleCap = countOf(s, 'canteen') * 2 + countOf(s, 'train') * 1.5 + countOf(s, 'pc') * 1.5 + countOf(s, 'locker') * 2;
  if (peopleCap < workload) {
    const delta = -Math.round(Math.min(20, (workload - peopleCap) * 4));
    colleague += delta;
    add('colleague', 'staff:short', delta, 'People & Culture provision is below the size of the workforce');
  }
  // The roster lands on the people who work it: too few colleagues is burnout, and a
  // second short round is worse than one — staff leave because the pattern repeats.
  if (mp.shortFrac > 0 && weakest) {
    const delta = -Math.round(mp.shortFrac * MANPOWER.shortColleague);
    if (delta) { colleague += delta; add('colleague', 'manpower:short', delta, shortNote(weakest)); }
    if ((s.shortStreak || 0) >= 1) {
      colleague -= MANPOWER.chronic;
      add('colleague', 'manpower:chronic', -MANPOWER.chronic, MANPOWER_NOTE.chronic);
    }
  }
  if (mp.training > 0) {
    const t = MANPOWER.training[mp.training];
    if (t.colleague) {
      colleague += t.colleague;
      add('colleague', 'manpower:training', t.colleague, MANPOWER_NOTE.training.replace('{tier}', t.label));
    }
  }

  /* Brand Standards */
  let brand = 50;
  add('brand', 'base:opening', 50, 'Standards start at the house baseline');
  for (const h of hits) if (h.metric === 'brand') { brand += h.delta; add('brand', `adj:${h.a}:${h.b}`, h.delta, h.note); }
  for (const m of missing) if (m.metric === 'brand') { brand -= m.penalty; add('brand', `missing:${m.id}`, -m.penalty, m.note); }
  const sig = SIGNATURES.find((x) => x.id === s.signature);
  if (sig) { brand += sig.brand; add('brand', `signature:${sig.id}`, sig.brand, `${sig.label} gives the hotel a signature guests remember`); }
  const land = LANDSCAPES.find((x) => x.id === s.landscape);
  if (land && land.brand) { brand += land.brand; add('brand', `landscape:${land.id}`, land.brand, `${land.label} landscaping around the building`); }
  brand += 5; add('brand', 'heritage:kept', 5, 'The heritage pavilion was preserved');
  // Height beside a two-storey pavilion is a design decision with a standards cost.
  const overshadowing = s.placements.filter((p) => {
    const f = FUNCTION_BY_ID[p.fnId];
    return storeysCustomisable(f) && storeysOf(p) >= 8 && gapBetween(p, HERITAGE_RECT) <= 2;
  });
  if (overshadowing.length) {
    brand -= 4;
    add('brand', 'height:heritage', -4, HEIGHT_NOTE);
  }
  const seDelta = Math.min(8, serviceEdge.length * 2);
  if (seDelta) { brand += seDelta; add('brand', 'edge:service', seDelta, 'Back of house is tucked against the service yard, out of guest sight'); }
  const bohInSight = s.placements.filter((p) => FUNCTION_BY_ID[p.fnId].cat === 'B'
    && Math.abs(p.row - SITE.arrival.row) + Math.abs(p.col - SITE.arrival.col) <= 3);
  if (bohInSight.length) {
    const delta = -6 * bohInSight.length;
    brand += delta;
    add('brand', 'sight:boh', delta, 'Back of house sits in full view of the arrival court');
  }

  /* Building customisation: add-ons the team chose to pay for */
  for (const addon of ADDONS) {
    const count = s.placements.filter((p) => (p.addons || []).includes(addon.id)).length;
    if (!count || !addon.delta) continue;
    // Capped per add-on type: past the cap it is a cost, not a score.
    const counted = Math.min(count, ADDON_SCORE_CAP);
    const delta = addon.delta * counted;
    if (addon.metric === 'fan') fan += delta;
    else if (addon.metric === 'profit') profit += delta;
    else if (addon.metric === 'colleague') colleague += delta;
    else brand += delta;
    const note = ADDON_NOTE.replace('{label}', addon.label).replace('{n}', String(count))
      .replace('building(s)', count === 1 ? 'building' : 'buildings');
    add(addon.metric, `addon:${addon.id}`, delta, note);
  }

  /* Journeys land on their own scorecard line */
  for (const j of journeys) {
    const metric = JOURNEY_METRIC[j.id] ?? 'fan';
    const delta = Math.round((j.quality - 62) * 0.22);
    if (metric === 'fan') fan += delta;
    else if (metric === 'profit') profit += delta;
    else if (metric === 'colleague') colleague += delta;
    else brand += delta;
    add(metric, `journey:${j.id}`, delta, j.gaps
      ? `${j.label}: ${j.gaps} step${j.gaps > 1 ? 's' : ''} with no home on site`
      : `${j.label}: ${j.friction} steps of walking end to end`);
  }

  const raw = { fan, profit, colleague, brand };
  const metrics = {
    fan: clamp(Math.round(fan), 0, 100),
    profit: clamp(Math.round(profit), 0, 100),
    colleague: clamp(Math.round(colleague), 0, 100),
    brand: clamp(Math.round(brand), 0, 100),
  };
  for (const m of Object.keys(metrics)) {
    if (Math.round(raw[m]) !== metrics[m]) {
      causes.push({ metric: m, code: 'clamp', delta: round1(metrics[m] - raw[m]), note: `${m} was held inside the 0-100 range` });
    }
  }

  return {
    round: r.n, roundName: r.name, arrivals: r.arrivals, metrics, raw,
    composite: compositeOf(metrics), causes,
    capacity: {
      ...cap, demandRooms: round1(demandRooms), demandCovers: round1(demandCovers), eventDemand,
      roomEff: Math.round(roomEff * 100), fnbEff: Math.round(fnbEff * 100), eventEff: Math.round(eventEff * 100),
    },
    // The roster exactly as it was scored, for the panel and the reveal card.
    manpower: mp,
    walks: { guestArrival: walks.guestArrival, roomWalk: walks.roomWalk, goods: walks.goods.steps, colleague: cw },
    journeys, missing: missing.map((m) => m.id), footprintCells: cells,
    // Solar-adjusted cells, used by the utility shock. Equal to footprintCells with no arrays.
    utilityCells: cells - solarCells * 0.5,
    viewEdge: view.length, serviceEdge: serviceEdge.length,
  };
}

/* --------------------------------------------------------------------- events */

/** Deterministic event draw for a round; never repeats an event within a session. */
export function drawEvents(s, round) {
  const count = round >= 4 ? 3 : round >= 3 ? 2 : 1;
  const rng = makeRng(`${s.seed}:draw:${round}`);
  const pool = rng.shuffle(EVENTS).filter((e) => !s.usedEvents.includes(e.id));
  const picked = pool.slice(0, Math.min(count, pool.length));
  // Manpower events are added only for a team that has actually planned a roster. The
  // main deck is untouched, so a session that never opens the panel draws exactly the
  // events it always did — which is what the regression lock requires.
  if (manpowerEngaged(s) && picked.length) {
    const mpRng = makeRng(`${s.seed}:draw:${round}:manpower`);
    const spare = mpRng.shuffle(MANPOWER_EVENTS).filter((e) => !s.usedEvents.includes(e.id));
    if (spare.length && mpRng.chance(0.5)) picked[picked.length - 1] = spare[0];
  }
  return picked;
}

const label = (id) => FUNCTION_BY_ID[id]?.label ?? id;

/**
 * Resolve one event against the built layout. An event never invents an outcome:
 * it reads what exists, how far away it is, and what the current scores are.
 */
export function resolveEvent(s, ev, layout, rng) {
  const present = presentIds(s);
  const deltas = { fan: 0, profit: 0, colleague: 0, brand: 0 };
  const notes = [];
  let outcome = 'neutral';

  if (ev.arrivalsMul) {
    const extra = Math.round(layout.arrivals * (ev.arrivalsMul - 1));
    const spareKeys = layout.capacity.keys - layout.capacity.demandRooms;
    const captured = clamp(spareKeys / Math.max(1, extra / 1.8), 0, 1);
    const d = Math.round(10 * captured - 6 * (1 - captured));
    deltas.profit += d;
    notes.push(captured >= 0.99
      ? `Absorbed all ${extra} extra arrivals`
      : `Only absorbed ${Math.round(captured * 100)}% of the ${extra} extra arrivals`);
    outcome = d >= 0 ? 'good' : 'bad';
  }

  if (ev.needs) {
    const have = ev.needs.every((id) => present.has(id));
    const mine = s.placements.filter((p) => ev.needs.includes(p.fnId));
    let near = true;
    if (have && ev.nearArrival) {
      near = mine.some((p) => Math.abs(p.row - SITE.arrival.row) + Math.abs(p.col - SITE.arrival.col) <= 4);
    }
    if (have && ev.nearService) near = mine.some((p) => p.row <= 2);
    if (have && near) {
      if (ev.fanWin) deltas.fan += ev.fanWin;
      if (ev.brandWin) deltas.brand += ev.brandWin;
      if (ev.profitWin) deltas.profit += ev.profitWin;
      notes.push(`Handled: ${ev.needs.map(label).join(' and ')} were in place and in reach`);
      outcome = 'good';
    } else {
      if (ev.fanLose) deltas.fan += ev.fanLose;
      if (ev.brandLose) deltas.brand += ev.brandLose;
      if (ev.profitLose) deltas.profit += ev.profitLose;
      notes.push(ev.loseNote || `Not handled: ${ev.needs.map(label).join(' and ')} ${have ? 'were too far from where the action was' : 'were not on site'}`);
      outcome = 'bad';
    }
  }
  if (ev.riskIfMissing) {
    const haveTeam = present.has(ev.riskIfMissing);
    const risk = haveTeam ? ev.riskBase * 0.25 : ev.riskBase;
    if (rng.chance(risk)) {
      const mul = haveTeam ? 0.4 : 1;
      deltas.fan += Math.round(ev.fanLose * mul);
      deltas.brand += Math.round(ev.brandLose * mul);
      notes.push(haveTeam ? 'The plant team had it running before breakfast' : 'No plant team on site: the fault stayed open all night');
      outcome = 'bad';
    } else {
      notes.push('No failure this round');
    }
  }

  if (ev.fanBelow !== undefined) {
    if (layout.metrics.fan < ev.fanBelow) {
      deltas.fan += ev.fanLose; notes.push('A weak Fan Score amplified the damage'); outcome = 'bad';
    } else {
      notes.push('A strong Fan Score absorbed the noise'); outcome = 'good';
    }
  }

  if (ev.colleagueBelow !== undefined) {
    if (layout.metrics.colleague < ev.colleagueBelow) {
      deltas.fan += ev.fanLose; deltas.profit += ev.profitLose;
      notes.push('Thin Colleague Engagement turned absence into a service failure'); outcome = 'bad';
    } else {
      notes.push('Engaged colleagues covered the shifts'); outcome = 'good';
    }
  }

  if (ev.scalesWithFootprint) {
    const d = Math.round(ev.profitLose * (1 + (layout.utilityCells ?? layout.footprintCells) / 90));
    deltas.profit += d;
    notes.push(`A bigger building costs more to run: ${d} points`);
    outcome = 'bad';
  }

  if (ev.penalisesJourney) {
    const j = layout.journeys.find((x) => x.id === ev.penalisesJourney);
    if (!j) {
      notes.push(`${ev.label}: no ${ev.penalisesJourney} journey designed yet`);
    } else if (j.quality < 70) {
      deltas.fan += ev.fanLose;
      notes.push(`${j.label} could not absorb the complaint (${j.gaps} gaps, ${j.friction} steps)`);
      outcome = 'bad';
    } else {
      deltas.fan += 3;
      notes.push(`${j.label} absorbed the complaint on the night`);
      outcome = 'good';
    }
  }

  // Manpower events read the roster, never the fiction. A team that staffed to
  // requirement is not punished for a shortage it did not create.
  if (ev.mp) {
    const plan = layout.manpower;
    if (ev.mp === 'resignation') {
      if (plan && plan.shortFrac > 0.05) {
        const scale = clamp(plan.shortFrac * 2, 0.5, 1);
        deltas.colleague += -Math.round(ev.colleagueLose * scale);
        deltas.fan += -Math.round(ev.fanLose * scale);
        deltas.profit += -Math.round(ev.profitLose * scale);
        notes.push(MANPOWER_NOTE.leave);
        outcome = 'bad';
      } else {
        notes.push('The roster held: nobody left');
        outcome = 'good';
      }
    }
    if (ev.mp === 'banquet') {
      const events = plan && plan.clusters.find((c) => c.id === 'events');
      const covered = events && events.need > 0 && events.planned >= Math.ceil(events.need * 1.5);
      if (covered) {
        deltas.profit += ev.profitWin;
        notes.push('The ballroom was staffed for the extra covers');
        outcome = 'good';
      } else {
        deltas.profit += ev.profitLose;
        deltas.fan += ev.fanLose;
        notes.push(events && events.need > 0
          ? 'The ballroom ran short of colleagues and turned covers away'
          : 'No event space: the booking went elsewhere');
        outcome = 'bad';
      }
    }
    if (ev.mp === 'payreview') {
      const heads = plan ? plan.plannedTotal : 0;
      const d = -Math.max(2, Math.round(heads * ev.profitPerHead));
      deltas.profit += d;
      notes.push(`The pay review covered ${heads} colleagues`);
      outcome = 'bad';
    }
  }

  return { id: ev.id, label: ev.label, detail: ev.detail, deltas, notes, outcome };
}

/** Live preview of the current layout, before events. Drives the metrics ribbon. */
export function preview(s) {
  return evaluateLayout(s, s.round);
}

/** Run the current round: layout score, seeded events, final metrics, full ledger. */
export function runRound(s) {
  const layout = evaluateLayout(s, s.round);
  const drawn = drawEvents(s, s.round);
  const resolved = [];
  const eventCauses = [];
  for (const ev of drawn) {
    const rng = makeRng(`${s.seed}:ev:${s.round}:${ev.id}`);
    const res = resolveEvent(s, ev, layout, rng);
    resolved.push(res);
    for (const k of Object.keys(res.deltas)) {
      if (!res.deltas[k]) continue;
      eventCauses.push({ metric: k, code: `event:${ev.id}`, delta: res.deltas[k], note: `${ev.label} — ${res.notes[0] || ev.detail}` });
    }
  }
  const metrics = {};
  for (const k of Object.keys(layout.metrics)) {
    const extra = eventCauses.filter((c) => c.metric === k).reduce((n, c) => n + c.delta, 0);
    metrics[k] = clamp(Math.round(layout.metrics[k] + extra), 0, 100);
  }
  const result = {
    round: s.round, roundName: layout.roundName, layout,
    events: resolved, metrics, composite: compositeOf(metrics),
    ledger: [...layout.causes, ...eventCauses],
  };
  // A shortfall is remembered between rounds: chronic understaffing is a pattern the
  // scorecard can see, not a fresh guess each time.
  s.shortStreak = layout.manpower.shortFrac > 0.05 ? (s.shortStreak || 0) + 1 : 0;
  s.history.push({
    round: s.round, roundName: layout.roundName, metrics, composite: result.composite,
    events: resolved.map((e) => ({ id: e.id, label: e.label, outcome: e.outcome })),
    placements: s.placements.length, spent: s.spent,
  });
  s.usedEvents.push(...drawn.map((e) => e.id));
  return result;
}
/* ------------------------------------------------------------------- presets */

/**
 * Demo presets. Each is an ordered build list; the greedy placer finds the best
 * legal spot for every item, so a preset can never produce an illegal layout.
 * They exist so the four strategies can be compared side by side in seconds,
 * and so the built hotel can be inspected visually without placing 16 blocks by hand.
 */
export const PRESETS = {
  core:     { label: 'Round 1 core',            round: 1, fns: ['rooms', 'front', 'fnb', 'kitchen', 'house'] },
  /** A balanced 15-function starting point. Don't name it "balanced" — the first
   *  click then gives the answer away (it scores 71 vs 43 for revenue-first). */
  // Preset labels are reframed: they read as starting POINTS a team might adopt,
  // not strategies a team is being scored against. The score is still computed the
  // same way; only the words on the button have changed.
  // Map of preset id -> { label, note, fns, round, mode: 'normal' | 'sandbox' }.
  // `sandbox` mode gives the full 640 credits upfront and runs all four rounds
  // against the same final layout, so a team can compare radically different
  // strategies (e.g. towers-only, waterpark, just-a-restaurant) in a single session.
  balanced: { label: '15 functions', note: 'Front office, rooms, kitchen, plant, people', round: 4, fns: ['rooms', 'front', 'concierge', 'fnb', 'kitchen', 'recv', 'house', 'rooms', 'laundry', 'eng', 'sec', 'canteen', 'train', 'pc', 'locker'] },
  revenue:  { label: 'Guest-facing only', note: 'A hotel that ignores the back of house', round: 4, fns: ['rooms', 'rooms', 'rooms', 'front', 'fnb', 'fnb2', 'kitchen', 'ballroom'] },
  people:   { label: 'Colleague-first', note: 'Canteen, training, plant, then a smaller hotel', round: 4, fns: ['rooms', 'front', 'fnb', 'kitchen', 'house', 'laundry', 'eng', 'recv', 'sec', 'canteen', 'train', 'pc', 'locker', 'rooms'] },
  neglect:  { label: 'Pool and spa only', note: 'No laundry, no engineering, no people space', round: 4, fns: ['rooms', 'rooms', 'rooms', 'front', 'fnb', 'kitchen', 'pool', 'spa'] },
  sandbox:  { label: 'Sandbox', note: 'Full 640 credits upfront, no per-round gating', round: 4, mode: 'sandbox', fns: [] },
};

/** Where a function "wants" to be. Mirrors the adjacency matrix, not a separate truth. */
function zoneAnchor(s, fnId) {
  if (fnId === 'front' || fnId === 'concierge') return SITE.arrival;
  if (fnId === 'kitchen' || fnId === 'steward') {
    const fnb = s.placements.find((p) => p.fnId === 'fnb' || p.fnId === 'fnb2');
    if (fnb) return { col: fnb.col, row: Math.max(0, fnb.row - 2) };
    return SITE.service;
  }
  if (fnId === 'house') {
    const rooms = s.placements.find((p) => p.fnId === 'rooms');
    if (rooms) return { col: rooms.col, row: rooms.row };
    return SITE.service;
  }
  const f = FUNCTION_BY_ID[fnId];
  if (f.cat === 'B') return SITE.service;
  if (f.cat === 'P') return { col: 3, row: 1 };
  return { col: SITE.viewEdgeCol - 1, row: 4 }; // guest-facing wants the river frontage
}

/** Best legal spot for a function: nearest to its zone anchor, deterministic on ties. */
export function findSpot(s, fnId) {
  const anchor = zoneAnchor(s, fnId);
  let best = null;
  for (let rot = 0; rot < 2; rot++) {
    const { w, h } = footprint(fnId, rot);
    for (let row = 0; row + h <= SITE.rows; row++) {
      for (let col = 0; col + w <= SITE.cols; col++) {
        if (placementBlocker(s, fnId, col, row, rot)) continue;
        const d = Math.abs(col + w / 2 - (anchor.col + 0.5)) + Math.abs(row + h / 2 - (anchor.row + 0.5));
        const score = d * 10 + rot + col * 0.01 + row * 0.001;
        if (!best || score < best.score) best = { col, row, rot, score };
      }
    }
  }
  return best ? { col: best.col, row: best.row, rot: best.rot } : null;
}

/**
 * Build a preset hotel. Sets the round and released budget as though those rounds
 * had been played, so a full hotel can be inspected at once in demo mode.
 */
export function autoBuild(s, presetId) {
  const plan = PRESETS[presetId] || PRESETS.core;
  s.placements = []; s.spent = 0; s.nextUid = 1; s.selectedUid = null;
  s.round = plan.round;
  // Sandbox gives the full 640 upfront, all rounds score the same final layout.
  // Anything else follows the round table so round 1 cannot start with 640 in the bank.
  s.released = plan.mode === 'sandbox' ? ROUNDS.reduce((n, r) => n + r.allowance, 0) : ROUNDS.slice(0, plan.round).reduce((n, r) => n + r.allowance, 0);
  s.sandbox = plan.mode === 'sandbox';
  const skipped = [];
  for (const fnId of plan.fns) {
    const spot = findSpot(s, fnId);
    if (!spot) { skipped.push(fnId); continue; }
    if (!place(s, fnId, spot.col, spot.row, spot.rot).ok) skipped.push(fnId);
  }
  return { ok: true, presetId, placed: s.placements.length, skipped, available: availableBudget(s) };
}

/** Audit trail for the reveal screen: every cause, grouped by scorecard line. */
export function traceOf(result) {
  const out = { fan: [], profit: [], colleague: [], brand: [] };
  for (const c of result.ledger) (out[c.metric] || (out[c.metric] = [])).push(c);
  return out;
}


