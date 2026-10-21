# MANPOWER BRIEF — workforce planning in Hotel Builders

Design lock for the manpower layer. **M1 (engine + catalogue + gates) is built; M2 (panel)
and M3 (classroom) are not.** Do not re-derive these numbers from memory or from the
README: this file is the source, and every constant below lives in `js/sim/catalogue.js`.

## 1. Why this exists

The simulation already contained labour economics without ever showing them: 45 keys per
room attendant, 22 covers per cover staff, and an under-capacity rooms wing that loses
revenue as if understaffed. The ask was to make that a **decision** New Joiners take —
staffing for key functions, so workforce planning is practised rather than assumed.

The brief therefore was *not* to bolt on a separate HR mini-game. It was to expose the
model that was already scoring the hotel.

## 2. Decisions taken by Clement (2026-10-20)

| # | Decision | Consequence |
|---|---|---|
| 1 | Four clusters as proposed | Rooms Division, Food & Beverage, Events, Front Office. No Engineering/Security rostering. |
| 2 | **Money for payroll** | Payroll shown in illustrative HK$ per season, labelled on screen; converted to points at a published rate. Revenue stays points. |
| 3 | **Raise the byte budget** | `tools/bytes.mjs` now 1180 KB raw / 310 KB gzip (was 1120 / 296). |
| 4 | **Inside the build clock** | The roster is decided in the round's build minutes, not in a separate step. |
| 5 | **Panel visible by default** | Solo play sees it too; untouched clusters are rostered at requirement. |

## 3. The model

### Requirements

Demand is measured against what was actually built, so nobody rosters for rooms they
cannot fill (`manpowerDemand`, `js/sim/engine.js`):

| cluster | basis | ratio |
|---|---|---|
| Rooms Division | `min(keys, arrivals / 1.8)` | 45 keys per attendant |
| Food & Beverage | `min(covers, arrivals × 0.75)` | 22 covers per colleague |
| Events | `min(seats, eventDemand)` where eventDemand = 0 / 60 / 120 by round | 40 seats per colleague |
| Front Office | `arrivals` | 60 guests per colleague |

`manpowerRequirement(s, round)` returns whole heads per cluster. It is a pure function of
the layout and the round table — the same demand arithmetic the capacity checks use, so the
roster and the scorecard cannot disagree about how busy the hotel is.

### The plan

`s.staffing` holds **only the clusters a team has touched**. An absent cluster is planned
at its requirement. `manpowerPlan(s, round)` returns each cluster's need, planned heads,
effective heads, service ratio, shortfall and excess, plus `shortFrac`, `plannedTotal`,
`payroll` and the training tier.

Training tiers (`None / Foundation / Advanced`) give +0 / +10 / +20 % effective capacity per
head, +0 / +2 / +4 Colleague Engagement, and cost 0 / 1 / 2 profitability points
(illustrative HK$0 / 30k / 60k per season).

### Scoring — deviation only

**Rostering exactly at requirement is score-neutral, and that is the linchpin.** It is what
keeps `tools/baseline.json` valid without regenerating it, and it is asserted directly in
`sim-check`.

| deviation | effect |
|---|---|
| understaffed cluster | revenue from that cluster scaled by `ratio` (floor 0.4); Fan Score −`shortFrac × 18`; engagement −`shortFrac × 20` |
| overstaffed cluster | −2 profitability points per excess head, and no fan or engagement gain |
| training | +2 / +4 engagement, −1 / −2 profit, and the same heads go further |
| chronic | a shortfall in two consecutive rounds adds −4 engagement (`manpower:chronic`); `s.shortStreak` is updated by `runRound`, never by `preview` |

Every effect is a cause-coded ledger line (`manpower:short:rooms`, `manpower:over:fnb`,
`manpower:training`, `manpower:chronic`), so the reveal card keeps its audit trail.

### Money

`payPerFteMonth = 18,000`, `months = 3` per season, `pointInHkd = 30,000`. Payroll is
displayed; scoring uses the point conversion above. The figures are **illustrative** and
the UI must say so. If Finance ever supplies sanitised numbers, they replace the constants
and nothing else.

### Events

Three roster events live in `MANPOWER_EVENTS`, deliberately **outside** `EVENTS`: inserting
them into the main deck would re-shuffle every existing session's draw and break the
regression lock.

- **Resignation wave** — bites only where `shortFrac > 0.05`, scaled by the shortfall.
- **Peak banquet season** — needs the Events cluster at ≥ 1.5× requirement to win.
- **Pay review** — costs `plannedTotal × 0.4` points, minimum 2.

They enter a session's pool only when `manpowerEngaged(s)` is true (any cluster touched or
any training tier bought), replacing the last drawn event with 50 % probability in a
dedicated seeded stream.

## 4. Strings (verbatim lock — all in `catalogue.js`)

`MANPOWER_UI`: `Manpower plan`, `Required`, `Planned`, `Illustrative payroll`,
`Total payroll`, `per season`, `Training`, `Illustrative figures`.
Cluster labels: `Rooms Division`, `Food & Beverage`, `Events`, `Front Office`.
Tiers: `None`, `Foundation`, `Advanced`.
Notes: `{cluster}: {planned} of {need} planned — service suffered`,
`{cluster}: {excess} over requirement — idle payroll`,
`Chronic understaffing: colleagues are leaving`, `Training: {tier}`,
`The roster was too thin to hold the team together`.
Events: `Resignation wave`, `Peak banquet season`, `Pay review` with their one-line details.

## 5. Status

The phased round structure (R1 construction → R2 pre-opening → R3 opening → R4 trading,
guided demo first) is specced in `docs/PHASED-OPENING-PLAN.md`; its Phase A is M2 here,
and it adds the ExCO payroll line, training-timing rule and R4 rate posture on top of
this layer.

### M1 — engine + catalogue + gates: BUILT

- `js/sim/catalogue.js`: `MANPOWER`, `MANPOWER_UI`, `MANPOWER_NOTE`, `MANPOWER_EVENTS`.
- `js/sim/engine.js`: `manpowerRequirement`, `manpowerPlan`, `manpowerEngaged`; scoring in
  `evaluateLayout`; `manpower` on the layout result; `shortStreak` in `runRound`; roster
  event draw in `drawEvents`; `resolveEvent` roster branches.
- `tools/sim-check.mjs`: **136 checks** (was 110). Includes the neutrality proof, the
  under/over/training/chronic effects, the event-gating proof, the double-roster exploit
  check and a determinism check.
- `tools/bytes.mjs`: budgets raised to 1180 KB / 310 KB.
- Measured after M1: **1114.0 KB raw / 293.2 KB gzip**; regression lock unchanged.

### M2 — panel + reveal: NOT BUILT

Build-screen Manpower panel: per-cluster stepper (0 → 2× requirement), required-versus-
planned bar, per-cluster and total illustrative payroll, training selector. Reveal card adds
a roster summary from `result.layout.manpower`. `input-check` gains stepper coverage at
phone and tablet sizes; one new `visual-check` frame. The panel must write only touched
clusters into `s.staffing` — writing requirement values would freeze headcounts across
rounds and destroy the seasonality lesson.

### M3 — classroom: NOT BUILT

Run-sheet briefing (2 minutes) and debrief questions; `class-check` additions for autosave,
resume and room-seeded roster events. Board and score codes need **no change**: they encode
final metrics, which the roster only influences upstream.

## 6. Constraints to respect

- Sim purity: nothing in `js/sim/` may touch DOM, three, network, `Date.now()`,
  `Math.random()`. `preview()` must stay free of mutation — chronic state moves only in
  `runRound`.
- Never regenerate `tools/baseline.json`. If a change would move the baseline, it is a
  balance decision for Clement, not a test fix-up.
- Every new on-screen string goes in `catalogue.js` first.
- Report bytes after each phase; if a phase overshoots, say so rather than raising again
  silently.
