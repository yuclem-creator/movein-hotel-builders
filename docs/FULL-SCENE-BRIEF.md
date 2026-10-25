# Full-scene fidelity — executing brief

Root: C:\Users\clementy\.kimi-code\hotel-builders
Read docs/FIDELITY-CONTINUATION.md FIRST for latest tested state. This supersedes the hall-only
ARCH-HANDOFF.md and conflicting older briefs. No email automation or Telegram actions.

## Objective and approvals
Improve the LIVE interactive 3D scene to the construction/material/lighting quality cues in
https://app.flora.ai/projects/ns7f9jew34edtpbq2sn94jn9w18gsecw . Not a still-image substitute.
Preserve architecture identities, massing, storeys, layout, planting positions, buildable footprints,
routes, picking, gameplay and js/sim/. Fix occluded existing elements, then enrich them.
Scope: all ten archetypes/three styles, trees, shrubs, planters, lamps, benches, quay, water, lighting.
Approved 2026-10-25: 1260 KiB raw / 345 KiB gzip critical code; 320 KiB deferred maps; $5 FLORA
reference cap (old hall ledger $0.156), quote before spend; desktop/projector AO, light phone path;
visual checkpoints with Clement. No further budget raises, no gate relaxation, no baseline regeneration.
No new frameworks, Python, Blender or .ps1 files. Use established Three.js core and Playwright tools.
Runtime surfaces procedural or licensed CC0 only; never substitute FLORA pixels for the user's build.

## Repair checkpoint before references
Old tools/arch-shot.mjs hid unnamed sun/hemi lights. review/arch is historical under-lit evidence.
Corrected output: review/arch-v2 plus JSON pre-flight reports. Preserve originals.
The common 0.34 m base buried pool water (0.26 m), loungers (0.30 m), spa water (0.19 m).
Corrected low terrace base must pass all styles/orientations without altering placement or simulation.
Tools/arch-scene.mjs shares light/texture/bounds/water checks with tools/arch-check.mjs.
Tools/verify.mjs runs package.json's canonical chain; do not use the stale ignored review/verify.mjs.

## Reference workflow
- Prove rooms, public/colonnade, pool pilot first; no giant generation batch before this loop works.
- Facade view for windows/columns, corner for roof/plant/pool; all target features visible in source.
- Record source hash, camera, prompt, parameters, model, run ID, URL, cost and acceptance reasoning.
- Existing sig.mjs --min 0.75 --max-colour 30 is a reference screening check, NOT a fidelity score or
  proof of geometry. Relighting affects correlation. Inspect layout/counts/silhouettes separately;
  never silently lower thresholds. Two failed reference attempts => quarantine and escalate that scope.
- Write construction rows with dimensions/material/builder/evidence/test for accepted targets.
- Historic hall references show useful construction detail but cannot set correct-lighting baselines.
- Prepare further building/style references incrementally; do not block all coding on every image.

## Workstreams (each ends in tests, frames and explicit visual review)
W0: reliability, negative regression tests, corrected source shots and performance baseline. Record
physical dimensions separately from rotated bounds/contact decals. Measure whole balanced/revenue
scenes with shadows settled. Software rasterisation is not real GPU/phone performance evidence.

W1: shared construction builders: bevels, soffits/fascia, hip/ridge caps, window recesses/frames,
mullions/sills, cornices/plinths, column bases/capitals, louvred plant, coping/parapets. Pilot first.

W2: hall, rooms, public, people, BOH, spa, plant, kiosk, shed, pool; heritage then courtyard/tower.
Check all existing green roofs, sizes, storey variants and add-ons. Do not imitate AI-invented wings,
windows or storeys. A square hip has an apex, not a long ridge.

W3: foliage silhouettes and layered/instanced leaves, shrubs, planters/tree pits. Preserve planting
positions/identities; density/overdraw must scale with quality. No giant trees added to fake realism.

W4: lamps/benches/bollards, quay joints, pool coping and existing water. Preserve routes and layout.
Water must be exposed and read as water, not a metallic slab.

W5: reversible, measured desktop AO prototype. No dark halos, UI occlusion, double contact shadows,
transparency errors, broken capture or resize. Phone gets corrected geometry/material identity with
lighter lighting. Do not promise a tiny shader automatically equals production-quality AO.

W6: texel scale/roughness/repetition and overall integration. Restrained MO palette/gold; day/dusk,
all palettes, gameplay cameras and user-built layouts. No bloom/DOF/grain used to hide bad geometry.

## Integration constraints (verified, not folklore)
- Per-building materials are disposed via userData.dynamic. Keep new materials owned by the kit;
  clone deliberately and test rebuild/ghost disposal. Shared resources must not be disposed twice.
- When replacing painted windows, remove all corresponding painted albedo/bump/roughness/emission,
  preserve plain plaster texture grain and intentional dusk illumination. Do not make smooth blank walls.
- Existing visual-check counts >=10 accent-coloured meshes. Preserve its contract; if batching changes
  representation, flag the conflict rather than weakening assertions or adding dummy meshes.
- buildMassing's final traverse overrides castShadow from geometry.parameters.height. Custom/merged
  geometry needs explicit shadow intent; otherwise details unexpectedly cast and raise shadow cost.
- Preserve uid/kind tagging, ghost transparency and pick resolution for instanced/merged objects.
- Brand gate currently scans CSS/HTML/main.js, NOT the renderer. A green gate does not validate new
  3D colours. Reuse kit colours and inspect palette-driven surfaces separately.
- Deferred-map budget currently counts JPG only. If adding PNG/WebP leaf atlases, extend accounting
  and loaded-asset checks so all shipped image bytes count; do not exploit the extension blind spot.
- Do not equate a coarse-pointer test with device performance; touch laptops must not lose desktop
  quality. Preserve baseline heuristic until a measured adaptive strategy is tested.

## Acceptance and delivery
Run `node tools/verify.mjs` from the root: existing eleven gates plus arch-check. Unknown subset names
must fail, never silently run zero gates. Keep all test exit codes/logs. Further shader/foliage changes
need their own failure tests. Existing calls <=+10%, triangles <=2.5x limits remain until explicitly
reviewed; report separate beauty/shadow/post-pass costs, don't hide them in a different measurement.
Capture matched gameplay-wide, facade, close, roof and dusk frames, plus a brief orbit/zoom inspection.
Use identical resolution/camera/lighting for comparisons, freeze labels/layout and test new user builds.
Evidence must list what is STILL wrong. Tests passing is not Clement's visual acceptance.
Record each checkpoint in docs/CHECKPOINTS.md: exact changes, tests, bytes, frame paths, reference run
IDs/spend, performance, known defects, review status and next action. Commit safe checkpoints locally;
push approved checkpoints with exact files after tests. Do not claim a live deploy without hash proof.
Review images are git-ignored: transfer them explicitly for another machine, with source hashes and URLs.

## First DeepSeek assignment
Read this brief and FIDELITY-CONTINUATION.md. Verify W0's real evidence; do not redo completed repairs.
Proceed with only the reference-approved construction rows for the pilot, then stop for Clement's
visual review. Other workstreams stay IN SCOPE, not DONE or silently dropped. If FLORA is unavailable,
continue independent tested infrastructure and request the specific missing references, not guessed art.
