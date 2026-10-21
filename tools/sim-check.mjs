// sim-check.mjs — runs the simulation in Node with no browser at all. Proves the
// engine is isomorphic and deterministic, and prints the balance evidence.
import { readFile } from 'node:fs/promises';
import {
  createSession, autoBuild, runRound, advanceRound, preview, PRESETS, traceOf,
  evaluateLayout, place, placementBlocker, removePlacement,
  journeyDetail, isOwned, ownedCells, inBounds, walkSteps, walkPath,
  customise, costOf, capacityOf, storeysOf, addonEligible, resolveEvent, footprintOf,
  buyPlot, viewEdgeHits,
  drawEvents, manpowerPlan, manpowerRequirement, manpowerEngaged,
} from '../js/sim/engine.js';
import {
  ROUNDS, SITE, ADDONS, STOREY_DELTA, FUNCTION_BY_ID, EVENTS, PLOTS, PLOT_ONLY_NOTE,
  MANPOWER, MANPOWER_EVENTS,
} from '../js/sim/catalogue.js';
import { snapshot } from './make-baseline.mjs';

const pad = (v, n) => String(v).padStart(n);
let fails = 0;
const check = (name, cond, extra = '') => {
  if (cond) console.log(`  ok   ${name}`);
  else { console.log(`  FAIL ${name} ${extra}`); fails++; }
};

console.log('== determinism: same seed, same result ==');
const runOnce = (preset, seed) => {
  const s = createSession({ seed, style: 'tower', palette: 'gold' });
  autoBuild(s, preset);
  const out = [];
  while (s.round <= ROUNDS.length) {
    const r = runRound(s);
    out.push({ m: r.metrics, c: r.composite, e: r.events.map((x) => x.id) });
    if (!advanceRound(s).ok) break;
  }
  return JSON.stringify(out);
};
for (const p of Object.keys(PRESETS)) {
  check(`${p} deterministic`, runOnce(p, 'seed-a') === runOnce(p, 'seed-a'));
}
check('different seed changes events', (() => {
  const a = JSON.parse(runOnce('balanced', 'seed-a'));
  const b = JSON.parse(runOnce('balanced', 'seed-b'));
  return JSON.stringify(a) !== JSON.stringify(b);
})());

console.log('\n== regression lock: the shipped baseline, byte for byte ==');
{
  // The lock exists because everything that follows (journeys, customisation, land)
  // edits scoring and walk code that already works. "No change" has to mean the same
  // numbers AND the same ledger wording AND the same placement cells, not a vibe.
  const base = JSON.parse(await readFile(new URL('./baseline.json', import.meta.url), 'utf8'));
  const now = snapshot();

  // Report WHERE it diverged: "differs somewhere in 130KB of JSON" is not actionable
  // for whoever broke it.
  const diff = (a, b, path = '') => {
    if (a === b) return null;
    const kind = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
    const ta = kind(a), tb = kind(b);
    if (ta !== tb) return `${path}: ${ta} -> ${tb}`;
    if (ta === 'array') {
      if (a.length !== b.length) return `${path}: length ${a.length} -> ${b.length}`;
      for (let i = 0; i < a.length; i++) {
        const d = diff(a[i], b[i], `${path}[${i}]`);
        if (d) return d;
      }
      return null;
    }
    if (ta === 'object') {
      const ka = Object.keys(a).join(','), kb = Object.keys(b).join(',');
      if (ka !== kb) return `${path}: keys [${ka}] -> [${kb}]`;
      for (const k of Object.keys(a)) {
        const d = diff(a[k], b[k], `${path}.${k}`);
        if (d) return d;
      }
      return null;
    }
    return `${path}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`;
  };

  check('baseline is substantive, not an empty shell', (() => {
    const b = base.presets?.balanced;
    return Object.keys(base.presets || {}).length >= 5
      && !!b && b.rounds.length > 0 && b.rounds[0].ledger.length > 10
      && b.layout.placements.length > 10 && b.layout.journeys.length >= 5;
  })(), 'a baseline regenerated from a broken engine would lock the breakage in');

  const d = diff(base, now);
  check('scores, ledgers, journeys and placement cells match the baseline exactly', d === null, d || '');
}

console.log('\n== balance evidence: composite by strategy (round 4) ==');
const table = [];
for (const p of Object.keys(PRESETS)) {
  const s = createSession({ seed: 'hb-balance', style: 'tower', palette: 'gold' });
  autoBuild(s, p);
  while (s.round < 4) advanceRound(s); // compare every strategy on the same round
  const r = runRound(s);
  table.push({ preset: p, ...r.metrics, composite: r.composite, placements: s.placements.length, spent: s.spent, available: s.released - s.spent });
}
console.log(['preset', 'fan', 'profit', 'colleag', 'brand', 'COMPOSITE', 'blocks', 'spent', 'left'].map((h) => h.padStart(10)).join(''));
for (const t of table) {
  console.log([t.preset, t.fan, t.profit, t.colleague, t.brand, t.composite, t.placements, t.spent, t.available].map((v) => String(v).padStart(10)).join(''));
}
const byComp = (id) => table.find((t) => t.preset === id).composite;
check('balanced beats revenue-first', byComp('balanced') > byComp('revenue'), `${byComp('balanced')} vs ${byComp('revenue')}`);
check('balanced beats neglected BOH', byComp('balanced') > byComp('neglect'), `${byComp('balanced')} vs ${byComp('neglect')}`);
check('people-first beats revenue-first', byComp('people') > byComp('revenue'), `${byComp('people')} vs ${byComp('revenue')}`);
check('neglect is the weakest or near it', byComp('neglect') <= Math.max(byComp('revenue'), byComp('core')));

console.log('\n== ledger reconciliation: baseline + deltas == raw ==');
{
  const s = createSession({ seed: 'hb-recon' });
  autoBuild(s, 'balanced');
  const layout = evaluateLayout(s, 4);
  for (const m of ['fan', 'profit', 'colleague', 'brand']) {
    const sum = layout.causes.filter((c) => c.metric === m).reduce((n, c) => n + c.delta, 0);
    check(`${m} causes reconcile to clamped score`, Math.abs(sum - layout.metrics[m]) < 0.51, `sum=${sum} metric=${layout.metrics[m]}`);
  }
  check('trace groups every ledger entry', Object.values(traceOf({ ledger: layout.causes })).flat().length === layout.causes.length);
}

console.log('\n== placement rules ==');
{
  const s = createSession({ seed: 'hb-rules' });
  check('heritage cannot be built over', !!placementBlocker(s, 'rooms', 2, 4, 0));
  check('arrival court stays clear', !!placementBlocker(s, 'front', 5, 8, 0));
  check('out of bounds rejected', !!placementBlocker(s, 'rooms', 11, 7, 0));
  check('legal spot accepted', !placementBlocker(s, 'rooms', 6, 5, 0));
  const a = place(s, 'rooms', 6, 5, 0);
  check('place() works', a.ok);
  check('overlap rejected', !!placementBlocker(s, 'fnb', 7, 6, 0));
  check('rotate works', place(s, 'fnb', 0, 7, 0).ok);

  const b = createSession({ seed: 'hb-budget' });
  place(b, 'rooms', 0, 6, 0);     // 120 (rows 6-8: clear of the heritage pavilion at rows 4-5)
  place(b, 'ballroom', 4, 5, 0);  //  70
  place(b, 'spa', 7, 6, 0);       //  55 -> 245 spent of 300 released
  check('three placements landed', b.placements.length === 3 && b.spent === 245, `spent=${b.spent}`);
  check('over budget rejected', !!placementBlocker(b, 'fnb', 0, 0, 0), 'fnb costs 60, only 55 left');
  check('within budget accepted', placementBlocker(b, 'house', 0, 0, 0) === null);
  check('remove refunds 70%', (() => {
    const before = b.spent;
    const r = removePlacement(b, b.placements[0].uid);
    return r.ok && r.refund === 84 && b.spent === before - 84;
  })());
}

console.log('\n== customisation: size, storeys and add-ons move the scorecard ==');
{
  const fresh = (fnId, col, row) => {
    const s = createSession({ seed: 'hb-custom' });
    return { s, p: place(s, fnId, col, row, 0).placement };
  };

  // Size moves the LONG side only, and capacity follows area exactly.
  const sizes = {};
  for (const size of ['S', 'M', 'L']) {
    const { s, p } = fresh('rooms', 0, 6);
    const res = customise(s, p.uid, { size });
    sizes[size] = { ok: res.ok, w: p.w, h: p.h, keys: capacityOf(s).keys, cost: costOf(p) };
  }
  check('Compact rooms: 3x3 footprint, 45 keys', sizes.S.w === 3 && sizes.S.h === 3 && sizes.S.keys === 45, JSON.stringify(sizes.S));
  check('Standard rooms unchanged: 4x3, 60 keys, 120 credits', sizes.M.w === 4 && sizes.M.h === 3 && sizes.M.keys === 60 && sizes.M.cost === 120, JSON.stringify(sizes.M));
  check('Extended rooms: 5x3 footprint, 75 keys, 150 credits', sizes.L.w === 5 && sizes.L.h === 3 && sizes.L.keys === 75 && sizes.L.cost === 150, JSON.stringify(sizes.L));

  {
    const { s, p } = fresh('rooms', 0, 6);
    const res = customise(s, p.uid, { storeyDelta: 1 });
    check('storey +1 on Rooms: 7 storeys, 70 keys, 140 credits', res.ok && storeysOf(p) === 7 && capacityOf(s).keys === 70 && costOf(p) === 140, JSON.stringify({ ok: res.ok, storeys: storeysOf(p), keys: capacityOf(s).keys, cost: costOf(p) }));
  }

  // A resize that would overlap a neighbour is refused, and spends nothing.
  {
    const s = createSession({ seed: 'hb-custom' });
    const rooms = place(s, 'rooms', 0, 6, 0).placement;
    // (4,6) clears the reserved arrival cell at (5,8); at (4,7) this placement is
    // refused and the "neighbour" in this test would silently not exist.
    check('the neighbour used by the resize test was placed', place(s, 'fnb', 4, 6, 0).ok);
    const spent = s.spent;
    const res = customise(s, rooms.uid, { size: 'L' });
    check('a resize into a neighbour is refused without spending', res.ok === false && s.spent === spent && rooms.w === 4, JSON.stringify({ reason: res.reason, spentBefore: spent, spentAfter: s.spent }));
  }

  // Downsizing refunds 70% of the difference, the same rule as removing a building.
  {
    const { s, p } = fresh('rooms', 0, 6);
    const before = s.spent;
    const res = customise(s, p.uid, { size: 'S' });
    check('downsizing Rooms refunds 70% of the 30-credit difference', res.ok && res.refund === 21 && s.spent === before - 21, JSON.stringify({ refund: res.refund, spent: s.spent }));
  }

  // An add-on's score is capped: three terraces are worth two.
  {
    const s = createSession({ seed: 'hb-custom' });
    autoBuild(s, 'revenue');
    s.released += 500;   // test-only: the preset already spends almost all of its 640
    const rooms = s.placements.filter((x) => x.fnId === 'rooms');
    for (const p of rooms) customise(s, p.uid, { toggle: 'terrace' });
    const causes = evaluateLayout(s, 4).causes.filter((c) => c.code === 'addon:terrace');
    check('three terraces score +4 fan, not +6', rooms.length === 3 && causes.reduce((n, c) => n + c.delta, 0) === 4, JSON.stringify({ rooms: rooms.length, causes }));
    check('the add-on note reads as approved', !!causes[0] && causes[0].note === 'Rooftop Terrace on 3 buildings', causes[0] && causes[0].note);
  }
}

{
  // A solar array halves that building's exposure to a utility shock.
  {
    const s = createSession({ seed: 'hb-custom' });
    autoBuild(s, 'balanced');
    s.released += 500;
    const plant = s.placements.find((x) => x.fnId === 'eng');
    const before = evaluateLayout(s, 4);
    check('solar is eligible on back of house', addonEligible('eng', 'solar'));
    customise(s, plant.uid, { toggle: 'solar' });
    const after = evaluateLayout(s, 4);
    const cells = plant.w * plant.h;
    check('a solar array halves its footprint for the utility shock', Math.abs((before.utilityCells - after.utilityCells) - cells / 2) < 1e-9, `${before.utilityCells} -> ${after.utilityCells}`);
    const ev = EVENTS.find((e) => e.id === 'utility');
    // Compared on explicit layouts rather than a whole preset: at this site size a few
    // halved cells change the raw product but not the rounded result, which would make
    // the assertion pass or fail on rounding noise instead of on behaviour.
    const hit = (utilityCells) => resolveEvent(s, ev, { utilityCells, footprintCells: 90 }, { chance: () => false }).deltas.profit;
    check('the utility shock scales with solar-adjusted cells', hit(45) > hit(90), `${hit(45)} vs ${hit(90)}`);
  }

  // Height beside the two-storey pavilion costs standards, but only when it is tall.
  {
    const s = createSession({ seed: 'hb-custom' });
    const rooms = place(s, 'rooms', 4, 4, 0).placement;
    const calm = evaluateLayout(s, 4).causes.filter((c) => c.code === 'height:heritage');
    const res = customise(s, rooms.uid, { storeyDelta: 2 });
    const tall = evaluateLayout(s, 4).causes.filter((c) => c.code === 'height:heritage');
    check('height:heritage fires only once the wing is eight storeys', res.ok && calm.length === 0 && tall.length === 1 && tall[0].delta === -4, JSON.stringify({ ok: res.ok, calm: calm.length, tall }));
  }

  // The ledger still explains every point on a customised layout.
  {
    const s = createSession({ seed: 'hb-custom' });
    autoBuild(s, 'balanced');
    s.released += 500;
    customise(s, s.placements.find((p) => p.fnId === 'rooms').uid, { toggle: 'terrace' });
    customise(s, s.placements.find((p) => p.fnId === 'front').uid, { toggle: 'canopy' });
    const layout = evaluateLayout(s, 4);
    for (const m of ['fan', 'profit', 'colleague', 'brand']) {
      const sum = layout.causes.filter((c) => c.metric === m).reduce((n, c) => n + c.delta, 0);
      check(`customised layout: ${m} causes reconcile to the score`, Math.abs(sum - layout.metrics[m]) < 0.51, `sum=${sum} metric=${layout.metrics[m]}`);
    }
  }

  // Spending is not a strategy: with the budget constraint removed, the greedy build
  // must still lose to a balanced hotel. This gate is what stops customisation from
  // turning into a score exploit.
  {
    const bal = createSession({ seed: 'hb-balance' });
    autoBuild(bal, 'balanced');
    while (bal.round < 4) advanceRound(bal);
    const balanced = runRound(bal).composite;

    const boom = createSession({ seed: 'hb-balance' });
    autoBuild(boom, 'revenue');
    boom.released += 2000;   // test-only: only the rules should bind, not the credits
    for (const p of boom.placements) {
      for (const a of ADDONS) if (addonEligible(p.fnId, a.id)) customise(boom, p.uid, { toggle: a.id });
      const f = FUNCTION_BY_ID[p.fnId];
      if (f.massing === 'rooms' || f.massing === 'public') customise(boom, p.uid, { storeyDelta: STOREY_DELTA.max });
    }
    // Buy every plot as well: land, height and add-ons all at once is the strongest
    // spend-everything strategy the game allows.
    for (const plot of PLOTS) buyPlot(boom, plot.id);
    const greedy = runRound(boom).composite;
    check('every add-on, maximum storeys and all the land still loses to a balanced hotel', greedy < balanced, `greedy ${greedy} vs balanced ${balanced}`);
  }
}

console.log('\n== land: buying it costs, keeping it costs, and it is restricted ==');
{
  const s = createSession({ seed: 'hb-land' });
  const first = buyPlot(s, 'west');
  check('buying the West Plot deducts its 60 credits', first.ok && s.spent === 60, JSON.stringify({ ok: first.ok, spent: s.spent }));
  const again = buyPlot(s, 'west');
  check('a purchase is final: buying the same plot twice is refused', again.ok === false, again.reason);
  check('the bought plot is owned land', isOwned(s, -4, 0) && isOwned(s, -1, 8));
  check('land nobody bought is not owned', isOwned(s, -5, 0) === false);
  const onPlot = place(s, 'rooms', -4, 0, 0);
  check('a Rooms Wing fits on the West Plot', onPlot.ok, onPlot.reason);
  const outside = place(s, 'concierge', -5, 0, 0);
  check('placement on unowned land is refused', outside.ok === false, outside.reason);
  const land = evaluateLayout(s, 4).causes.filter((c) => c.code === 'land:west');
  check('the West Plot charges 2 credits of upkeep every round', land.length === 1 && land[0].delta === -2, JSON.stringify(land));

  const riverside = buyPlot(s, 'riverside');
  // Engineering is back of house: the deck takes restaurants, the pool and the spa only.
  const engThere = place(s, 'eng', 12, 2, 1);
  const poolThere = place(s, 'pool', 12, 2, 1);
  check('the Riverside Deck refuses a back-of-house function', riverside.ok && engThere.ok === false && engThere.reason === PLOT_ONLY_NOTE, engThere.reason);
  check('the Riverside Deck takes the pool', poolThere.ok, poolThere.reason);
  check('a riverside placement counts as view edge', viewEdgeHits(s).some((p) => p.fnId === 'pool'));
  const free = evaluateLayout(s, 4).causes.filter((c) => c.code === 'land:riverside');
  check('the Riverside Deck carries no upkeep', free.length === 0);
}

console.log('\n== journeys resolve against the layout ==');
{
  const s = createSession({ seed: 'hb-journeys' });
  autoBuild(s, 'balanced');
  const layout = evaluateLayout(s, 4);
  for (const j of layout.journeys) {
    const resolved = j.stops.filter((x) => x.resolved).length;
    console.log(`  ${j.label.padEnd(20)} quality ${pad(j.quality, 3)}  stops ${resolved}/${j.stops.length}  friction ${pad(j.friction, 3)}  gaps ${j.gaps}`);
    check(`${j.label} has no gaps in the balanced preset`, j.gaps === 0, `gaps=${j.gaps}`);
  }
  const n = createSession({ seed: 'hb-journeys' });
  autoBuild(n, 'neglect');
  const nl = evaluateLayout(n, 4);
  const goods = nl.journeys.find((j) => j.id === 'goods');
  check('neglect preset leaves journey gaps', nl.journeys.some((j) => j.gaps > 0), JSON.stringify(nl.journeys.map((j) => [j.id, j.gaps])));
}

console.log('\n== journey legs carry the route that was scored ==');
{
  let legs = 0, withPath = 0;
  for (const preset of ['balanced', 'neglect']) {
    const s = createSession({ seed: 'hb-journeys' });
    autoBuild(s, preset);
    for (const j of evaluateLayout(s, 4).journeys) {
      const sum = j.legs.reduce((n, l) => n + l.frictionAdded, 0);
      check(`${preset}/${j.id}: leg friction sums to the journey's friction`, sum === j.friction, `legs=${sum} journey=${j.friction}`);
      for (const l of j.legs) {
        legs++;
        if (l.path) {
          withPath++;
          // The number a player reads and the line drawn on the ground come from the
          // same BFS, so this must hold exactly — not within a tolerance.
          check(`${preset}/${j.id}: path length agrees with its step count`, l.path.length - 1 === l.steps, `path=${l.path.length} steps=${l.steps}`);
        } else {
          check(`${preset}/${j.id}: an unreachable leg carries no path`, l.steps === null, `steps=${l.steps}`);
        }
      }
    }
  }
  check('legs and paths were actually exercised', legs > 10 && withPath > 10, `legs=${legs} withPath=${withPath}`);

  // walkSteps is the scorecard's measurement; walkPath is the drawing's. One must be
  // the other, or the two drift apart silently.
  const s = createSession({ seed: 'hb-journeys' });
  autoBuild(s, 'balanced');
  const [a, b] = [s.placements[0], s.placements[s.placements.length - 1]];
  check('walkPath().steps equals walkSteps()', walkPath(s, a, b).steps === walkSteps(s, a, b));

  // A journey that is not scored yet still resolves against the layout, and says so.
  const early = createSession({ seed: 'hb-journeys' });
  autoBuild(early, 'balanced');
  early.round = 1;
  const goods = journeyDetail(early, 'goods');
  check('an inactive journey resolves but reports active:false', !!goods && goods.active === false && goods.stops.length === 5 && goods.introducedInRound === 3, JSON.stringify({ active: goods && goods.active, stops: goods && goods.stops.length }));
  early.round = 2;
  check('the arrival journey is active from round 2', journeyDetail(early, 'arrival').active === true);
  check('round 1 scores no journeys at all', evaluateLayout(early, 1).journeys.length === 0);
}

console.log('\n== owned land: the base plot, plus anything bought ==');
{
  const s = createSession({ seed: 'hb-land' });
  check('the base plot owns its corners', isOwned(s, 0, 0) && isOwned(s, SITE.cols - 1, SITE.rows - 1));
  check('outside the base plot is not owned', !isOwned(s, -1, 0) && !isOwned(s, SITE.cols, 0));
  check('ownedCells covers exactly the base plot', ownedCells(s).size === SITE.cols * SITE.rows, `${ownedCells(s).size}`);
  // A stand-in plot, purely to prove the abstraction extends. The real plots arrive in
  // Phase 3; nothing here depends on their catalogue entry existing yet.
  s.plots.push({ id: 'test', col: -2, row: 0, w: 2, h: 2 });
  check('a bought plot extends ownership', isOwned(s, -2, 1) && inBounds(-2, 0, 2, 2, s));
  check('ownership does not leak past the plot', !isOwned(s, -3, 0) && !inBounds(-3, 0, 2, 2, s), 'a rect reaching to col -3 leaves owned land');
  check('ownedCells grows by the plot area', ownedCells(s).size === SITE.cols * SITE.rows + 4, `${ownedCells(s).size}`);
  check('without a session the boundary is the original plot', !inBounds(-2, 0, 2, 2) && inBounds(0, 0, 1, 1));
  s.plots.length = 0;
}

console.log('\n== manpower: a roster is a decision, and an untouched one changes nothing ==');
{
  const base = (preset = 'balanced') => {
    const s = createSession({ seed: 'hb-manpower' });
    autoBuild(s, preset);
    return s;
  };
  const causeOf = (layout, code) => layout.causes.find((c) => c.code === code);

  const s = base();
  const req = manpowerRequirement(s, 4);
  check('the requirement follows what was built and what is demanded',
    req.rooms === Math.ceil(Math.min(120, 180 / 1.8) / 45)
    && req.fnb === Math.ceil(Math.min(80, 180 * 0.75) / 22)
    && req.front === Math.ceil(180 / 60), JSON.stringify(req));
  check('every cluster gets a whole number of heads',
    Object.values(req).every((n) => Number.isInteger(n) && n >= 0));
  check('demand seasonality moves the requirement', manpowerRequirement(s, 1).rooms < manpowerRequirement(s, 3).rooms,
    `${manpowerRequirement(s, 1).rooms} -> ${manpowerRequirement(s, 3).rooms}`);
  check('a hotel with no event space needs no events team', req.events === 0);
  check('a ballroom creates an events roster', manpowerRequirement(base('revenue'), 4).events === 3,
    `${manpowerRequirement(base('revenue'), 4).events}`);

  // The linchpin: an explicit roster at requirement must be invisible to the scorecard.
  const before = evaluateLayout(s, 4);
  s.staffing = { ...req };
  const after = evaluateLayout(s, 4);
  check('rostering exactly at requirement changes no score and adds no cause',
    JSON.stringify(before.metrics) === JSON.stringify(after.metrics)
    && JSON.stringify(before.causes) === JSON.stringify(after.causes),
    JSON.stringify({ before: before.metrics, after: after.metrics }));
  check('the plan reports the heads it scored', after.manpower.plannedTotal === after.manpower.needTotal
    && after.manpower.shortFrac === 0 && after.manpower.excessHeads === 0);

  // Understaffed: revenue that cannot be served is lost, and the guest feels it.
  const short = base();
  short.staffing = { rooms: 1 };
  const lo = evaluateLayout(short, 4);
  check('an understaffed cluster sells less and says why', lo.metrics.profit < after.metrics.profit
    && !!causeOf(lo, 'manpower:short:rooms'), JSON.stringify(causeOf(lo, 'manpower:short:rooms')));
  check('the ledger names the shortfall in heads',
    causeOf(lo, 'manpower:short:rooms').note.includes(`1 of ${req.rooms} planned`),
    causeOf(lo, 'manpower:short:rooms').note);
  check('a thin roster reaches the guest', lo.metrics.fan < after.metrics.fan && !!causeOf(lo, 'manpower:short'));
  check('a thin roster lands on colleague engagement', lo.metrics.colleague < after.metrics.colleague);

  // Overstaffed: payroll with nothing to do buys no goodwill.
  const over = base();
  over.staffing = { fnb: req.fnb + 3 };
  const hi = evaluateLayout(over, 4);
  check('overstaffing costs profitability and buys no fan score', hi.metrics.profit < after.metrics.profit
    && hi.metrics.fan === after.metrics.fan);
  check('overstaffing is named in the ledger', !!causeOf(hi, 'manpower:over:fnb')
    && causeOf(hi, 'manpower:over:fnb').note.startsWith('Food & Beverage: 3 over'),
    causeOf(hi, 'manpower:over:fnb') && causeOf(hi, 'manpower:over:fnb').note);
}

console.log('\n== manpower: training, chronic shortfall and the event deck ==');
{
  const base = (preset = 'balanced') => {
    const s = createSession({ seed: 'hb-manpower' });
    autoBuild(s, preset);
    return s;
  };
  const req = manpowerRequirement(base(), 4);
  const atNeed = base();
  atNeed.staffing = { ...req };
  const ref = evaluateLayout(atNeed, 4);

  const trained = base();
  trained.training = 2;
  const tr = evaluateLayout(trained, 4);
  check('training lifts colleague engagement and is charged',
    tr.metrics.colleague > ref.metrics.colleague && tr.causes.some((c) => c.code === 'manpower:training'));
  check('training is priced into payroll',
    tr.manpower.payroll === tr.manpower.plannedTotal * MANPOWER.payPerFteMonth * MANPOWER.months + 60000,
    `${tr.manpower.payroll}`);

  const lean0 = base(); lean0.staffing = { rooms: req.rooms - 1 };
  const lean2 = base(); lean2.staffing = { rooms: req.rooms - 1 }; lean2.training = 2;
  const p0 = evaluateLayout(lean0, 4).metrics.profit;
  const p2 = evaluateLayout(lean2, 4).metrics.profit;
  check('the same short headcount goes further when trained', p2 > p0, `${p0} -> ${p2}`);

  const ch = base();
  ch.staffing = { rooms: 1 };
  ch.round = 3;
  const r3 = runRound(ch);
  check('a short round is remembered', ch.shortStreak === 1, `${ch.shortStreak}`);
  check('one short round is not yet chronic', !r3.ledger.some((c) => c.code === 'manpower:chronic'));
  ch.round = 4;
  const r4 = runRound(ch);
  check('a second short round carries the chronic cost', ch.shortStreak === 2
    && r4.ledger.some((c) => c.code === 'manpower:chronic'));
  check('the streak resets once the roster is fixed', (() => {
    ch.staffing = { ...manpowerRequirement(ch, 4) };
    runRound(ch);
    return ch.shortStreak === 0;
  })());

  check('an untouched roster never draws a manpower event',
    drawEvents(base(), 1).every((e) => !e.mp) && drawEvents(base(), 3).every((e) => !e.mp));
  check('a planned roster counts as engaged', manpowerEngaged(atNeed) && !manpowerEngaged(base()));
  let seen = 0;
  for (let i = 0; i < 6; i++) {
    const e = createSession({ seed: `hb-mp-${i}` });
    autoBuild(e, 'balanced');
    e.staffing = { ...manpowerRequirement(e, 4) };
    for (const r of [1, 2, 3, 4]) for (const ev of drawEvents(e, r)) if (ev.mp) seen++;
  }
  check('roster events do reach a planned session', seen > 0, `seen=${seen}`);
  check('the roster event deck stays separate from the main deck',
    MANPOWER_EVENTS.every((m) => !EVENTS.some((e) => e.id === m.id)));

  const double = base();
  double.staffing = Object.fromEntries(Object.entries(req).map(([k, v]) => [k, v * 2]));
  check('doubling every roster scores worse than staffing to requirement',
    evaluateLayout(double, 4).composite < ref.composite,
    `${evaluateLayout(double, 4).composite} vs ${ref.composite}`);

  const once = (seed) => {
    const x = createSession({ seed });
    autoBuild(x, 'balanced');
    x.staffing = { rooms: 1, fnb: req.fnb + 2 };
    x.training = 1;
    return JSON.stringify([runRound(x).metrics, x.shortStreak]);
  };
  check('the same roster and seed produce the same round', once('hb-mp-a') === once('hb-mp-a'));
}

/* ------------------------------------------------------- shared build (team) */
console.log('\n== shared build: one hotel, several people ==');
{
  const { applyIntent, snapshotOf, adoptSnapshot } = await import('../js/sim/intents.js');
  const open = (team) => createSession({ seed: 'hb-room-SYNC', teamName: team, hotelName: 'H' });
  const a = open('A');
  const b = open('B');

  // The leader assigns uids; both devices replay the same ordered intents.
  const stream = [
    { op: 'place', fnId: 'rooms', col: 3, row: 3, uid: 'p900' },
    { op: 'place', fnId: 'front', col: 7, row: 3, uid: 'p901' },
    { op: 'customise', uid: 'p901', changes: { size: 'S' } },
    { op: 'rotate', uid: 'p900' },
    { op: 'place', fnId: 'rooms', col: 5, row: 8, uid: 'p902' },
    { op: 'remove', uid: 'p902' },
    { op: 'staffing', cluster: 'rooms', heads: 3 },
    { op: 'training', tier: 1, round: 1 },
  ];
  for (const intent of stream) {
    applyIntent(a, intent);
    applyIntent(b, intent);
  }
  check('two devices replaying the same intents hold the same hotel',
    JSON.stringify(a.placements) === JSON.stringify(b.placements), `${a.placements.length} vs ${b.placements.length}`);
  check('the same budget, roster and training tier travel with them',
    a.spent === b.spent && JSON.stringify(a.staffing) === JSON.stringify(b.staffing)
    && a.training === b.training && a.trainingSetRound === b.trainingSetRound);
  const ra = runRound(a);
  const rb = runRound(b);
  check('and the same round scores the same on both',
    ra.composite === rb.composite && JSON.stringify(ra.metrics) === JSON.stringify(rb.metrics),
    `${ra.composite} vs ${rb.composite}`);
  check('a stale intent is refused rather than applied differently',
    applyIntent(b, { op: 'remove', uid: 'p999' }).ok === false
    && applyIntent(a, { op: 'remove', uid: 'p999' }).ok === false);

  // Two people pressing + at the same time must land on a headcount, not a race: the
  // staffing intent is absolute, so replaying it is idempotent.
  const before = JSON.stringify(a.staffing);
  applyIntent(a, { op: 'staffing', cluster: 'rooms', heads: 3 });
  applyIntent(b, { op: 'staffing', cluster: 'rooms', heads: 3 });
  check('a replayed staffing intent is idempotent',
    JSON.stringify(a.staffing) === before && JSON.stringify(b.staffing) === before);
  check('stepping back to the requirement clears the cluster on every device',
    (() => {
      const need = manpowerRequirement(a, a.round).rooms;
      applyIntent(a, { op: 'staffing', cluster: 'rooms', heads: need });
      applyIntent(b, { op: 'staffing', cluster: 'rooms', heads: need });
      return a.staffing.rooms === undefined && b.staffing.rooms === undefined;
    })());

  // A late joiner gets one snapshot, not a replay of the whole session.
  const c = open('C');
  adoptSnapshot(c, snapshotOf(a));
  check('a late joiner adopts the leader snapshot exactly',
    JSON.stringify(c.placements) === JSON.stringify(a.placements) && c.spent === a.spent
    && c.round === a.round && c.training === a.training);
  check('and previews the same score as the leader',
    preview(c).composite === preview(a).composite,
    `${preview(c).composite} vs ${preview(a).composite}`);
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL SIM CHECKS PASSED');
process.exit(fails ? 1 : 0);
