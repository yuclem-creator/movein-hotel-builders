// relay-check.mjs — proves the team-build relay is actually usable before a session does.
//
//   node tools/relay-check.mjs <project-url> <publishable-or-anon-key> [room]
//
// or set HB_SB_URL / HB_SB_ANON. It answers four questions in order, because each one is a
// different failure with a different fix: is the project reachable, has the schema been run,
// can a device write, and how long a round trip takes — that last number is the poll latency a
// team actually feels. Nothing here is part of `npm run verify`: it needs credentials.
const [, , urlArg, keyArg, roomArg] = process.argv;
const url = (urlArg || process.env.HB_SB_URL || '').replace(/\/$/, '');
const key = keyArg || process.env.HB_SB_ANON || '';
const room = (roomArg || 'HB24').toUpperCase();

let fails = 0;
const check = (name, ok, extra = '') => {
  console.log(ok ? `  ok   ${name}${extra ? ` — ${extra}` : ''}` : `  FAIL ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};

if (!url || !key) {
  console.error('usage: node tools/relay-check.mjs <project-url> <publishable-key> [room]');
  console.error('       (or set HB_SB_URL and HB_SB_ANON)');
  process.exit(2);
}

// A publishable key is not a JWT; only JWT keys are sent as a Bearer token.
const base = { apikey: key };
const auth = String(key).startsWith('eyJ') ? { ...base, Authorization: `Bearer ${key}` } : base;
const json = { ...auth, 'Content-Type': 'application/json' };

const timed = async (fn) => {
  const t0 = performance.now();
  const out = await fn();
  return { out, ms: Math.round(performance.now() - t0) };
};

console.log(`== relay: ${url} (room ${room}) ==`);

try {
  // Connectivity is proven by any structured answer from PostgREST — including "no such
  // table", which is the answer before the schema exists. A bare 401 on `/rest/v1/` means
  // nothing: that endpoint wants a schema cache hit, not an anon key.
  const reach = await timed(() => fetch(`${url}/rest/v1/rooms?select=code&limit=1`, { headers: auth }));
  const reachBody = await reach.out.text().catch(() => '');
  const reachJson = (() => { try { return JSON.parse(reachBody); } catch { return null; } })();
  check('the project answers and accepts the key',
    reach.out.ok || reachJson?.code === 'PGRST205',
    `HTTP ${reach.out.status}, ${reach.ms} ms${reach.out.status === 401 ? ' — key refused' : ''}`);
  if (reach.out.status === 401 || reach.out.status === 403) {
    console.log('       the key was refused: check that this is the publishable/anon key for THIS project');
  }

  // Rooms first: the team_events policy checks the room exists and is still open.
  const openRoom = await fetch(`${url}/rest/v1/rooms?on_conflict=code`, {
    method: 'POST',
    headers: { ...json, Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify([{ code: room, rounds: 4, minutes: 8, label: 'relay-check' }]),
  });
  const roomBody = openRoom.ok ? '' : (await openRoom.text()).slice(0, 180).replace(/\s+/g, ' ');
  check('the rooms table exists and accepts a room', openRoom.ok, roomBody || `HTTP ${openRoom.status}`);
  if (!openRoom.ok && /relation|does not exist|42P01|PGRST205/i.test(roomBody)) {
    console.log('       run supabase/schema.sql in the project\'s SQL editor, then run this again');
  }

  const probe = await fetch(`${url}/rest/v1/team_events?select=id&limit=1`, { headers: auth });
  const probeBody = probe.ok ? '' : (await probe.text()).slice(0, 180).replace(/\s+/g, ' ');
  const hasTable = probe.ok;
  check('the team_events table exists', hasTable, probeBody || `HTTP ${probe.status}`);
  if (!hasTable) {
    console.log('       run supabase/schema.sql in the project\'s SQL editor, then run this again');
  }

  if (hasTable) {
    const marker = `relay-check-${Date.now()}`;
    const write = await timed(() => fetch(`${url}/rest/v1/team_events`, {
      method: 'POST',
      headers: { ...json, Prefer: 'return=minimal' },
      body: JSON.stringify({ room, team: 'relay-check', body: { k: 'probe', marker } }),
    }));
    check('a device can write an intent', write.out.ok,
      write.out.ok ? `${write.ms} ms` : (await write.out.text()).slice(0, 180).replace(/\s+/g, ' '));

    if (write.out.ok) {
      const read = await timed(async () => {
        for (let i = 0; i < 10; i++) {
          const res = await fetch(
            `${url}/rest/v1/team_events?room=eq.${room}&team=eq.relay-check&order=id.desc&select=id,body&limit=5`,
            { headers: auth, cache: 'no-store' },
          );
          if (res.ok) {
            const rows = await res.json();
            if (rows.some((r) => r.body?.marker === marker)) return rows;
          }
          await new Promise((r) => setTimeout(r, 150));
        }
        return null;
      });
      check('the same device can read it back', Boolean(read.out), read.out ? `${read.ms} ms round trip` : 'not visible after 1.5 s');
      if (read.out) {
        const slow = read.ms > 1500;
        console.log(`       felt latency with an 800 ms poll: about ${Math.max(read.ms, 800)} ms${slow ? ' (slow link or cold project)' : ''}`);
      }
    }
  }
} catch (err) {
  check('the project answered at all', false, err.message);
}

console.log(fails ? `\n${fails} RELAY CHECK(S) FAILED` : '\nRELAY READY');
process.exitCode = fails ? 1 : 0;
