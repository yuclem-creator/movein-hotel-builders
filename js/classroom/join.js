// join.js — classroom plumbing that needs no server.
//
// A pilot room is three things: a URL that carries the room code and the team, a save
// on the device so a locked phone does not lose a hotel, and a score code at the end
// that the facilitator pastes into the projector board. All three work offline, which
// is what makes a first pilot possible before Supabase exists.
import { ROUNDS } from '../sim/catalogue.js';

export const SAVE_VERSION = 2;
const SAVE_PREFIX = 'hb.v2.save';

/* --------------------------------------------------------------------- join */

/** Room codes are what a facilitator reads aloud: letters and digits only. */
export function normaliseRoom(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

/**
 * A join card can carry the relay configuration (`net=`), so a phone needs no setup of its
 * own: the payload is the same public pair a facilitator would otherwise paste into a
 * console, encoded into the link they scanned. Base64url of `{"url":"…","anonKey":"…"}`.
 */
export function parseNet(raw) {
  if (!raw) return null;
  try {
    const padded = raw.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (raw.length % 4)) % 4);
    const text = new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
    const net = JSON.parse(text);
    return typeof net?.url === 'string' && typeof net?.anonKey === 'string' && net.url.startsWith('http')
      ? { url: net.url, anonKey: net.anonKey }
      : null;
  } catch {
    return null;
  }
}

/** The same public pair, encoded for a URL. */
export function encodeNet(url, anonKey) {
  const text = JSON.stringify({ url, anonKey });
  return btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Read the session from the URL.
 * `room` turns classroom rules on; `team` is the team's display name, not an index,
 * so two teams that both type "Blue" are the facilitator's problem, not a crash.
 */
export function parseJoin(search = '') {
  const params = new URLSearchParams(search);
  const room = normaliseRoom(params.get('room'));
  const minutes = Number(params.get('mins'));
  return {
    classroom: Boolean(room),
    room,
    team: (params.get('team') || '').trim().slice(0, 24),
    hotel: (params.get('hotel') || '').trim().slice(0, 28),
    minutes: Number.isFinite(minutes) && minutes > 0 ? Math.min(60, Math.round(minutes)) : 8,
    facilitator: params.get('facilitator') === '1',
    // Team build: several devices on one hotel, one of them sequencing. Off unless the card
    // asks for it, because a solo session must keep behaving exactly as it did.
    collab: params.get('collab') === '1',
    // The relay configuration carried by the card, so a phone needs nothing typed in.
    net: parseNet(params.get('net')),
  };
}

/** The same URL a team scanned, rebuilt from what the lobby currently holds. */
export function joinUrl(baseHref, { room, team, hotel, minutes }) {
  const url = new URL(baseHref);
  url.search = '';
  url.searchParams.set('room', normaliseRoom(room));
  if (team) url.searchParams.set('team', team);
  if (hotel) url.searchParams.set('hotel', hotel);
  if (minutes) url.searchParams.set('mins', String(minutes));
  return url.toString();
}

/* ------------------------------------------------------------------- saves */

const keyFor = (scope) => `${SAVE_PREFIX}.${scope}`;

/** Only the fields the simulation reads; `selectedUid` is UI state, not the hotel. */
export function serialise(session) {
  return {
    v: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    session: {
      seed: session.seed,
      teamName: session.teamName,
      hotelName: session.hotelName,
      style: session.style,
      palette: session.palette,
      signature: session.signature,
      landscape: session.landscape,
      placements: session.placements.map((p) => ({
        uid: p.uid, fnId: p.fnId, col: p.col, row: p.row, w: p.w, h: p.h, rot: p.rot || 0,
        round: p.round, size: p.size || 'M', storeyDelta: p.storeyDelta || 0,
        variant: p.variant || null, addons: [...(p.addons || [])],
      })),
      round: session.round,
      released: session.released,
      spent: session.spent,
      usedEvents: [...session.usedEvents],
      history: session.history,
      nextUid: session.nextUid,
      plots: (session.plots || []).map((p) => ({ ...p })),
      monogram: session.monogram || '',
    },
  };
}

/** Reason the save cannot be used, or null when it is safe to restore. */
export function saveProblem(save) {
  if (!save || save.v !== SAVE_VERSION || !save.session) return 'This save was written by a different version';
  const s = save.session;
  if (!Array.isArray(s.placements) || !Array.isArray(s.history)) return 'This save is incomplete';
  if (!(s.round >= 1 && s.round <= ROUNDS.length)) return 'This save is from a different round structure';
  return null;
}

export function writeSave(scope, session) {
  try {
    localStorage.setItem(keyFor(scope), JSON.stringify(serialise(session)));
    return true;
  } catch {
    // Private browsing, or storage full. Autosave must never break the game.
    return false;
  }
}

export function readSave(scope) {
  try {
    const raw = localStorage.getItem(keyFor(scope));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSave(scope) {
  try { localStorage.removeItem(keyFor(scope)); } catch { /* nothing to clear */ }
}

/** Fields the restore path copies over a fresh session, so nothing unknown slips in. */
export const RESTORED_FIELDS = [
  'seed', 'teamName', 'hotelName', 'style', 'palette', 'signature', 'landscape',
  'placements', 'round', 'released', 'spent', 'usedEvents', 'history', 'nextUid',
  'plots', 'monogram',
];

export function restore(session, save) {
  const problem = saveProblem(save);
  if (problem) return { ok: false, reason: problem };
  for (const k of RESTORED_FIELDS) {
    if (save.session[k] !== undefined) session[k] = save.session[k];
  }
  session.selectedUid = null;
  return { ok: true };
}

/* -------------------------------------------------------------- score codes */

/** FNV-1a over the layout. Identity, not proof: it tells two layouts apart cheaply. */
export function layoutHash(session) {
  const text = session.placements
    .map((p) => [p.fnId, p.col, p.row, p.w, p.h, p.rot || 0, p.size || 'M', p.storeyDelta || 0,
      (p.addons || []).join('+'), p.variant || '-'].join(':'))
    .sort()
    .join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, '0').slice(-7);
}

const b64url = (text) => btoa(String.fromCharCode(...new TextEncoder().encode(text)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const unb64url = (text) => {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const bin = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

/**
 * A team's finished session, as one line the facilitator can paste into the board.
 * `HB1.` is the version marker, so an old code can never be read as a new one.
 */
export function scoreCode(session, result) {
  const m = result.metrics;
  const payload = [
    session.teamName, session.hotelName, result.composite,
    m.fan, m.profit, m.colleague, m.brand,
    layoutHash(session), session.placements.length, ROUNDS.length,
  ].join('|');
  return `HB1.${b64url(payload)}`;
}

export function readScoreCode(code) {
  const clean = String(code || '').trim().replace(/\s+/g, '');
  if (!clean.startsWith('HB1.')) return null;
  let text;
  try { text = unb64url(clean.slice(4)); } catch { return null; }
  const parts = text.split('|');
  if (parts.length !== 10) return null;
  const [team, hotel, composite, fan, profit, colleague, brand, hash, placements, rounds] = parts;
  const [c, f, p, l, b, n, r] = [composite, fan, profit, colleague, brand, placements, rounds].map(Number);
  if ([c, f, p, l, b, n, r].some((v) => !Number.isFinite(v))) return null;
  if ([c, f, p, l, b].some((v) => v < 0 || v > 100)) return null;
  return {
    team, hotel, composite: c,
    metrics: { fan: f, profit: p, colleague: l, brand: b },
    hash, placements: n, rounds: r, code: clean,
  };
}

/** Parse a pasted block: one code per line, blanks and junk ignored. */
export function readScoreBlock(text) {
  const seen = new Set();
  const out = [];
  for (const token of String(text || '').split(/[\s,;]+/)) {
    const row = readScoreCode(token);
    if (!row) continue;
    const key = `${row.team}|${row.hash}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

/** Sort for the board: composite, Fan, Brand, then name — ties are never left silent. */
export function rankRows(rows) {
  return rows.slice().sort((a, b) => b.composite - a.composite
    || b.metrics.fan - a.metrics.fan
    || b.metrics.brand - a.metrics.brand
    || a.team.localeCompare(b.team));
}
