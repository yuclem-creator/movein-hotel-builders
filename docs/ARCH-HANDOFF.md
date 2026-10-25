# Handoff — architectural detail, Phase 3 onward (hall first)

**Repo:** `C:\Users\clementy\.kimi-code\hotel-builders` — git, origin
`yuclem-creator/movein-hotel-builders`, branch `main`, clean at `e03844f`.
**Live:** <https://yuclem-creator.github.io/movein-hotel-builders/>

Ignore the "NOT a git repo / copy the whole folder first" line in `docs/DEEPSEEK-BRIEF.md` — it is
stale. That brief's §1 tooling facts and §2 rules (sim purity, verbatim lock, brand, pointer-events)
still apply in full.

Read first, in order: `docs/ARCH-FIDELITY-PLAN.md` (the method), `docs/ARCH-DETAIL-LEDGER.md`
(rows 1–9 are the build list), `docs/RENDER-FIDELITY-GAP.md`, `docs/RENDER-REALISM.md` (what has
already been tried and reverted). Evidence frames (git-ignored, on disk):
`review/arch/hall-heritage-{corner,close,facade,roof}.png` = ours;
`review/arch-ref/hall-heritage-corner-ref.png` and `hall-heritage-close-ref2.png` = accepted
targets. Take **construction detail only** from the references — never their slate tone, their
invented scrub or their paving re-tone.

## Decisions already made by Clement (2026-10-25)

1. **Download budget raised once for this work:** `tools/bytes.mjs` `BUDGET_RAW` 1200 → 1225 KB,
   `BUDGET_GZ` 324 → 332 KB. Make that edit **first**, with a comment in the file's existing style
   ("Raised for the architectural-detail pass, approved by Clement 2026-10-25"). The surface-map
   budget (240 KB) is **not** raised: no new image files. Any further breach is a stop, not a
   negotiation.
2. **Scope:** the hall (heritage) rows 1–9 first, one commit. No email/Telegram work. Nothing in
   `js/sim/` changes.
3. **Machine:** no `.ps1` files (EDR-blocked), no Python, no Blender, no `npm install`, no new
   dependencies, no `three/addons` (the vendored build is core only).

## Corrections to the ledger — apply these before sizing anything

The ledger's hall measurements were taken from a stale estimate. Measured from the code:

| fact | ledger says | actually |
|---|---|---|
| footprint | 21 × 21 m | **11.5 × 11.5 m** (`w = d = 3*4 − 0.5`; `MARGIN = 0.5`) |
| wall head | 5 m | **2.28 m** (`FLOOR*1.9*hMul('heritage')` = 1.5 × 1.9 × 0.8) |
| roof apex | — | **4.88 m** (`hipRoof(w+1, d+1, 2.6)` placed at `h + 1.3`) |
| eave overhang | "none" | **0.5 m already exists** (the roof is built `w+1` wide) |

Confirm all four before editing geometry:

```
node tools\arch-shot.mjs hall heritage gold
```

It prints `size W x H x D m, roof at N m, centre x, z` plus draw calls and triangles.

**Row 1 is therefore not "add an overhang."** The 0.5 m overhang reads as absent because the roof
is a zero-thickness surface with nothing under it: no fascia, no soffit, no gutter. Build the edge
assembly, not a bigger roof.

**Row 5** is mis-sized for the same reason: the facade texture carries four storeys per 6 m tile
(`FACADE_TILE`), so a 2.28 m wall shows about one and a half window bands, not a squeezed partial
band under a 5 m eave. Fix it with a plaster-only wall plus real window bays (constraint 4 below).

Fix the numbers in `ARCH-DETAIL-LEDGER.md` in the same commit as the first geometry.

## Hard constraints found in the code — each one breaks a gate if ignored

1. **Colours.** `tools/brand-gate.mjs` fails any hex literal in `js/` that is not declared in
   `css/tokens.css` or one of the four palette accents. Use existing kit materials only
   (`kit.accent`, `kit.gold`, `kit.roofSlate`, `kit.roofTile`, `kit.roofDark`, `kit.ink`,
   `kit.paving`, `kit.pavingDark`, `kit.glass`, `kit.trunk`, `kit.contact`). If a new material is
   genuinely unavoidable, build it in `materials.js` from colours **already in that file**.
2. **Material lifetime.** Never `new THREE.Material(...)` inside `detail.js` or `massing.js`.
   Per-building materials must come from the kit with `userData.dynamic = true` — `view.js`
   disposes exactly those on rebuild, and `setGhost` clones every mesh material
   (`view.js:544-556`). A stray material leaks on every tool selection.
3. **Accent count.** `tools/visual-check.mjs` requires the palette accent on **≥ 10 separate
   meshes** for every palette (`tools/visual-check.mjs:296-312`). So do **not** merge
   accent-material meshes. Use `InstancedMesh` for repeats (windows, mullions, caps, louvres);
   merge only non-accent materials, and only if draw calls rise more than 10%. Never loosen the
   check.
4. **The painted windows cannot be stripped from the hall alone.** `facadeSet(role)` is one
   texture shared by every building of that role. Add `kit.makePlaster(role, jitter)` to
   `materials.js` — the same function as `buildFacade` but without `map`, `bumpMap` or
   `emissiveMap` (same `FACADE` colours, `dynamic: true`) — and use it for the hall wall only.
   Real `windowBay()` geometry then replaces the painted ones on that building. **Dusk:** the
   painted windows carry the emissive map; a plaster wall loses it, so the window glass must light
   at dusk through existing materials (`kit.warm` / `kit.glass`). Check a dusk frame too
   (`node tools\arch-shot.mjs hall heritage gold dusk`) or the hall goes dark at night.
5. **Shadows.** `buildMassing`'s final traverse (`massing.js:651-658`) sets `castShadow` from
   `geometry.parameters.height`, which custom `BufferGeometry` and `InstancedMesh` do not have —
   so they default to casting. Add a `userData.noShadow` flag honoured in that traverse and set it
   on fascia, caps, gutters, mullions, downpipes and the finial.
6. **Picking.** `view.js:331-342` walks parents for `userData.uid`, and the traverse tags every
   descendant, so plain children and `InstancedMesh` are safe. If you merge anything, re-run
   `input-check` — the plan's stop condition is "merging breaks picking".
7. **Gates on this machine.** Batch files are EDR-blocked, so run the chain through the local
   runner and read the log:

   ```
   Start-Process cmd -ArgumentList '/c node review\verify.mjs > %TEMP%\hb-gates.log 2>&1' -Wait
   Get-Content "$env:TEMP\hb-gates.log" -Tail 40
   ```

   `node review\verify.mjs <gate> <gate>` runs a subset; the runner is `review/verify.mjs`
   (git-ignored, present on disk). Files on disk are CRLF. Commit with
   `git -c user.name='Clement Yu' -c user.email='clementy@mohg.com' commit ...`.

## Steps

**0. Baseline, before any edit.** `node tools\bytes.mjs`; `node tools\arch-shot.mjs hall heritage
gold`; record draw calls and triangles for the isolated hall **and** for the full `revenue` and
`balanced` presets. For the presets add `tools/perf.mjs` — copy `arch-shot.mjs`'s server/browser
bootstrap, build the preset through `window.__hb`, render once, print
`view.renderer.info.render.calls` and `.triangles`. Tools are not part of the download budget.
Then run all 11 gates: `node review\verify.mjs` must end `CHAIN-GREEN`. Keep the logs.

**1.** The `bytes.mjs` budget edit (decision 1).

**2.** New `js/render/detail.js`, imported by `massing.js`. Helpers take `(w, d, h, kit)` in metres:
`eave()` [row 1], `hipCaps()` + `ridgeCap()` [row 2 — capping along the four hips; reuse
`hipRoof`'s own maths, and note a square plan has no ridge, it collapses to an apex], `finial()`
[row 3 — tapered `kit.gold` spike and knop on a `kit.roofDark` skirt, replacing the plain box at
`massing.js:463`]. Then `arch-shot`, compare against `review/arch-ref/`, and run `syntax`,
`brand-gate`, `bytes`, `visual-check`.

**3.** `windowBay()` + `mullions()` [rows 4–5]: recess ≈ 0.15 m, stone surround (`kit.paving`),
sill, lintel, glass, one or two mullions per bay, one band at a consistent head height, bays spaced
to the reference rhythm on all four faces, built as `InstancedMesh`. Swap the hall wall to
`makePlaster`.

**4.** `plinthCourse()` [row 6 — note `buildMassing` already adds a 0.34 m `pavingDark` base at
`massing.js:619`: extend or replace that for the hall, never stack two], `cornice()` [row 7],
`downpipe()` [row 8], and the cheap corner shading [row 9 — `vertexColors` on the hall's own
per-building plaster material instance only, so every mesh sharing it carries a `color` attribute;
darken the wall foot and under-eave by 15–25%].

**5.** Comparison loop, three rounds maximum: `arch-shot` → **look at the frames yourself** →
`node tools\sig.mjs review\arch\hall-heritage-corner.png
review\arch-ref\hall-heritage-corner-ref.png --min 0.75 --max-colour 30` (and `close` against
`close-ref2`). Update each ledger row to DONE, or DEFERRED with the reason. Write down what is
still wrong, plainly. If structure drops below 0.75 you have redesigned the building — revert that
change.

**6.** Checks: all 11 gates `CHAIN-GREEN`; bytes inside 1225 / 332; performance — draw calls no more
than +10% against the baseline, triangles no more than 2.5×, both presets; regression frames
`node tools\shot.mjs heritage gold all day std`, plus courtyard and tower, because the hall code
path differs per style and only heritage should change.

**7.** Deliver: one commit, "Arch detail: hall (heritage)", listing the rows finished and the
measured calls, triangles and raw/gzip bytes. Push, then verify the live site by hash: fetch
`https://yuclem-creator.github.io/movein-hotel-builders/js/render/detail.js` once Pages has
deployed and compare its SHA-256 with the local file. Update `docs/RENDER-FIDELITY-GAP.md` and the
README's known-limits list.

## Stop conditions — halt and report the exact numbers, never work around

- any gate fails after one rerun;
- any budget is exceeded;
- merging breaks picking;
- structure < 0.75 against an accepted reference after the third round;
- the work would need a change to `js/sim/`, `tools/baseline.json`, or any gate threshold.

## After the hall — do not start without references

Order: `rooms`, `public`, `people`, `boh`, `spa`, `plant`, `kiosk`, `shed`, `pool` (heritage), then
the same list in courtyard and tower. Each archetype needs an accepted FLORA reference **before**
its geometry (Phase 1 of the plan): model `i2i-elote-gateway` (Nano Banana 2.1 i2i), workspace
`ws_qd73pg6vhpkmrpywgazt4e5h2h895p58`, project `prj_ns7f9jew34edtpbq2sn94jn9w18gsecw`, $5 total cap
($0.156 spent so far), accept only when structure ≥ 0.75 **and** colour ≤ 30. If you have no FLORA
access, stop after the hall and hand back — do not guess column capitals, louvred plant or
flat-roof parapets, which the hall frames do not show.

