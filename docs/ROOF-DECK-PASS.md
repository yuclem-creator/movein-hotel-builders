# Roof deck pass — green roof and terrace, 19 October 2026

What was wrong with the "customise add-ons" frames, what was changed, and what still looks
less than convincing. Evidence: `review/27-customise-before.png`,
`review/27-customise-greenroof.png`, `review/27-customise-addons.png`, plus 2–3× crops
taken from those frames during the pass (not committed).

## Two real defects, both in the deck

1. **Diagonal streaks read as a venetian blind / glass.** Not transparency and not the
   roof showing through. `plantingTexture()` scattered discs on `(i*53)%128, (i*97)%128`;
   a stride sharing factors with the canvas pairs points into diagonal rows, and at
   `tileWorld 2.6` those rows read as slats across a 6 m deck.
2. **A kerb standing proud of the roof plate.** The deck was clamped to the 12.69 m gold
   drip ring while the actual plate is 12.11 m, so the `+0.16` kerb slab landed 0.37 m
   past the plate on each side — visibly hanging in the air over the slope.

## Changes

- `js/render/materials.js` — `plantingTexture()` rewritten on a seeded stream
  (`mulberry32(0x9e3779b9)`, so the canvas is byte-identical between runs and frame
  diffs stay meaningful). Three layers, no stroked circles: broad dark shade patches,
  leaf-scale ellipse clusters with one sun-side highlight each, fine low-contrast grain.
  Every mark is redrawn in the eight neighbouring cells, so the tile wraps without a seam.
- `js/render/massing.js` — deck sized to the largest-footprint child at maximum height
  (the plate), minus `0.12` per side for a parapet reveal; kerb slab exactly the deck
  footprint; planting at `0.9` leaving a 0.6 m stone edge; terrace on green laid in
  `kit.path` (`pavingDark` sits only 6% under the kerb's `paving`, so the two merged into
  one white U-shape); terrace planters are a paved box with a planting slab on top, seated
  on the terrace deck rather than straddling its edge; shrubs are two-lobed, smooth-shaded,
  textured mounds; the crown mast ends in an 18 cm gold knob instead of a bare cut.
- `js/render/view.js` — `focusOn(x, z, radius, phi, ty = 2)`; the optional target height
  keeps every existing tap-level caller unchanged.
- `tools/visual-check.mjs` — the add-on evidence camera now measures the wing's top once,
  before any add-on exists, and all three frames orbit that same point instead of orbiting
  the pavement.

## Honest critique of the current frames

- **The diagonal reading is reduced, not gone.** On the delivered frame the deck is
  mottled vegetation, the foam rings and the venetian slats are gone, and the leaf dashes
  are visible. But at 1× the dashes still string into evenly spaced diagonal rows, so a
  close look reads faintly as mown stripes. The rows are not in the map — cluster positions
  are seeded and every leaf's tilt is random over 0–π — so what is left is the 2.6 m tile
  repeating about four times across a 12 m deck and the eye linking identical clusters.
  If it needs another pass: halve the per-leaf alpha, or overlay a second copy of the same
  map rotated 30–45° at a different repeat, which breaks the linking without new bytes of
  geometry.
- **The kerb reads correctly**: stone edge, plate reveal, gold cornice — in that order,
  with no lip past the plate.
- **The deck green is pale.** `planting` (#8FB3A4) under the map reads as soft mint, and
  the pool 10 m away is #6F9A92 — the same hue family, separated only by value. It no
  longer reads as water because of the leaf structure, not because of the colour.
- **The tile repeats every 2.6 m.** On a 6–10 m deck that is 2–4 repeats. No grid seam,
  but a straight-on 4×4 preview shows the pattern repeating; at the inspection camera it
  does not read as a repeat.
- **The shrubs are mounds, not plants.** They read as groundcover clumps, which is what
  the scale supports, but they carry no leaf detail.
- **The mast's foot is buried by the planting.** A paving collar around it was tried and
  looked like a sheet of paper on the grass, so it was removed; the gold knob is what
  makes the pole read as a spire. On the frame the pole is a short brown stroke lying on
  the lawn with a pale cap — it still has no visible base.
- **The planters are the weakest prop.** The box is 0.6 m and the planting slab 0.5 m, its
  top 0.04 m above the box rim: at 1× that reads as a white planter with a green lid, and
  at 3× the lid is visibly a slab rather than foliage. It is a scale cue, not a detailed
  prop; real planting would need a subdivided mound or three crossed leaf cards per box.
- **The terrace paving now separates.** `kit.path` (#C4B79C, 2.2 m joints) against the
  kerb's `paving` (#EDE7DC) is clearly darker and warmer at 1×, and the earlier pale
  U-shape is gone. The remaining wish is a cooler grey stone, because the terrace tan sits
  in the same warm family as the gold cornice directly below it — a palette decision, not
  a geometry one.

## The evidence frame was also wrong

The first pair of frames was shot with `focusOn(cx, cz, radius, 0.82)`, which orbits a
point 2 m above the ground: on a multi-storey wing the deck sat against the top edge of
the frame and the gold cornice took the middle, so the "add-on" evidence was mostly
facade. `focusOn` now takes an optional target height, and `tools/visual-check.mjs`
measures the rebuilt wing's own top **once, before any add-on exists** and aims 1.5 m
below it at `phi 0.62` and `radius = 1.5 ×` the wing's larger plan dimension (24 m
minimum). All three evidence frames therefore share one camera, so the pixel diff is
geometry only. The whole deck is in frame for any storey count, and the pixel diff over
that camera went from 10.0% to 16.2% (terrace-on-green 3.0% to 5.4%) without any geometry
being touched.

## Also fixed

`input-check` had a stale assertion (`radius > 84` after buying a plot); `fit()` solves
for a projected fill of 0.78, so the radius is aspect-dependent — it now asserts the
camera moved onto the owned land and pulled back from the pre-purchase radius.

## Gates

`npm run verify` — 28 files parse, 110 sim checks, brand gate, 1101.5 KB raw / 289.4 KB
gzip (budget 1120 / 296), 23 QR, 39 smoke, 30 visual, 84 input and 54 classroom checks,
no console errors; 301 draw calls.
Add-ons change 16.2% of pixels, terrace-on-green changes 5.4% (floors 0.5% / 0.3%),
because the evidence camera now aims at the roof.
