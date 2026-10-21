# PHASED OPENING PLAN — Hotel Builders as a hotel-opening journey

Execution brief for the phased round structure. **Read `docs/DEEPSEEK-BRIEF.md` §1–2
(project facts, non-negotiable rules) and `docs/MANPOWER-BRIEF.md` (the manpower layer,
M1 built) before touching anything.** Those rules all apply here; this document adds the
phasing layer on top.

> **STATUS — approved design, nothing built.** Phase A (= manpower M2), Phase B and
> Phase C are strictly ordered with a **STOP for approval** after each.

## 1. What we are building and why

Today the demo is free play: all four rounds are the same build-and-run loop. Clement
approved (2026-10-21) re-framing the four rounds as the phases of a real hotel opening,
with the workforce timeline he specified:

- **T-12 months** — the GM and ExCO (P&C, Finance, Engineering, Commercial Directors,
  Hotel Manager) join the property.
- **T-6 → T-3 months** — frontline hiring ramps up.
- **Opening day** — every colleague is trained and ready.
- **Year one** — basic revenue management, seasonal adjustment, events planning.

The delivery vehicle is the **demo first** (a guided single-player run), so the concept
can be shown before the multiplayer classroom launches. The classroom uses the same
phase rules when it ships.

### The approved round map

| Round | Phase | Timeline chip | Teams may | The run reports |
|---|---|---|---|---|
| 1 | **Design & Build** | `T-24 → T-12` | Buy land, place functions, customise. Manpower panel locked. | **Construction Report** — fit, budget discipline, demand forecast. No revenue, no composite. |
| 2 | **Pre-opening** | `T-12 → T-3` | Customise + add-ons only (no new buildings). **Manpower panel unlocks** (the T-6→T-3 hiring ramp). ExCO payroll line appears. | **Soft Opening** — run at **60% demand**. Colleague block goes live. |
| 3 | **Grand Opening** | `Opening day` | As R2. Roster events may now bite. | **Grand Opening** — full demand, full P&L. |
| 4 | **Year One — Trading** | `Year one` | As R3, plus the **rate posture** selector. | **Year One Review** — seasonality forecast shown in advance; composite as today. |

**Training rule with teeth:** a training tier first set in R1–R2 (pre-opening) gives its
full uplift; first set in R3 or later gives **half** — "everyone trained and ready by
opening day" is a mechanic, not a slogan.

**Pricing (R4, deliberately basic):** one three-way posture per team —

| posture | arrivals | revenue rate |
|---|---|---|
| Value | ×1.15 | ×0.90 |
| Balanced | ×1.00 | ×1.00 |
| Premium | ×0.85 | ×1.15 |

Arrivals feed straight back into `manpowerRequirement`, so a pricing decision is also a
staffing decision — that coupling is the R4 lesson. Seasonal adjustment and events
planning are taught by **showing the round's demand forecast in the build screen**
(arrivals and banquet covers), not by new mechanics.

## 2. Decisions locked by Clement (2026-10-21)

1. R1 produces a construction report, **not** a comparable composite. The leaderboard
   starts at R2.
2. Soft-opening demand is **60%**.
3. Phasing applies to the **guided demo and classroom sessions**. Presets and the
   sandbox stay unphased free play.
4. New buildings are locked after R1; **customise (size/storeys) and add-ons stay
   available every round** — that is the escape hatch for a team that under-built.
5. The R4 second-plot purchase idea is **cut** (scope guard: do not overcomplicate).
   Plot buying stays an R1 decision.
6. ExCO payroll is a **display-only** illustrative line from R2 onward. It never moves
   a score.

## 3. Non-negotiables (in addition to DEEPSEEK-BRIEF §2)

- **The regression lock must not move.** Every new engine input is optional and
  defaults to today's exact behaviour: `s.demandFactor ?? 1`, pricing `undefined`/
  `balanced` = multipliers 1.0, `s.trainingSetRound` absent = full uplift (this is
  also what keeps the M1 sim-check fixtures valid). `tools/baseline.json` is never
  regenerated. `ROUNDS` in `catalogue.js` is **not edited** — phase titles and chips
  are a new overlay, not a rename.

## 4. Catalogue additions (`js/sim/catalogue.js`)

Add after `MANPOWER_EVENTS`. All player-facing strings live here and nowhere else.

```js
export const ROUND_PHASES = [
  { n: 1, id: 'build',   title: 'Design & Build',      chip: 'T-24 → T-12',
    caps: { build: true,  manpower: false, pricing: false }, demandFactor: 1,
    reportTitle: 'Construction Report', runLabel: 'Complete construction' },
  { n: 2, id: 'preopen', title: 'Pre-opening',         chip: 'T-12 → T-3',
    caps: { build: false, manpower: true,  pricing: false }, demandFactor: 0.6,
    reportTitle: 'Soft Opening',        runLabel: 'Run the soft opening' },
  { n: 3, id: 'opening', title: 'Grand Opening',       chip: 'Opening day',
    caps: { build: false, manpower: true,  pricing: false }, demandFactor: 1,
    reportTitle: 'Grand Opening',       runLabel: 'Open the hotel' },
  { n: 4, id: 'trading', title: 'Year One — Trading',  chip: 'Year one',
    caps: { build: false, manpower: true,  pricing: true  }, demandFactor: 1,
    reportTitle: 'Year One Review',     runLabel: 'Run year one' },
];

export const PRICING_POSTURES = [
  { id: 'value',    label: 'Value',    arrivalsMul: 1.15, rateMul: 0.9,
    note: 'Sharper rates fill the hotel; each room earns less.' },
  { id: 'balanced', label: 'Balanced', arrivalsMul: 1,    rateMul: 1,
    note: 'Hold rate and occupancy together.' },
  { id: 'premium',  label: 'Premium',  arrivalsMul: 0.85, rateMul: 1.15,
    note: 'Rate-led: fewer arrivals, higher yield per guest.' },
];

export const PHASE_UI = {
  bannerPreopen: 'Your GM and ExCO have joined — T-12. Frontline hiring ramps up now.',
  panelLocked: 'Pre-opening starts in Round 2 — hiring begins at T-6.',
  buildLocked: 'Construction is complete — adjust sizes, storeys and add-ons now.',
  pricingTitle: 'Rate posture',
  forecast: 'Forecast: {arrivals} arrivals · {covers} banquet covers this season',
  excoLine: 'Leadership team (GM & ExCO)',
  constructionFit: '{hits} working adjacencies · {missing} required functions missing',
  constructionForecast: 'At opening this hotel needs about {heads} frontline colleagues.',
};

// Display-only illustrative payroll for the leadership team from Round 2.
// 6 roles × HK$120k/month × 3 months. Never enters scoring.
export const EXCO_PAYROLL = { roles: 6, payPerMonth: 120000, months: 3 };
```

## 5. Engine additions (`js/sim/engine.js`)

All additive; no existing line changes its default behaviour.

1. **`arrivalsFor(s, round)`** — single helper, the only place arrivals are computed:
   `Math.round(r.arrivals * (s.demandFactor ?? 1) * postureArrivalsMul)`. Pricing mul
   comes from `PRICING_POSTURES.find(p => p.id === s.pricing)` (absent/`balanced` → 1).
   **Rewire the three existing readers to it**: `manpowerDemand` (currently
   `r.arrivals` at ~L720–727), `evaluateLayout` (`demandRooms`/`demandCovers` at
   ~L874–875 and `workload` at ~L974). With defaults this is a pure refactor — assert
   it with the regression lock.
2. **Rate multiplier** — in `evaluateLayout`, scale `roomRev`/`fnbRev`/`eventRev`
   (~L914–916) by the posture `rateMul` (default 1). New ledger code
   `pricing:{posture}` only when a non-balanced posture is set, with the catalogue note.
3. **Training timing** — in `manpowerPlan`, uplift is `tier.uplift` when
   `s.trainingSetRound` is absent or `<= 2`, and `tier.uplift / 2` when `>= 3`.
   `trainingSetRound` is written by the UI when the selector changes, never by
   `preview()`. Ledger note unchanged.
4. **`constructionReport(s)`** — new pure function for phased R1. Returns
   `{ missing, adjacencyHits, creditsLeft, forecastArrivals, forecastHeads }` from
   `missingRequired`, `adjacencyHits`, `availableBudget`, `arrivalsFor(s, 2)` and
   `manpowerRequirement(s, 2)`. No events, no metrics, no composite.
5. **`runConstruction(s)`** — the mutating round-runner for phased R1 (sibling of
   `runRound`, which stays untouched): builds the report, pushes
   `{ round: 1, roundName: phase.reportTitle, construction: true, ...report }` to
   `s.history`, draws **no** events, never touches `shortStreak` or `usedEvents`.
6. **`demandForecast(s)`** — pure: `{ arrivals: arrivalsFor(s, s.round), eventDemand }`
   for the current round (eventDemand rule unchanged: 0 / 60 / 120 by round).
7. **Session fields** (all optional, set by the UI layer): `mode`
   (`'guided' | 'classroom'`, absent = free play), `demandFactor` (number, set from
   `ROUND_PHASES` when each round starts), `pricing` (posture id),
   `trainingSetRound` (round number). No new required fields in `createSession` —
   autosave/resume carries them automatically.

- Sim purity as before: `js/sim/` stays free of DOM/three/network/`Date.now()`/
  `Math.random()`; `preview()` never mutates.
- Every new on-screen string goes in `catalogue.js` first, verbatim.
- Byte budget stands at 1180 KB raw / 310 KB gzip; M1 measured 1114.0 / 293.2, so the
  headroom is ~16 KB gzip. This whole plan must fit inside it (estimate: 4–6 KB gzip).
  Report bytes after every phase; if a phase overshoots, stop and say so.

## 6. Phase A — Manpower panel (manpower M2, restated from MANPOWER-BRIEF §5)

Build-screen panel, rendered in every mode (free play sees it from R1; phased modes
gate it per `caps.manpower` — the lock state shows `PHASE_UI.panelLocked`):

- Per-cluster stepper 0 → 2× requirement, required-vs-planned bar, per-cluster and
  total illustrative payroll, training selector. Strings from `MANPOWER_UI` /
  `MANPOWER_NOTE` only.
- From R2 in phased modes, an ExCO line (`PHASE_UI.excoLine`, `EXCO_PAYROLL`) is added
  to the displayed payroll total, clearly inside the "illustrative" block.
- **The panel writes only touched clusters into `s.staffing`** and writes
  `trainingSetRound` when the tier changes. Writing requirement values would freeze
  headcounts and kill the seasonality lesson.
- Reveal card gains the roster summary from `result.layout.manpower`.
- Gates: `input-check` stepper coverage at phone and tablet sizes; one new
  `visual-check` frame. **STOP for approval.**

### 6.1 What Phase A actually delivered (2026-10-21)

Panel, catalogue strings, per-cluster steppers with the required-vs-planned bar, per-cluster
and total illustrative payroll, the training selector, `syncPanels()` sharing the right
column with Customise, and the `session.staffing` / `trainingSetRound` writes are in and
gated. The new coverage found five defects that no earlier gate could see — the first of
which made the shipped build unusable on a 1280x800 laptop:

1. **The Customise panel's own controls were under the tray.** A vertically centred panel
   put its bottom 59px below the tray's top edge at both 1280x800 and 1440x900 (measured:
   panel 595 vs tray 536; 695 vs 636; 848 vs 846 at 1920x1080). `Done` could not be
   tapped. Both right-hand panels are now anchored between the HUD and the tray
   (`top: 170px; bottom: 280px`) and scroll inside themselves.
2. **The roster reopened at its previous scroll offset**, so it showed a half row with
   its header scrolled out and read as a broken panel. It now resets to the top each time
   it is shown.
3. **The roster's last row was sliced at the panel edge with no scrollbar on screen**
   (`overflow-y: auto` hides it until scrolled). The panel now marks itself while it
   overflows and fades the cut row into the paper — the same rule the tray already uses
   sideways.
4. **The wrapped tray cut its third row at a card boundary** (People & Culture Office,
   Colleague Lockers) inside the 170px cap, again with no visible scrollbar. Same fix:
   `can-scroll-down` fades the trailing edge while there is more.
5. **A zero-requirement cluster offered an enabled `+`** that could only ever be a no-op
   (the handler clamps to `need × maxMul`) — Events showed "Required 0 / Planned 0 · No
   requirement this season" beside a live button. It is now disabled. Training chips were
   also ragged (the third grew to full width); they are a 3-up grid. On touch devices the
   stepper grows to 40px, since 30px is a mouse target, not a thumb target.
6. **On a phone the roster had no way out.** At 390×844 the sheet spans the screen and
   covered the very tool button that opened it, so the roster could be opened and never
   closed. Below 700px the panel now spans the screen with clean edges (no half-drawn tool
   buttons showing beside it), ends above the tool column, and carries its own `×` with an
   `aria-label`; the gate asserts a way out is always hittable — 2 exits on phone, 1 on
   tablet.
7. **The gate itself needed a longer timeout.** A 1920×1080 full-frame screenshot is
   rasterised on the CPU and exceeded Playwright's 30 s default on a loaded machine, which
   killed the run as a `TimeoutError` rather than reporting anything about the app;
   `input-check` now allows 60 s per action.
8. **The Manpower plan tool could not be toggled while a building was selected** (reported
   from demo mode, reproduced headlessly). Customise and the roster share the right-hand
   column, and `syncPanels()` hid the roster whenever Customise was open — so the tool
   flipped a stored flag, the button kept claiming `aria-pressed="true"` with no roster on
   screen, and two clicks changed nothing visible. The roster was unreachable until the user
   found `Done`. Now: `aria-pressed` describes what is on screen, and clicking the tool with
   Customise open hands the column over (deselect as `Done` does, then open the roster).
   `input-check` asserts the handover, the pressed state, and that the tool toggles off
   again — three checks per desktop viewport.

Gate evidence: `input-check` green at 1280x800, 1440x900, 1920x1080, plus phone 390x844
(panel 320px wide, ends 544, tray starts 666, stepper hit and wrote 2 → 3) and tablet
1024x768 (ends 468, tray starts 604, same write); `visual-check` frame
`62-manpower-panel.png` plus `31-manpower-*.png` / `32-manpower-*.png`.


## 7. Phase B — engine phasing + sim-check coverage

Engine work per §5 (no UI yet). New `sim-check` checks, all deterministic:

1. **Refactor neutrality:** `arrivalsFor` rewiring with defaults leaves the regression
   lock bit-identical (the existing lock check passing is the proof).
2. `demandFactor: 0.6` scales arrivals to 84 in R2 and is deterministic across runs.
3. `pricing: 'balanced'` is bit-identical to no pricing; `value` raises arrivals and
   the manpower requirement while cutting room revenue per unit; `premium` inverts it.
4. **Pricing→manpower coupling:** a `value` posture that pushes arrivals past a ratio
   boundary raises `manpowerRequirement` by a head.
5. Training timing: `trainingSetRound` absent = full uplift; `2` = full; `3` = half
   (assert `effective` heads, not just the multiplier).
6. `constructionReport` purity (no mutation, no events) and `runConstruction` history
   shape; `shortStreak` and `usedEvents` untouched by it.
7. Scripted guided 4-round session (construction → soft opening → opening → trading
   with `premium`) is deterministic end to end.

Expected check count: 136 → ~146. **STOP for approval.**

## 8. Phase C — guided demo, classroom wiring, remaining gates

`js/main.js`, `index.html`, `css/app.css`:

- **Mode assignment:** lobby "Start demo" sets `session.mode = 'guided'`; the room
  join path sets `'classroom'`; presets and the sandbox leave `mode` unset (free play,
  exactly today's behaviour — this is what keeps `input-check`'s existing demo flows
  valid).
- **Phase banner** on the build screen: `chip` + `title` from `ROUND_PHASES`; at the
  R2 transition show `PHASE_UI.bannerPreopen` once (the T-12 ExCO beat).
- **Capability gating** from `caps`: `build: false` disables the function tray's
  new-placement cards (tooltip/toast `PHASE_UI.buildLocked`); customise, add-ons and
  remove stay live. Manpower panel per Phase A. Pricing selector
  (`PHASE_UI.pricingTitle`, the three posture labels + notes) renders only when
  `caps.pricing`.
- **Round start:** when a round begins, set `s.demandFactor` from the phase and show
  the `PHASE_UI.forecast` line from `demandForecast(s)` (R2 onward; R4 always).
- **Run flow:** phased R1 calls `runConstruction` and renders the construction report
  card (`constructionFit`, `constructionForecast`, credits left) instead of the
  scorecard; R2–R4 call `runRound` with `renderResult`'s eyebrow using
  `reportTitle` + `chip`, and `#btnRun` using `runLabel`.
- **Reveal:** the round-by-round block renders the R1 construction entry as
  fit/credits (no metric numbers), R2–R4 as today. Score code unchanged (it encodes
  final metrics; board untouched).
- **Classroom:** same `ROUND_PHASES` drive room sessions — no separate rule set.

Gates to extend:

- `class-check`: R1 tray live → R2 new-building cards locked but customise live →
  panel visible from R2 → pricing selector only in R4 → autosave/resume round-trips
  `mode`, `demandFactor`, `pricing`, `trainingSetRound` → construction report renders
  at R1. (Existing assertions keep passing: classroom builds happen in R1.)
- `input-check`: a guided-mode pass — banner text, panel lock in R1, stepper in R2,
  pricing selector at phone portrait in R4.
- `visual-check`: two frames — R1 phase banner, R4 trading screen with selector +
  forecast. Open and critique every new PNG honestly.
- `docs/PILOT-RUNSHEET.md`: rewrite the round beats per phase (briefing line, what to
  watch, one debrief question per phase). Uneven clocks: suggest 8 / 12 / 12 / 12 min.

**STOP for approval — then the concept demo is ready to show.**

## 9. Gates after every phase

`npm run verify` (= check-syntax, sim-check, brand-gate, bytes, qr-check, smoke,
visual-check, input-check, class-check), then report per DEEPSEEK-BRIEF §10: files
changed, gate summary with byte numbers, new screenshots with honest defect critique,
and anything assumed. Known machine quirk: run the browser gates as detached
processes with output redirected to `%TEMP%` logs and poll the logs — a wedged
headless Chrome can stall an attached terminal.

## 10. Assumptions and rejected options (do not relitigate without Clement)

- Half-uplift for late training stays (proposed, not objected to). If it plays too
  harsh in the pilot, the single dial is the `/ 2` in `manpowerPlan`.
- Sandbox and presets stay unphased free play.
- R4 second-plot purchase cut for scope.
- Multiplayer launch is **out of scope** here; Phase C only makes the classroom
  consume the same phase rules.

