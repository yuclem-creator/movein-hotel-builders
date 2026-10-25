# Checkpoints — full-scene fidelity

## W0 source-pipeline repair — 2026-10-25 (review pending)
Base revision 5e6dbab. This is a repair checkpoint, NOT a claim of FLORA-level quality.

### Implemented
- Isolation affects world content only: sun/hemi retained, hidden unrelated practicals stay hidden.
- Missing lights/failed textures now throw before any evidence is accepted.
- Pool/spa base lowered from 0.34 m to 0.08 m; other archetypes and simulation untouched.
- Physical plot, authored body, local solid bounds and world solid bounds reported separately;
  contact decals excluded. JSON includes camera/lighting/texture/water evidence per archetype.
- Corrected PNGs go to review/arch-v2; old review/arch is preserved as under-lit history.
- New arch-check regression suite in package.json verify; portable tools/verify.mjs reads that chain.
- Full-scene approval saved in FULL-SCENE-BRIEF.md; hall-only handoff marked superseded.
- Upload tool can read an ephemeral descriptor from environment (FLORA_UPLOAD_DESCRIPTOR, '-' path),
  so signed credentials need not be stored on disk. No signed descriptor was written in this pass.

### Verification complete
- Before runtime fix: 12 water-visibility checks failed against actual production geometry.
- After fix: 27/27 architecture checks pass, including all styles, swapped footprints, placement
  immutability, missing-light/texture negative cases, and bounds excluding contact.
- Corrected rooms/public/pool/spa: all four cameras saved, 8/8 textures loaded, sun/hemi visible,
  zero browser console errors; pool/spa low-side water rays see water, not the base slab.
- Full package chain: **CHAIN-GREEN, all 12 suites exit 0** (syntax, sim, arch, brand, bytes, QR,
  smoke, visual, input, team, classroom, capture). No gate thresholds loosened; simulation unchanged.
- After final tool/document edits: fast syntax/arch/brand/bytes chain green; arch-check 27/27 rerun green.
- Upload environment-descriptor path dry-run exit 0; no network submission. Unknown verify gate exits 1.
- Durable local logs copied to review/repair-evidence (git-ignored; transfer with frames on handoff).
- Measured current bytes: 1198.7 KiB raw / 322.2 KiB gzip; maps 222.2 KiB. Limits 1260/345/320.

### Visual inspection of corrected sources (not user acceptance)
Rooms/public: normal direct illumination and cast shadows restored; windows still texture-printed,
roof/cornice profiles crude. Public facade has oversized trim. Pool water/loungers are visible again,
but water still reads as a flat sheet, and parasols are low-poly. Spa needs a side-focused view of the
courtyard: the corner frame is roof-dominated even though the visibility probe passes.
Do not claim these frames match FLORA yet. No frame has Clement's final visual acceptance.

### Pilot source files (not yet uploaded/generated)
Paths below relative to C:\Users\clementy\.kimi-code\hotel-builders\review\arch-v2:
- rooms-heritage-facade.png — SHA256 6A5C8B6CD8EBF03919BB9056E1DE0B234D7B40DE1E1980D07C2BE1ADBC92DC38
- public-heritage-facade.png — SHA256 E37431121ADFFD1A51089E8A0FD9C9A10DF016ED7F32C8AD1EB5E687FD29B77A
- pool-heritage-corner.png — SHA256 EED6E006680C22250C7096172FC18235F8FA32FBF3AF0ECEDC90CBC772031B68

### FLORA stop / spend
Initial three signed upload reservations succeeded. No image bytes submitted, no completion, no runs.
The middle descriptor was truncated by the tool-result transport. A single-source reservation attempt
was rejected for source+sources schema ambiguity; a corrected one-entry batch then returned
`MCP error -32000: fetch failed`. Stopped FLORA operations rather than looping or generating bad inputs.
New generation spend: $0. Prior hall ledger: $0.156; cap $5. No new run IDs exist.
Pending known reservations (do not treat as ready; reserve fresh on resumption if expired):
- rooms asset_jd7b8heksvvw5j5vz6z2e664h58gyppm
- pool asset_jd7f9rp9hsc97fq3rnkc0zbmj18gysh2
Public reservation ID was not recovered from the truncated payload. Do not invent it.

### Next exact action
Local repair gates complete. Once FLORA access is restored: obtain fresh reservations for
these three verified source files, upload/finalise, quote all three exact generation requests, then run.
Score AND visually review outputs before writing pilot construction rows. Do not reshoot valid sources
or rerun paid batches without checking stored run IDs. No fidelity-detail implementation is complete.

### Delivery status
Save this as a local repair commit; do not publish to the live pilot while the FLORA pilot and
Clement's visual review are outstanding. Existing live site remains unchanged. W0's full-scene
GPU/performance baseline remains pending; isolated-shot counters are not that measurement.
