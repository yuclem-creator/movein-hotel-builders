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

1. **Hip-roof UVs.** The pitched roofs project their tiling as a fan/diamond, so courses run
   diagonally instead of parallel to the eave. The single most obviously synthetic surface
   left in the wide shot. Fixing it means replacing the cone UV projection in
   `tileConeUV` with a per-face planar projection.
2. **Tree crowns** now have an irregular silhouette but still read as clustered spheres at
   close range, not foliage.
3. **No ambient occlusion.** Buildings meet the paving with a hard edge and only a painted
   blob shadow under them; FLORA's images had soft contact darkening everywhere.
4. **Ground** low-frequency variation is doing too much work at the establishing camera and
   reads as dune-like patches rather than dry grass.

## Byte cost

+21.2 KB raw / +6.8 KB gzip (measured 1177.1 / 314.3, budgets raised 310 -> 318 gzip).
Still zero image assets: every map is drawn on canvas at runtime.
