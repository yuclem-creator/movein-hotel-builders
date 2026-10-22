# Render realism pass — what FLORA was used for, and what it was not

Short version: **FLORA is an atelier, not a renderer.** It was used to find out what
"photographic" looks like in this palette, and the answer was then drawn in canvas code
inside `js/render/materials.js`. No FLORA pixel ships in the app.

## Why not apply the generated images directly

Two full-frame image-to-image passes were run on `review/shot-fit-heritage-wide.png`
(Nano Banana 2.1 and Nano Banana Pro). Both were convincing photographs and both were the
**wrong building**:

- the tan site outside the plot became desert sand in one and lawn in the other;
- the even tree rhythm was replaced with invented scrub, and trees appeared where the
  site has none — a change to the *count* of site facts;
- the sun dropped and shadows lengthened by roughly a third, so the image no longer
  matches the shadow the game renders;
- the roof went cold blue-grey and the gold band went bright brass — outside MO canon.

The layout survived; the *condition* did not. For a game whose promise is "this is the
hotel you built", an image that quietly redesigns the site breaks the product, not just
the art direction. So the full-frame path is a marketing-still path, not a runtime one.

## What was extracted instead

FLORA output was read as a **reference for four specific cues**, each of which turned out
to be cheap to draw:

| Reference | What it showed | What was implemented |
|---|---|---|
| `paving.png` | per-slab tonal range, chamfer lit on one edge and shadowed on the other, faint damp patches | 512 px slab field, six base tones, four-edge chamfer, radial stains |
| `roof.png` | warm-to-charcoal range within one roof, crisp shadow under every course | 512 px, ten courses, six slate tones, per-course shadow gradient |
| `ground.png` | directional brushed grain, not blobs | 2600 near-horizontal strokes, broad tonal patches, tufts |
| `sky.png` | high-key ivory horizon, cool zenith, one broad bloom, no hard disc | 1024x512 sky, used for the background **and** as the PMREM source |

The sky is the largest single win: the environment map was a 16x64 three-band gradient, so
gold reflected a grey stripe and glass reflected nothing. It is now a real sky, and day and
dusk each derive their own IBL.

Also fixed while in there: the river was tiling its ripple map every 6 m across a 76 x 260 m
canal, which mips to a flat sheet — it now tiles at 20 m (wind lanes, not wavelets), and the
tree crowns went from three heavily-overlapping spheres (reads as one ball) to five offset,
squashed, independently rotated lobes.

## Licensing / watermark finding

Two batches were generated in two workspaces and the results differ:

- **Clement Yu's workspace** — outputs came back with a large translucent FLORA watermark
  burned into the pixels, including text-to-image plates. Unusable as a shipped asset.
- **Workspace 12** (`ws_qd73pg6vhpkmrpywgazt4e5h2h895p58`) — flux-2 / flux-3 outputs came
  back **clean**, no watermark.

So the earlier conclusion that watermarking is account-wide was wrong: it depends on the
model and workspace. Any future plan to ship a generated texture should be verified per
workspace before it is built into the pipeline. Available image models also differ by
workspace — Nano Banana 2.1 is available in one and not in the other.

## Cost

~$0.40 of generation in total for the two full-frame passes and the Workspace 12 reference
set. Everything that shipped is procedural, so the recurring cost of the in-game look is
zero and it survives a palette switch with no network request.

## Known remaining defects (not fixed by this pass)

1. **Hip-roof UVs** — FIXED in the in-app pass below. The team's own buildings already used a
   planar, eave-parallel projection; the diamond read came from the heritage pavilion's
   four-sided `ConeGeometry`, whose UV unwrap is radial. It now uses the same `hipRoof`
   builder (a square plan collapses to an apex, so the pavilion keeps its pyramid) and its
   courses run parallel to its eaves. `tileConeUV` has no callers left in `js/`.
2. **Tree crowns** — FIXED in the in-app pass below. The lobes had an irregular *silhouette*
   but were still faceted spheres: an icosahedron with `flatShading: true`. The crown is now
   geometry (`crownGeometry()`): every vertex pushed along its own radius by a hash of its
   **position** (a per-index hash tears a non-indexed icosahedron open at every shared edge),
   the underside drawn in so the canopy hangs, and smooth shading so nothing reads as a
   polyhedron. Seven lobes per tree, and the same geometry on bushes and deck shrubs.
3. **No ambient occlusion** — partly addressed. The painted contact blob was always there, but
   `shadow.normalBias` 0.5 lifted the shadow map off the wall/ground junction, which is what
   made buildings look like they floated. Now 0.28 with a shallower depth bias, so the shadow
   map supplies a real contact edge and the blob darkens under it. There is still no
   screen-space AO: that needs a depth pass this renderer does not have.
4. **Ground** — FIXED in the in-app pass below, and then corrected once more. The dune read was
   fourteen tonal patches up to a third of the tile across at 0.44 alpha on a 9 m tile, i.e. a
   repeating field of soft mounds. Removing them was right; replacing them with 13-40 cm mottle
   was wrong, because that is sub-pixel from the establishing camera — the review frame showed a
   flat sandy field, the largest surface in the picture reading as cardboard. The map now carries
   three deliberate scales: 6 patches under 1.5 m of ground, 40 patches at 0.5-1.2 m (the scale
   the camera sees), and 900 mottles as grain.

## The in-app pass: the cues drawn into the live renderer

Everything above was extracted as *cues* from the FLORA references and then rebuilt as
procedural code in the live scene — which is the point of using a reference atelier at all.
The four defects above, plus two changes that were tried and one that was measured and
rejected:

| Change | Where | Why |
|---|---|---|
| `crownGeometry()` — position-hashed, smooth-shaded, underside drawn in | `materials.js`, used by `site.js` | A tree was five faceted spheres. Geometry, not more lobes, was the fix. |
| Seven lobes, wider spread, per-lobe squash and droop | `site.js` | The silhouette is what the establishing camera reads. |
| `hipRoof` exported and used by the pavilion | `massing.js`, `site.js` | Kills the last radial-UV roof: courses parallel to the eave. |
| `normalBias` 0.5 -> 0.28, `bias` -0.0004 -> -0.00025 | `view.js` | Puts the shadow map's contact edge back at the wall/ground junction. |
| Ground map: three scales — 6 small patches, 40 mid-scale, 900 mottles | `materials.js` | Removes the dune-scale repeat, then puts variation back at 0.5-1.2 m, which is the scale a 30-110 m camera can actually see. |
| Fog per preset (day 120-360, dusk 90-330) | `view.js` | Aerial perspective; the old 160 m start did nothing inside a 110 m shot. |
| Accent chroma +30% (envelope tint and trim) | `materials.js` | Puts margin behind the palette gate; `accentHex` stays the declared brand hex, so nothing downstream claims a colour the brand does not have. Gold lands near `#C08B55`, inside the 34-unit window the gold check measures. |

**AgX was tried and rejected, on evidence.** The vendored Three.js supports
`AgXToneMapping`, and it is the more filmic curve — long highlight rolloff, film-like
highlight desaturation, closer to the reference frames in a still. Against the same frames it
also compressed exactly the signals this app teaches with: palette separation fell to **2 of 6**
pairs (gate needs 4), tower vs courtyard fell to **3.73** mean pixel difference (floor 4), and
ivory paving fell to **1%** of frame (floor 1%). A teaching tool whose style and palette choices
stop reading is not more photoreal, it is just darker. The tone curve went back to ACES; the
accent chroma gain it exposed stayed, because it earns its place on its own terms.

## Byte cost

+21.2 KB raw / +6.8 KB gzip for the canvas material pass (measured 1177.1 / 314.3, budgets
raised 310 -> 318 gzip). Still zero image assets: every map is drawn on canvas at runtime.

The Stills panel then added +1.8 KB raw / +1.3 KB gzip of *interface* (measured 1181.8 /
315.5). It is gone: the in-app pass below replaced it with a capture of the team's own hotel,
which **deleted** its three JPEGs (522 KB) from the repo.

The in-app realism pass is +12.4 KB raw / +4.5 KB gzip (measured **1194.2 / 320.0**, budgets
raised 1184 -> 1200 raw and 318 -> 324 gzip, flagged for approval rather than absorbed).
That is the crown geometry, the hip-roof pavilion, the ground rebalance, the fog and shadow
work, the accent chroma gain, and the capture panel with its styles. Every byte of it is
code; the renderer still ships no image assets at all, so a palette switch, a style change
and a capture all cost zero network requests.


## Render set (Workspace 12) — full-frame passes on the built game

Model ids matter, not names: `i2i-elote-gateway` is Nano Banana 2.1 image-to-image and
`i2i-gemini-3-pro` is Nano Banana Pro. Passing the display name (`t2i-nano-banana-2.1`)
returns a 400 listing the accessible ids — that is what made it look as though Workspace 12
had no Nano Banana.

What the passes establish, measured on a 64x32 luminance signature against the source:

| Render | Model | Structural r | Mean RGB |
|---|---|---|---|
| court | NB 2.1 | **0.824** | 182,174,152 -> 175,163,144 |
| fit wide | NB Pro | 0.316 | 185,184,161 -> 183,176,162 |
| fit wide dusk | NB 2.1 | 0.421 | 68,44,27 -> 69,72,82 |

Calibration for those numbers: the same camera in day and dusk scores **0.648**, and a
genuinely different camera scores **0.19**. So 0.824 is at least as faithful as a relight,
and 0.421 is not.

Two reproducible findings:

1. **`i2i-elote-gateway` preserves framing exactly** — output 2978x1408 against a
   2509x1186 source, both 2.115:1. `i2i-gemini-3-pro` returns 3168x1344 (2.357:1) even with
   `aspect_ratio: auto`, so it reframes. Use NB 2.1 for a matched set of stills; use Pro only
   when a reformat is acceptable.
2. **Neither model reliably obeys a colour instruction on a dark frame.** The dusk source is
   warm amber (mean B=27); the first dusk pass returned cool blue (mean B=82), i.e. blue hour.
   A prompt with an explicit colour lock and `thinking_level: HIGH` was required. Any dark or
   graded pass needs its mean RGB checked, not just its subject.

Outputs of `i2i-*` runs land under `node-inputs/...` and are **unwatermarked**; the earlier
`node-outputs/wm-...` batch was watermarked. Watermarking follows the model/route, not the
account.

Evidence: `review/flora-render/`, with the sources alongside as `review/tex-after-*.png`.

## Shipped: Capture — the panel renders the team's own hotel

The FLORA renders were a **reference atelier, not pixels**. Three of them did ship for a while
as a labelled **Stills** panel (`#btnStills`), on the argument that a labelled illustration is
honest; the label was load-bearing precisely because the panel showed a demo build and every
team assembles a different hotel. That is a claim the app can only keep honest, never make
true — so the panel is gone, and what replaced it does not need the disclaimer.

`view.capture()` renders **the live scene** at twice the pixel ratio: raise the ratio (never
the CSS size, so the framing is identical to what the user is looking at), render once, read
the canvas in the same task, restore. No `preserveDrawingBuffer` — that would cost every frame
of the normal path for one screenshot. The grid, the selection plate and any pending ghost are
hidden for the shot, because they are tools rather than building. The panel shows the frame,
its pixel size, and a download of the same image named after the hotel and the team.

The three JPEGs are deleted from the repo (522 KB), and the eleventh gate changed with them:
`tools/capture-check.mjs` types a hotel name into the lobby and then looks for that name in
the capture's own alt text and note. A render of a demo build cannot contain a name the
session invented, and the gate also decodes the capture and measures its colour spread, so a
blank canvas buffer — the failure mode of a broken `toDataURL` — fails the gate rather than
shipping as an empty panel.

Decisions worth keeping:

- **Nano Banana 2.1 for the reference set.** Pro reframes (2.357:1 against 2.115:1), so a
  mixed-source gallery has visibly different framings in one grid. Day plates are
  frame-preserving; the dusk pair needed the colour-locked v2 to avoid the blue-hour flip.
  This still matters for future reference work, even though no FLORA output ships now.
- **Deferred work, asserted.** The panel used to defer its images; now there are none to
  defer, and the gate asserts the stronger property instead: **zero** image requests in the
  whole session, before and after the panel opens. A baked asset creeping back in fails.
- **A capture is a picture of the hotel, not of the tools.** The grid, the selection plate and
  a pending ghost are hidden for the shot and restored after it — otherwise the "still" would
  carry a translucent gold plate and a dashed grid across the building.
- **Only faithful reference frames were ever considered.** The Pro wide pass scored 0.316 with a
  reframe; it stayed evidence in `review/`. A still that is not faithful to the build it claims
  to illustrate is worse than no still — which is the argument that ended the panel entirely.

