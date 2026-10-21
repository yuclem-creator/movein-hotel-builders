// intents.js — a hotel built by several people, described as operations rather than state.
//
// Two devices cannot both own a session and hope to agree. They need one order. An intent is
// a small, content-addressed record of what someone asked for ("place a rooms wing at 4,2"),
// replayed by every device through the same engine calls the UI uses. The deterministic
// engine stays the single source of truth, so there is no merge logic to get wrong: identical
// intents in identical order produce identical hotels, which `sim-check` proves.
//
// The leader assigns `seq` and the placement `uid`. Followers never invent a uid, because
// every later intent (move, rotate, customise, remove) addresses a building by it.
import {
  place, movePlacement, rotatePlacement, removePlacement, customise, buyPlot,
  manpowerRequirement, runRound, advanceRound,
} from './engine.js';

export const INTENT = {
  PLACE: 'place',
  MOVE: 'move',
  ROTATE: 'rotate',
  CUSTOMISE: 'customise',
  REMOVE: 'remove',
  PLOT: 'plot',
  STAFFING: 'staffing',
  TRAINING: 'training',
  RUN: 'run',
  ADVANCE: 'advance',
};

/**
 * Apply one intent to `s`, mutating it exactly as the UI would. Returns
 * `{ ok, uid?, reason? }` and never throws: a stale intent is refused on every peer with the
 * same reason, which is what keeps the devices from silently diverging.
 */
export function applyIntent(s, intent) {
  if (!intent || typeof intent.op !== 'string') return { ok: false, reason: 'Malformed intent' };

  switch (intent.op) {
    case INTENT.PLACE: {
      const res = place(s, intent.fnId, intent.col, intent.row, intent.rot || 0);
      if (!res.ok) return res;
      const added = s.placements[s.placements.length - 1];
      if (intent.uid) added.uid = intent.uid;
      return { ok: true, uid: added.uid };
    }
    case INTENT.MOVE: return movePlacement(s, intent.uid, intent.col, intent.row);
    case INTENT.ROTATE: return rotatePlacement(s, intent.uid);
    case INTENT.CUSTOMISE: return customise(s, intent.uid, intent.changes || {});
    case INTENT.REMOVE: return removePlacement(s, intent.uid);
    case INTENT.PLOT: return buyPlot(s, intent.plotId);

    // The roster is absolute, not incremental: two people pressing + at the same time must
    // land on the same headcount, not on whichever delta arrived last.
    case INTENT.STAFFING: {
      const { cluster, heads } = intent;
      if (typeof cluster !== 'string' || !Number.isFinite(heads)) {
        return { ok: false, reason: 'Malformed staffing intent' };
      }
      const need = manpowerRequirement(s, s.round)[cluster];
      // Landing back on the requirement deletes the key, so the plan returns to the
      // score-neutral default — the same rule the stepper applies locally.
      if (Number.isFinite(need) && need === heads) delete s.staffing[cluster];
      else s.staffing[cluster] = Math.max(0, Math.round(heads));
      return { ok: true };
    }

    case INTENT.TRAINING: {
      const tier = Number(intent.tier);
      if (!Number.isFinite(tier)) return { ok: false, reason: 'Malformed training intent' };
      s.training = tier;
      // When the tier was bought matters as much as the tier: it is read by the round the
      // team was in when they bought it, so it travels with the intent.
      s.trainingSetRound = Number.isFinite(intent.round) ? intent.round : s.round;
      return { ok: true };
    }

    // Scoring is deterministic, so every device can run the round itself and must arrive at
    // the same answer — which is cheaper and safer than shipping a result to compare.
    case INTENT.RUN: {
      const result = runRound(s);
      return { ok: true, result };
    }
    case INTENT.ADVANCE: {
      const res = advanceRound(s);
      return res;
    }

    default:
      return { ok: false, reason: `Unknown intent ${intent.op}` };
  }
}

/** The state a late joiner needs. Placements carry their leader-assigned uids. */
export function snapshotOf(s) {
  return {
    style: s.style,
    palette: s.palette,
    signature: s.signature,
    landscape: s.landscape,
    round: s.round,
    released: s.released,
    spent: s.spent,
    nextUid: s.nextUid,
    training: s.training || 0,
    trainingSetRound: s.trainingSetRound || 0,
    staffing: { ...s.staffing },
    plots: (s.plots || []).map((p) => ({ ...p })),
    placements: s.placements.map((p) => ({
      uid: p.uid, fnId: p.fnId, col: p.col, row: p.row, w: p.w, h: p.h, rot: p.rot || 0,
      round: p.round, size: p.size || 'M', storeyDelta: p.storeyDelta || 0,
      variant: p.variant || null, addons: [...(p.addons || [])],
    })),
    usedEvents: [...s.usedEvents],
    history: s.history,
  };
}

/** Copy a snapshot into a live session, replacing everything a build can change. */
export function adoptSnapshot(s, snap) {
  if (!snap || !Array.isArray(snap.placements)) return false;
  s.style = snap.style ?? s.style;
  s.palette = snap.palette ?? s.palette;
  s.signature = snap.signature ?? s.signature;
  s.landscape = snap.landscape ?? s.landscape;
  s.round = snap.round ?? s.round;
  s.released = snap.released ?? s.released;
  s.spent = snap.spent ?? s.spent;
  s.nextUid = snap.nextUid ?? s.nextUid;
  s.training = snap.training || 0;
  s.trainingSetRound = snap.trainingSetRound || 0;
  s.staffing = { ...(snap.staffing || {}) };
  s.plots = (snap.plots || []).map((p) => ({ ...p }));
  s.placements = snap.placements.map((p) => ({ ...p, addons: [...(p.addons || [])] }));
  s.usedEvents = [...(snap.usedEvents || [])];
  s.history = snap.history || [];
  s.selectedUid = null;
  return true;
}
