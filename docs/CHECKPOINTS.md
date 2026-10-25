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

## W1 first sample — shared construction detail (2026-10-25)

Implemented the first, deliberately small slice of W1: three reusable builders in a new
`js/render/detail.js`, applied to the two buildings the pilot references cover, heritage style only.

### What was built
| Builder | Rows | What it adds | What it deliberately does NOT change |
|---|---|---|---|
| `columnTrim` | R1, P1 | Square plinth + abacus on every EXISTING column shaft, one instanced batch | Column count, spacing, height, shaft radius, canopy |
| `roofDetail` fascia | R2 | Slim accent fascia band at the existing eave line | Roof footprint, pitch, overhang, storey heights |
| `roofDetail` batch | R2, R3 | Dark soffit slab + hip/ridge caps on the existing roof seams, one instanced batch | Ridge position, apex, finial, slope geometry |

Applied in `roomsHeritage` and in `publicBlock`'s heritage branch. Every other archetype and both
other styles are untouched. `buildMassing`'s final traverse now honours `userData.noShadow`, so a
7-10 cm band cannot cast a full-box shadow.

### Measured result (tools/perf.mjs, heritage/gold, 1440x900)
| Preset | Calls before -> after | Limit +10% | Triangles | Limit 2.5x |
|---|---|---|---|---|
| empty | 60 -> 60 | n/a | x1.00 | n/a |
| balanced | 272 -> 284 (+4.4%) | pass (299) | x1.06 | pass |
| revenue | 203 -> 221 (+8.9%) | pass (223) | x1.08 | pass |
| neglect | 207 -> 222 (+7.2%) | pass (228) | x1.07 | pass |

Bytes: 1198.7 -> 1206.4 KiB raw (+7.7) and 322.2 -> 325.3 KiB gzip (+3.1), inside 1260/345.

**A first attempt breached the budget and was reworked, not accepted.** Splitting the soffit and
the hip caps into separate meshes cost +11.8% calls on the revenue preset, over the +10% limit.
Because the soffit and the caps are both dark boxes in the same material, they were merged into
one instanced batch, which brought every preset back inside the limit. The limit is a stop
condition, so the first version was discarded rather than shipped with an exception.

### Visual result (assistant review, not user acceptance)
`review/arch-v2/rooms-heritage-{facade,corner,roof}.png` and the public set show column feet and
capitals reading at facade distance, a continuous fascia line along the eave, and capped roof
seams. The change is articulation, not transformation: windows are still printed, roof courses are
still texture-only, and the reference's recessed bays (R4), plinth joints (R5) and pool/landscape
rows (P2-P4, L1-L3) are all still TODO. Clement's sign-off is required before expanding scope.

### Corrections found while building
- The caps were first built in `hipRoof`'s local space and added without the roof's own offset,
  which would have placed them on the ground. Fixed by lifting the batch to `roofY`.
- `detail.js` does not import from `massing.js`: the two would form a cycle whose behaviour
  depends on load order. The caller passes its `box` helper and UV tiler in as a `make` object.

## W1 extension — every heritage hip-roofed archetype (2026-10-25)

Extended the same builders to the remaining buildings, then fixed two defects that only appeared
once the trim was applied more widely.

### Extension
- Roof trim moved INTO `roofFor()`, so every archetype that takes its hip roof from that function
  (public, spa, people) is detailed by construction and a new caller cannot forget it.
- `hallBlock` and `kiosk` build their own roofs, so they call `roofDetail` explicitly.
- `fascia: false` for `roofFor` callers: that branch already draws an accent band at the same eave,
  and two bands 0.1 m apart read as one thick cornice while costing a draw call for nothing.
- Column trim still applies only where a colonnade exists (rooms, public).

### Defect 1 — transposed soffit (caught by the architecture test)
For a rectangular plan the batch is built in the roof's own frame and rotated 90 degrees. The soffit
was sized `roofW x roofD` instead of `W x D`, so a 5.9 m roof produced a 12 m slab. `arch-check`
failed on `spa/heritage/swapped ... bounds exclude contact` and named it.

### Defect 2 — soffit floating above the roof (caught only by looking at a frame)
The soffit's Y was expressed in the WALL frame while the whole batch is lifted to the roof's
position, so it landed at `h - 0.145 + roofY`: above the roof on every archetype. On the shallower
public roof it was buried inside the hip and invisible; on the tall hall roof it appeared as a
full-footprint slab covering the building. **Every automated check passed it** — bounds, lighting,
water and picking are all satisfied by a slab in the air. A new `arch-check` assertion now requires
that the trim never rises above the roof and that the soffit sits below it, so this class of defect
cannot return silently.

### Measured result after the extension (tools/perf.mjs, heritage/gold)
| Preset | Calls before -> after | Limit +10% | Triangles | Limit 2.5x |
|---|---|---|---|---|
| empty | 60 -> 60 | n/a | x1.00 | n/a |
| balanced | 272 -> 290 (+6.6%) | pass (299) | x1.08 | pass |
| revenue | 203 -> 220 (+8.4%) | pass (223) | x1.08 | pass |
| neglect | 207 -> 221 (+6.8%) | pass (228) | x1.07 | pass |

Bytes 1207.9 KiB raw / 325.8 KiB gzip, inside 1260/345. `arch-check` 30/30.

### Honest limits of this checkpoint
- **The published commit `15d5b02` contains defect 2** (a floating soffit above the rooms and public
  roofs). It was published before the frame was inspected. This checkpoint corrects it and must be
  published promptly.
- Visual confirmation of the corrected frames is **outstanding**: the image channel refused further
  images part-way through this session, so the fix is verified numerically (30/30, including the new
  under-roof assertion) but not yet seen. Frames exist at `review/arch-w1-prev/*.jpg` (post-fix) and
  `review/arch-v2-prev/*.jpg` (pre-W1).
- A process error of mine, repeated three times: previews were generated in the same batch as the
  render that overwrites the PNGs, so the preview showed the previous frame. Generate previews in a
  separate step after the render completes.
