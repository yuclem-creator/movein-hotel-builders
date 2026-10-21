// room.js — Phase 2: the optional Supabase transport.
//
// Nothing imports this unless a project is configured, so the pilot ships and runs with
// no backend at all. Configuration is deliberately NOT a file in this repo: an anon key
// is a public client key, but it still belongs to a project, not to a git history. Set
// it once in the facilitator's browser:
//
//   localStorage.setItem('hb.v2.net', JSON.stringify({ url: 'https://<ref>.supabase.co', anonKey: '<anon>' }))
//
// or provide `window.__HB_NET__` before the module loads. `docs/PHASE-2-SUPABASE.md`
// has the provisioning steps and the honest limits of this design.

const CONFIG_KEY = 'hb.v2.net';

function config() {
  if (window.__HB_NET__?.url && window.__HB_NET__?.anonKey) return window.__HB_NET__;
  try {
    const stored = JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null');
    return stored?.url && stored?.anonKey ? stored : null;
  } catch {
    return null;
  }
}

export const configured = () => Boolean(config());

const headers = (extra = {}) => ({
  apikey: config().anonKey,
  // A publishable key (`sb_publishable_…`) is not a JWT; only JWT keys travel as a Bearer.
  ...(String(config().anonKey).startsWith('eyJ') ? { Authorization: `Bearer ${config().anonKey}` } : {}),
  'Content-Type': 'application/json',
  ...extra,
});

async function rest(path, init = {}) {
  const cfg = config();
  if (!cfg) throw new Error('Supabase is not configured');
  const res = await fetch(`${cfg.url.replace(/\/$/, '')}/rest/v1/${path}`, {
    ...init,
    headers: headers(init.headers),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 160)}` : ''}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** Shape a score row the way the board's paste path reads it. */
const toRow = (r) => ({
  team: r.team,
  hotel: r.hotel,
  composite: r.composite,
  metrics: { fan: r.fan, profit: r.profit, colleague: r.colleague, brand: r.brand },
  hash: r.layout_hash,
  placements: r.placements,
  rounds: r.rounds,
  code: r.code || '',
});

/**
 * Publish one team's result. A resubmission for the same team replaces the earlier one:
 * a team that resumes after a dead battery should not appear twice.
 */
export async function submitScore({ room, team, hotel, result, code, layoutHash, placements }) {
  const body = [{
    room,
    team,
    hotel,
    composite: result.composite,
    fan: result.metrics.fan,
    profit: result.metrics.profit,
    colleague: result.metrics.colleague,
    brand: result.metrics.brand,
    layout_hash: layoutHash,
    placements,
    rounds: result.round,
    code,
  }];
  await rest('submissions?on_conflict=room,team', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(body),
  });
  return true;
}

/** Every submission in a room, newest first, in board order terms. */
export async function listScores(room) {
  const rows = await rest(
    `submissions?room=eq.${encodeURIComponent(room)}`
    + '&select=team,hotel,composite,fan,profit,colleague,brand,layout_hash,placements,rounds,code'
    + '&order=composite.desc',
  );
  return (rows || []).map(toRow);
}

/** Create the room row a submission will reference. Idempotent by design. */
export async function openRoom({ code, rounds = 4, minutes = 8, label = '' }) {
  await rest('rooms?on_conflict=code', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify([{ code, rounds, minutes, label }]),
  });
  return true;
}
