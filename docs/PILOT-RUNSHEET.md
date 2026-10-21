# Classroom pilot — run sheet

**What this pilot is for:** proving that a room of New Joiners can build a hotel on a
phone or a tablet, understand *why* their layout scored what it scored, and finish inside
one session — with no server, no accounts and no IT ticket.

**What it deliberately does not test:** the revenue model (deferred by decision), live
multi-team sync (Phase 2, see `PHASE-2-SUPABASE.md`), and whether the visuals hold up on
a projector at 4 m.

---

## Before the session (20 minutes, once)

1. **Host it.** The game is static and needs HTTPS for a camera to read a QR. Either:
   - **GitHub Pages**: put this folder in a repository, Settings → Pages → deploy from
     the branch root, and note the URL (e.g. `https://<org>.github.io/hotel-builders/`).
     Fonts are licensed for public serving, so the local `assets/fonts/` copies are fine.
   - **Any static host.** SharePoint is not one: it rewrites HTML.
2. **Open the board** at `<url>/board.html` on the facilitator laptop.
3. **Set the room.** Room code (e.g. `HB24`), teams (6), build minutes (8), team names if
   you want them fixed. **Make join cards** → **Print** → cut.
4. **Test one card** with a phone camera on the venue Wi-Fi and follow it through to the
   build screen. Do this before printing thirty.
5. **Dry-run one solo session** on the facilitator laptop: *Start build* → *Build the
   hotel* → *Run round* ×4. You need to have seen the result card before a room does.
6. **Room kit:** one tablet per table (preferred) or one phone per person, chargers, the
   printed cards, the room code on the whiteboard, and a stopwatch in case a device dies.

> **Wi-Fi:** after the first load the game needs no network at all. Load every device
> once in the room before the session starts (open the card, wait for the site), then let
> them lock their screens. That single step removes the most common classroom failure.

---

## Run sheet — 70 minutes, 4 rounds

| Time | What | Notes |
|---|---|---|
| 0–5 | **Join** | Teams open their card, confirm the team name, tap *Start build*. Room code is on the board and the whiteboard. |
| 5–10 | **Customise** | Architecture style, palette, signature element, landscape. Starting hotels are **off** in a classroom room — every team builds from the same 640 credits. |
| 10–18 | **Round 1 — Foundations** | 8-minute clock. Rooms, arrival, one outlet, the back of house. |
| 18–21 | **Run round 1** | Read the result card together. One line per cause: "Housekeeping is close to the rooms it turns over." |
| 21–29 | **Round 2 — Opening Months** | Demand grows. |
| 29–32 | **Run round 2** | |
| 32–40 | **Round 3 — Peak Season** | The second journeys start to matter. |
| 40–43 | **Run round 3** | |
| 43–51 | **Round 4 — The Year in Review** | Everything compounds. |
| 51–55 | **Final round + showcase** | The dusk tour, then the final scorecard. |
| 55–62 | **Score codes → board** | Each team reads or pastes its code (`HB1.…`). Paste all six into *Leaderboard*. |
| 62–70 | **Debrief** | See below. |

### Suggested roles at a tablet (3–4 per team)

The app does not enforce roles; assign them so the team has to talk:

- **General Manager** — holds the budget, decides what gets cut.
- **Rooms Division** — rooms, front office, housekeeping, concierge.
- **Food & Beverage** — restaurant, second restaurant, kitchen, ballroom.
- **Engineering & P&C** — plant, laundry, receiving, waste, canteen, training, lockers.

Each round, the role that owns the decision taps the screen. The conversation is the
learning; the screen is the record of it.

### Debrief, in this order

1. **Spread first.** Read the board top to bottom. The composite is deliberately not a
   revenue ranking: Fan 30%, Profit 25%, Colleague 25%, Brand 20%. Ask the leader what
   they spent *nothing* on.
2. **One team, one cause.** Pick the lowest Profit score and open its round-4 card
   ("Why the score moved"). The causes are plain English, not codes.
3. **The invisible functions.** Whoever skipped plant, laundry or receiving: what
   happened in the plant-failure and linen rounds? This is the induction point — back of
   house is not optional.
4. **The trade-off they felt.** The clock, the 640 credits, the heritage pavilion, the
   service yard. Ask what they wanted to build and could not.

---

## Failure modes and the fix

| Symptom | Cause | Fix in the room |
|---|---|---|
| A card will not scan | Camera focus, screen glare, a dense QR | Type the room code from the whiteboard into *Joining a classroom session?*; the team name is theirs. |
| Blank page or "Something went wrong" | The device never finished the first load | Move to a device that did, or reload on the venue Wi-Fi. The game itself needs no network. |
| A tablet locks and the tab reloads | Normal | The lobby offers **Resume** for that team and round. Autosave runs on every change. |
| Two tables call themselves the same name | Typed, not scanned | Rename one — and do it before round 2, because the save slot is per team name. |
| A team finishes early | The clock paces the room, it does not lock a team | They keep building; *Run round* is theirs to press. |
| Nobody finishes round 4 | 8 minutes is too short for the room | Either raise build minutes to 10 on the board before printing, or treat round 3 as the final round and stop there. |
| A team wants the preset hotels | Classroom rooms hide them by design | That is the point: a preset is a one-tap answer and it beat teams that built by hand. |
| The board shows fewer teams than tables | A code was mistyped | Re-paste it; codes are idempotent, so a repeat never duplicates a row. |

---

## What to collect for the decision

Bring these back; they decide whether this goes to a real cohort:

1. **Six score codes.** The whole session in six lines, and it replays identically.
2. **The spread.** If every team lands within 5 composite points, the exercise is not
   discriminating and the baseline needs recalibrating.
3. **Actual time per round.** Where did the room stall: placing, customising, reading
   results, or arguing?
4. **Device reality.** Model, OS, and anything that broke. This is the first time the
   renderer has run on a real GPU — note whether it stutters when the shadow map rebakes
   after a placement, and whether a phone in landscape can still read the tray.
5. **Verbatim quotes** from the debrief, especially anything a New Joiner says about a
   department they had not thought about before.
6. **Two questions for the group:** _Which decision cost you the most points?_ and
   _What would you do differently with the same 640 credits?_

---

## After the pilot

- Fix in this order: anything that stopped a team finishing > anything that made a result
  unreadable > anything cosmetic.
- Then Phase 1 of the learning work: the readable journey panel (the routes exist in the
  simulation but have no player-facing view) and, if approved, a simple P&L with room
  rate and occupancy feeding Profitability.
- Live multi-team sync stays optional: the score-code path already runs a competition
  without a backend, so Phase 2 is an upgrade, not a prerequisite.
