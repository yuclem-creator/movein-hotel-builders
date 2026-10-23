# Fidelity gap — the reference renders against the live renderer

Clement's target, stated 2026-10-23: the live 3D should reach the fidelity of the FLORA
reference renders in Workspace 12 (`review/flora-render/`, project
`prj_ns7f9jew34edtpbq2sn94jn9w18gsecw`). This file is the honest inventory: what that
reference actually is, which of its cues are implementable in the live renderer, which
closed, and what each remaining item would cost.

## What the reference is

An image-to-image pass over **our own frame** (`review/shot-fit-heritage-wide.png`) at
2.1k, from a **low architectural 3/4 camera**. It is a photograph of a building that is
mostly ours and partly invented — the planting, the ground cover and the roof colour are
not the site's (`docs/RENDER-REALISM.md`). So it is a reference for **condition**, not for
layout: sun, shadow, contact, material scale, atmosphere.

## The gap, cue by cue

| Cue | Reference | Live before | Live now | Cost |
|---|---|---|---|---|
| Sun elevation | ~26 deg, shadows ~2x object height | 49 deg, shadows 0.87x — near-noon | **26 deg, 2.05x** | 0 bytes |
| Horizontal irradiance | high-key despite the low sun | — | sunI 3.4 -> 5.0 (sin(26)/sin(49) = 0.58) | 0 bytes |
| Contact darkening | under every object | buildings only | **+ trees, lamps, planters, benches** (1 instanced batch) | ~1 KB |
| Paving slab size | ~1.9 m slabs, joints legible | 1.0 m (4x4 slabs on a 4 m tile) | **1.875 m** (tileWorld 4 -> 7.5) | 0 bytes |
| Roof courses | legible slate on the shaded side too | 14% albedo spread: shaded slopes went flat charcoal | **26% spread, stronger slate edges** | 0 bytes |
| Water | sky reflection, fine wind ripple | flat teal sheet, reflection tinted away | **metalness 0.72, near-white base, envMapIntensity 2.4** | 0 bytes |
| Aerial perspective | distance lifts | fog began at 120 m in a 110 m shot | **60 m** | 0 bytes |
| Plinth edge | none visible (paving runs to the water) | razor line on sand, no shadow cast | **base course + cast shadow** | ~0.5 KB |

Also recorded because it was measured wrong first: a low sun does not simply dim the scene.
Vertical irradiance rises as cos(elevation), so sunI 5.0 at 26 degrees put 4.5 on every
sun-facing wall against 2.2 before — the gold fascia went brass-yellow. 4.3 restores the
horizontal/vertical ratio the old sun had.

Measured on the same frames: ground-region variance 138 -> 194, sky mean 173 -> 181,
middle-band variance 1133 -> 1160 — more shadow and more legible slab tone, which is what
"photographic" shows up as numerically. Gold pixels within 34 of #B59060: 20885.

## What is left, and what each one needs

1. **Screen-space ambient occlusion.** The biggest remaining cue. Reference frames darken
   every interior corner — under eaves, inside the colonnade, where roofs meet walls. The
   per-object decals above reproduce contact at the GROUND only. Three is vendored as two
   files (`vendor/three/three.core.js`, `three.module.min.js`) with **no `examples/jsm`**,
   so there is no EffectComposer and no SSAO/GTAO pass to enable. Adding one means
   vendoring the composer plus a shader chain: roughly **40-60 KB raw**, against a
   remaining budget of ~1 KB. This is a decision, not a task: raise the first-load budget
   by ~5% or accept decal-based contact as the substitute.
2. **Camera.** The reference is a low architectural 3/4 with a long lens; the game camera
   is a high aerial (`LIMITS.phi` 0.42-1.24, radius 26-118) because the whole plot has to
   stay legible for a facilitator on a phone, and `visual-check` asserts the composition.
   Fidelity is inherently limited at that altitude — the same materials read better from
   low. Option: a "hero" framing available in **Capture only**, leaving gameplay untouched.
3. **Object and geometry detail.** The reference has colonnades with many columns, deep
   window reveals, coping stones, roof plant with real depth, tree pits, bollards and much
   larger trees. The live model is fewer, chunkier primitives. Cheap in bytes, visible in
   every gate, and the largest remaining work item.
4. **The surroundings.** Outside the plot is a flat sand field; the reference is fine
   gravel and dust with structure at human scale.
5. **Flat roofs.** The membrane roofs still read as lids at the establishing camera.

## What is deliberately NOT adopted

The cold slate roof hue, the invented planting and the changed ground cover — each was
measured as a change to a site fact rather than to its appearance, and the sun position was
rejected as a *still* for the same reason. Lowering the sun in the RENDERER is different:
that makes the game match the reference instead of making a picture lie about the game.

## The honest ceiling

A browser WebGL renderer with no post-processing chain tops out at convincing
architectural visualisation. The reference is a diffusion photo pass. Two paths reach it:

- **Spend the bytes** on a post chain (AO, bloom, depth of field, grain) and accept the
  first-load cost; or
- **Keep the real-time scene as the product** and treat the photo look as an export
  feature: `view.capture()` already renders the team's own build, so a one-click
  image-to-image pass on that capture would produce a genuine photograph of *their* hotel
  — which is what the FLORA project demonstrates today. It costs API money per image and
  it would break the current assertion that the app makes zero image requests, so it is a
  separate, explicit decision.
