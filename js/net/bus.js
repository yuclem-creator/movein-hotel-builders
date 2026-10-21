// bus.js — how team messages travel. The protocol above this file does not care which bus it
// gets, and that is the point: the browser tab bus needs no account and proves the behaviour,
// while the Supabase bus carries the same messages between phones.
//
// A bus is { kind, send(msg), onMessage(handler), close() }.

/**
 * Several tabs or windows of one browser, no configuration, no network. Two people sharing a
 * laptop — or one person testing — get real collaboration, and `team-check` uses this to
 * prove convergence without a backend.
 */
export function localBus(name) {
  const channel = new BroadcastChannel(name);
  const handlers = new Set();
  channel.onmessage = (event) => {
    for (const handler of handlers) handler(event.data);
  };
  return {
    kind: 'local',
    send: (msg) => channel.postMessage(msg),
    onMessage(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    close() {
      handlers.clear();
      channel.close();
    },
  };
}

/**
 * Phones on different networks, through Supabase over plain REST.
 *
 * Realtime broadcast would be lower latency, but it needs the Supabase client library and a
 * channel handshake; a polled append-only table needs neither, survives a dropped connection
 * by simply asking for what it missed, and is fast enough for a build where people are
 * arguing about a ballroom. Latency is the poll interval, default 800 ms.
 *
 * The table is `team_events(id bigserial, room text, team text, body jsonb)`; the schema and
 * its row-level policy live in `supabase/schema.sql`.
 */
export function supabaseBus({ url, key, room, team, pollMs = 800 }) {
  const base = url.replace(/\/$/, '');
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const handlers = new Set();
  const scope = `room=eq.${encodeURIComponent(room)}&team=eq.${encodeURIComponent(team)}`;
  let lastId = 0;
  let timer = null;
  let stopped = false;

  const emit = (msg) => { for (const handler of handlers) handler(msg); };

  async function poll() {
    if (stopped) return;
    try {
      const res = await fetch(
        `${base}/rest/v1/team_events?${scope}&id=gt.${lastId}&order=id.asc&select=id,body&limit=200`,
        { headers, cache: 'no-store' },
      );
      if (res.ok) {
        const rows = await res.json();
        for (const row of rows) {
          lastId = Math.max(lastId, row.id);
          emit({ ...row.body, _id: row.id });
        }
      }
    } catch {
      // A dropped poll is not an event: the next one asks for everything after lastId.
    }
    if (!stopped) timer = setTimeout(poll, pollMs);
  }

  timer = setTimeout(poll, 0);

  return {
    kind: 'supabase',
    async send(msg) {
      try {
        await fetch(`${base}/rest/v1/team_events`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: JSON.stringify({ room, team, body: msg }),
        });
      } catch { /* offline: the next poll will reconcile when it returns */ }
    },
    onMessage(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    close() {
      stopped = true;
      clearTimeout(timer);
      handlers.clear();
    },
  };
}
