# BRIEF — MOVEin Hotel Builders: Journeys, Building Customisation, Site Expansion

You are implementing three approved features in an existing, working static three.js app.
Read this whole brief before touching anything. Phases are strictly ordered:
**Phase 0 → Phase 1 (Journeys) → STOP for approval → Phase 2 (Customisation) → STOP → Phase 3 (Land) → STOP.**

> **STATUS — Phase 0 locked. Phase 2 (customisation) and Phase 3 (land) are built and
> awaiting sign-off. Phase 1 (readable journeys) is NOT built.**
> `tools/baseline.json` was generated from the shipped engine *before* any refactor, and
> `tools/sim-check.mjs` now fails on any drift — proven, not assumed: a one-point edit to
> the baseline produced `.presets.balanced.layout.metrics.fan: 100 -> 99`.
> **Do not redo §3, and never regenerate `baseline.json`.** It is the only thing that can
> tell you a later phase has quietly changed a score. §3 stays in this document as the
> record of what was done and why.
>
> Delivered out of the brief's order: §5 and §6 shipped before §4. Nothing in §4 shipped —
> `JOURNEY_GROUPS`, `#journeyPanel`, `journeyLabels` and the `overlays.js` rewrite are all
> still absent, and `overlays.js` is unchanged from before Phase 0. Read §4 as still-open
> work, then re-check §9 for any strings the later phases already consumed.

---------------------------------------------------------------------------------------------
## 1. Project facts

- Root: `C:\Users\clementy\.kimi-code\hotel-builders` (Windows, PowerShell). NOT a git repo.
  **First action:** copy the whole folder to `C:\Users\clementy\.kimi-code\hotel-builders.bak-<yyyymmdd-hhmm>`
  before editing. Never work without that backup.
- Plain ES modules, no bundler, no `npm install`, no new dependencies. three.js is vendored at
  `vendor/three/three.module.min.js` (core build only — **no three/addons**, so no CSS2DRenderer,
  no OrbitControls; write what you need).
- Serve: `node serve.js` → http://127.0.0.1:5173/
- Browser tests use playwright-core at
  `C:/Users/clementy/Downloads/email-automation/browser/node_modules/playwright-core` and Chrome at
  `C:/Program Files/Google/Chrome/Application/chrome.exe` (already wired in the tools).
- Machine policy: **never create `.ps1` files** (EDR blocks them). No Python, no Blender.

### Architecture (read these files fully before Phase 0)
| file | role |
|---|---|
| `js/sim/catalogue.js` | ALL content + every on-screen string (verbatim lock) |
| `js/sim/engine.js` | PURE + ISOMORPHIC sim: grid, placement, BFS walks, journeys, scorecard, events, presets |
| `js/sim/rng.js` | seeded RNG |
| `js/render/view.js` | renderer, camera rig (`rig`/`goal`, `fit`, `focusOn`, `snap`, `resize`), picking (`pick`, `groundCell`), ghost, selection, showcase |
| `js/render/massing.js` | procedural buildings per style × archetype; `buildMassing`, `storeysFor`, `footprintCentre` |
| `js/render/site.js` | terrain, plinth, grid, heritage, landscape, paths, signature, `cellCentre`, `doorPoint` |
| `js/render/overlays.js` | journey overlay (to be rewritten in Phase 1) |
| `js/render/agents.js` | instanced walkers/vehicles |
| `js/render/materials.js` | material kit `makeKit(paletteId)` — reuse kit materials, do not add colours |
| `js/main.js` | screens, HUD, tray, selection panel, gestures, `window.__hb` test hook |
| `index.html`, `css/app.css`, `css/tokens.css` | UI |
| `tools/*.mjs` | gates (see §8) |

---------------------------------------------------------------------------------------------
## 2. Non-negotiable rules

1. **Sim purity.** Nothing in `js/sim/` may touch DOM, three, network, `Date.now()` or `Math.random()`.
   Same input ⇒ same output in Node and browser (smoke test compares them bit for bit).
2. **Verbatim lock.** Every on-screen string must be defined in `catalogue.js` (labels, notes,
   templates). Never invent roles, systems, figures or labels beyond §9. User-typed text (team name,
   hotel name, monogram) is exempt.
3. **Every score change is a ledger cause.** Use the existing `add(metric, code, delta, note)` pattern in
   `evaluateLayout`, so the result card explains it and the reconciliation check (Σcauses == metric) passes.
4. **Regression lock.** With no customisation, no add-ons and no land bought, every preset must score
   **byte-identically** to today (see Phase 0 baseline). This holds through ALL phases.
5. **Brand.** Colours only from `css/tokens.css` (gold #B59060, sage #B7CDC2, ink #232323, ivory,
   stone, alert #A85B45, positive #4F7A5E, …) or the 4 palette accents. 3D: reuse kit materials
   (`kit.gold`, `kit.goldLine`, `kit.accent`, `kit.planting`, `kit.lawn`, `kit.foliage`, `kit.glass`,
   `kit.roofDark`, `kit.roofSlate`, `kit.roofTile`, `kit.paving`, `kit.pavingDark`, `kit.path`,
   `kit.trunk`, `kit.valid`, `kit.invalid`, `kit.selected` — all verified to exist in
   `materials.js#makeKit`). Headings = MO Exceptional, Regular only —
   **never** put `font-weight` on h1/h2/h3 rules. Body = Avenir Next LT Pro.
6. **Pointer-events trap (a real shipped bug).** `css/app.css` has `#ui > .screen { pointer-events:none }`
   and `#ui > .screen > * { pointer-events:auto }`. Any new direct child of `.screen--build` becomes
   clickable. A full-viewport layer (e.g. a label layer) placed there will block orbit/zoom/tap on the
   canvas. Such layers MUST get `pointer-events:none` with a selector of at least equal specificity
   (e.g. `#ui > .screen > .journey-labels { pointer-events:none }`), and only their interactive children
   get `auto`. `tools/input-check.mjs` must keep passing.
7. Keep the existing code style: explanatory "why" comments, small pure helpers, no frameworks.
8. Do not delete or weaken any existing check. Do not raise any threshold except the byte budget in §8.
9. Do not mark a phase done without running every gate and viewing the screenshots yourself.

---------------------------------------------------------------------------------------------
## 3. Phase 0 — groundwork (COMPLETE — reference only, do not repeat)

### 3.1 Baseline lock (do this BEFORE editing engine.js)
- Done. `tools/make-baseline.mjs` writes `tools/baseline.json`; `tools/sim-check.mjs`
  imports `snapshot()` from it so the gate and the generator share one code path (a gate
  that rewrote its own baseline would always pass — the write only happens when the file
  is run directly).
- The baseline records, per preset: every round's metrics, composite, event ids and full
  ledger (codes, deltas **and note wording**), plus the round-4 layout's causes, journeys
  and the exact placement cells. Ledger wording and cells are in there on purpose: a
  changed sentence is a changed result card, and a preset that moved cells changes every
  walk that follows.

### 3.2 BFS returns the path
- In `engine.js` add `bfsPath(from, to, blocked)` → array of `{col,row}` from start to goal inclusive,
  or `null`. Reimplement `bfsSteps` as `path ? path.length - 1 : null` (identical numbers; same
  neighbour order `DIRS`, same "goal may sit inside a footprint" rule).
- Add `walkPath(s, a, b)` → `{ steps, path, from: doorA, to: doorB }` mirroring `walkSteps`.

### 3.3 Journey legs
- Extend `evaluateJourney` so it also returns `legs[]`: for each consecutive pair of RESOLVED stops,
  `{ fromIndex, toIndex, steps (number|null), path (cells|null), frictionAdded }`, where `frictionAdded`
  is exactly what the existing code adds to `friction` (n, or 12 for an unreachable fixed stop, or 0 for
  an unreachable candidate). Unresolved stops produce a leg marker `{ gapIndex }` between neighbours.
  **Do not change** friction/gaps/quality arithmetic.
- Export `journeyDetail(s, journeyId)` → `evaluateJourney` result for any journey id (including ones
  not yet active in this round) plus `{ metric: JOURNEY_METRIC[id], active: introducedInRound <= s.round,
  introducedInRound }`.

### 3.4 Per-placement fields (defaults = today)
- `place()` writes `{ …existing, size:'M', storeyDelta:0, variant:null, addons:[] }`.
- `createSession` adds `plots: []`, `monogram: ''`.
- Move `storeysFor(fn, style)` from `massing.js` into `engine.js` (pure) and import it in massing.js.
- `window.__hb.SIM` already exposes the whole engine module (`main.js`, the test hook), so
  `input-check.mjs` can read `journeyDetail` / `customise` / `buyPlot` results directly
  instead of parsing the DOM. Nothing was added to it for this.

### 3.5 Owned-site abstraction (DONE — Phase 3 is built on it)
- Add `isOwned(s, col, row)` and `ownedCells(s)`; base = today's 12×9 rect. Thread an optional session
  into `inBounds(col,row,w,h,s)`; when `s` is absent behave exactly as today. Use it in
  `placementBlocker`, `doorCell`, `bfsPath` neighbour test. `findSpot`/`autoBuild` keep scanning the
  base rect only (keeps presets identical).

**Phase 0 exit:** all gates green, regression lock green, zero visible change.

---------------------------------------------------------------------------------------------
## 4. Phase 1 — Journeys you can read (FIRST VISIBLE PHASE)

Problem today: all 5 journeys draw at once as floating Catmull-Rom tubes through buildings, with no
sequence, no numbering, no step counts.

### 4.1 Data
- `catalogue.js`: `JOURNEY_GROUPS = [{ id:'guest', label:'Guest Journey', journeys:['arrival','recovery'] },
  { id:'ops', label:'Operations', journeys:['linen','goods','colleague'] }]` and a `JOURNEY_UI` block of
  string templates (see §9).

### 4.2 Journey panel (replaces the toast on `#btnOverlays`)
- Clicking **Journeys** opens `#journeyPanel` (direct child of `.screen--build`, left side under the
  tool buttons on desktop; bottom sheet above the tray at ≤720 px). Two tabs: **Guest Journey** /
  **Operations**. Under the active tab, one chip per journey; selecting a chip shows ONLY that journey.
- Panel body for the selected journey:
  - title (journey label), quality `/100`, which scorecard line it lands on (SCORECARD label via
    `JOURNEY_METRIC`), total steps;
  - ordered stop list: number, stop label, owner (from `JOURNEYS[].stops[].owner`), "Optional" tag,
    gap rows flagged with the gap string;
  - leg rows between stops: "N steps" or the unreachable string;
  - if `introducedInRound > session.round`: banner "Not scored until round N" (still previewed);
  - controls: **Play** / **Stop**, close (×).
- Numbers shown MUST equal the engine's: for active journeys use `SIM.preview(session).journeys`;
  for inactive use `SIM.journeyDetail`.

### 4.3 3D overlay — rewrite `js/render/overlays.js`
API: `setJourney(detail | null, { colour })`, `setActiveLeg(i | null)`, `update(dt)`, `setVisible`, `dispose`.
- **Ribbon on the ground along the real BFS path**: convert each leg's `path` cells via
  `cellCentre` to world points (y ≈ 0.05), prepend/append the stop door points (`doorPoint(rect)` /
  fixed arrival & service points), build ONE flat strip mesh per journey (manual BufferGeometry like
  `site.js#buildPaths`, width ≈ 0.9, mitred corners). Direction chevrons via a small canvas texture
  scrolled with `map.offset` in `update(dt)` — no per-frame geometry.
- Colours: keep the existing `ROUTE_COLOR` map in overlays.js.
- **Stop markers**: disc at each resolved stop + a footprint outline plate on each building the
  journey uses (thin rect line in route colour), so you can see which buildings are involved.
- **Gaps**: dashed straight segment from the previous resolved stop toward the next resolved stop,
  using `kit.invalid` colour, with a gap marker at its midpoint.
- **Active leg** (during Play/hover): that leg's ribbon at full opacity, others at ~0.35.
- Remove the old tubes, floating pins and sphere pulses entirely.

### 4.4 Labels (HTML, projected)
- Add `view.project(x, y, z)` → `{ x, y, visible }` in CSS px.
- `#journeyLabels` layer inside `.screen--build`, **pointer-events:none** (see rule 6). Each frame
  (only while a journey is shown) position: numbered badges "①…" with stop label + owner small text,
  and leg chips "N steps" at each leg's path midpoint. Hide labels behind the camera; avoid overlaps by
  nudging badges vertically when within 28 px of each other.
- Badge style: gold fill for guest group, sage for operations, ink text, MO Exceptional numerals.

### 4.5 Play
- A single walker (simple mesh in route colour; reuse agents' figure geometry if exposed, otherwise a
  capsule + sphere) moves along the ribbon at constant speed, pausing ~0.8 s at each stop. The panel
  highlights "Step k of n"; `view.focusOn(midX, midZ, radius)` frames the current leg (radius fitted to
  the leg's extent, clamped to camera limits). Stop restores the previous camera goal.
- While a journey is shown, hide ambient agents (`view.agents.group.visible = false`), restore on close.
- Showcase must still force overlays off (existing `startShowcase` behaviour).

### 4.6 Gates for Phase 1
- `sim-check`: for every journey of the balanced and neglect presets, Σ `legs[].frictionAdded` ===
  `friction`; every non-null `path.length - 1 === steps`; `journeyDetail` for an inactive journey returns
  `active:false`.
- `input-check` (all 3 viewports): open Journeys, switch tabs, pick each journey, assert exactly one
  route mesh visible, badge count == resolved stop count, leg chip text equals engine steps, Play
  advances "Step 1 → Step 2", close restores agents; **canvas still topmost** and drag-orbit still works
  with the panel open.
- `visual-check`: add frames `review/40-journey-arrival.png`, `41-journey-goods.png`,
  `42-journey-gap-neglect.png`; assert route pixels present and that only one route colour is present.
- **STOP. Report screenshots + gate output to Clement. Wait for approval before Phase 2.**

---------------------------------------------------------------------------------------------
## 5. Phase 2 — Building customisation (affects score)

### 5.1 Catalogue (approved — use these exact labels)
```js
export const SIZES = [
  { id: 'S', label: 'Compact',  delta: -1 },
  { id: 'M', label: 'Standard', delta: 0 },
  { id: 'L', label: 'Extended', delta: 1 },
];
export const STOREY_DELTA = { min: -2, max: 3 };       // relative to the function's default
export const ADDONS = [
  { id: 'terrace', label: 'Rooftop Terrace', cost: 18, massing: ['rooms','public'],   metric: 'fan',    delta: 2 },
  { id: 'green',   label: 'Green Roof',      cost: 10, massing: 'any-but-pool',        metric: 'brand',  delta: 2 },
  { id: 'solar',   label: 'Solar Array',     cost: 16, cats: ['B','P'],                metric: 'profit', delta: 2, halvesUtility: true },
  { id: 'canopy',  label: 'Entrance Canopy', cost: 8,  fnIds: ['front','spa','fnb','fnb2'], metric: 'fan', delta: 2 },
  { id: 'seating', label: 'Outdoor Seating', cost: 12, fnIds: ['fnb','fnb2'],           covers: 20 },
];
export const ADDON_SCORE_CAP = 2;   // an add-on's score delta counts on at most 2 buildings
```
(Encode eligibility however is cleanest; the meaning above is fixed. "public blocks" = massing
`public` = Front Office, Restaurant & Bar, Speciality Restaurant.)

### 5.2 Engine (pure, all deterministic)
- `footprintOf(p)` = base w/h with the LONG side changed by `SIZES[p.size].delta`, then rotated by
  `p.rot`. Size controls only offered when the long side ≥ 2 (S never yields 0).
- `areaFactor = area(size) / area(M)`; `storeyFactor = (fn.storeys + storeyDelta) / fn.storeys`
  (style-independent so the score never depends on style); storeys only for massing `rooms` and
  `public`, with `fn.storeys + storeyDelta ≥ 1`.
- Capacity: `keys/covers/seats × areaFactor × storeyFactor` (+20 covers per Outdoor Seating).
  e.g. Rooms Compact 3×3 = 45 keys, Standard 60, Extended 5×3 = 75.
- Cost of a placement = `round(fn.cost × areaFactor × storeyFactor) + Σ addon costs`.
- `customise(s, uid, { size?, storeyDelta?, variant?, addonsToggle? })`: validates footprint with
  `placementBlocker(..., excludeUid)` against the new size (anchor stays at col,row), charges the
  positive cost difference (reject with "Needs N credits; M left" if short), refunds 70% of a negative
  difference (same rule as `removePlacement`), returns `{ ok, reason?, delta }`. `removePlacement`
  refunds 70% of the placement's FULL current cost.
- `placementBlocker`, `rotatePlacement`, `movePlacement`, `cellsOf`, `capacityOf` must all use the
  placement's real footprint/capacity, not the catalogue default.
- Scoring additions (ledger codes):
  - `addon:<id>` — per add-on type, `delta × min(count, ADDON_SCORE_CAP)` on its metric.
  - Solar Array: in the `utility` event branch (`scalesWithFootprint` — read it), count each solar
    building's footprint at 50%.
  - `height:heritage` — brand −4 if any rooms/public placement with `fn.storeys + storeyDelta ≥ 8` is
    within gap ≤ 2 of the heritage pavilion (`gapBetween` with `HERITAGE_RECT`).
  - Operating cost: add `+0.3 × Σ max(0, storeyDelta)` inside the existing `opCost` expression (0 when
    no storeys added ⇒ baseline unchanged).
- `variant` is visual only (no score effect).

### 5.3 Team identity
- Lobby: add **Monogram** field (1–3 chars, defaults to the team name's initials, uppercased).
- 3D: banner at the arrival court showing monogram + team name (canvas texture, MO Exceptional —
  `await document.fonts.load('48px "MO Exceptional"')` before drawing, redraw on name change); hotel
  name as signage on the Front Office facade (canvas texture plane on the +Z front). No logo, no fan
  emblem.
- Showcase plate already shows team + hotel; add the monogram.

### 5.4 Rendering (`massing.js`, `view.js`)
- `buildMassing(placement, style, kit)`: effective style = `placement.variant || style`; effective
  storeys = `clamp(storeysFor(fn, effStyle) + storeyDelta, 1, 12)`; dimensions from the real footprint.
- Add-on geometry, reusing kit materials, merged/instanced to stay cheap:
  terrace = deck + planters + 2–3 parasols on the roof; green = flat planted roof deck (forces a flat
  roof on that building even in heritage style); solar = tilted panel rows (`kit.glass`/`kit.roofDark`
  frames); canopy = cantilevered slab with accent fascia over the +Z entrance; seating = tables + parasols
  on the ground in front of the +Z face.
- Ghost/selection/move must use the placement's real footprint (`setGhost` and `moveGhost` currently
  read catalogue `f.w/f.h` — fix both).
- Keep total draw calls within the existing visual-check limit for a full sandbox build with every
  add-on; report the number.

### 5.5 UI
- The selection panel gains a **Customise** section: Size segmented control (Compact / Standard /
  Extended with credit delta and capacity delta), Storeys − / + (shows resulting storeys, keys/covers,
  credit delta), Style variant chips (the 3 STYLES), Add-on toggles (label, cost, effect line built
  from catalogue data). Disabled controls carry a `title` explaining why (budget, blocked, not eligible).
- Fix the tray overflow at 1280 px (last cards cut off): wrap the tray to two rows ≥1024 px or add
  visible scroll affordance; must not overlap the Run button or selection panel.

### 5.6 Gates
- `sim-check`: regression lock still exact; Rooms keys 45/60/75 across sizes; storey +1 on Rooms =
  70 keys and cost 140; resize blocked by neighbour is rejected with no spend; downsizing refunds 70%
  of the difference; add-on cap (3 terraces ⇒ +4 fan, not +6); solar halves the utility hit;
  height:heritage fires and clears; ledger reconciliation passes with customised layouts;
  **exploit check**: revenue preset + `s.released += 2000` (test only) + every eligible add-on on every
  building + max storeys where legal ⇒ composite still < balanced preset composite.
- `input-check`: select a building, change size, storeys, add an add-on, assert spend and a visible mesh
  change; monogram appears on the banner.
- `visual-check`: `review/50-addons-closeup.png`, `51-sizes.png`, `52-banner.png`; each add-on changes
  the pixels of its building region measurably.
- **STOP for approval.**

---------------------------------------------------------------------------------------------
## 6. Phase 3 — Site expansion (affects score)

### 6.1 Catalogue (approved)
```js
export const PLOTS = [
  { id: 'west',      label: 'West Plot',       col: -4, row: 0,  w: 4, h: 9, cost: 60, upkeep: 2 },
  { id: 'northeast', label: 'North-East Plot', col: 7,  row: -3, w: 5, h: 3, cost: 30, upkeep: 1 },
  { id: 'riverside', label: 'Riverside Deck',  col: 12, row: 2,  w: 2, h: 5, cost: 40, upkeep: 0,
    only: ['fnb', 'fnb2', 'pool', 'spa'] },
];
```
Coordinates extend the existing grid, so the arrival court, service yard, heritage pavilion and every
existing placement keep their cells. North-East sits east of the service drive (cols 4–6); Riverside
Deck sits on the river frontage and automatically counts as view edge (`viewEdgeCol` 11).

### 6.2 Engine
- `buyPlot(s, id)`: one-off cost from available budget (`s.spent += cost`), push to `s.plots`;
  purchases are final. `isOwned` = base rect ∪ owned plots.
- `placementBlocker`: every cell must be owned; on Riverside Deck only `only[]` functions
  (reject with the §9 string).
- BFS walks may route through owned plots (longer walks are a natural cost).
- Ledger: `land:<id>` profit −upkeep per owned plot each round (0 upkeep ⇒ no entry).
- Presets/`findSpot` unchanged (base rect only).

### 6.3 Rendering
- Owned plots: plinth + gold edge line matching the main plinth, grid extended over them.
  Riverside Deck rendered as a timber/paving deck at plot level over the lawn strip.
- **Expand site** tool button: shows unowned plots as dashed outlines with HTML price/upkeep labels
  (projected, pointer-events rule 6). Tap a plot → small confirm panel (label, cost, upkeep, Buy / Cancel).
- Make bounds dynamic everywhere `W`/`D`/`SITE.cols`/`SITE.rows` are assumed: `view.js` `groundCell`
  (allow negative/extended cells when owned or when tapping a for-sale plot), `fit()` (frame the owned
  bbox; centre target on it), `LIMITS.radius` max, shadow camera extents (fit owned bbox + pad, call
  `updateProjectionMatrix`), grid rebuild, `agents.js` W/D usage (read and adapt), `site.js` plinth.
- Re-bake shadows after purchase (`renderer.shadowMap.needsUpdate = true`).

### 6.4 Gates
- `sim-check`: regression lock exact with no plots; buying deducts cost; upkeep ledger entry per round;
  placement on an unowned cell rejected, on owned plot accepted; Riverside Deck rejects rooms, accepts
  pool; Riverside placement counts toward `viewEdgeHits`; exploit check from 5.6 extended with all plots
  still < balanced.
- `input-check`: Expand site → tap West Plot → Buy → place a Rooms Wing on it → camera fit includes it;
  canvas topmost throughout.
- `visual-check`: `review/60-expand-mode.png`, `61-west-plot-built.png`; plot-span % reported for the
  expanded fit (must stay ≥ 70%).
- **STOP for approval.**

---------------------------------------------------------------------------------------------
## 7. Docs
Update `README.md` (features, architecture table, gate table, check counts, byte numbers, known
limitations). Keep the honest-limitations tone.

---------------------------------------------------------------------------------------------
## 8. Gates (run all, in this order, after every phase)
```
node tools/check-syntax.mjs
node tools/sim-check.mjs
node tools/brand-gate.mjs
node tools/bytes.mjs
node tools/qr-check.mjs
node tools/smoke.mjs
node tools/visual-check.mjs
node tools/input-check.mjs
node tools/class-check.mjs
```
(= `npm run verify`). Add `tools/make-baseline.mjs` to nothing — it is run once, by hand.
**Byte budget (raised again for the classroom layer, already applied):** `tools/bytes.mjs`
now carries `BUDGET_GZ = 296 * 1024` and `BUDGET_RAW = 1120 * 1024`, and the walk covers
all of `js/` rather than `js/sim` + `js/render`, so the classroom modules cannot escape the
budget. After Phases 2 and 3, the classroom layer and the Phase 3 roof-deck fixes, the tree
measures **289.4 KB gzip / 1101.5 KB raw** (of a 296 / 1120 budget — 6.6 KB gzip and
18.5 KB raw left). Report the
numbers after every phase; if a phase overshoots, say so and propose a trim rather than
silently raising again.
`sim-check` is now **110 checks**, including the regression lock.
Then open and LOOK at every new `review/*.png`; describe defects honestly — no reassurance.

---------------------------------------------------------------------------------------------
## 9. New strings (approved labels + drafted notes; put ALL in catalogue.js)
- Groups: `Guest Journey`, `Operations`
- JOURNEY_UI: `Play`, `Stop`, `Step {k} of {n}`, `{n} steps`, `No walkable route`,
  `No home on site`, `Optional`, `Not scored until round {n}`, `Lands on {scorecard label}`
- Sizes: `Compact`, `Standard`, `Extended`
- Add-ons: `Rooftop Terrace`, `Green Roof`, `Solar Array`, `Entrance Canopy`, `Outdoor Seating`
- Add-on ledger notes: `{label} on {n} building(s)`
- Height note: `A tall wing overshadows the heritage pavilion`
- Plots: `West Plot`, `North-East Plot`, `Riverside Deck`; tool `Expand site`; `Buy`, `Cancel`
- Upkeep note: `{label}: upkeep on the extra land`
- Deck rule: `The Riverside Deck takes restaurants, the pool and the spa only`
- Lobby field: `Monogram`
Reuse existing strings wherever one already fits.

---------------------------------------------------------------------------------------------
## 10. Report format at each STOP
1. Files changed (paths) and a one-line purpose each.
2. Full gate output summary (pass counts, bytes, draw calls, plot span).
3. List of new screenshots with your own defect critique.
4. Anything you could not do or had to assume — stated plainly.
