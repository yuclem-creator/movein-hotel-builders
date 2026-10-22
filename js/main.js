// main.js — demo-mode application. Single player, zero network: everything runs
// from the local simulation and the local renderer. Multiplayer is Stage 2 and
// will slot in behind the same session object without changing the sim or render.
import * as SIM from './sim/engine.js';
import { styleLabel } from './render/massing.js';
import {
  FUNCTIONS, CATEGORIES, ROUNDS, SCORECARD, STYLES, PALETTES, SIGNATURES,
  LANDSCAPES, TOTAL_BUDGET, FUNCTION_BY_ID,
  SIZES, ADDONS, CUSTOMISE_UI, PLOTS, PLOT_UI,
  MANPOWER, MANPOWER_UI, MANPOWER_NOTE,
} from './sim/catalogue.js';
import { createView } from './render/view.js';
import { createClock, formatClock } from './classroom/timer.js';
import { createTeam } from './net/team.js';
import { localBus, supabaseBus } from './net/bus.js';
import { applyIntent, INTENT } from './sim/intents.js';
import {
  parseJoin, normaliseRoom, writeSave, readSave, clearSave, saveProblem, restore,
  scoreCode, layoutHash,
} from './classroom/join.js';

/* --------------------------------------------------------------------- state */

let session = null;
let view = null;
// Team build: null in every non-collaborative session, which is why every mutation site
// below reads `commit(...)` rather than the engine directly.
let team = null;
const selfId = (() => {
  const key = 'hb.v2.member';
  try {
    const saved = sessionStorage.getItem(key);
    if (saved) return saved;
    const made = Math.random().toString(36).slice(2, 8);
    sessionStorage.setItem(key, made);
    return made;
  } catch {
    return Math.random().toString(36).slice(2, 8);
  }
})();

let tool = null;          // function id awaiting placement
let placing = null;       // { uid } when moving an existing placement
let lastResult = null;
let finalResult = null;
let overlaysOn = false;
let duskOn = false;
let expandMode = false;   // the Expand site tool is armed: taps buy land
let pendingPlot = null;   // the plot whose confirm panel is open
// The manpower panel shares the right-hand column with Customise, so only one of them is
// ever open: you are either looking at a building or at your roster.
let mpOpen = true;

// Classroom state. `join` is read once at boot from the URL; a room code typed in the
// lobby updates it in place, so the rest of the app only ever asks `join.classroom`.
let join = parseJoin(window.location.search);

// A join card can carry the relay configuration. Storing it here is what lets a phone take
// part in a shared hotel without anyone opening a console on it.
if (join.net) {
  try { localStorage.setItem('hb.v2.net', JSON.stringify(join.net)); } catch { /* private mode */ }
}

let clock = null;         // build clock; null in solo mode
let saveScope = 'solo';   // localStorage slot: "<room>.<team>" in class, "solo" solo
let saveTimer = 0;
let savedNotice = false;  // one toast per session when autosave first succeeds

const $ = (sel) => document.querySelector(sel);
const screens = [...document.querySelectorAll('[data-screen]')];

function show(name) {
  for (const s of screens) s.hidden = s.dataset.screen !== name;
}

let toastTimer = 0;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

/* ------------------------------------------------------------ classroom kit */

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '').slice(0, 24) || 'team';

/** The localStorage slot for a team: room-scoped in class, shared in solo. */
const scopeFor = (teamName) => (join.classroom ? `${join.room}.${slug(teamName)}` : 'solo');

/** Autosave is throttled: orbiting the site must not write on every frame. */
function autosave(force = false) {
  if (!session || !session.placements) return;
  clearTimeout(saveTimer);
  const write = () => {
    if (writeSave(saveScope, session) && !savedNotice) {
      savedNotice = true;
      toast('Saved on this device');
    }
  };
  if (force) write();
  else saveTimer = setTimeout(write, 500);
}

function paintClock(remaining, state) {
  const el = $('#clock');
  if (!el) return;
  el.hidden = !join.classroom;
  if (!join.classroom) return;
  $('#clockValue').textContent = formatClock(remaining);
  $('#clockShare').textContent = state === 'over' ? 'Time is up'
    : state === 'paused' ? 'Paused' : '';
  el.dataset.state = state;
  const total = Math.max(1, join.minutes * 60000);
  $('#clockFill').style.width = `${Math.max(0, Math.min(100, (remaining / total) * 100))}%`;
}

/** Start (or resume) the build clock. `reset` gives the next round a full block. */
function armClock({ reset = false } = {}) {
  if (!join.classroom) return;
  if (!clock) {
    clock = createClock(join.minutes, {
      onTick: paintClock,
      onDone: () => toast('Build time is up — run the round when the room is ready'),
    });
  }
  if (reset) clock.reset(join.minutes);
  clock.start();
  paintClock(clock.remaining, clock.state);
}

/**
 * Phase 2 convenience: publish the result when this browser has a Supabase project
 * configured. The score code on screen is already the record, so a failure here must
 * never block the reveal — and with no project configured nothing is imported at all.
 */
function publishScore(result) {
  if (!join.classroom) return;
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem('hb.v2.net') || 'null'); } catch { stored = null; }
  if (!(window.__HB_NET__?.url || stored?.url)) return;
  import('./net/room.js')
    .then(({ submitScore }) => submitScore({
      room: join.room,
      team: session.teamName,
      hotel: session.hotelName,
      result,
      code: scoreCode(session, result),
      layoutHash: layoutHash(session),
      placements: session.placements.length,
    }))
    .catch(() => { /* live sync is a convenience; the code is the record */ });
}

/* --------------------------------------------------------------- frame loop */

let last = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;
  view.update(dt);
  view.render();
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------- live preview */

/** Agent population derived from the scorecard, so the site fills as demand grows. */
function agentCounts(pv) {
  const guests = Math.max(3, Math.min(24, Math.round(pv.arrivals / 12)));
  const queue = pv.capacity.roomEff < 100 ? Math.min(12, Math.max(1, Math.round((100 - pv.capacity.roomEff) / 6))) : 0;
  const boh = session.placements.filter((p) => FUNCTION_BY_ID[p.fnId].cat !== 'G').length;
  return {
    guests,
    queue,
    colleagues: Math.min(14, 3 + Math.round(boh * 0.8)),
    porters: Math.min(8, 1 + SIM.countOf(session, 'recv') + SIM.countOf(session, 'kitchen')),
  };
}

/** Recompute the preview and push it to the HUD, the agents and the overlays. */
function refresh() {
  const pv = SIM.preview(session);
  view.rebuild(session);
  view.agents.setLayout(session, agentCounts(pv));
  if (overlaysOn) {
    view.overlays.setJourneys(pv.journeys);
    view.overlays.setVisible(true);
  }
  view.setSelection(session.selectedUid, session);
  renderHud(pv);
  renderTray();
  renderManpower(pv);
  syncPanels();
  autosave();
  return pv;
}

/* ------------------------------------------------------------ manpower panel */

/** Illustrative money: grouped for reading, never implied to be a real payroll. */
const hkd = (n) => `HK$ ${Math.round(n).toLocaleString('en-US')}`;

const clusterMeta = (id) => MANPOWER.clusters.find((c) => c.id === id);

/**
 * The roster, rendered from the same plan the scorecard uses (`pv.manpower`), so the
 * panel and the ledger cannot disagree. Steppers write only the clusters the team
 * touches: a cluster left alone is rostered at requirement, which is what keeps an
 * untouched plan score-neutral.
 */
function renderManpower(pv) {
  const plan = pv && pv.manpower;
  if (!plan) return;
  $('#mpTitle').textContent = MANPOWER_UI.title;
  $('#mpTag').textContent = MANPOWER_UI.illustrative;
  $('#mpTrainLabel').textContent = MANPOWER_UI.training;
  $('#mpTotalLabel').textContent = MANPOWER_UI.total;
  $('#mpSeason').textContent = MANPOWER_UI.perSeason;

  const list = $('#mpList');
  list.innerHTML = '';
  for (const c of plan.clusters) {
    const meta = clusterMeta(c.id);
    const max = Math.max(1, c.need * MANPOWER.maxMul);
    const fill = Math.min(100, (c.planned / max) * 100);
    const tick = (c.need / max) * 100;
    const row = document.createElement('div');
    row.className = 'mp-row';
    row.innerHTML = `
      <div class="mp-rowhead"><b>${escapeHtml(c.label)}</b>
        <small>${escapeHtml(MANPOWER_UI.ratio.replace('{per}', String(meta.per)).replace('{unit}', meta.unit))}</small></div>
      <div class="mp-rowbody">
        <div class="mp-counts">
          <span>${MANPOWER_UI.required} <b>${c.need}</b></span>
          <span>${MANPOWER_UI.planned} <b>${c.planned}</b></span>
        </div>
        <div class="mp-stepper">
          <button class="mp-step" type="button" data-cluster="${c.id}" data-step="-1"
            aria-label="One fewer in ${escapeHtml(c.label)}"${c.planned <= 0 ? ' disabled' : ''}>−</button>
          <button class="mp-step" type="button" data-cluster="${c.id}" data-step="1"
            aria-label="One more in ${escapeHtml(c.label)}"${c.planned >= max || c.need === 0 ? ' disabled' : ''}>+</button>
        </div>
      </div>
      <div class="mp-bar${c.short ? ' is-short' : c.excess ? ' is-over' : ''}">
        <span style="width:${fill}%"></span><i style="left:${tick}%"></i></div>
      <small class="mp-money">${hkd(c.planned * MANPOWER.payPerFteMonth * MANPOWER.months)}</small>
      ${c.need === 0 ? `<small class="mp-none">${MANPOWER_UI.none}</small>` : ''}`;
    list.appendChild(row);
  }

  const train = $('#mpTraining');
  train.innerHTML = '';
  for (const t of MANPOWER.training) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.tier = String(t.id);
    b.setAttribute('aria-pressed', plan.training === t.id ? 'true' : 'false');
    b.innerHTML = `<b>${t.label}</b><small>${t.cost ? hkd(t.cost) : '—'}</small>`;
    train.appendChild(b);
  }

  $('#mpTotal').textContent = hkd(plan.payroll);
  syncPanelEdge();
}

/* The roster is taller than the right-hand column at 1280x800, so its last row is cut at
   the panel edge. On Chrome the scrollbar is an overlay that stays hidden until you
   scroll, so the cut row read as a broken panel (frame 62) rather than as "more below".
   Mark the panel while it overflows and fade the cut row into the paper, the same
   affordance the tray uses sideways. */
function syncPanelEdge() {
  const panel = $('#mpPanel');
  if (!panel || panel.hidden) return;
  if (!panel.dataset.edgeBound) {
    panel.dataset.edgeBound = '1';
    panel.addEventListener('scroll', syncPanelEdge, { passive: true });
    window.addEventListener('resize', syncPanelEdge);
  }
  panel.classList.toggle('can-scroll-down', panel.scrollHeight - panel.clientHeight - panel.scrollTop > 4);
}

/** Closes the Customise panel and drops the selection. Shared by Done and by the roster tool. */
function deselectBuilding() {
  session.selectedUid = null;
  view.setSelection(null, session);
  $('#selectedPanel').hidden = true;
}

/** One right-hand panel at a time: the selected building, or the roster. */
function syncPanels() {
  const selOpen = !$('#selectedPanel').hidden;
  const panel = $('#mpPanel');
  const wasHidden = panel.hidden;
  panel.hidden = !mpOpen || selOpen;
  // Opening the roster must start at the top. Reopening it kept the previous scroll
  // position, so the frame showed a half row with its header scrolled out of the panel
  // and read as a broken panel rather than as "this scrolls" (seen in the 31 frames).
  if (wasHidden && !panel.hidden) panel.scrollTop = 0;
  if (!panel.hidden) syncPanelEdge();
  // Pressed must describe what is on screen, not a stored intention. While Customise held
  // the column the button still read "pressed" with no roster anywhere, so a user who
  // tapped it twice saw nothing happen and concluded the controls were dead.
  $('#btnManpower').setAttribute('aria-pressed', panel.hidden ? 'false' : 'true');
}

/* ---------------------------------------------------------------------- HUD */

function renderHud(pv) {
  const r = ROUNDS[session.round - 1];
  $('#hudRoundEyebrow').textContent = `Round ${r.n} of ${ROUNDS.length}`;
  $('#hudRoundName').textContent = r.name;
  $('#hudHotel').textContent = `${session.hotelName} · ${session.teamName}`;

  const prev = session.history.length ? session.history[session.history.length - 1].metrics : null;
  const wrap = $('#hudMetrics');
  wrap.innerHTML = '';
  for (const m of SCORECARD) {
    const v = pv.metrics[m.id];
    const d = prev ? v - prev[m.id] : 0;
    const el = document.createElement('div');
    el.className = 'metric';
    el.innerHTML = `<span>${m.label}</span><b>${v}</b>` +
      (prev ? `<i class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '+' : ''}${d}</i>` : '');
    wrap.appendChild(el);
  }

  const left = SIM.availableBudget(session);
  $('#budgetLeft').textContent = left;
  $('#budgetTotal').textContent = TOTAL_BUDGET;
  $('#budgetFill').style.width = `${Math.max(0, Math.min(100, (left / TOTAL_BUDGET) * 100))}%`;
  $('#btnRun').textContent = session.round >= ROUNDS.length ? 'Run the final round' : `Run round ${session.round}`;
}

/* --------------------------------------------------------------------- tray */

function renderTray() {
  const tray = $('#tray');
  tray.innerHTML = '';
  const left = SIM.availableBudget(session);
  for (const f of FUNCTIONS) {
    const b = document.createElement('button');
    b.className = `fn fn--cat-${f.cat}`;
    b.type = 'button';
    const short = f.cost > left;
    b.disabled = short;
    // A greyed-out tray with no reason reads as a broken page — "I can't click any of
    // the functions" was a real report after a preset had spent the budget. Say why,
    // on the button and in the hint line.
    if (short) b.title = `${f.label} costs ${f.cost} credits; only ${left} left. Run a round or remove a building.`;
    b.setAttribute('aria-pressed', tool === f.id ? 'true' : 'false');
    b.innerHTML = `<b>${f.label}</b><small>${CATEGORIES[f.cat]} · ${f.w}×${f.h}</small><em>${f.cost} credits</em>`;
    b.addEventListener('click', () => selectTool(f.id));
    tray.appendChild(b);
  }
  if (left < Math.min(...FUNCTIONS.map((f) => f.cost))) {
    $('#trayHint').textContent = `No credits left (${left}). Run a round to earn more, or remove a building to refund it.`;
  } else if ($('#trayHint').textContent.startsWith('No credits left')) {
    // Credits came back (a refund, a round) — do not leave the dead-end message up.
    $('#trayHint').textContent = 'Choose a function, then tap the site to place it. Tap a building to move, rotate or remove it.';
  }
  syncTrayEdge();
  syncPanels();
}

/* The tray only scrolls sideways below 1280px, and tablets hide the scrollbar until it is
   dragged. Mark the tray while there is more to see so the trailing edge fades (see
   .tray.can-scroll-right); the mark comes off at the end so the cue cannot lie. At 1280
   and up the tray wraps instead and scrolls DOWN — twenty cards are three rows, and the
   170px cap cut the third row (People & Culture Office, Colleague Lockers) at a card
   boundary with no scrollbar on screen, which reads as a clipped layout rather than
   "there are more functions below". Same rule: fade only while there is more. */
function syncTrayEdge() {
  const tray = $('#tray');
  if (!tray) return;
  if (!tray.dataset.edgeBound) {
    tray.dataset.edgeBound = '1';
    tray.addEventListener('scroll', syncTrayEdge, { passive: true });
    window.addEventListener('resize', syncTrayEdge);
  }
  const moreX = tray.scrollWidth - tray.clientWidth - tray.scrollLeft > 4;
  const moreY = tray.scrollHeight - tray.clientHeight - tray.scrollTop > 4;
  tray.classList.toggle('can-scroll-right', moreX);
  tray.classList.toggle('can-scroll-down', moreY);
}

function selectTool(fnId) {
  // Arming a function leaves land mode: two tools fighting over the same tap is a bug
  // waiting to be reported as "I bought a plot by accident".
  if (fnId && expandMode) exitExpand();
  placing = null;
  tool = tool === fnId ? null : fnId;
  session.selectedUid = null;
  view.setSelection(null, session);
  $('#selectedPanel').hidden = true;
  if (tool) {
    view.setGhost(tool, session);
    $('#trayHint').textContent = `${FUNCTION_BY_ID[tool].label} — tap the site to place it. Tap the item again to cancel.`;
  } else {
    view.hideGhost();
    $('#trayHint').textContent = 'Choose a function, then tap the site to place it. Tap a building to move, rotate or remove it.';
  }
  renderTray();
}
/* ------------------------------------------------------------------ gestures */

function handleTap(ndc) {
  const current = screens.find((s) => !s.hidden);
  if (!current || current.dataset.screen !== 'build') return;
  const hit = view.pick(ndc.x, ndc.y);

  // 0. Buying land. The expand tool owns the tap while it is armed, so a stray tap can
  // never place a building on ground the team does not own yet.
  if (expandMode) {
    const cell = view.groundCell(ndc.x, ndc.y);
    if (!cell) return;
    const plot = SIM.forSaleAt(session, cell.col, cell.row);
    if (plot) openPlotPanel(plot);
    else toast(`${PLOT_UI.forSale}: tap a dashed plot`);
    return;
  }

  // 1. Dropping a placement that is being moved.
  if (placing) {
    const cell = view.groundCell(ndc.x, ndc.y);
    if (!cell) { toast('Drop it inside the site boundary'); return; }
    const p = session.placements.find((x) => x.uid === placing.uid);
    const res = commit({ op: INTENT.MOVE, uid: placing.uid, col: cell.col, row: cell.row });
    if (!res.ok) { toast(res.reason); return; }
    placing = null;
    view.hideGhost();
    if (res.pending) { sentToTeam(); return; }
    refresh();
    toast(`${FUNCTION_BY_ID[p.fnId].label} moved`);
    return;
  }

  // 2. Placing a new function.
  if (tool) {
    const cell = view.groundCell(ndc.x, ndc.y);
    if (!cell) { toast('Place it inside the site boundary'); return; }
    const fnId = tool;
    const res = commit({ op: INTENT.PLACE, fnId, col: cell.col, row: cell.row, rot: 0 });
    if (!res.ok) { toast(res.reason); return; }
    if (res.pending) { sentToTeam(); return; }   // the lead applies it and echoes the uid
    const placed = FUNCTION_BY_ID[fnId].label;
    if (FUNCTION_BY_ID[fnId].cost > SIM.availableBudget(session)) selectTool(null);
    else view.setGhost(fnId, session);
    refresh();
    toast(`${placed} placed`);
    // Select what was just built: the Customise panel is the only place size, storeys
    // and add-ons live, and with a tool still armed a tap on the building places
    // another one instead of selecting it — so without this the feature is hidden.
    // selectPlacement also disarms the tool; re-arm from the tray to place another.
    selectPlacement(res.uid);
    return;
  }

  // 3. Selecting an existing building.
  if (hit && hit.uid) { selectPlacement(hit.uid); return; }
  if (hit && hit.heritage) { toast('The heritage pavilion is protected: it cannot be moved or demolished'); return; }

  // 4. An empty tap clears the selection.
  session.selectedUid = null;
  view.setSelection(null, session);
  $('#selectedPanel').hidden = true;
}

function handleHover(ndc) {
  if (!tool && !placing) return;
  const cell = view.groundCell(ndc.x, ndc.y);
  if (!cell) return;
  const moving = placing ? session.placements.find((x) => x.uid === placing.uid) : null;
  const fnId = tool || moving?.fnId;
  if (!fnId) return;
  // A moving building is validated at its OWN footprint, not the catalogue default.
  const blocker = moving
    ? SIM.blockerAt(session, moving, cell.col, cell.row)
    : SIM.placementBlocker(session, fnId, cell.col, cell.row, 0, null);
  view.moveGhost(cell.col, cell.row, !blocker, moving ? { w: moving.w, h: moving.h } : null);
}

/** Capacity word and value for one building, before any add-on covers. */
function capacityOfOne(p) {
  const f = FUNCTION_BY_ID[p.fnId];
  const { areaFactor, storeyFactor } = SIM.scaleOf(p);
  const kind = f.keys ? 'keys' : f.covers ? 'covers' : f.seats ? 'seats' : null;
  const base = f.keys ?? f.covers ?? f.seats ?? 0;
  return { value: Math.round(base * areaFactor * storeyFactor), kind };
}

const signed = (n) => (n > 0 ? `+${n}` : String(n));

/**
 * The Customise block. Every control is a dry run through the same `customise()` the
 * game commits with, so a disabled button is disabled for the reason the engine would
 * actually refuse — overlap, budget or eligibility — not a rule invented here.
 */
function renderCustomise(p) {
  const wrap = $('#customise');
  if (!wrap) return;
  wrap.innerHTML = '';
  const f = FUNCTION_BY_ID[p.fnId];
  const cap = capacityOfOne(p);

  const group = (label) => {
    const el = document.createElement('div');
    el.className = 'customise-group';
    const h = document.createElement('h3');
    h.textContent = label;
    el.appendChild(h);
    wrap.appendChild(el);
    return el;
  };

  const chip = (parent, { label, note, active, disabled, title, onClick }) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.type = 'button';
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
    b.disabled = !!disabled;
    if (title) b.title = title;
    b.innerHTML = `<b>${escapeHtml(label)}</b><small>${escapeHtml(note || '')}</small>`;
    if (onClick && !disabled) b.addEventListener('click', onClick);
    parent.appendChild(b);
    return b;
  };

  const apply = (changes) => {
    const res = commit({ op: INTENT.CUSTOMISE, uid: p.uid, changes });
    if (!res.ok) { toast(res.reason); return; }
    if (res.pending) { sentToTeam(); return; }
    refresh();
    selectPlacement(p.uid);
  };

  // Size: the long side moves by one cell, so capacity and cost follow area.
  const sizeRow = group(CUSTOMISE_UI.size);
  const sizes = document.createElement('div');
  sizes.className = 'chips';
  sizeRow.appendChild(sizes);
  for (const size of SIZES) {
    const dry = SIM.customise(session, p.uid, { size: size.id }, true);
    const probeCap = capacityOfOne({ ...p, size: size.id });
    const money = !dry.ok ? dry.reason
      : dry.delta === 0 ? CUSTOMISE_UI.noChange
        : `${signed(dry.delta)} ${CUSTOMISE_UI.credits}`;
    const note = probeCap.kind ? `${money} · ${probeCap.value} ${probeCap.kind}` : money;
    chip(sizes, {
      label: size.label, note,
      active: (p.size || 'M') === size.id,
      disabled: (p.size || 'M') === size.id || !dry.ok,
      title: dry.ok ? undefined : dry.reason,
      onClick: () => apply({ size: size.id }),
    });
  }

  // Storeys: only wings and public blocks have them at all.
  const storeyRow = group(CUSTOMISE_UI.storeys);
  const stepper = document.createElement('div');
  stepper.className = 'stepper';
  storeyRow.appendChild(stepper);
  const customisable = f.massing === 'rooms' || f.massing === 'public';
  if (customisable) {
    const step = (d) => {
      const dry = SIM.customise(session, p.uid, { storeyDelta: (p.storeyDelta || 0) + d }, true);
      const b = document.createElement('button');
      b.className = 'btn btn--small';
      b.type = 'button';
      b.textContent = d > 0 ? '+' : '−';
      b.disabled = !dry.ok;
      if (!dry.ok) b.title = dry.reason;
      b.addEventListener('click', () => apply({ storeyDelta: (p.storeyDelta || 0) + d }));
      return b;
    };
    const value = document.createElement('b');
    value.textContent = String(SIM.storeysOf(p));
    const label = document.createElement('span');
    label.className = 'note';
    label.textContent = cap.kind ? `${cap.value} ${cap.kind}` : '';
    stepper.append(step(-1), value, step(1), label);
  } else {
    const fixed = document.createElement('span');
    fixed.className = 'note';
    fixed.textContent = CUSTOMISE_UI.fixed;
    stepper.appendChild(fixed);
  }

  // Style variant: this building only, and deliberately visual only.
  const variantRow = group(CUSTOMISE_UI.variant);
  const variants = document.createElement('div');
  variants.className = 'chips';
  variantRow.appendChild(variants);
  chip(variants, {
    label: CUSTOMISE_UI.inherit, note: styleLabel(session.style),
    active: !p.variant, onClick: () => apply({ variant: null }),
  });
  for (const st of STYLES) {
    chip(variants, {
      label: st.label, note: st.note, active: p.variant === st.id,
      onClick: () => apply({ variant: st.id }),
    });
  }

  // Add-ons: eligibility, price and effect all come from the catalogue.
  const addonRow = group(CUSTOMISE_UI.addons);
  const addons = document.createElement('div');
  addons.className = 'chips';
  addonRow.appendChild(addons);
  for (const a of ADDONS) {
    const active = (p.addons || []).includes(a.id);
    const eligible = SIM.addonEligible(p.fnId, a.id);
    const dry = SIM.customise(session, p.uid, { toggle: a.id }, true);
    const metric = SCORECARD.find((m) => m.id === a.metric);
    const effect = a.covers ? `+${a.covers} covers` : `${signed(a.delta)} ${metric ? metric.label : ''}`.trim();
    chip(addons, {
      label: a.label,
      note: `${a.cost} ${CUSTOMISE_UI.credits} · ${effect}`,
      active,
      disabled: !eligible || (!active && !dry.ok),
      title: eligible ? (dry.ok ? undefined : dry.reason) : CUSTOMISE_UI.notEligible,
      onClick: () => apply({ toggle: a.id }),
    });
  }
}

function selectPlacement(uid) {
  session.selectedUid = uid;
  tool = null;
  placing = null;
  view.hideGhost();
  view.setSelection(uid, session);
  const p = session.placements.find((x) => x.uid === uid);
  if (!p) return;
  const f = FUNCTION_BY_ID[p.fnId];
  $('#selLabel').textContent = f.label;
  $('#selHint').textContent = `${CATEGORIES[f.cat]} · ${p.w}×${p.h} cells · built in round ${p.round}. Removing refunds 70% of ${SIM.costOf(p)} credits.`;
  $('#selectedPanel').hidden = false;
  renderCustomise(p);
  renderTray();
}

function startMove() {
  const uid = session.selectedUid;
  const p = session.placements.find((x) => x.uid === uid);
  if (!p) return;
  placing = { uid };
  tool = null;
  $('#selectedPanel').hidden = true;
  syncPanels();
  view.setGhost(p.fnId, session, p);
  view.moveGhost(p.col, p.row, true, { w: p.w, h: p.h });
  $('#trayHint').textContent = `Tap a new spot for the ${FUNCTION_BY_ID[p.fnId].label}.`;
  renderTray();
}
/* --------------------------------------------------------------------- land */

/** Leave land mode. One place, so the button state and the outlines cannot disagree. */
function exitExpand() {
  expandMode = false;
  $('#btnExpand').setAttribute('aria-pressed', 'false');
  view.setExpandMode(false);
  closePlotPanel();
}

function toggleExpand() {
  if (expandMode) { exitExpand(); return; }
  expandMode = true;
  $('#btnExpand').setAttribute('aria-pressed', 'true');
  view.setExpandMode(true);
  tool = null;
  placing = null;
  view.hideGhost();
  session.selectedUid = null;
  view.setSelection(null, session);
  $('#selectedPanel').hidden = true;
  renderTray();
  $('#trayHint').textContent = `${PLOT_UI.forSale}: tap a dashed plot to see its price.`;
}

function openPlotPanel(plot) {
  pendingPlot = plot;
  $('#plotLabel').textContent = plot.label;
  const upkeep = plot.upkeep ? `${plot.upkeep} ${PLOT_UI.upkeep}` : 'no upkeep';
  const only = plot.only
    ? ` Only ${plot.only.map((id) => FUNCTION_BY_ID[id].label).join(', ')}.`
    : '';
  $('#plotNote').textContent = `${plot.cost} credits · ${upkeep}.${only} ${PLOT_UI.final}.`;
  $('#plotPanel').hidden = false;
}

function closePlotPanel() {
  pendingPlot = null;
  $('#plotPanel').hidden = true;
}

function buyPendingPlot() {
  if (!pendingPlot) return;
  const res = commit({ op: INTENT.PLOT, plotId: pendingPlot.id });
  if (!res.ok) { toast(res.reason); return; }
  if (res.pending) { sentToTeam(); return; }
  const { label, cost } = res.plot;
  exitExpand();
  refresh();
  // Re-frame on what the team now owns, so the new land is in the picture.
  view.fit();
  toast(`${label} ${PLOT_UI.bought} · ${cost} credits`);
}

/* -------------------------------------------------------------------- lobby */

function bootLobby() {
  applyClassroomUi();
  offerResume();

  $('#teamName').addEventListener('change', offerResume);
  $('#startDemo').addEventListener('click', startBuild);
  $('#joinRoom').addEventListener('click', joinTypedRoom);
  $('#roomCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinTypedRoom(); });

  $('#resumeGo').addEventListener('click', resumeSave);
  $('#resumeDrop').addEventListener('click', () => {
    const scope = $('#resumeCard').dataset.scope || scopeFor($('#teamName').value);
    clearSave(scope);
    $('#resumeCard').hidden = true;
    toast('Saved session cleared');
  });
}

/** Lobby copy and the room chip follow `join`, wherever it came from. */
function applyClassroomUi() {
  $('#classChip').hidden = !join.classroom;
  if (join.classroom) $('#classRoom').textContent = join.room;
  $('#joinDetails').hidden = join.classroom;
  $('#lobbyNote').textContent = join.classroom
    ? `Classroom session ${join.room}: ${join.minutes}-minute build rounds, starting hotels off, progress saved on this device.`
    : 'Solo mode runs the full simulation on this device: no other players, no accounts, no network.';
  if (join.team) $('#teamName').value = join.team;
  if (join.hotel) $('#hotelName').value = join.hotel;
}

/** Offer a resume only for a save this build can actually load. */
function offerResume() {
  const scope = scopeFor($('#teamName').value);
  const save = readSave(scope);
  const problem = save ? saveProblem(save) : 'No save';
  const card = $('#resumeCard');
  if (!save || problem) { card.hidden = true; return; }
  const s = save.session;
  const when = new Date(save.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  $('#resumeLine').textContent = `${s.teamName} · ${s.hotelName} · round ${s.round} of ${ROUNDS.length} · `
    + `${s.placements.length} function${s.placements.length === 1 ? '' : 's'} · saved ${when}`;
  card.dataset.scope = scope;
  card.hidden = false;
}

function resumeSave() {
  const scope = $('#resumeCard').dataset.scope || scopeFor($('#teamName').value);
  const save = readSave(scope);
  const problem = save ? saveProblem(save) : 'No save';
  if (!save) { toast('Nothing saved on this device'); return; }
  if (problem) { toast(problem); return; }

  session = SIM.createSession({
    seed: save.session.seed,
    teamName: save.session.teamName,
    hotelName: save.session.hotelName,
  });
  const res = restore(session, save);
  if (!res.ok) { toast(res.reason); return; }

  saveScope = scope;
  savedNotice = true;          // it came from a save; do not toast "saved" on the first tap
  view.rebuild(session);
  view.fit();
  if (!session.placements.length && !session.history.length) {
    buildDesign();
    show('design');
    return;
  }
  enterBuild();
  toast(`Resumed ${session.teamName} at round ${session.round}`);
}

/** A typed room code is the fallback when a QR will not scan. */
function joinTypedRoom() {
  const room = normaliseRoom($('#roomCode').value);
  const hint = $('#joinHint');
  if (room.length < 3) {
    hint.hidden = false;
    hint.textContent = 'A room code is at least 3 letters or digits — read it from the facilitator.';
    return;
  }
  hint.hidden = true;
  join = { ...join, classroom: true, room };
  const url = new URL(window.location.href);
  url.searchParams.set('room', room);
  window.history.replaceState({}, '', url);
  applyClassroomUi();
  offerResume();
  toast(`Joined session ${room}`);
}

function startBuild() {
  const team = ($('#teamName').value || 'Team One').trim().slice(0, 24) || 'Team One';
  const hotel = ($('#hotelName').value || 'The Riverside').trim().slice(0, 28) || 'The Riverside';
  join = { ...join, team, hotel };
  session = SIM.createSession({
    // Solo is seeded from the hotel name, so the same hotel always meets the same events.
    // A room is seeded from the ROOM, so every team in a competition meets identical events.
    seed: join.classroom ? `hb-room-${join.room}` : `hb-demo-${slug(hotel)}`,
    teamName: team,
    hotelName: hotel,
  });
  saveScope = scopeFor(team);
  savedNotice = false;
  view.rebuild(session);
  buildDesign();
  show('design');
}

/* ------------------------------------------------------------------- design */

function choiceRow(host, items, current, onPick, renderLabel) {
  host.innerHTML = '';
  for (const it of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'choice';
    b.setAttribute('aria-pressed', it.id === current ? 'true' : 'false');
    b.innerHTML = renderLabel(it);
    b.addEventListener('click', () => onPick(it.id));
    host.appendChild(b);
  }
}

function buildDesign() {
  // Classroom: no starting hotels, no sandbox. A preset is a one-tap answer to the
  // exercise, and it let a team that clicked it beat teams that built by hand.
  $('#presetBlock').hidden = join.classroom;
  $('#classroomNote').hidden = !join.classroom;
  const paint = () => {
    choiceRow($('#choicesStyle'), STYLES, session.style,
      (id) => { session.style = id; view.setStyle(id); paint(); },
      (s) => `<b>${styleLabel(s.id)}</b><small>${s.note}</small>`);

    choiceRow($('#choicesSignature'), SIGNATURES, session.signature,
      (id) => { session.signature = id; view.rebuild(session); paint(); },
      (s) => `<b>${s.label}</b><small>+${s.brand} Brand Standards</small>`);

    choiceRow($('#choicesLandscape'), LANDSCAPES, session.landscape,
      (id) => { session.landscape = id; view.rebuild(session); paint(); },
      (l) => `<b>${l.label}</b><small>${l.trees} trees</small>`);

    const sw = $('#choicesPalette');
    sw.innerHTML = '';
    for (const p of PALETTES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.style.background = `linear-gradient(160deg, ${p.accent} 0%, ${p.accent} 62%, var(--ivory) 62%)`;
      b.setAttribute('aria-pressed', p.id === session.palette ? 'true' : 'false');
      b.setAttribute('aria-label', p.label);
      b.innerHTML = `<span>${p.label}</span>`;
      b.addEventListener('click', () => { session.palette = p.id; view.setPalette(p.id); paint(); });
      sw.appendChild(b);
    }

    choiceRow($('#choicesPreset'),
      // Filter to real presets: sandbox has no fns and would just be a no-op button.
      Object.entries(SIM.PRESETS)
        .filter(([, p]) => p.fns.length)
        .map(([id, p]) => ({ id, label: p.label, note: p.note })),
      null,
      (id) => applyPreset(id),
      (p) => `<b>${p.label}</b><small>${p.note}</small>`);
  };
  paint();

  $('#designBack').addEventListener('click', () => show('lobby'));
  $('#designContinue').addEventListener('click', () => enterBuild());
  $('#designSandbox').addEventListener('click', () => applyPreset('sandbox'));
}

function applyPreset(id) {
  if (join.classroom) { toast('Starting hotels are off in a classroom session'); return; }
  const res = SIM.autoBuild(session, id);
  enterBuild();
  toast(`${SIM.PRESETS[id].label}: ${res.placed} functions built, ${res.available} credits left`);
}

/* ---------------------------------------------------------------- team build */

/**
 * One hotel, several devices. Every mutation below reads `commit(...)` instead of the engine:
 * without a team that is the old local call, with a team it is an intent that the sequencer
 * orders and every device replays. The engine still validates, so a refusal is identical
 * everywhere and nothing can silently diverge.
 */
function commit(intent) {
  if (team) return team.commit(intent);
  const res = applyIntent(session, intent);
  if (!res.ok) toast(res.reason);
  return res;
}

const sentToTeam = () => toast('Sent to the team — the lead device applies it');

function renderTeamChip() {
  const el = $('#teamChip');
  if (!el) return;
  if (!team) { el.hidden = true; return; }
  el.hidden = false;
  el.dataset.role = team.leader ? 'lead' : 'follow';
  el.textContent = `${team.size} in this hotel · ${team.leader ? 'you are the lead' : 'lead elsewhere'}`;
}

/** Reactions that belong to the team rather than to this device. */
function onTeamChange(event) {
  if (!event) return;
  if (event.rejected) { toast(event.rejected.reason || 'The team build refused that change'); return; }
  renderTeamChip();

  if (event.res?.result) {              // a round was run, by anyone
    lastResult = event.res.result;
    if (clock) clock.pause();
    autosave(true);
    renderResult(lastResult);
    show('result');
    return;
  }
  if (event.snapshot) {
    view.rebuild(session);
    // A snapshot must not undo a screen the team is already looking at: adopting state while
    // the result card is up would hide the round everyone just scored.
    const resultVisible = !document.querySelector('[data-screen="result"]').hidden;
    if (!resultVisible) show('build');
    refresh();
    return;
  }
  if (event.intent?.op === INTENT.ADVANCE) {
    show('build');
    refresh();
    armClock({ reset: true });
    toast(ROUNDS[session.round - 1].brief);
    return;
  }
  if (event.res && event.res.ok === false) { toast(event.res.reason); return; }
  if (event.res) refresh();
}

/**
 * A team is only created once the build starts, so the design screen stays personal and the
 * newest device adopts the lead's design with its first snapshot.
 */
async function startTeam() {
  if (!join.collab || !join.classroom || team) return;
  let net = null;
  try { net = JSON.parse(localStorage.getItem('hb.v2.net') || 'null'); } catch { net = null; }

  if (net?.url && net?.anonKey) {
    // The relay only accepts messages for a room that exists and is open, so whoever arrives
    // first creates the row. Without this a fresh room code silently drops every intent — the
    // exact failure a pilot would hit on its first new session.
    try {
      const { openRoom } = await import('./net/room.js');
      await openRoom({ code: join.room, rounds: ROUNDS.length, minutes: join.minutes, label: session.hotelName });
    } catch { /* the bus keeps retrying; a missing room is reported by relay-check */ }
  }

  const bus = net?.url && net?.anonKey
    ? supabaseBus({ url: net.url, key: net.anonKey, room: join.room, team: session.teamName })
    : localBus(`hb-team-${join.room}-${slug(session.teamName)}`);
  team = createTeam({ bus, self: selfId, name: session.teamName, session, onChange: onTeamChange });
  renderTeamChip();
  toast(bus.kind === 'supabase' ? 'Team build connected — one hotel for everyone' : 'Team build: tabs on this device share one hotel');
}

function enterBuild() {
  show('build');
  tool = null;
  placing = null;
  view.fit();
  view.setGrid(true);
  view.setDusk(duskOn);
  view.hideGhost();
  refresh();
  armClock();
  startTeam();
  $('#trayHint').textContent = 'Choose a function, then tap the site to place it. Tap a building to move, rotate or remove it.';
}
/* ---------------------------------------------------------------- run round */

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

function runRound() {
  if (!session.placements.length) { toast('Place at least one function before running the round'); return; }
  const res = commit({ op: INTENT.RUN });
  if (!res.ok) return;
  if (res.pending) { toast('Round sent to the team — the lead device scores it'); return; }
  lastResult = res.result;
  if (clock) clock.pause();
  autosave(true);
  renderResult(lastResult);
  show('result');
}

/** Cause list for a card: the biggest movers first, capped so it stays readable. */
function causeList(ledger, limit = 12) {
  const rows = ledger
    .filter((c) => !c.code.startsWith('base:') && c.code !== 'clamp')
    .slice()
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.code.localeCompare(b.code))
    .slice(0, limit);
  return rows.map((c) => `<li><em class="${c.delta > 0 ? 'up' : 'down'}">${c.delta > 0 ? '+' : ''}${c.delta}</em>
    <span>${escapeHtml(c.note)}</span><code>${escapeHtml(c.code)}</code></li>`).join('')
    || '<li><em>0</em><span>No change from the layout this round</span><code>none</code></li>';
}

function renderResult(res) {
  const prev = session.history.length > 1 ? session.history[session.history.length - 2].metrics : null;
  const isLast = res.round >= ROUNDS.length;
  const card = $('#resultCard');
  card.innerHTML = `
    <p class="eyebrow">Round ${res.round} of ${ROUNDS.length} · ${escapeHtml(res.roundName)}</p>
    <h2>${escapeHtml(session.hotelName)}</h2>
    <p class="note">${res.layout.arrivals} arrivals · ${res.layout.footprintCells} cells built ·
      ${session.placements.length} functions · ${res.layout.capacity.roomEff}% of room demand met</p>
    <div class="score-grid">
      ${SCORECARD.map((m) => {
        const v = res.metrics[m.id];
        const d = prev ? v - prev[m.id] : 0;
        return `<div class="score"><span>${m.label}</span><b>${v}</b>
          <i>${prev ? `${d > 0 ? '+' : ''}${d} vs last round` : m.hint}</i></div>`;
      }).join('')}
    </div>
    <div class="composite"><b>${res.composite}</b>
      <span>Composite<p class="note">Fan Score 30% · Profitability 25% · Colleague Engagement 25% · Brand Standards 20%</p></span></div>
    <h3>What happened this round</h3>
    <ul class="events">
      ${res.events.map((e) => `<li class="${e.outcome}"><b>${escapeHtml(e.label)}</b>
        <span class="note">${escapeHtml(e.detail)}</span>
        <span class="note">${e.notes.map(escapeHtml).join(' · ')}</span></li>`).join('')
        || '<li><b>A quiet round</b><span class="note">No events drawn.</span></li>'}
    </ul>
    <h3>Why the score moved</h3>
    <ul class="causes">${causeList(res.ledger)}</ul>
    <p class="note">Every point is recorded with a cause code. The full trace appears at the end of the game.</p>
    <div class="row">
      <button class="btn" id="resJourneys">Show journeys on the site</button>
      <button class="btn btn--primary" id="resNext">${isLast ? 'See your hotel' : `Continue to round ${res.round + 1}`}</button>
    </div>`;

  $('#resJourneys').addEventListener('click', () => {
    overlaysOn = true;
    view.overlays.setJourneys(res.layout.journeys);
    view.overlays.setVisible(true);
    $('#btnOverlays').setAttribute('aria-pressed', 'true');
    show('build');
    armClock();
    toast('Journey routes drawn from the stops your layout actually resolved');
  });

  $('#resNext').addEventListener('click', () => {
    if (isLast) { finalResult = res; startShowcase(); return; }
    // Everyone advances together: a follower's click is an intent like any other.
    commit({ op: INTENT.ADVANCE });
    if (!team) {
      show('build');
      refresh();
      armClock({ reset: true });   // a new round starts with a full build block
      toast(ROUNDS[session.round - 1].brief);
    }
  });
}
/* --------------------------------------------------------------- showcase */

let showcaseTimer = 0;

function startShowcase() {
  show('showcase');
  $('#showcaseTeam').textContent = session.teamName;
  $('#showcaseHotel').textContent = session.hotelName;
  $('#showcaseCaption').textContent = '';
  view.startShowcase((i, caption) => { $('#showcaseCaption').textContent = caption; });
  clearTimeout(showcaseTimer);
  showcaseTimer = setTimeout(endShowcase, view.showcaseTotal * 1000 + 500);
}

function endShowcase() {
  clearTimeout(showcaseTimer);
  view.stopShowcase();
  view.setDusk(duskOn);
  view.setGrid(false);
  view.fit();
  renderReveal();
  show('reveal');
}

/* ------------------------------------------------------------------ reveal */

const VERDICTS = [
  { min: 78, line: 'A hotel that works for guests and for the colleagues who run it.' },
  { min: 62, line: 'A hotel that trades well, with something still left on the table.' },
  { min: 46, line: 'Revenue without the machine behind it. The gaps showed up late.' },
  { min: 0, line: 'The invisible functions decided this year.' },
];

/**
 * The reveal card scrolls internally on a tablet, where no scrollbar is drawn (the fade is
 * `.card::after` in app.css). Mark the card while there is more below, and unmark it at the
 * end, so the cue says "there is more" rather than a line of the scorecard being sliced.
 * Wired once per card: the reveal element survives a re-render, and stacking listeners on
 * every resize would be a slow leak in a session that runs for an hour.
 */
function wireScrollCue(el) {
  const update = () => {
    el.classList.toggle('is-more', el.scrollHeight - el.scrollTop - el.clientHeight > 6);
  };
  if (!el.dataset.scrollCue) {
    el.dataset.scrollCue = 'on';
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
  }
  // Web fonts land after first paint and change the text metrics, so measure again then.
  if (document.fonts?.ready) document.fonts.ready.then(update).catch(() => {});
  update();
}

/** The roster as it was scored at the end, in the same words the ledger used. */
function rosterBlock(res) {
  const mp = res.layout && res.layout.manpower;
  if (!mp) return '';
  const rows = mp.clusters.map((c) => {
    const note = c.short
      ? MANPOWER_NOTE.short.replace('{cluster}', c.label)
        .replace('{planned}', String(c.planned)).replace('{need}', String(c.need))
      : c.excess
        ? MANPOWER_NOTE.over.replace('{cluster}', c.label).replace('{excess}', String(c.excess))
        : `${MANPOWER_UI.planned} ${c.planned} of ${c.need}`;
    const cls = c.short ? 'short' : c.excess ? 'over' : '';
    return `<li><em class="${cls}">${c.planned}/${c.need}</em><span>${escapeHtml(note)}</span></li>`;
  }).join('');
  return `
    <h3>${MANPOWER_UI.title}</h3>
    <ul class="causes">
      ${rows}
      <li><em>${hkd(mp.payroll)}</em><span>${MANPOWER_UI.total} · ${MANPOWER_UI.training}: ${escapeHtml(mp.trainingLabel)}</span></li>
    </ul>
    <p class="note">${MANPOWER_UI.illustrative}: payroll is shown in HK$ and scored through the published points conversion.</p>`;
}

function renderReveal() {
  const res = finalResult || lastResult;
  if (!res) { show('build'); return; }
  const trace = SIM.traceOf(res);
  const verdict = (VERDICTS.find((v) => res.composite >= v.min) || VERDICTS[VERDICTS.length - 1]).line;
  const card = $('#revealCard');

  const traceBlock = (metricId, label) => {
    const rows = (trace[metricId] || []).filter((c) => !c.code.startsWith('base:')).slice(0, 5);
    return `<div class="score"><span>${label}</span><b>${res.metrics[metricId]}</b>
      <ul class="causes">${rows.map((c) => `<li><em class="${c.delta > 0 ? 'up' : 'down'}">${c.delta > 0 ? '+' : ''}${c.delta}</em>
        <span>${escapeHtml(c.note)}</span></li>`).join('') || '<li><em>0</em><span>No recorded causes</span></li>'}</ul></div>`;
  };

  card.innerHTML = `
    <p class="eyebrow">Final scorecard · ${escapeHtml(session.teamName)}</p>
    <h2>${escapeHtml(session.hotelName)}</h2>
    <p class="lede">${escapeHtml(verdict)}</p>
    <div class="composite"><b>${res.composite}</b>
      <span>Composite<p class="note">Across ${ROUNDS.length} rounds · ${session.placements.length} functions ·
        ${session.spent} of ${TOTAL_BUDGET} credits spent</p></span></div>
    <div class="code-block" id="codeBlock">
      <p class="eyebrow">Score code</p>
      <p class="note">Paste this into the board on the facilitator's laptop, or read it out.
        It carries the team name, the four scores and a fingerprint of the layout — the
        layout itself never leaves this device.</p>
      <textarea id="codeValue" readonly rows="2" spellcheck="false" aria-label="Score code"></textarea>
      <p class="note" id="codeHash"></p>
      <div class="row"><button class="btn btn--small btn--primary" id="codeCopy">Copy code</button></div>
    </div>
    <div class="score-grid">${SCORECARD.map((m) => traceBlock(m.id, m.label)).join('')}</div>
    ${rosterBlock(res)}
    <h3>Round by round</h3>
    <ul class="causes">
      ${session.history.map((h) => `<li><em>${h.composite}</em>
        <span>Round ${h.round} · ${escapeHtml(h.roundName)} — Fan ${h.metrics.fan}, Profit ${h.metrics.profit},
        Colleague ${h.metrics.colleague}, Brand ${h.metrics.brand}</span><code>${h.placements} functions</code></li>`).join('')}
    </ul>
    <p class="note">${join.classroom
      ? `Classroom session ${escapeHtml(join.room)}: every team met the same events, so the board compares like with like.`
      : 'Solo mode: single player, no network. Every number above came from the local deterministic simulation, so the same hotel replays identically.'}</p>
    <div class="row">
      <button class="btn" id="revSite">Back to the site</button>
      <button class="btn btn--primary" id="revAgain">Play again</button>
    </div>`;

  // The code is the record of the session; the save can now go.
  $('#codeValue').value = scoreCode(session, res);
  $('#codeHash').textContent = `Layout fingerprint ${layoutHash(session)} · ${session.placements.length} functions`;
  wireScrollCue(card);
  $('#codeCopy').addEventListener('click', async () => {
    const code = $('#codeValue').value;
    try {
      await navigator.clipboard.writeText(code);
      toast('Score code copied');
    } catch {
      $('#codeValue').select();
      toast('Selected — copy it from the field');
    }
  });

  $('#revSite').addEventListener('click', () => { show('build'); refresh(); });
  publishScore(res);
  $('#revAgain').addEventListener('click', () => {
    clearSave(saveScope);
    if (clock) clock.stop();
    overlaysOn = false;
    view.overlays.setVisible(false);
    $('#btnOverlays').setAttribute('aria-pressed', 'false');
    show('lobby');
    session = SIM.createSession({ seed: 'hb-lobby' });
    view.rebuild(session);
    view.fit();
    offerResume();
  });
}
/* ------------------------------------------------------------ build wiring */

function bindBuild() {
  $('#btnOverlays').addEventListener('click', () => {
    overlaysOn = !overlaysOn;
    $('#btnOverlays').setAttribute('aria-pressed', overlaysOn ? 'true' : 'false');
    if (overlaysOn) {
      view.overlays.setJourneys(SIM.preview(session).journeys);
      view.overlays.setVisible(true);
      toast('Routes are drawn from the stops your layout resolved — gaps are dimmed');
    } else {
      view.overlays.setVisible(false);
    }
  });

  $('#btnManpower').textContent = MANPOWER_UI.title;
  // The roster and Customise share the right-hand column. Reaching for this tool with a
  // building selected has to hand the column over; toggling a flag whose panel cannot appear
  // made the tool look broken (reproduced 2026-10-21: two clicks, nothing on screen).
  $('#btnManpower').addEventListener('click', () => {
    if (!$('#selectedPanel').hidden) {
      deselectBuilding();
      mpOpen = true;
    } else {
      mpOpen = !mpOpen;
    }
    syncPanels();
  });
  // The phone sheet's own way out (it covers the tool button at 700px and below).
  $('#mpClose').addEventListener('click', () => {
    mpOpen = false;
    syncPanels();
  });

  // The roster steppers. `session.staffing` holds only touched clusters; landing back on
  // the requirement deletes the key, so the plan returns to the score-neutral default.
  $('#mpList').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-cluster]');
    if (!b) return;
    const id = b.dataset.cluster;
    const step = Number(b.dataset.step);
    const need = SIM.manpowerRequirement(session, session.round)[id] || 0;
    const current = session.staffing[id] === undefined ? need : session.staffing[id];
    const next = Math.max(0, Math.min(need * MANPOWER.maxMul, current + step));
    // The intent carries the absolute headcount, so two devices cannot race a delta.
    const res = commit({ op: INTENT.STAFFING, cluster: id, heads: next });
    if (res.pending) { sentToTeam(); return; }
    refresh();
  });

  $('#mpTraining').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tier]');
    if (!b) return;
    const tier = Number(b.dataset.tier);
    if (tier === (session.training || 0)) return;
    // When the tier was chosen matters as much as the tier itself: training bought in
    // pre-opening is absorbed before opening day, training bought later is rushed.
    const res = commit({ op: INTENT.TRAINING, tier, round: session.round });
    if (res.pending) { sentToTeam(); return; }
    refresh();
  });

  $('#btnDusk').addEventListener('click', () => {
    duskOn = !duskOn;
    $('#btnDusk').setAttribute('aria-pressed', duskOn ? 'true' : 'false');
    view.setDusk(duskOn);
  });

  // Capture: a render of the TEAM'S OWN hotel, taken from the live scene at twice the
  // on-screen resolution. This replaced a panel of pre-baked photographs of a demo build
  // — pictures the app then had to label as "not your hotel". Nothing is fetched and
  // nothing is pre-rendered: the image is produced by the renderer on the click, from
  // wherever the camera happens to be, so it cannot show a hotel the session lacks.
  const capturePanel = $('#capture');
  function showCapture(on) {
    if (on && !capturePanel.hidden) return;
    if (on) {
      const shot = view.capture();
      const img = $('#captureImg');
      img.setAttribute('src', shot.url);
      // The alt text is the claim: this is the team's hotel, and it says so with the
      // names the team typed. Built as text, not markup — a hotel name is user input.
      img.setAttribute('alt', `A render of ${session.hotelName} as built by ${session.teamName}`);
      const save = $('#captureSave');
      save.setAttribute('href', shot.url);
      save.setAttribute('download', `${session.hotelName} - ${session.teamName}.jpg`);
      $('#captureNote').textContent = `Your own build — ${session.hotelName}, exactly as it stands `
        + `on screen, re-rendered at twice this screen's resolution (${shot.w} × ${shot.h}) `
        + `${duskOn ? 'at dusk' : 'in daylight'}. Nothing here is pre-drawn.`;
      $('#captureSize').textContent = `${shot.w} × ${shot.h} JPEG`;
    }
    capturePanel.hidden = !on;
    $('#btnCapture').setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on) $('#captureClose').focus();
    else $('#btnCapture').focus();
  }
  $('#btnCapture').addEventListener('click', () => showCapture(capturePanel.hidden));
  $('#captureClose').addEventListener('click', () => showCapture(false));
  capturePanel.addEventListener('click', (e) => { if (e.target === capturePanel) showCapture(false); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !capturePanel.hidden) showCapture(false);
  });

  $('#btnGrid').addEventListener('click', () => {
    const on = $('#btnGrid').getAttribute('aria-pressed') !== 'true';
    $('#btnGrid').setAttribute('aria-pressed', on ? 'true' : 'false');
    view.setGrid(on);
  });

  $('#btnFit').addEventListener('click', () => view.fit());
  $('#btnRun').addEventListener('click', runRound);

  $('#btnExpand').textContent = PLOT_UI.tool;
  $('#btnExpand').addEventListener('click', toggleExpand);
  $('#plotBuy').addEventListener('click', buyPendingPlot);
  $('#plotCancel').addEventListener('click', closePlotPanel);

  $('#selRotate').addEventListener('click', () => {
    const res = commit({ op: INTENT.ROTATE, uid: session.selectedUid });
    if (!res.ok) { toast(res.reason); return; }
    if (res.pending) { sentToTeam(); return; }
    refresh();
    selectPlacement(session.selectedUid);
  });
  $('#selMove').addEventListener('click', startMove);
  $('#selRemove').addEventListener('click', () => {
    const uid = session.selectedUid;
    const res = commit({ op: INTENT.REMOVE, uid });
    if (!res.ok) { toast(res.reason); return; }
    if (res.pending) { sentToTeam(); return; }
    $('#selectedPanel').hidden = true;
    refresh();
    toast(`${FUNCTION_BY_ID[res.placement.fnId].label} removed · ${res.refund} credits refunded`);
  });
  $('#selClose').addEventListener('click', () => {
    deselectBuilding();
    syncPanels();
  });
  $('#btnSkipShowcase').addEventListener('click', endShowcase);
}

/* -------------------------------------------------------------------- boot */

function boot() {
  const canvas = $('#scene');
  view = createView(canvas);
  view.resize();
  window.addEventListener('resize', () => view.resize());
  view.onTap = handleTap;
  view.onHover = handleHover;

  // A session must exist before the first frame: the lobby shows the empty plot,
  // the heritage pavilion and the signature element, so the 3D is never blank.
  session = SIM.createSession({ seed: 'hb-lobby' });
  view.rebuild(session);
  view.fit();

  bootLobby();
  bindBuild();
  // The roster panel shares the right-hand column with Customise, so on a tablet it
  // starts closed: the canvas and the tray are what a first-time user needs first.
  mpOpen = window.innerWidth >= 1200;
  syncPanels();
  show('lobby');
  requestAnimationFrame((t) => { last = t; frame(t); });

  // Test hook: the smoke test drives the real app through this handle instead of
  // re-implementing it, so what is verified is what ships. Read-only by convention.
  window.__hb = {
    get session() { return session; },
    get view() { return view; },
    get screen() { return screens.find((s) => !s.hidden)?.dataset.screen || null; },
    get join() { return join; },
    get clock() { return clock; },
    get saveScope() { return saveScope; },
    get team() { return team; },
    // The actions a gate needs to drive without guessing at canvas coordinates. Each one goes
    // through `commit`, the same intent path a tap takes, so a test cannot take a shortcut the
    // UI lacks: a follower device still has to send the intent and wait for the sequencer.
    select: (uid) => { selectPlacement(uid); },
    placeAt: (fnId, col, row) => commit({ op: INTENT.PLACE, fnId, col, row, rot: 0 }),
    remove: (uid) => commit({ op: INTENT.REMOVE, uid }),
    scoreCode,
    layoutHash,
    SIM,
  };

  // Fail loudly rather than silently: a WebGL failure must be visible, not a blank page.
  window.addEventListener('error', (e) => {
    console.error('[hotel-builders]', e.message);
    toast(`Error: ${e.message}`);
  });
}

boot();
