> **Current fidelity work:** start with `C:\Users\clementy\.kimi-code\hotel-builders\docs\FIDELITY-CONTINUATION.md` and `FULL-SCENE-BRIEF.md` beside it. Source-lighting and pool/spa occlusion repairs are tracked in `CHECKPOINTS.md`. The existing hall-only architecture plan is historical where it conflicts. Run the canonical checks with `node tools/verify.mjs` from this repository.


# MOVEin — Hotel Builders

A static, procedural Three.js prototype of MOVEin Hotel Builders: build a hotel on a
constrained site, run the simulation, and see the result in both the scorecard **and
the building**.

**Status: classroom pilot build.** The simulation and the visuals are the same Stage 1
vertical slice; what is new is a classroom layer that runs a multi-team session with no
server: a join link per team, classroom rules, a build clock, autosave, and a score code
that a facilitator pastes into a projector board. A Supabase transport exists for Phase 2
but is dormant until a project is configured.

Run the pilot from `docs/PILOT-RUNSHEET.md`; wire the optional backend from
`docs/PHASE-2-SUPABASE.md`.

**Deployed pilot:** <https://yuclem-creator.github.io/movein-hotel-builders/> — GitHub Pages
serves the repo root on `main`, so a push is a deploy. The board at
`…/movein-hotel-builders/board.html` prints join cards carrying that HTTPS address, which is
why phones can scan them from any network: no laptop, no tunnel, no client isolation.

---

## Run it

```
node serve.js          # http://127.0.0.1:5173
```

No `npm install`. Three.js is vendored in `vendor/three/`, fonts are local, and every
texture is drawn on a canvas at runtime. Nothing is fetched from a CDN at runtime, so
blocked jsdelivr cannot break a session.

**Fastest way to see it** (the demo path, no other players required):

1. Open the URL → **Start build**
2. On *Customise*, pick a style / palette / signature, then click any preset —
   **Balanced hotel**, **Revenue-first**, **People-first** or **Neglected back of house**.
   Each builds a complete hotel immediately so you can inspect the visual without
   placing sixteen blocks by hand.
3. **Build the hotel** → **Run this round** → result card with cause-coded metrics.
4. After round 4: **See your hotel** → a dusk showcase camera tour → final scorecard
   with the full audit trace.

You can also place functions manually from the tray: tap a function, tap the site.
Tap a built function to select it, then Rotate / Move / Remove.

**Customise what you own.** Select a built function and its panel offers only what that
function is allowed to carry — a rooftop terrace on rooms and public buildings, a green
roof on anything but the pool, a solar array on back of house and people functions, a
canopy on the front, the spa and the restaurants, outdoor seating on the restaurants —
plus height in storeys where height is a choice. Every add-on is paid for out of the
release budget and scores immediately against the same four lines as everything else, so
a pretty roof still has to earn its credits. Add-ons combine: a green roof turns the crown
into a planted deck, and a terrace added on top of one insets into that planting instead of
paving over it.

**Buy land.** *Expand site* shows the plots that are for sale; buy one and it becomes
part of your hotel — buildable, framed by the camera, and charged upkeep every round.
Purchases are final, and the Riverside Deck takes only restaurants, the pool and the spa.

---

## Run a classroom session

A room is a URL: `index.html?room=HB24&team=Blue%20Team&mins=8`. Six things follow from
that query string, and all of them work offline.

1. **Join cards.** Open `board.html` on the facilitator laptop, set the room code, the
   number of teams and the build minutes, then *Make join cards* → *Print*. Each card is
   a QR plus the room code and the link. **The card must carry an address a phone can
   reach**: opened on `localhost`, the board asks the dev server for the laptop's network
   address (`/__lan`) and fills it in, so the default set is phone-reachable. If no network
   card answers — static hosting, or `localhost` with no LAN — the page says so rather than
   printing six codes that open nothing. A phone that will not scan can join by typing the
   code in the lobby.
2. **Classroom rules turn on.** Starting hotels and the sandbox are hidden: a preset is a
   one-tap answer, and in testing it beat teams that built by hand. Every team builds from
   the same 640 credits and meets the same events, because a classroom room seeds the
   events from the room code rather than the hotel name.
3. **A build clock per round.** Shown in the HUD, default 8 minutes, paced by the
   facilitator via `mins=`. It never blocks a tap: at zero it says time is up and the team
   still presses *Run round*.
4. **Autosave and resume.** Every change is written to this device under
   `hb.v2.save.<room>.<team>`. A locked tablet or a reload offers **Resume** in the lobby.
5. **A score code.** The final card prints `HB1.…` — the team name, the four scores and a
   fingerprint of the layout (not the layout itself). Copy it, read it out, or send it.
6. **The board.** Paste the codes into *Leaderboard*; it ranks by composite, then Fan,
   then Brand, then name. Rows persist across a refresh.

Solo play, the presets and the sandbox are unchanged when there is no `room` in the URL.

### When the room's Wi-Fi will not let a phone reach the laptop

**The deployed Pages site removes this problem entirely** — point the cards at
`https://yuclem-creator.github.io/movein-hotel-builders/` and stop running a local server.
What follows is only for a laptop-hosted session.

Guest and corporate networks routinely isolate clients. A card can carry a correct address,
scan perfectly, and still open nothing, because the access point drops phone-to-laptop
traffic. Confirm it in ten seconds: type the card's address into the phone's browser — a
timeout means isolation, not a bad QR.

```
npm run share
```

opens an SSH reverse tunnel through `localhost.run` (no account, no install — OpenSSH ships
with Windows) and records the public address in `share-url.txt`. The dev server publishes it
at `/__lan`, and the board prefers it over the laptop's own address, so *Make join cards*
prints codes that work on any phone, on any network. The address lives as long as the
command does; Ctrl-C closes the tunnel and removes the file. If a share dies without Ctrl-C,
delete `share-url.txt` or the cards keep carrying a dead address.

Two alternatives, both honest: tether the laptop to a phone hotspot (hotspot subnets do not
isolate clients, but iPhone allows only about five), or deploy the folder to any static host
— the app needs no server, so HTTPS hosting removes the problem entirely.

---

## Architecture

```
index.html            importmap -> vendor/three
css/tokens.css        MO brand canon: gold #B59060, sage #B7CDC2, ink #232323
css/app.css           layout only; phone-first, no hover dependencies
js/sim/               PURE + ISOMORPHIC simulation (no DOM, no three, no network)
  catalogue.js        all content: site facts, 20 functions, adjacency matrix, journeys, events,
                      add-ons, plots, manpower clusters/tiers - every string the player sees
  rng.js              seeded RNG - Math.random() is forbidden here
  engine.js           grid, placement rules, pathfinding, scorecard, rounds, presets,
                      customisation, land purchase and upkeep, manpower plan and its scoring
js/render/            procedural three.js
  materials.js        material kit + canvas textures, photo surface maps drawn into them
assets/textures/      8 CC0 surface scans (tools/textures.mjs builds them; SOURCES.md)
  massing.js          3 architecture styles x 10 function archetypes, plus add-on geometry
  site.js             plot, arrival court, service yard, river, heritage pavilion, landscape
  agents.js           instanced figures + vehicles that walk the routes the sim computed
  overlays.js         journey routes, from the stops the sim actually resolved
  view.js             renderer, constrained camera rig, day/dusk, showcase shot list, picking
js/main.js            screens, gestures, HUD, result cards
js/classroom/         classroom layer - no DOM, no network
  join.js             join links, autosave/restore, score codes, ranking
  timer.js            the per-round build clock
js/qr/qr.js           QR encoder (facilitator page only; never on a player's first load)
js/net/room.js        Phase 2 Supabase transport, imported only when configured
js/board.js           facilitator page: join cards, leaderboard, optional live sync
board.html            printable cards and the projector board
supabase/schema.sql   Phase 2 tables, indexes and RLS policies
tools/                verification gates (see below)
review/               rendered frames for human inspection (gitignored)
```

Key decision: **the simulation never touches the renderer.** `js/sim/` is importable in
Node with no browser, which is what lets the determinism gate compare the browser's
answer against Node's answer bit for bit.

**Several people, one hotel (opt-in).** A card built with `collab=1` puts every device that
joins the same room *and team* on one shared build. It is not a multiplayer server: the
earliest device is the **sequencer**, everyone else sends intents, the sequencer validates
them against the engine and republishes them with a sequence number, and every device replays
the same intents in the same order. There is no state to merge, so two devices cannot drift —
which is the whole point. The engine stays deterministic and single-client; the order is the
only shared artefact.

- Transport: `BroadcastChannel` across tabs on one device, or Supabase (`team_events`, polled)
  across phones once a project is configured — see `docs/PHASE-2-SUPABASE.md`.
- Tests: `npm run team` drives two browser contexts and a late joiner through place, roster,
  remove and a full round, asserting every device holds the same hotel. `sim-check` proves the
  same convergence in Node, with no browser at all.

**Solo play never touches any of it.** Without `collab`, the simulation is one client that
stores nothing outside the device and cannot be corrupted by a dropped connection.

### How the architecture is drawn

No model files. Every texture is drawn on a canvas at load, so the first frame needs no
image. After the window `load` event, eight CC0 photographic scans from Poly Haven
(`assets/textures/`, 222 KB, provenance in `assets/textures/SOURCES.md`, built and
md5-verified by `node tools/textures.mjs`) are drawn **into** those same canvases: paving,
roof slate (both with normal maps), open-ground sand, roof gravel, planting and facade
plaster grain. They are grey modulators re-centred on the drawn colours, so the MO palette
still comes from the materials. A map that fails to load logs a `console.error` (every gate
fails on it) and the drawn map stays.

- **Facade albedo + bump from one canvas.** One tile = 4 columns × 4 storeys of
  recessed window openings over warm stone, with panel joints, mullions, transoms,
  sills, a few drawn blinds and fine grain. The same canvas serves as `map` *and*
  `bumpMap`, so openings and sills catch real light with no extra texture memory.
- **UVs rescaled per face in world units** (`tileBoxUV`). Without it every facade gets
  one window stretched across its whole elevation — the difference between a building
  and a coloured box. Because a tile is four storeys and a storey is 1.5 units, the
  windows lock exactly to the 3D floor bands.
- **Window lights share the same 4×4 cell maths** as the albedo, so a light can never
  appear between two windows at dusk.
- **Per-building material variation**: lightness is jittered a few percent from the
  footprint, deterministically, so fifteen walls are not one flat tone.
- **Detail courses**: a proud base course and a stepped cornice on every main body;
  styles add a colonnade (Heritage), a garden wall with planting (Courtyard), or
  vertical fins and a taller entrance (Tower).
- **Paving tiles at its own world scale** (3 units) so the plinth and aprons are not
  one stretched tile.
- **Shadows are baked once** and re-baked only on rebuild, style, palette or day/dusk.
  The site is static and figures deliberately do not cast shadows, so there is no
  reason to re-render a 2048² shadow map every frame.

## The simulation

Four scorecard lines, one composite. The weights are the design argument:

`Fan Score 30% · Profitability 25% · Colleague Engagement 25% · Brand Standards 20%`

Revenue is capped at 25%, so a revenue-first plan cannot win, and every point carries a
**cause code** (`adj:laundry:rooms`, `missing:eng`, `journey:goods`, `event:breakdown`,
`cost:operating`…) so the result card can always say *why*.

What a plan is judged on:

- **Capacity against demand** — 90 → 210 arrivals across four rounds; short rooms mean a
  visible queue of guests standing outside check-in.
- **Adjacency matrix** — 26 rules with distance decay. Kitchen beside the restaurant
  helps; laundry or plant beside guest rooms costs Fan Score; waste crossing the guest
  arrival costs Brand Standards.
- **Invisible functions** — `REQUIRED` records what breaks when something is missing:
  no Laundry, no Engineering, no Housekeeping, no canteen. This is the lesson of the
  "Neglected back of house" preset.
- **Site facts** — arrival court (south), service yard (north), river frontage (east),
  heritage pavilion (protected). The same footprint scores differently by position.
- **Pathfinding** — a BFS over the grid. Walking distance drives Fan Score, operating
  cost and Colleague Engagement, and a block in the wrong place lengthens a real route.
- **Service Sequences** — five journeys (Guest Arrival, Service Recovery, Linen Cycle,
  Goods-In, Colleague Day). Gaps are penalised hard; friction is the extra steps the
  layout forces people to walk. Routes drawn on the map come from these resolutions.
- **Events** — 12, drawn deterministically per seed, and each one reads the layout
  rather than rolling dice blind: a plant failure matters far more with no Engineering,
  a VIP arrival needs a concierge near the arrival court, a complaint is absorbed by a
  healthy Guest Arrival journey. Three roster events (Resignation wave, Peak banquet
  season, Pay review) join the deck only once a team has planned a roster.
- **Manpower** — four rostered clusters (Rooms Division, Food & Beverage, Events, Front
  Office). Each requirement follows what the team built and what the round demands — 45
  keys per room attendant, 22 covers per service colleague — so a hotel does not roster
  for rooms it cannot fill. **Rostering exactly at requirement is score-neutral by
  design**, which is why the regression lock still passes: the layer only moves a score
  when a team deviates. Too few colleagues loses revenue, Fan Score and engagement; too
  many pays for colleagues with nothing to do; a second short round running costs more
  than one because the session remembers it. Payroll is displayed in illustrative money
  (labelled on screen); the scorecard still scores points.

Measured balance evidence (`npm run check`), round 4, same budget:

| preset | fan | profit | colleague | brand | **composite** |
|---|---|---|---|---|---|
| Balanced hotel | 100 | 45 | 71 | 58 | **71** |
| People-first | 97 | 37 | 71 | 54 | **67** |
| Revenue-first | 75 | 62 | 0 | 26 | **43** |
| Neglected back of house | 66 | 46 | 0 | 31 | **38** |
| Round 1 core only | 88 | 16 | 0 | 28 | **36** |

Revenue-first takes the highest Profitability in the set and still finishes 28 points
behind the balanced plan.

---

## Verification

Eleven gates. `npm run verify` runs all of them; none is a substitute for looking at the
frames or handing a tablet to a colleague.

| gate | proves |
|---|---|
| `check-syntax.mjs` | every JS file parses (41 files) |
| `sim-check.mjs` | determinism, **regression lock against `tools/baseline.json`**, balance assertions, ledger reconciliation, placement rules, journey resolution, journey legs, owned land, manpower requirements and deviations, and **shared-build convergence** — two sessions replaying one intent stream, a refused stale intent, and a late joiner (144 checks) |
| `brand-gate.mjs` | no off-canon colour anywhere in shipped CSS/HTML/JS, `board.html` included; headings use MO Exceptional at Regular only, never synthesised weight |
| `bytes.mjs` | first-load budget: **1198.4 KB raw / 322.1 KB gzip** (budgets 1200 / 324), walking all of `js/`; deferred surface maps **222.2 KB** (budget 240, after the first frame) |
| `qr-check.mjs` | the join-card QR is scannable: finders, timing, both format copies, capacity boundaries, quiet zone — and, when the dev decoder is installed, an independent **decode** of five real join URLs |
| `smoke.mjs` | browser E2E on desktop **and** phone: boot, WebGL, fonts, full demo flow, result card, showcase, reveal, **browser engine === Node engine**, a *comparative* frame-rate check, zero console errors (39 checks) |
| `visual-check.mjs` | composition (sky/middle/ground), three styles produce genuinely different silhouettes, each palette's accent is wired to real geometry, four signature elements are distinguishable, add-ons change the building without breaking the frame, and the manpower roster sits clear of the HUD and the tray with its own steps reflected on screen (39 checks) |
| `input-check.mjs` | a real pointer reaches the scene at 1280/1440/1920: start, pick a function, orbit, zoom, tap the site, press Reset view, buy a plot, then hand the right-hand column from Customise to the roster and back — plus phone 390×844 and tablet 1024×768, where the roster must open from the tool button, stay hittable, always leave a way out, and write the session; the canvas stays topmost throughout (133 checks) |
| `team-check.mjs` | two devices and a late joiner on one hotel: both see each other, a placement on one appears on the other under the same uid, a roster change and a removal cross over, the late joiner adopts the hotel instead of starting empty, and a round run on one device lands every device on the result screen with the same composite (12 checks) |
| `class-check.mjs` | the classroom path at 390×844, 844×390 and 1024×768: join from the URL, classroom rules, clock start and countdown, nothing off screen; then place, autosave, reload, resume, four rounds, score code, the reveal card's scroll cue, and the board ranking it — plus the join cards' QR pointing at an address a phone can actually open (56 checks) |
| `capture-check.mjs` | the Capture panel renders **the team's own hotel**: closed on boot, its tool button unpressed, and *no image requested except the surface maps in `assets/textures/`*, every one of which must have loaded — the image is a `data:` URL produced by the renderer on the click, so a missing asset cannot be what is on screen; it is larger than the viewport it was taken from, carries real bytes, decodes to a frame with real colour spread and variance (a blank buffer fails), names the hotel and team **this session typed** (a demo render could not), states that it is the team's own build and not pre-drawn, hands the same image to a named download, tracks `aria-pressed`, and dismisses by close control, Escape and scrim (15 checks) |

The architectural-fidelity tools are not gates and are not part of `npm run verify`:
`arch-shot.mjs` renders one isolated building from four fixed cameras, so a reference frame shows
one building and nothing else; `sig.mjs` scores a candidate reference against our own frame for
structure (>= 0.75) and colour (<= 30); `flora-upload.mjs` sends a frame to an upload slot FLORA
reserves. The method is `docs/ARCH-FIDELITY-PLAN.md` and the measured detail rows are
`docs/ARCH-DETAIL-LEDGER.md`.

The Capture panel is the one place the app shows a picture of the hotel, so it is the one
place a reader could mistake it for something else. It used to be the opposite risk: three
pre-baked photographs of a demo build, which the app then had to label "not your hotel" —
a claim no gate can make true, only keep honest. It now calls `view.capture()`, which raises
the pixel ratio (never the CSS size, so the framing is identical to what the user is looking
at), renders once, reads the canvas in the same task — no `preserveDrawingBuffer`, which
would cost every frame of the normal path — and restores. The grid, the selection plate and
any pending ghost are hidden for the shot because they are tools, not building. The gate
types a hotel name into the lobby and then looks for it in the capture's own alt text: a
render of a demo build cannot contain a name the session invented.

The reveal card is the one screen that scrolls internally at tablet size, and a tablet draws
no scrollbar. `class-check` asserts a sticky paper fade sits above the bottom edge while
there is more to read and retires at the end of the card, so the scorecard is never silently
sliced mid-line (`review/75-class-reveal-tablet.png`).

Two layout defects the roster frames caught were equally invisible to a pixel hash, and one
of them made the build unusable on a 1280×800 laptop: a vertically centred right-hand panel
ended 59px *under* the tray, so the Customise panel's `Done` button could not be tapped; and
the wrapped tray cut its third row at a card boundary with no scrollbar on screen. Both
panels are now anchored between the HUD and the tray and scroll inside themselves, the
roster resets to the top when reopened, and both the roster and the tray fade their trailing
edge only while there is more (`review/62-manpower-panel.png`, `review/31-manpower-laptop.png`).

`qr-check` decodes with a dev-only decoder, not a runtime dependency:
`npm install --prefix tools/.qrdeps jsqr` (gitignored). Without it the structural checks
still run and the decode step says it was skipped — it never silently passes.

`visual-check` includes a **control**: the same look rendered twice must differ by
0/255 mean pixel. Every threshold above that floor is therefore meaningful rather than
relative to noise.

`sim-check` also carries a **regression lock**. `tools/baseline.json` was generated from
the engine as shipped, before the journey/customisation/land work began, and records every
preset's per-round metrics, composite, event ids and full ledger — including the wording of
each ledger note — plus the round-4 layout's journeys and exact placement cells. Any drift
fails the gate with the path that moved (`.presets.balanced.layout.metrics.fan: 100 -> 99`).
It is deliberately not regenerated by any gate: `tools/make-baseline.mjs` only writes when
run by hand, and changing the baseline is a balance decision, not a test fix-up.

Rendered frames land in `review/` — open them yourself to judge the look; the gates
only prove the image is not empty and that the differences are real.

---

## Known limitations and open questions

- **Screenshots were viewed at 1× and in crops, on one pass only.** The customisation
  frames (`27-customise-greenroof.png`, `27-customise-addons.png`) are now shot on the
  roof itself — the camera measures the wing's own top once, before any add-on, and orbits
  it, instead of orbiting the pavement — so the deck is fully in frame and all three frames
  share one camera. They were still only inspected at 1× and at 2–3× on the deck edge and
  the crown mast, and the judgements are in `docs/`.
  Still unjudged: a green roof on the Tower and Courtyard styles, the other three
  palettes, and the terrace-on-green at 1920. Open `review/21-style-*.png` and
  `review/60-expand-mode.png` before approving those.
- **The renderer does not reach the fidelity of the reference renders, and there is a
  measured inventory of why.** Clement's target is the FLORA reference set in
  `review/flora-render/`. One pass has closed the cues that were implementable without new
  dependencies — raking sun (49° -> 26° elevation, shadows 0.87× -> 2.05× object height),
  contact darkening under every prop, paving slabs at 1.875 m instead of 1.0 m, sky-reflecting
  water, real aerial perspective, legible slate courses on shaded slopes — at a cost of
  ~1.2 KB. What is left is itemised with its price in `docs/RENDER-FIDELITY-GAP.md`: screen-space
  AO needs the post-processing chain vendored (~40–60 KB, against ~1.7 KB of headroom), the
  reference camera is a low architectural 3/4 while the game camera is a high aerial for
  legibility, and the object set is still fewer, chunkier primitives.
- **Two palette pairs are barely distinguishable**: gold/ember (0.75/255 mean pixel) and
  sage/moon (0.40) sit below the 1.5 floor, against 1.90–2.91 for every other pair.
  Whether to widen the palette is a design call, not a code defect — the accent *is*
  correctly applied to 38 of 225 meshes either way.
- **The roster scrolls at 1280×800.** Four clusters plus the training selector are taller
  than the 350px column, so the payroll total sits below the fold and the panel fades its
  last row. It fits from 1440×900 up. Compacting the zero-requirement rows would buy back
  ~50px and is not done, because collapsing a division changes what the panel appears to
  measure.
- **On a phone the roster covers most of the hotel.** At 390×844 the panel spans the screen
  between the HUD and the tool column, leaving a thin strip of scene. It carries its own
  `×` there, because it covers the tool button that opened it; the stepper grows to 40px on
  coarse pointers — still under the 44px guideline, which two buttons plus the counts
  inside a 358px sheet will not allow. Its top edge also clips the lower half of the HUD
  score bars at that size, because the phone HUD wraps to two lines and the sheet is
  anchored at 170px; the numbers stay readable.
- **Performance is measured only under software rasterisation.** The headless harness
  renders on the CPU, so absolute frame rates there are meaningless (and noisy — a
  shared machine with stray browser processes moved the same empty scene between 4 and
  9 fps). The smoke gate therefore asserts a *ratio* against the empty plot, and after
  baking the shadow map a 15-building hotel costs nothing measurable over an empty one.
  **Nobody has measured this on a real GPU or a real phone.** Do that before committing
  to a live session, and give the scene a frame budget if a low-end tablet is in scope.
- **Fan Score saturates at 100** for the balanced and people-first presets, which
  removes headroom for an excellent hotel at the top. The ledger records the clamp, so
  it is visible rather than hidden, but the baselines want recalibrating.
- **Revenue is still points, while payroll now shows money.** By decision (2026-10-19)
  there is no room rate, occupancy or P&L. Manpower displays illustrative payroll —
  labelled as such on screen — and converts season cost to points at a published rate
  (HK$30,000 per point, in `catalogue.js`), so teams practise workforce planning against
  a real cost without the game pretending to model a margin. A New Joiner still learns
  why departments sit where they do, not how a hotel makes its margin.
- **Phase 2 has code but no hosted project.** `supabase/schema.sql` and
  `js/net/room.js` are ready; creating the project needs the Supabase account, so the
  pilot runs on score codes instead. The policies are open to the anon role on purpose
  (no accounts in a classroom) and the honest limits are in `docs/PHASE-2-SUPABASE.md`.
- **The QR encoder is hand-written** (versions 1-10, byte mode, ECC L/M). It is enough
  for a join URL and it is decoded by an independent library in `tools/qr-check.mjs`, but
  it is not a general-purpose QR library and should not grow into one.
- **No Blender.** Everything you see is generated at runtime from placement data.
- **A classroom room has a build clock; solo play does not.** The clock paces a room; it
  does not lock a team out at zero, so a facilitator can still allow "one more minute".
  Solo play remains untimed, on purpose.
- Fonts are the local copies (MO Exceptional, Avenir Next LT Pro). Confirmed 2026-10-19:
  both may be served from a public URL, so GitHub Pages is cleared for a pilot.

## Next

1. **Run the pilot** — `docs/PILOT-RUNSHEET.md`. Six teams, 70 minutes, one tablet per
   table. Bring back the score codes, the spread, the real timings and the device list.
2. **Manpower, remaining build** — the engine and its scoring are in and gated
   (`sim-check`, 144 checks). Still to build: the build-screen panel (per-cluster
   steppers, required-versus-planned bar, illustrative payroll, training tier), the reveal
   lines, and the run-sheet briefing and debrief questions. `docs/MANPOWER-BRIEF.md` is
   the design lock; do not re-derive the numbers from this README.
3. **Phase 1, learning** — the readable journey panel first (the routes exist in the
   simulation but have no player-facing view), then, if approved, a simple P&L with room
   rate and occupancy feeding Profitability. Revenue figures need a source: sanitised
   Finance numbers, or a fictional property that says "illustrative" on screen. Nothing
   is invented.
4. **Phase 2, optional backend** — `docs/PHASE-2-SUPABASE.md`. The project itself has not
   been created: that needs your Supabase login. **Nothing in this repo may touch an
   existing Supabase project**; create a new, dedicated one.
5. **Deferred** — Blender polish (inspect the procedural approach first), the revenue
   model, and role cards at the table (the run sheet suggests roles; the app does not
   enforce them yet).
