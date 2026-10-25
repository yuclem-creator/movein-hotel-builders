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

### Pilot source files (uploaded, finalised and generated; see pilot checkpoint below)
Paths below relative to C:\Users\clementy\.kimi-code\hotel-builders\review\arch-v2:
- rooms-heritage-facade.png — SHA256 6A5C8B6CD8EBF03919BB9056E1DE0B234D7B40DE1E1980D07C2BE1ADBC92DC38
- public-heritage-facade.png — SHA256 E37431121ADFFD1A51089E8A0FD9C9A10DF016ED7F32C8AD1EB5E687FD29B77A
- pool-heritage-corner.png — SHA256 EED6E006680C22250C7096172FC18235F8FA32FBF3AF0ECEDC90CBC772031B68

### Historical upload blocker (resolved)
Earlier reservations/fetch failure were superseded by successful HTTP 204 uploads. Repeated direct
MCP finalisation calls incorrectly sent BOTH mutually exclusive identifier fields; they did not
finalise anything. A local client call with asset_ids only returned HTTP 200 and ready for all three.
Do not reuse the earlier abandoned reservation IDs. Current asset IDs are in PILOT-REFERENCES.json.

### Next exact action
Local repair and three-image reference loop complete. Implement the reviewed construction cues in
PILOT-DETAIL-LEDGER.md after recording full-scene performance. Do not reshoot valid sources or rerun
paid batches; all three outputs already exist. No fidelity-detail implementation is complete.

### Delivery status
Source repair saved as local commit 9a2112d. Do not publish to the live pilot while
Clement's visual review is outstanding. Existing live site remains unchanged. W0's full-scene
GPU/performance baseline remains pending; isolated-shot counters are not that measurement.

## Pilot reference / connector checkpoint — 2026-10-25
- All three input assets are ready. No re-upload was needed to resolve finalisation.
- Exact three-request quote $0.156; generation charged $0.156. All exact run IDs completed.
- Tracked architectural-reference total: $0.312 including the previous $0.156 hall ledger.
  This is not an organisation-wide usage total. Do not regenerate the successful batch.
- Rooms: structure 0.8875; maximum colour delta 21.62 (numerical PASS).
- Public: structure 0.8395; maximum colour delta 25.31 (numerical PASS).
- Pool: structure 0.8186; maximum colour delta 10.02 (numerical PASS).
- Visual review: construction cues selectively usable. Rooms invents background shrubs; public
  changes bollards to stone, omits the apex cap, alters lighting/trim; pool exaggerates raised edging
  and water depth. These are NOT approved changes to the game. Preserve source geometry and palette.
- User visual acceptance: pending. No code detail row is marked DONE.
- Public output URLs, exact IDs/hashes and review status: PILOT-REFERENCES.json. Exact submitted
  prompts: PILOT-PROMPTS.json. All plates are text/logo/scrim-free reference images, not runtime assets.

### Permanent connector fix and tests
Canonical installed connector: C:\Users\clementy\Documents\Cline\MCP\flora-mcp\ .
Added asset-tools.mjs, asset-tools.test.mjs, asset-tools.smoke.mjs; integrated in bridge.mjs/call.mjs.
Aliases flora_complete_assets_batch / flora_get_assets_batch expose only asset_ids. Conflicting raw
calls fail locally with -32602; no silently discarded field and no authentication/timeout changes.
Unit tests 7/7 PASS; bridge/call syntax PASS; fresh stdio bridge smoke PASS (live tool discovery,
ambiguous-input rejection and real read-only asset lookup). CLI alias lookup HTTP 200.
The running Cline bridge has not been forcibly killed: reconnect its server to load new aliases.
Current work is already unblocked through the local client. Tests/logs in review/repair-evidence.
