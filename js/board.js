// board.js — the facilitator's page. Two jobs, one screen: print join cards before the
// session, then collect score codes and project the board at the end.
//
// There is no server in the pilot: a team's code travels as text (typed, read out, or
// pasted from a chat) and the board is the only place it lands. Phase 2 replaces the
// paste box with Supabase, which this file already knows how to read when configured.
import { qrSvg } from './qr/qr.js';
import { normaliseRoom, readScoreBlock, rankRows } from './classroom/join.js';

const $ = (sel) => document.querySelector(sel);
const STORE = 'hb.v2.board';
const ALPHABET = 'ACDEFGHJKLMNPQRTUVWXY34679';   // no O/0, I/1, S/5 — read aloud safely

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let rows = [];

/* ------------------------------------------------------------------- storage */

function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return null;
    const save = JSON.parse(raw);
    return save && Array.isArray(save.rows) ? save : null;
  } catch {
    return null;
  }
}

function persist() {
  const config = {
    room: normaliseRoom($('#room').value),
    teams: Number($('#teams').value) || 1,
    mins: Number($('#mins').value) || 8,
    // The names are the facilitator's own work: without them a reload silently went back
    // to "Team 1..6" while the room, the team count and the clock survived.
    names: $('#names').value,
    rows,
  };
  try { localStorage.setItem(STORE, JSON.stringify(config)); } catch { /* private mode */ }
}

/* ---------------------------------------------------------------- join cards */

/** Where teams actually open the game: this page's folder, index.html. */
function siteBase() {
  const typed = $('#site').value.trim();
  if (typed) return typed;
  const url = new URL(window.location.href);
  url.pathname = url.pathname.replace(/board\.html$/, 'index.html');
  url.search = '';
  url.hash = '';
  return url.toString();
}

/** True when this page was opened on the laptop itself. */
const onThisMachine = () => /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/i.test(window.location.hostname);

/** True when a card built from this address would only open on the laptop. */
const isLocalBase = (base) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(base);

const localWarning = 'These links point at this laptop, so a phone cannot open them. '
  + 'Type this laptop\'s network address above — it fills itself in when the dev server is running — '
  + 'or have teams type the room code in the lobby instead.';

const staleWarning = 'The published address is no longer answering, so the cards above point at this laptop. '
  + 'Run npm run share again, then press Make join cards.';

// Set when /__lan reports a published address that stopped answering, so the footer says so
// instead of letting a facilitator print a set of dead codes.
let shareStale = false;

/**
 * A card built from `127.0.0.1` scans perfectly and opens nothing. The board asks its own
 * dev server for an address phones can reach and adopts it, so the default set works without
 * the facilitator knowing an IP. A published `/share` address wins over the laptop's own,
 * because guest and corporate Wi-Fi often drop phone-to-laptop traffic entirely. Static
 * hosting has no such route, and then the warning is the honest answer.
 */
async function adoptLanSite() {
  if (!onThisMachine() || !isLocalBase($('#site').value.trim())) return;
  try {
    const res = await fetch('__lan', { cache: 'no-store' });
    if (!res.ok) return;
    const info = await res.json();
    shareStale = info.shareStale === true;
    const ip = Array.isArray(info.lan) ? info.lan[0] : '';
    const host = typeof info.share === 'string' && info.share
      ? info.share.replace(/\/$/, '')
      : ip ? `http://${ip}:${info.port}` : '';
    if (!host) return;
    $('#site').value = `${host}/index.html`;
    makeCards();
  } catch { /* static hosting: keep the address we were opened on */ }
}

const randomRoom = () => Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

function makeCards() {
  const room = normaliseRoom($('#room').value) || randomRoom();
  const count = Math.max(1, Math.min(12, Number($('#teams').value) || 1));
  const mins = Math.max(3, Math.min(30, Number($('#mins').value) || 8));
  const names = $('#names').value.split('\n').map((s) => s.trim()).filter(Boolean);
  const base = siteBase();

  const teams = Array.from({ length: count }, (_, i) => names[i] || `Team ${i + 1}`)
    .map((name) => {
      const url = new URL(base);
      url.searchParams.set('room', room);
      url.searchParams.set('team', name);
      url.searchParams.set('mins', String(mins));
      return { name, url: url.toString() };
    });

  $('#room').value = room;
  $('#site').value = base;
  $('#roomLine').textContent = `Session ${room} · ${teams.length} team${teams.length === 1 ? '' : 's'} · ${mins}-minute rounds`;

  $('#cards').innerHTML = teams.map(({ name, url }) => `
    <figure class="card">
      <div class="qr">${qrSvg(url, { module: 6 })}</div>
      <figcaption>
        <b>${escapeHtml(name)}</b>
        <span class="code">${room}</span>
        <span class="link">${escapeHtml(url)}</span>
      </figcaption>
    </figure>`).join('');

  const longest = Math.max(...teams.map((t) => t.url.length));
  $('#cardsFoot').textContent = shareStale
    ? staleWarning
    : isLocalBase(base)
      ? localWarning
      : `Codes were generated for ${base}. `
        + (longest > 180
          ? 'One link is very long: shorten the site address, or the QR gets dense.'
          : 'Test one card with a phone camera before you print the set.');

  persist();
}

/* --------------------------------------------------------------- leaderboard */

function mergeRows(incoming) {
  const seen = new Set(rows.map((r) => `${r.team}|${r.hash}|${r.composite}`));
  let added = 0;
  for (const row of incoming) {
    const key = `${row.team}|${row.hash}|${row.composite}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
    added++;
  }
  return added;
}

function renderBoard() {
  const sorted = rankRows(rows);
  $('#board').hidden = sorted.length === 0;
  $('#boardEmpty').hidden = sorted.length > 0;

  $('#boardBody').innerHTML = sorted.map((r, i) => `
    <tr>
      <td class="rank">${i + 1}</td>
      <td class="team"><b>${escapeHtml(r.team)}</b>
        <span>${escapeHtml(r.hotel)} · layout ${escapeHtml(r.hash)}</span></td>
      <td class="num comp">${r.composite}</td>
      <td class="num">${r.metrics.fan}</td>
      <td class="num">${r.metrics.profit}</td>
      <td class="num">${r.metrics.colleague}</td>
      <td class="num">${r.metrics.brand}</td>
      <td class="num hash">${r.placements}</td>
    </tr>`).join('');

  const lead = sorted[0];
  $('#boardFoot').textContent = lead
    ? `${sorted.length} on the board · leading: ${lead.team} at ${lead.composite}. `
      + 'Ties are broken by Fan Score, then Brand Standards, then name.'
    : '';
}

function addPasted() {
  const found = readScoreBlock($('#paste').value);
  const added = mergeRows(found);
  $('#paste').value = '';
  renderBoard();
  persist();
  const note = $('#boardFoot');
  if (added) note.textContent = `Added ${added} score${added === 1 ? '' : 's'}. ${note.textContent}`;
  else if (!found.length) note.textContent = 'No readable score code in that text — codes start with HB1.';
  else note.textContent = 'Those codes are already on the board.';
}

/* -------------------------------------------------------------- view wiring */

function setPanel(name) {
  const isJoin = name === 'join';
  $('#panelJoin').classList.toggle('is-on', isJoin);
  $('#panelBoard').classList.toggle('is-on', !isJoin);
  $('#tabJoin').setAttribute('aria-pressed', String(isJoin));
  $('#tabBoard').setAttribute('aria-pressed', String(!isJoin));
}

function init() {
  const save = load();
  if (save) {
    $('#room').value = save.room || $('#room').value;
    $('#teams').value = save.teams || $('#teams').value;
    $('#mins').value = save.mins || $('#mins').value;
    if (typeof save.names === 'string') $('#names').value = save.names;
    rows = save.rows || [];
  }
  $('#site').value = siteBase();

  $('#tabJoin').addEventListener('click', () => setPanel('join'));
  $('#tabBoard').addEventListener('click', () => setPanel('board'));
  $('#makeCards').addEventListener('click', makeCards);
  $('#printCards').addEventListener('click', () => window.print());
  $('#randomRoom').addEventListener('click', () => { $('#room').value = randomRoom(); makeCards(); });
  $('#addCodes').addEventListener('click', addPasted);
  $('#clearBoard').addEventListener('click', () => {
    rows = [];
    renderBoard();
    persist();
    $('#boardFoot').textContent = 'Board cleared.';
  });

  for (const id of ['room', 'teams', 'mins']) {
    $(`#${id}`).addEventListener('change', makeCards);
  }
  // Typing the names then going straight to Print used to print the old set: rebuild on
  // blur, which is when 'change' fires for a textarea.
  $('#names').addEventListener('change', makeCards);

  renderBoard();
  if (!$('#cards').children.length) makeCards();
  // The cards rendered above may be built from 127.0.0.1, which no phone can open. Ask the
  // dev server for a reachable address and rebuild if it has one.
  adoptLanSite();
}

init();

/* ---------------------------------------------------------------- phase two */

/**
 * When a Supabase project is configured (`js/net/config.local.js`), the board reads
 * submissions live instead of waiting for a paste. Without it this is a no-op, so the
 * pilot needs no server at all.
 */
async function syncServer() {
  if (!window.__HB_NET__ || !window.__HB_NET__.url) return;
  try {
    const { listScores } = await import('./net/room.js');
    const remote = await listScores(normaliseRoom($('#room').value));
    if (mergeRows(remote)) { renderBoard(); persist(); }
  } catch (err) {
    $('#boardFoot').textContent = `Live sync unavailable (${err.message}). Pasting codes still works.`;
  }
}

if (window.__HB_NET__ && window.__HB_NET__.url) {
  syncServer();
  setInterval(syncServer, 15000);
}
