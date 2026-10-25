# Full-scene fidelity continuation — 2026-10-25

Read this FIRST on resumption. It supersedes the hall-only scope/budgets in ARCH-HANDOFF.md.
Root: C:\Users\clementy\.kimi-code\hotel-builders. Base commit: 5e6dbab.

## Approved outcome and limits
- Improve the LIVE interactive scene to the quality cues in the FLORA project, not a still-image substitute.
- Keep footprints, placement, counts, architectural identities, gameplay and js/sim/ unchanged.
- Entire scene: all ten archetypes and three styles, landscape, furniture, water, materials and lighting.
- Approved limits: 1260 KiB raw / 345 KiB gzip critical code; 320 KiB deferred maps.
- Desktop/projector AO only, optional quality downgrade; phones retain the lightweight path.
- FLORA reference-generation cap $5; prior hall ledger reports $0.156. Quote before spending.
- Visual checkpoints with Clement. No email automation or Telegram actions.

## Historical start state (before the repair checkpoint)
- Disk blocker resolved: about 11.6 GiB free; do not delete unrelated files.
- tools/bytes.mjs approved limits edited locally; tools/preview.mjs new, uncommitted.
- 40 heritage PNGs complete, but generated with a BROKEN isolation harness (sun/hemi hidden).
- Existing hall FLORA refs are historical construction-detail evidence, not correct-lighting baselines.
- No new FLORA uploads/generations for the expanded scope yet; no fidelity geometry library yet.
- Historical at start: ARCH-HANDOFF.md was hall-only. Now marked superseded by FULL-SCENE-BRIEF.md.

## Confirmed defects (1-3 repaired; 4 remains an interpretation rule)
1. tools/arch-shot.mjs hides unnamed scene children, including directional and hemisphere lights.
   Isolate world content, preserve global lighting; fail if expected lights or textures are missing.
2. js/render/massing.js adds a 0.34 m solid base to every archetype. Pool water top is 0.26 m,
   loungers 0.30 m, spa water 0.19 m: buried by the base. Give low terraces an appropriate base;
   retain existing placement/footprint. Regression tests now prove low-side visibility (a spa
   pergola can legitimately obscure a vertical ray).
3. Box3 measurements include the rotated contact-shadow plane. Report authored footprint,
   building-local solid bounds and world solid bounds separately, never call all of them footprint.
4. Numeric luminance correlation detects changes, not quality or geometry correctness by itself.
   Use paired cameras, visual review and explicit scene invariants; never claim a score proves fidelity.

## Execution checkpoint
Status: runtime/source repairs implemented; corrected rooms/public/pool/spa renders verified.
Architecture tests 27/27 pass (12 water failures reproduced before the fix). All 12 regression suites
passed with CHAIN-GREEN. Logs: review/repair-evidence; see docs/CHECKPOINTS.md for exact coverage.
FLORA pilot BLOCKED: initial signed reservations succeeded, but a replacement one-entry reservation
returned `MCP error -32000: fetch failed`. No uploads completed, no generation runs, $0 new spend.
Stop FLORA attempts until access is restored; then fresh-reserve/upload/quote the THREE existing
hashed pilot sources listed in CHECKPOINTS.md. Do not regenerate sources or repeat a paid run blindly.
Current executing brief: docs/FULL-SCENE-BRIEF.md; old hall-only ARCH-HANDOFF.md is superseded.
Old PNGs preserved; corrected shots are review/arch-v2 (four views and JSON pre-flight per archetype).
Spa requires a courtyard-focused side view later; low-side water exposure is tested but corner view
hides the garden behind its roof. No source/ref should be accepted on automated scores alone.

## Delivery workstreams after the pilot
W0 baseline/tests/performance; W1 shared geometry detail; W2 buildings across styles;
W3 foliage/planters; W4 furniture/quay/pool/water; W5 desktop AO; W6 material tuning/integration.
At every checkpoint: tests, bytes, same-camera evidence, calls/triangles, known visual defects, reviewer status.
Do not block all implementation on a giant reference batch: deliver validated building groups incrementally.
No checkpoint is visually accepted until Clement/reviewer says so. Never silently relax gates or budgets.
