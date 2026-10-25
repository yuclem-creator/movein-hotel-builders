# Architecture detail ledger

What this is: the detail set that separates our buildings from the FLORA references, written
down element by element with the evidence frame for each, so Phase 3 is a build list rather than
a re-derivation. Read with `docs/ARCH-FIDELITY-PLAN.md` (the method) and
`docs/RENDER-FIDELITY-GAP.md` (the older, coarser gap list).

A row is DONE when the geometry exists and `review/arch-cmp/` shows it. A row is DEFERRED only
with a reason recorded here. Nothing in this file is copied from a reference: the references set
the target, the geometry is ours, and the palette stays ours (brand canon: ivory plaster,
`#B59060` family gold, charcoal-brown slate).

## How a reference is accepted

`node tools/sig.mjs <ours.png> <ref.png> --min 0.75 --max-colour 30` and both gates must pass.

| measure | meaning | calibration |
|---|---|---|
| structure | Pearson correlation of the 64x32 luminance signature | 0.042 different camera, 0.493 relight, 0.791 faithful pass. Gate: >= 0.75 |
| colour | mean absolute RGB delta per channel, worst channel | Gate: <= 30 |
| detail | edge-energy ratio | **informational only.** On the hall it tracked the ground, not the building: the reference that added the full detail set scored 0.92x because it also smoothed our noisy paving, and the reference that added nothing but invented scrub scored 1.40x. Not a gate. |
| shadow | darkest decile over mean luminance | informational |

## Phase 1 provenance

Fixed frames from `node tools/arch-shot.mjs hall heritage gold` (1600x1000, isolated placement,
grid/plots/offers/ghost/selection/landscape/signature/pavilion/agents/overlays/glows and the
service-yard gate hidden, terrain and paving kept for ground contact). Model
`i2i-elote-gateway` (Nano Banana 2.1 i2i), workspace `ws_qd73pg6vhpkmrpywgazt4e5h2h895p58`,
project `prj_ns7f9jew34edtpbq2sn94jn9w18gsecw`, resolution 1K, aspect auto.

| frame | run id | seed | prompt | structure | colour | verdict | cost |
|---|---|---|---|---|---|---|---|
| corner | `run_m172fh7y0k8kzgx8a3gyta836n8gwd6p` | 20261024 | v1 | 0.812 | 23.4 | ACCEPTED | $0.052 |
| close | `run_m176xyvpa3cnm0eacx741rj6058gx664` | 20261024 | v1 | 0.497 | 48.2 | REJECTED | $0.052 |
| close | `run_m1734pdw9z9nw934y008ksfg598gw507` | 20261024 | v2 (tone lock) | 0.977 | 4.8 | ACCEPTED | $0.052 |

Total spend $0.156 of a $5 cap.

- **Accepted references**: `review/arch-ref/hall-heritage-corner-ref.png` (corner) and
  `review/arch-ref/hall-heritage-close-ref2.png` (close v2). Both sit under `review/`, which is
  Git-ignored as human-review evidence, so the durable handles are the run ids above and the
  source URLs:
  `https://media.flora.ai/node-inputs/2026/10/24/px70fqe29tk833wybqphdy4yj97x7xyp/gen-m172fh7y0k8kzgx8a3gyta836n8gwd6p-0.png`
  and
  `https://media.flora.ai/node-inputs/2026/10/24/px70fqe29tk833wybqphdy4yj97x7xyp/gen-m1734pdw9z9nw934y008ksfg598gw507-0.png`.
- **Why close v1 was rejected, and what it proves.** The close frame is roof-dominated, so when
  FLORA re-toned the slate from near-black to mid-grey the luminance signature moved to 0.497 —
  the tool's own relight value — and the colour gate failed at 48.2. The layout was never in
  question: the corner frame from the same run, same prompt, same seed scored 0.812. So the
  rejection is a tone change on the dominant surface, not a redesign. The retry isolated the
  cause by changing the prompt only (same seed) and adding "keep every material tone exactly as
  shown, the slate must stay as dark as it is", which produced the accepted frame.
- **Do not copy from the references**: v1's lighter slate, the invented scrub FLORA added to the
  apron, and its slight paving re-tone. Take the construction detail only.

## Ledger — hall (heritage, 3x3 cells, 21 x 21 m, 5 m, hip roof)

Ours today, read off `review/arch/hall-heritage-{corner,close,facade,roof}.png`. Reference, read
off the two accepted frames. Helper names are the Phase 3 units in `js/render/detail.js`.

| # | element | ours today | accepted reference | helper | status |
|---|---|---|---|---|---|
| 1 | eave assembly | roof plane meets the wall head; a wide flat gold plate, no overhang, no soffit, no thickness | ~0.5 m overhang, slim gold-ochre fascia (~0.15 m exposed), dark soffit with its own shadow line, lead gutter edge | `eave()` | TODO |
| 2 | hips and ridge | smooth pyramid, no caps; a faint diagonal UV seam at the valley | raised hip capping along all four hips, raised ridge cap, staggered slate courses | `hipCaps()`, `ridgeCap()` | TODO |
| 3 | apex finial | bare ochre box (~0.8 m) sitting on the roof surface | tapered gold finial with a knop, on a lead skirt and a short ridge stub | `finial()` | TODO |
| 4 | windows | painted flat panels with a painted frame; no relief of any kind | recessed reveals (~0.15 m), stone surround, mullions splitting each bay, sills | `windowBay()`, `mullions()` | TODO |
| 5 | facade rhythm | painted facade tiles at `4 * FLOOR` (6 m) on a 5 m wall, so a partial second window band is squeezed under the eave | one window band at a consistent head height, plain plaster above it to the eave | facade re-tile + `cornice()` | TODO |
| 6 | wall base | plaster to the ground | dressed base course / plinth (~0.5 m) with a moulding at the wall foot | `plinthCourse()` | TODO |
| 7 | wall head | flat plaster, nothing under the gold band | slim cornice band under the eave | `cornice()` | TODO |
| 8 | rainwater | none | slender downpipes at the corners | `downpipe()` | TODO |
| 9 | soffit and wall-foot shading | flat ambient; wall and soffit read as one tone | dark soffit, darker wall foot | vertex-colour AO on facade and soffit materials | TODO |
| 10 | paving weathering | regular checker, 1.875 m slabs, joints | joints plus grime and tone variation | — | DEFERRED: this is surface, not geometry. The paving normal map already exists; grime would be another deferred map and that line is at 222.2 / 240.0 KB |

Rows 1-5 are the ones that move the frame most: in the accepted reference they are what makes the
roof read as a built roof rather than a pyramid, and what makes the windows read as openings
rather than a print.

## Rows that belong to other archetypes

Not visible in the hall frames, so not derivable from them. Each needs its own reference pass on
a building that has the feature.

| element | needs | note |
|---|---|---|
| column base and capital | a colonnade archetype | the hall has no colonnade |
| louvred rooftop plant | an archetype with plant, on a flat roof | the hall is hip-roofed with no plant |
| flat-roof parapet with coping | a flat-roof archetype | coping on a hip roof is meaningless |

## Tooling changes this pass forced

- `tools/sig.mjs` — `--min`'s value was being counted as a filename, so the tool refused to run
  with a gate at all. Fixed. `--max-colour` added so the acceptance rule is one command, and the
  verdict line now reads ACCEPTED / REJECTED rather than leaving the colour gate to the reader.
  The detail ratio is labelled informational, with the measurement that earned it.
- `tools/arch-shot.mjs` — a `facade` camera added. The roof-dominated `close` frame is what
  produced the 0.497 false negative, so a wall-dominated frame is now shot as well. It took two
  attempts: at radius 0.62 span the camera stands inside a 21 m footprint's radius and the near
  roof edge fills the view, so the frame needs phi ~1.48 and radius ~1.15 span, putting the eye
  near eave height. This frame is also what exposed row 5.
- `js/render/site.js` — the service-yard gate was five loose meshes on the terrain group and
  could not be hidden by name, so it stood in every single-building frame. It is now a named
  `serviceYard` group. No world transform and no pixel changed; the visual gate passed unchanged.
- `tools/flora-upload.mjs` — new. Sends a local file's bytes to the URL `flora_create_asset`
  reserves, following the descriptor's own method and fields. Handles `form_fields` and
  `file_field` as the gateway returns them.

## Open items

1. Phases 2-6 for the hall: build rows 1-9, then the compare loop (three rounds maximum).
2. One reference pass per remaining archetype group before its geometry is written; the rows in
   the other-archetype table above are not guessable from the hall.
3. The download budget is 1198.4 / 1200 KB raw and 322.1 / 324 KB gzip, so rows 1-9 must be
   geometry only. Any new map is a stop condition, not a negotiation.
