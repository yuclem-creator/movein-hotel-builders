# Pilot construction-detail ledger — 2026-10-25

Read FULL-SCENE-BRIEF.md first. Evidence lives under
C:\Users\clementy\.kimi-code\hotel-builders\review\arch-ref-v2\ (references) and review\arch-v2\
(sources). IDs, URLs/hashes and numeric results are in PILOT-REFERENCES.json.

## Review verdict
All three numeric reference screens pass. These are **selective detail references**, not accepted
whole-frame replacements. No feature may move to match an AI invention. Clement's visual sign-off
is still pending; this document is the assistant's technical/visual assessment, not his approval.

| Reference | Structure | Worst RGB delta | Exclusions (do not implement) |
|---|---:|---:|---|
| rooms-heritage-pilot.jpg | 0.8875 | 21.62 | invented background scrub; stronger/different shadow appearance, water retone; do not copy AI opening rhythm |
| public-heritage-pilot.jpg | 0.8395 | 25.31 | gold bollards changed to stone, apex cap omitted, lighting/sky and trim tones changed; keep original cap, gold, columns and openings |
| pool-heritage-pilot.jpg | 0.8186 | 10.02 | raised deck/step exaggerated, water depth/basin shape implied rather than source-grounded; do not enlarge platform or pool |

No new runs are needed to extract the rows below. None of these rows is implemented yet.
Dimensions below are **engineering starting ranges**, not measurements extracted from the AI image.
Authoritative placement/scale/counts come from existing code, not from counting AI pixels.

## Authoritative existing scene dimensions
- Rooms: plot 16 x 12 m; body 15.5 x 11.5 m; roomsHeritage sets h=storeys*1.5, roof rise 2.6.
  Column count max(3,round(w/1.5)) = 10 for this source. Preserve positions and canopy envelope.
- Public (front office): plot 12 x 8 m; body 11.5 x 7.5 m; heritage h=storeys*1.5*0.8.
  Existing column count max(3,round(w/1.6)) = 7. Preserve both visible roof/trim tiers.
- Pool: source placement is swapped, plot 8 x 12 m; body 7.5 x 11.5 m. Water is 0.66w x 0.62d,
  centre x=-0.1w, top y=0.26. Three parasols and three loungers; same locations and outlines.
- Window rhythm is defined by paintFacade/FACADE_LOOK, its 4x4 tile and tileBoxUV phase. Derive
  openings from those exact rules for each face, including edge clipping; do not invent a new grid.

## W1 first sample: exterior trim/columns, then one matched facade
Start with independently testable shared geometry; measure full balanced/revenue performance first.
Reuse kit materials, preserve UID picking/ghosts and material ownership. Batch repeated pieces without
evading the existing accent-mesh gate. Distinguish beauty, shadow and post-pass costs.

| ID | Source -> reference cue | Builder / conservative starting range | Required test | State |
|---|---|---|---|---|
| R1 | plain shafts -> articulated foot/capital | columnDetail: preserve shaft, position/height/count; base/capital within roughly 1.2-1.4x existing shaft diameter, 0.04-0.10 m stepped bands | all ten source columns retained; no floating foot or canopy intersection; side silhouette | SAMPLE DONE (rooms heritage); other archetypes/styles TODO |
| R2 | zero-thickness roof edge -> fascia/soffit shadow line | eaveDetail on EXISTING overhang, 0.05-0.10 m fascia thickness; roof pitch/span unchanged | matched roof boundary, no broad new gold plate; day/dusk | SAMPLE DONE (rooms heritage); other archetypes/styles TODO |
| R3 | roof seams -> restrained hip/ridge caps | follow hipRoof endpoints; roughly 0.08-0.14 m cap width, no new crest or finial | rectangular vs square cases, normals/UVs, no seam gaps | SAMPLE DONE (rooms heritage); other archetypes/styles TODO |
| R4 | printed windows/rails -> recessed bay assembly | windowBay/rail, 0.08-0.15 m reveal depth, 0.03-0.05 m frames; real apertures or segmented walls (glass cannot sit behind an uncut solid wall) | source opening count/UV phase, no duplicate albedo/bump/roughness/emissive windows; correct dusk | TODO |
| R5 | flat base/plaster -> bevelled joints and grain | retain current plinth height/extent; shallow joint/edge relief, preserve plaster map, colour and scale | no doubled slab; tiling/palette and building bounds | TODO |
| P1 | plain columns -> layered circular bases/capitals | reuse R1, scaled to existing public shaft, seven columns; no thicker replacement shafts | original column count, centres, heights; approach/picking unchanged | SAMPLE DONE (public heritage); other archetypes/styles TODO |
| P2 | simple cornice -> multiple narrow stepped profiles | corniceDetail within existing envelope, starting layers 0.03-0.08 m; preserve gold bands | both tiers and apex cap retained; no increased roof footprint | TODO |
| P3 | flat glass ribbon -> frames/reveals, contact shadow | derive pane boundaries from source; 0.03-0.05 m frames, depth <=0.12 m | avoid doubled printed windows; occlusion/transparent sorting and dusk | TODO |
| P4 | painted stone base -> fine joints, bevel highlights | reused kit stone and fine coursing, not heavy dirt or a new palette | gold bollards unchanged, no new access steps, correct texel scale | TODO |
| L1 | stripe-like flat pool -> finer irregular ripples/reflection | water normal/material tuning within existing basin/top surface; geometry and water colour remain source-led | water visible at orbit angles, no flicker/metal lid, bounded shader cost | TODO |
| L2 | flat border -> narrow jointed coping | perimeter strips matching existing border extents, small 0.01-0.025 m bevels; no solid gold plane under water if it spoils transmission | no occlusion, pool/deck unchanged; negative ray regression | TODO |
| L3 | polygon cones/blocks -> restrained fabric/frame relief | parasol ribs/folds + lounger frames INSIDE existing envelopes, preserve all six prop centres | no count/scale change, no floating feet or overdraw explosion | TODO |

## Review protocol
Three matched views per sample (facade, corner, roof), dusk and an orbit inspection. Report still-wrong
details honestly. Numeric similarity alone cannot approve these samples. W0 source fixes remain valid;
do not undo them to chase an AI target. Stop for Clement after the first W1 sample, then expand the
rest of the full-scene programme. Maintain counts/layout and simulation baseline throughout.


## Deferred: flat-roof eave depth, blocked by the draw-call limit (2026-10-25)

Attempted and **reverted, not shipped**. Every flat-roofed archetype in every style builds its roof
through one function (`copedRoof`), which today draws a zero-thickness coping ring plus a deck — the
same "box with a lid" edge the references do not have. Adding the missing underside there would
cover tower and courtyard in one call site, which is why it is worth doing properly.

Measured cost of a separate dark soffit mesh (tools/perf.mjs, whole scene, limit +10% calls):

| Style | balanced | revenue | neglect |
|---|---|---|---|
| heritage | +6.6% pass | +8.4% pass | +6.8% pass |
| tower | +5.1% pass | **+11.3% BREACH** | **+11.6% BREACH** |
| courtyard | **+12.9% BREACH** | **+11.3% BREACH** | +8.2% pass |

Sharing the deck's own geometry in one instanced batch recovered about six calls but did not clear
the breach, so the change was reverted rather than shipped with an exception, and the dark soffit
tone stays deferred.

### The decision this needs
The +10% call limit was set for a small detail pass. It is now the binding constraint on the rest of
the programme, and **it cannot be satisfied by trimming the work**: the remaining rows (recessed
window bays, plinth courses, pool coping, foliage, ambient occlusion) all add geometry. Two options,
and this is Clement's call, not the implementer's:

1. **Raise the call limit for the full programme** and state the new ceiling, accepting that a
   richer scene costs more per frame; or
2. **Authorise a merging pass first** — instancing the per-storey accent bands and other repeats,
   which the plan anticipated ("merging should reduce them") and which would buy back headroom
   before more detail is added. Note the risk: `visual-check` requires the palette accent on at
   least 10 separate meshes, so merging accent geometry can breach that check and it must not be
   relaxed.

Until one is chosen, further W2 coverage should not be attempted, because every attempt will either
breach the limit or be reverted.
