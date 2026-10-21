# Phase 2 — Supabase sync (optional)

The pilot does not need a server: a team's score travels as an `HB1.…` code and the board
reads it from a paste box. This page covers the upgrade path, so that wiring it later is
an afternoon rather than a project.

**Status of this phase: code and schema are in place; the hosted project is NOT created.**
Creating one needs your Supabase account (an access token or a dashboard login). There is
no Supabase credential on this machine — I checked, and none should be stored in this
folder anyway. So everything that can be done without your login is done; the last two
steps are yours and take about five minutes.

---

## What is already built

| File | What it does |
|---|---|
| `supabase/schema.sql` | Two tables (`rooms`, `submissions`), indexes, RLS policies, `close_room()`. Run once in a new project's SQL editor. |
| `js/net/room.js` | PostgREST client: `openRoom`, `submitScore`, `listScores`. Reads config from `localStorage['hb.v2.net']` or `window.__HB_NET__`. Nothing imports it unless a project is configured. |
| `js/main.js` → `publishScore()` | After the final reveal, if a project is configured **and** the team is in a classroom room, the result is published. Failures are silent: the code on screen is the record. |
| `js/board.js` → `syncServer()` | The board re-reads the room every 15 s when configured, so the projector updates itself. |

The design decision that matters: **teams submit a finished score, they do not stream
build state.** The simulation is deterministic and single-client, so there is no state to
reconcile, no ordering problem, and no way for a dropped connection to corrupt a hotel.
Real-time co-building would be a much larger, much riskier build for no learning gain.

---

## Create the project (your login, ~5 minutes)

1. <https://supabase.com/dashboard> → **New project**. Name it something unmistakable,
   e.g. `movein-hotel-builders`. Pick the region closest to the session (Singapore for
   HKT/APAC).
2. **SQL editor** → paste all of `supabase/schema.sql` → **Run**. You should see
   "Success. No rows returned".
3. **Project settings → API** → copy **Project URL** and the **anon public** key.
4. In the browser that will run the session (the facilitator laptop), open
   `<your-game-url>/board.html`, open the developer console, and run — with the real
   values:

   ```js
   localStorage.setItem('hb.v2.net', JSON.stringify({
     url: 'https://<project-ref>.supabase.co',
     anonKey: '<anon public key>',
   }));
   location.reload();
   ```

   The anon key is a *public client key* by design, but it belongs to a project, not to a
   git history: keep it in the browser, not in a file in this repo.
5. **Verify.** Run one solo round, then check **Table editor → submissions** after a full
   4-round session; or ask the board to sync (it does so on load and every 15 s).

> Do NOT paste the **service_role** key anywhere. It bypasses RLS and has no business in
> a browser.

---

## What the policies do, and what they do not

The classroom has no accounts — asking thirty New Joiners to sign in is not a pilot — so
`rooms` and `submissions` are open to the anon role:

- anyone may read a room and its board;
- anyone may create a room;
- anyone may insert or update a submission **in an open room**;
- closing a room (`select close_room('HB24')`) stops further submissions without
  deleting the board.

The limit is honest and worth stating in the debrief room if it comes up: **a team could
overwrite another team's row if it knew the team name**, because the unique key is
`(room, team)` and there is no per-team secret. That is acceptable for a training room
where the incentive is a certificate, and not acceptable for anything that matters.

Phase 3 hardening, in order:

1. Issue a per-team secret inside the join card (`?k=…`), store its hash on the room row,
   and check it in a Postgres function before accepting a submission.
2. Move the insert into an RPC so the check is not client-side.
3. Add a facilitator token for `close_room`, and a `reset_room` that deletes rows.
4. Rate-limit by room.

---

## If the venue blocks Supabase

Expected. Corporate Wi-Fi commonly blocks `*.supabase.co`. The pilot is designed so that
does not matter: turn the sync off by clearing the config and the event-driven flow is
unchanged.

```js
localStorage.removeItem('hb.v2.net'); location.reload();
```

The board keeps working from pasted codes, and nothing else in the game touches the
network.

---

## Not built, deliberately

- **Edge Functions, auth, realtime channels.** None of them earn their keep for a
  4-round, one-laptop session.
- **Replay storage.** `submissions` stores the score and a layout fingerprint, not the
  layout. If a later phase wants the facilitator to re-render a team's hotel on the
  projector, the layout has to be added as JSON and the engine replayed against it — a
  clean addition, because the simulation is deterministic and has no browser dependency.
