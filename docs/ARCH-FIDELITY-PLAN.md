> **2026-10-25 update:** `FULL-SCENE-BRIEF.md` and `FIDELITY-CONTINUATION.md` supersede this plan's hall-only limits and source-capture assumptions. Full-scene limits are 1260/345 KiB code and 320 KiB maps. Old isolated frames had disabled global lights; use corrected `review/arch-v2` evidence. Luminance correlation is not proof of unchanged geometry or visual quality.


# Architectural fidelity: bringing the buildings up to the FLORA references

Status: Phase 0 (tooling), Phase 1 (the hall reference) and Phase 2 (the hall ledger) are done;
Phases 3-6 are the work. **The executing brief is `docs/ARCH-HANDOFF.md`** - read that with this
file, not instead of it.
The detail rows the work builds from are in `docs/ARCH-DETAIL-LEDGER.md`, not in this file. Read
this together with `docs/RENDER-FIDELITY-GAP.md` (what is still missing, with a cost per item)
and `docs/RENDER-REALISM.md` (what has already been tried).

## The answer to "can we run the render through FLORA and improve the buildings?"

Not on its own. FLORA returns a picture; the live scene only changes when the geometry code
changes. So FLORA is a **target generator**, not a fixer:

1. render one building alone, from a fixed camera;
2. run that frame through FLORA (Nano Banana 2.1) with an instruction to keep the shape and
   add real construction detail;
3. write down every detail FLORA added that ours lacks;
4. build those details in `js/render/massing.js` as Three.js geometry;
5. re-render and re-measure.

All five steps are code, which is why **no Blender is needed**. Blender would only add
pre-baked shading and hand-modelled meshes; the loop above gets the same result inside the
browser pipeline that already ships.

The gap is visible today in `review/cmp/` (top: FLORA, bottom: ours). Same massing, same
camera, same sun - different architecture:

| element | FLORA reference | ours today |
|---|---|---|
| hall roof | slim ochre fascia, real eave overhang, dark soffit | wide flat gold plate, no overhang |
| slate roofs | courses, hip and ridge caps, thickness at the eave | smooth pyramid, no caps |
| columns | base and capital | plain cylinder |
| windows | recessed, frame, sill, mullions | painted onto the wall texture |
| rooftop plant | louvred | bare boxes |
| walls | stone base course, slight weathering | plaster to the ground |
| paving | weathered slabs with joints | regular checker |

Every row is buildable in code. None of them needs Blender.


## Constraints that decide the shape of the work

- **No Blender, no Python, no local headless render.** Geometry is procedural Three.js in
  `js/render/massing.js`, driven by `buildMassing(placement, style, kit)`.
- **Machine rules.** No `.ps1` files (EDR-blocked). Run gates through
  `Start-Process cmd -ArgumentList '/c node review\verify.mjs [gates] > %TEMP%\<log>.log 2>&1'`
  and read the log. Files on disk are CRLF. Commit with
  `git -c user.name='Clement Yu' -c user.email='clementy@mohg.com'`.
- **Download budget is nearly spent.** `tools/bytes.mjs` currently reports 1198.1/1200 KB raw
  and 321.9/324 KB gzip. This work is expected to cost 15-25 KB raw (5-8 KB gzip).
  **Do not raise a budget.** If one is exceeded, stop and report the measured numbers.
- **Brand canon.** Ivory plaster, gold/ochre in the `#B59060` family, charcoal-brown slate.
  Keep the gold, but restrained: slim fascias and bands, not wide plates.
- **Nothing outside appearance.** No changes to `js/sim/` (scoring, footprints, storeys,
  placement, picking). Detail is construction detail only: no new floors, wings, signs or
  text.
- **Reference renders are never shipped pixels.** Nothing FLORA returns is copied into the
  app. Runtime maps stay procedural or CC0 (`assets/textures/SOURCES.md`), and the palette
  still comes from material colours.

## Measured facts the work depends on

| fact | value | where |
|---|---|---|
| site | 12 x 9 cells, 4 m cell -> 48 x 36 m | `js/sim/catalogue.js` `SITE` |
| storey height | `FLOOR = 1.5` m | `js/render/massing.js:10` |
| footprint gap | `MARGIN = 0.5` m | `js/render/massing.js:11` |
| facade texture tile | `FACADE_TILE = 4 * FLOOR` | `js/render/massing.js:14` |
| camera radius | limits are `[26, 118]`, but `applyRig()` does not clamp, so `focusOn(x, z, radius, phi, ty)` reaches in closer | `js/render/view.js:20, 162` |
| phi limits | `[0.42, 1.24]`, smaller = higher camera | `js/render/view.js:20` |
| azimuth | `theta` is only settable through `fit()`: `focusOn` cannot change it and `snap()` overwrites `rig` from `goal` | `js/render/view.js:188, 247, 257` |
| scene access | `view.scene`, `.camera`, `.renderer`, `.world`, `.rig`, `.agents`, `.overlays` are exposed | `js/render/view.js:725` |

## Phase 0 - tooling (built, runnable now)

- **`tools/arch-shot.mjs`** - one archetype, alone, from three fixed cameras.
  `node tools/arch-shot.mjs [massing] [style] [palette] [dusk]`
  massing: `rooms public kiosk spa pool hall boh plant shed people` (default `hall`);
  style: `tower courtyard heritage` (default `heritage`);
  palette: `gold sage ember moon` (default `gold`).
  Writes `review/arch/<massing>-<style>-<cam>.png` for `corner`, `close`, `roof`, and prints
  the measured bounding box, draw calls and triangle count.
  It builds a preset, keeps exactly one placement, then hides every group that is furniture
  rather than building (grid, plots, offers, ghost, selection, landscape, signature, the
  heritage pavilion, agents, overlays, glows). Terrain and paving stay, so the building keeps
  its ground contact and cast shadow.
- **`tools/sig.mjs`** - the numeric comparison used to accept or reject a reference.
  `node tools/sig.mjs <a.png> <b.png> [--min 0.75] [--json]`
  Reports four numbers off a 64x32 luminance grid: **structure** (Pearson correlation),
  **colour** (mean absolute RGB difference per channel), **detail** (ratio of edge energy)
  and **shadow** (ratio of the darkest decile to the mean). Measured calibration on this
  implementation, so the numbers below are the tool's own, not a remembered scale:

  | pair | structure | colour |
  |---|---|---|
  | faithful reference pass, same camera, different renderer | **0.791** | ~20 |
  | relight only, same camera, day vs dusk | 0.493 | ~86-105 |
  | different camera, same renderer (court vs roof) | 0.042 | ~50 |

  Exit code 1 when `--min` is given and structure is below it.

## Phase 1 - FLORA reference per archetype

Order: `hall`, `rooms`, `public`, `people`, `boh`, `spa`, `plant`, `kiosk`, `shed`, `pool`,
then the same list again in the `courtyard` and `tower` styles. Heritage first, because the
existing reference set is heritage.

1. Shoot the archetype: `node tools/arch-shot.mjs hall heritage gold`.
2. Upload the `corner` and `close` frames as assets (`flora_create_asset` with
   `source:"signed-url"`, then upload the bytes, then `flora_complete_asset`).
3. Generate: model `i2i-elote-gateway`, `params.image_url` = the uploaded URL,
   `resolution: "2K"`, `thinking_level: "HIGH"`, `aspect_ratio: "auto"`, a fixed `seed`.
   Quote first with `quote: true`. **Hard cap $5 in total.**
4. Save accepted output to `review/arch-ref/<massing>-<style>-<cam>.png`.
5. Log run id, seed, scores and cost in `docs/ARCH-DETAIL-LEDGER.md`.

The prompt is fixed; only the building changes:

> Photorealistic architectural visualisation of exactly this building. Keep identical:
> camera, footprint, storey count, roof form, number and position of windows and columns,
> sun direction and shadow length. Do not add or remove buildings, floors, windows, trees,
> people, signage or text. Keep colours: ivory plaster walls, restrained warm gold/ochre
> trim, charcoal-brown slate. Add only real construction detail: recessed window reveals
> with frames and sills, mullions, cornice and fascia profiles, eave soffits and gutters,
> hip and ridge caps, column bases and capitals, louvred rooftop plant, stone plinth base
> course, subtle weathering.

**Accept a reference only when:** structure >= 0.75 **and** colour <= 30 per channel. The
known-good court pass measures 0.791 / ~20, so both limits pass it with margin and both
reject a redesign (a different camera alone scores 0.042 / ~50). Otherwise retry once with a
new seed, then discard. A reference that redesigns the building is worse than no reference
at all.

| presets | `core`, `balanced` (15 fns), `revenue` (has the ballroom), `people`, `neglect` (has pool + spa), `sandbox` | `js/sim/engine.js:1299` |
| FLORA model | `i2i-elote-gateway` = Nano Banana 2.1, image-to-image, ~$0.052 and ~40 s per image, preserves framing. `i2i-gemini-3-pro` reframes - do not use. | `flora_list_models` |
| FLORA workspace / project | `ws_qd73pg6vhpkmrpywgazt4e5h2h895p58` / `prj_ns7f9jew34edtpbq2sn94jn9w18gsecw` | Workspace 12 |


## Phase 2 - the detail ledger

For each accepted reference, add a table to `docs/ARCH-DETAIL-LEDGER.md`:

| detail | where visible | size (m) | kit material | builder in `massing.js` | status |

Starting rows, taken from the `review/cmp/` comparison:

1. hall: gold coping plate -> slim fascia + eave overhang + dark soffit
2. slate roofs: hip caps, ridge cap, eave thickness
3. columns: base and capital
4. windows: recess, frame, sill, lintel, mullions
5. rooftop plant: louvres
6. every building: stone base course
7. flat roofs: parapet with coping

This phase needs eyes on the images. If the executing model cannot see images, the ledger is
written by Clement (or by a vision-capable pass over `review/arch-cmp/`) and the executor
works from the written table only.

## Phase 3 - code

New file `js/render/detail.js`, imported by `massing.js`. Shared helpers:

- `windowBay` - recess 0.12-0.18 m, frame, sill, lintel
- `mullions`
- `cornice` - two or three stepped boxes
- `eave` - roof thickness, fascia, soffit in a dark material, gutter
- `hipCaps` / `ridgeCap` for `hipRoof`
- `column` - base, slightly tapered shaft, capital; build once, reuse
- `plinthCourse`, `louvredPlant`, `parapet`

Rules:

1. Repeated parts (windows, columns, louvres) use `InstancedMesh`, following `site.js`.
2. Add `mergeByMaterial(group)` (about 50 lines - `BufferGeometryUtils` is **not**
   vendored) to collapse a building to one mesh per material. **Read how `view.js` picks
   and what it reads from `userData` first**; a merged mesh must keep the same
   `userData.uid` and `userData.kind`, or picking breaks.
3. Where a facade gets real window geometry, the painted windows on that facade must go, so
   the wall shows plaster only. No doubled-up windows.
4. Cheap corner shading: give facade and soffit materials `vertexColors` and darken vertices
   near the ground and under eaves by 15-25%. This stands in for the ambient occlusion a
   real renderer would give, at no download cost.
5. Slim the exposed width of `copedRoof` and `bands` to match the references. **If a gate
   fails because of it, stop and report. Never loosen a gate.**

## Phase 4 - comparison loop, per archetype, three rounds maximum

`arch-shot` -> contact sheet in `review/arch-cmp/` -> `sig.mjs` -> update the ledger. An
archetype is done when every ledger row is done or deferred with a reason. Write down what is
still wrong without softening it.

## Phase 5 - checks

- All 11 gates: `node review\verify.mjs` (syntax, sim, brand, bytes, qr, smoke, visual,
  input, team, class, capture).
- Performance: print `renderer.info.render.calls` and `.triangles` for the full demo build
  before and after. Limits: calls no more than +10% (merging should reduce them), triangles
  no more than 2.5x.
- Budgets: `node tools/bytes.mjs`. Exceeding one is a stop, not a negotiation.
- Regression frames: `node tools/shot.mjs heritage gold all day std`, compared against
  `review/shot-*-heritage-std.png` and the FLORA references.

## Phase 6 - delivery

One commit per group of archetypes ("Arch detail: hall + rooms"), each message listing the
detail rows finished and the measured calls, triangles and bytes. Push, verify the live site
by hash, and update `docs/RENDER-FIDELITY-GAP.md`.

## Stop conditions - halt and report, never work around

- a FLORA upload or generation fails, or spend would pass $5;
- a reference fails acceptance twice;
- any gate fails after one rerun;
- a download budget is exceeded;
- merging breaks picking.

## Decisions taken (2026-10-25) - these are no longer open

1. **Who writes the Phase 2 ledger** - done. Written by the model that ran Phase 1, from the two
   accepted frames, and corrected on 2026-10-25 where its dimensions were estimates rather than
   measurements (`docs/ARCH-DETAIL-LEDGER.md`). Rows 1-9 for the hall are the build list; row 10 is
   deferred because it is surface, not geometry.
2. **Download budget** - approved. `tools/bytes.mjs` is raised once, to 1225 KB raw / 332 KB gzip,
   for the detail geometry; measured 1198.4 / 322.1, so 26.6 KB raw and 9.9 KB gzip of headroom.
   The surface-map budget stays at 240 KB (no new image files). A further breach is a stop.
3. **FLORA access for the executor** - Phase 1 runs in this harness, which has FLORA tools, so the
   executor works from references that already exist. An executing harness without FLORA tools
   stops after the hall rather than guessing the details the hall frames cannot show.
