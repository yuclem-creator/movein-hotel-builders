// view.js — renderer, camera rig, lighting and picking. The camera is deliberately
// constrained: a facilitator on a phone cannot get lost, and every framing keeps
// the whole plot legible. Showcase mode overrides the rig with a shot list.
import * as THREE from '../../vendor/three/three.module.min.js';
import { SITE, FUNCTION_BY_ID, PLOTS } from '../sim/catalogue.js';
import { isOwned, ownedBounds } from '../sim/engine.js';
import { makeKit, applyDusk, environment, skyBackground, texturesReady } from './materials.js';
import {
  buildTerrain, buildGrid, buildHeritage, buildLandscape, buildSignature, buildPaths,
  buildPlots, buildPlotOffers, cellCentre,
} from './site.js';
import { buildMassing } from './massing.js';
import { createAgents } from './agents.js';
import { createOverlays } from './overlays.js';

const W = SITE.cols * SITE.cell;
const D = SITE.rows * SITE.cell;

/** Camera limits. phi is the polar angle from +Y, so smaller phi = higher camera. */
const LIMITS = { radius: [26, 118], phi: [0.42, 1.24] };

const DAY = {
  // ACES, and the exposure it needs. AgX was tried here and REJECTED ON EVIDENCE: it is
  // the more filmic curve (long highlight rolloff, film-like highlight desaturation) and
  // it looks better in a still, but it compressed exactly the signals this app teaches
  // with. Measured against the same frames: palette separation fell to 2 of 6 pairs (the
  // gate needs 4), tower vs courtyard fell to 3.7 mean pixel difference (floor 4), and
  // ivory paving dropped to 1% of frame (floor 1%). A teaching tool whose style and
  // palette choices stop reading is not more photoreal, it is just darker. The rest of
  // the realism pass — crown geometry, eave-parallel roofs, contact shadow, ground — is
  // independent of the curve and stayed.
  //
  // ACES compresses highlights hard, so an ivory surface needs well over 1.0 of
  // incident light to read as ivory. These values are measured, not guessed: with
  // the earlier sun 1.55 / exposure 1.0 the paving sampled at rgb(169,164,143)
  // instead of the #EDE7DC it is supposed to be.
  //
  // The hemisphere term is lower than it used to be (1.0 -> 0.55) because the
  // environment map now carries the sky ambient AND gives metal something to
  // reflect. The sun is up to compensate, so every face still has a shadow side and
  // the model stops looking like a flat-lit render.
  bg: '#EFE9DF', fog: '#EFE9DF', hemiSky: '#FFF8EC', hemiGround: '#C9C0AE', hemiI: 0.4,
  // A RAKING sun, not a near-noon one: the largest fidelity gap against the reference
  // renders, and arithmetic rather than taste. [42,62,34] is 49 degrees of elevation, so a
  // 30 m tower cast a 26 m shadow; [58,32,30] is 26 degrees and casts 2.05x, which is what
  // puts the colonnade, the eaves and the tree crowns into real shadow. sunI compensates for
  // the horizontal light that a low sun loses: sin(26)/sin(49) = 0.58. Not 5.0 — a low sun
  // does not simply dim the scene, it raises cos(elevation) on every wall, and 5.0 turned the
  // gold fascia brass-yellow and blew the reveals. 4.3 keeps the horizontal/vertical ratio.
  sunColor: '#FFF4E2', sunI: 4.3, sunPos: [58, 32, 30], exposure: 1.01, envI: 0.45,
  // Aerial perspective: the reference frames lose contrast with distance, and a fog that
  // only starts at 160 m does nothing inside a 110 m establishing shot.
  fogNear: 60, fogFar: 320,
};
const DUSK = {
  bg: '#22252A', fog: '#22252A', hemiSky: '#4A5A6E', hemiGround: '#191713', hemiI: 0.22,
  sunColor: '#FFB27A', sunI: 1.15, sunPos: [-54, 20, 44], exposure: 1.12, envI: 0.3,
  fogNear: 45, fogFar: 260,
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
// Coarse pointer AND a narrow viewport. The old test ('ontouchstart' in window) fired on
// every touchscreen laptop, so a 1920px desktop got phone-quality shadows and half the
// pixel ratio for no reason.
const isTouch = () => typeof window !== 'undefined' && !!window.matchMedia
  && window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 900;

export function createView(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch() ? 1.6 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = DAY.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // The site is static and the sun only moves on a day/dusk change, so the shadow
  // map is baked once and re-baked only when something actually changes (rebuild,
  // style, palette, day/dusk). Re-rendering a 2048^2 map every frame to follow a
  // walking figure is the single most expensive thing this scene could do - hence
  // figures deliberately do not cast shadows.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  const scene = new THREE.Scene();
  // A real sky rather than a flat fill. The camera is high and looks down, so the sky is
  // rarely more than a sliver of the frame — but it is what every metal and every pane of
  // glass reflects, and that is where most of the perceived realism comes from.
  scene.background = skyBackground(false);
  scene.fog = new THREE.Fog(DAY.fog, DAY.fogNear, DAY.fogFar);
  // Metals and glass need something real to reflect: without this every gold band
  // renders near-black and reads as brown plastic (see materials.environment).
  scene.environment = environment(renderer, false);
  scene.environmentIntensity = DAY.envI;

  const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 900);

  const hemi = new THREE.HemisphereLight(DAY.hemiSky, DAY.hemiGround, DAY.hemiI);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(DAY.sunColor, DAY.sunI);
  sun.position.set(...DAY.sunPos);
  sun.castShadow = true;
  sun.shadow.mapSize.set(isTouch() ? 1024 : 2048, isTouch() ? 1024 : 2048);
  // Fit the shadow frustum to the plot plus its apron (58 x 46) instead of a +-50
  // square, which spent most of a 2048 map on ground nothing stands on: shadows came
  // out as soft smudges with no contact edge.
  sun.shadow.camera.left = -34; sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 34; sun.shadow.camera.bottom = -34;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 200;
  // Required: three builds the shadow matrices from the camera's projection, and a
  // changed left/right/top/bottom does nothing until the projection is rebuilt.
  sun.shadow.camera.updateProjectionMatrix();
  // Contact edge. normalBias 0.5 pushed the shadow back half a metre along the surface
  // normal to stop acne on the facades, which also lifted the shadow off the wall/ground
  // junction — the "floating building" tell. 0.28 with a slightly shallower depth bias
  // keeps the acne away (the scene is static and the map is baked, so acne shows up
  // immediately in the review frames if it returns) and puts the contact edge back.
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.28;
  scene.add(sun);
  scene.add(sun.target);
  // Two warm practicals, off by day and on at dusk: arrival court and heritage pavilion.
  const arrivalGlow = new THREE.PointLight('#FFC98A', 0, 34, 2);
  const heritageGlow = new THREE.PointLight('#FFC98A', 0, 30, 2);
  scene.add(arrivalGlow, heritageGlow);

  let kit = makeKit('gold');
  let dusk = false;

  const world = new THREE.Group();
  world.name = 'world';
  scene.add(world);

  let terrain = null, grid = null, heritage = null, landscape = null, signature = null, paths = null;
  const buildings = new THREE.Group();
  buildings.name = 'buildings';
  world.add(buildings);

  const agents = createAgents(kit);
  world.add(agents.group);
  const overlays = createOverlays(kit);
  world.add(overlays.group);

  // Bought land, and land for sale. Both are rebuilt from the session, because a
  // purchase moves land from the second group to the first.
  const plotHolder = new THREE.Group();
  plotHolder.name = 'plots';
  world.add(plotHolder);
  const offerHolder = new THREE.Group();
  offerHolder.name = 'plotOffers';
  offerHolder.visible = false;
  world.add(offerHolder);

  const ghostHolder = new THREE.Group();
  ghostHolder.name = 'ghost';
  world.add(ghostHolder);
  /* ------------------------------------------------------------- camera rig */

  const rig = { theta: -0.62, phi: 0.92, radius: 86, tx: 0, ty: 3, tz: 0 };
  const goal = { ...rig };
  let showcase = null;

  function applyRig() {
    const sp = Math.sin(rig.phi), cp = Math.cos(rig.phi);
    camera.position.set(
      rig.tx + rig.radius * sp * Math.sin(rig.theta),
      rig.ty + rig.radius * cp,
      rig.tz + rig.radius * sp * Math.cos(rig.theta),
    );
    camera.lookAt(rig.tx, rig.ty, rig.tz);
  }

  /** Fraction of the frame width the owned bounding box spans, right now. */
  function projectedFill(b, cam) {
    let min = 1e9, max = -1e9;
    const v = new THREE.Vector3();
    for (const c of [b.col0, b.col1 + 1]) {
      for (const r of [b.row0, b.row1 + 1]) {
        for (const y of [0, 12]) {
          v.set(c * SITE.cell - W / 2, y, r * SITE.cell - D / 2).project(cam);
          min = Math.min(min, v.x);
          max = Math.max(max, v.x);
        }
      }
    }
    return (max - min) / 2;
  }

  function fit() {
    showcase = null;
    // A tall window shows the plot's height; an ultrawide one only adds empty ground
    // either side of it. Zoom in as the frame gets wider so the hotel keeps roughly
    // the same share of the picture, and never closer than a phone already was.
    const zoom = clamp((camera.aspect || 1.6) / 1.6, 1, 1.3);
    goal.theta = -0.62; goal.phi = 0.92; goal.ty = 3;
    if (!lastSession || !(lastSession.plots || []).length) {
      // Untouched site: exactly the original framing, so every existing frame and
      // measurement stays comparable.
      goal.radius = 80 / zoom;
      goal.tx = 0; goal.tz = 0;
      return;
    }
    // Expanded site: frame the land the team OWNS. The projected span is not a linear
    // function of radius once the camera is tilted over a plane, so solve it by
    // measuring — three iterations land within a percent and there is no magic constant
    // to drift when the camera limits change.
    const b = ownedBounds(lastSession);
    goal.tx = ((b.col0 + b.col1 + 1) / 2) * SITE.cell - W / 2;
    goal.tz = ((b.row0 + b.row1 + 1) / 2) * SITE.cell - D / 2;
    let radius = clamp((80 / zoom) * ((b.col1 - b.col0 + 1) / SITE.cols), LIMITS.radius[0], LIMITS.radius[1]);
    for (let i = 0; i < 3; i++) {
      goal.radius = radius;
      Object.assign(rig, goal);
      applyRig();
      const fill = projectedFill(b, camera);
      if (!fill) break;
      radius = clamp(radius * (fill / 0.78), LIMITS.radius[0], LIMITS.radius[1]);
    }
    goal.radius = radius;
  }

  /**
   * Keep the shadow frustum tight to the land the team owns. It grows with a purchase
   * and never shrinks below the original 34, so buying land cannot make the shadows on
   * the original plot coarser than they were.
   */
  function fitShadow(session) {
    if (!session) return;
    const b = ownedBounds(session);
    const half = Math.max(34,
      Math.abs(b.col0 * SITE.cell - W / 2) + 8,
      Math.abs((b.col1 + 1) * SITE.cell - W / 2) + 8,
      Math.abs(b.row0 * SITE.cell - D / 2) + 8,
      Math.abs((b.row1 + 1) * SITE.cell - D / 2) + 8);
    sun.shadow.camera.left = -half;
    sun.shadow.camera.right = half;
    sun.shadow.camera.top = half;
    sun.shadow.camera.bottom = -half;
    sun.shadow.camera.updateProjectionMatrix();
  }

  /**
   * Orbit to a point. `ty` is the height of the point being orbited: it defaults to the
   * eye-level target a tap uses, but a roof pass has to aim at the roof — aiming a
   * seven-storey wing at the pavement leaves the deck against the top edge of the frame
   * however far back the camera is pulled.
   */
  function focusOn(x, z, radius = 34, phi = 0.74, ty = 2) {
    showcase = null;
    goal.tx = x; goal.tz = z; goal.ty = ty; goal.radius = radius; goal.phi = phi;
  }

  /**
   * Jump the rig to its goal immediately instead of easing there. The easing is right
   * for a person tapping around, but it makes a screenshot depend on how many frames
   * happened to render — which is how a visual test becomes flaky on a loaded machine.
   */
  function snap() {
    Object.assign(rig, goal);
    applyRig();
  }

  /* ------------------------------------------------------------------ input */

  const pointers = new Map();
  let dragging = false;
  let moved = 0;
  let pinchStart = 0;
  let radiusStart = 0;
  let onTap = null;
  let onHover = null;

  const ndc = (ev) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((ev.clientX - r.left) / r.width) * 2 - 1, y: -((ev.clientY - r.top) / r.height) * 2 + 1 };
  };

  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (ev) => {
    canvas.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    dragging = true; moved = 0;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
      radiusStart = goal.radius;
    }
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!pointers.has(ev.pointerId)) {
      if (onHover && ev.pointerType === 'mouse') onHover(ndc(ev));
      return;
    }
    const prev = pointers.get(ev.pointerId);
    const dx = ev.clientX - prev.x, dy = ev.clientY - prev.y;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    moved += Math.abs(dx) + Math.abs(dy);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStart > 0) goal.radius = clamp(radiusStart * (pinchStart / Math.max(1, d)), LIMITS.radius[0], LIMITS.radius[1]);
      return;
    }
    if (!dragging) return;
    goal.theta -= dx * 0.006;
    goal.phi = clamp(goal.phi - dy * 0.005, LIMITS.phi[0], LIMITS.phi[1]);
  });
  const endPointer = (ev) => {
    if (!pointers.has(ev.pointerId)) return;
    pointers.delete(ev.pointerId);
    if (pointers.size === 0) {
      dragging = false;
      // A tap (not a drag) is the placement gesture; the UI decides what it means.
      if (moved < 8 && onTap) onTap(ndc(ev));
    }
    if (pointers.size < 2) pinchStart = 0;
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    goal.radius = clamp(goal.radius * (1 + Math.sign(ev.deltaY) * 0.1), LIMITS.radius[0], LIMITS.radius[1]);
  }, { passive: false });

  /* ---------------------------------------------------------------- picking */

  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPoint = new THREE.Vector3();

  /** What is under this NDC point: a building uid, the heritage pavilion, or null. */
  function pick(nx, ny) {
    raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
    const hits = raycaster.intersectObjects([buildings, heritage].filter(Boolean), true);
    for (const h of hits) {
      let o = h.object;
      while (o) {
        if (o.userData && o.userData.uid) return { uid: o.userData.uid };
        if (o.userData && o.userData.kind === 'heritage') return { heritage: true };
        o = o.parent;
      }
    }
    return null;
  }

  /** The cell under this NDC point, or null when off the plot. */
  function groundCell(nx, ny) {
    raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
    if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return null;
    const col = Math.floor((hitPoint.x + W / 2) / SITE.cell);
    const row = Math.floor((hitPoint.z + D / 2) / SITE.cell);
    const base = col >= 0 && row >= 0 && col < SITE.cols && row < SITE.rows;
    // Owned land and land for sale are both tappable: the first to build on, the second
    // to buy. Land that is neither owned nor for sale is not part of the site.
    const onPlot = base
      || (lastSession && isOwned(lastSession, col, row))
      || PLOTS.some((p) => col >= p.col && row >= p.row && col < p.col + p.w && row < p.row + p.h);
    if (!onPlot) return null;
    return { col, row, x: hitPoint.x, z: hitPoint.z };
  }
  /* ------------------------------------------------------------ scene build */

  let agentsRef = agents;
  let overlaysRef = overlays;
  let lastSession = null;
  let gridVisible = true;
  let expandMode = false;
  let selectedUid = null;

  const selHolder = new THREE.Group();
  selHolder.name = 'selection';
  world.add(selHolder);

  /** Remove a group and free its geometries. Kit materials are shared: never freed here. */
  function disposeGroup(g) {
    if (!g) return;
    g.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const list = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of list) if (m && m.userData && m.userData.dynamic) m.dispose();
      }
    });
    if (g.parent) g.parent.remove(g);
  }

  function clearGroup(g) {
    for (const child of g.children.slice()) {
      g.remove(child);
      child.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (!o.material) return;
        // Per-building facade materials are made during rebuild; the kit's shared
        // ones are reused, so only the ones marked dynamic may be freed.
        const list = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of list) if (m && m.userData && m.userData.dynamic) m.dispose();
      });
    }
  }

  /** Rebuild everything that depends on the session: buildings, landscape, signature. */
  function rebuild(session) {
    lastSession = session;
    clearGroup(buildings);
    for (const p of session.placements) buildings.add(buildMassing(p, session.style, kit));

    // Paving follows the doors the simulation routes people to, so it is rebuilt with
    // the layout rather than with the terrain, and merged into one draw call.
    if (!paths) { paths = new THREE.Group(); paths.name = 'paths'; world.add(paths); }
    clearGroup(paths);
    const paving = buildPaths(kit, session.placements);
    if (paving) paths.add(paving);

    if (!terrain) { terrain = buildTerrain(kit); world.add(terrain); }
    if (!heritage) { heritage = buildHeritage(kit); world.add(heritage); }
    if (!grid) { grid = buildGrid(kit); grid.visible = gridVisible; world.add(grid); }

    // Bought land and land for sale are part of the site, not of the terrain: buying
    // moves a plot from one group to the other, so both are rebuilt with the session.
    clearGroup(plotHolder);
    plotHolder.add(buildPlots(session, kit));
    clearGroup(offerHolder);
    offerHolder.add(buildPlotOffers(session, kit));
    offerHolder.visible = expandMode;
    fitShadow(session);

    disposeGroup(landscape);
    landscape = buildLandscape(kit, session.landscape);
    world.add(landscape);
    disposeGroup(signature);
    signature = buildSignature(kit, session.signature);
    world.add(signature);

    const a = cellCentre(SITE.arrival.col, SITE.arrival.row);
    arrivalGlow.position.set(a.x, 3.4, a.z + 1.4);
    const h = SITE.heritage;
    heritageGlow.position.set((h.col + h.w / 2) * SITE.cell - W / 2, 3.2, (h.row + h.h / 2) * SITE.cell - D / 2);

    // Per-building facades only exist after the loop above, so emission is applied
    // to the scene graph here, not to the kit.
    applyDusk(world, dusk);
    renderer.shadowMap.needsUpdate = true;
    setSelection(selectedUid, session);
  }

  /** Palette switch: new kit, rebuild every holder, then free the old kit. */
  function setPalette(paletteId) {
    const oldKit = kit;
    kit = makeKit(paletteId);
    disposeGroup(terrain); terrain = null;
    disposeGroup(heritage); heritage = null;
    disposeGroup(grid); grid = null;
    disposeGroup(landscape); landscape = null;
    disposeGroup(signature); signature = null;
    world.remove(agentsRef.group); agentsRef.dispose();
    world.remove(overlaysRef.group); overlaysRef.dispose();
    agentsRef = createAgents(kit); world.add(agentsRef.group);
    overlaysRef = createOverlays(kit); world.add(overlaysRef.group);
    if (lastSession) rebuild(lastSession);
    oldKit.dispose();
  }

  function setStyle(styleId) {
    if (!lastSession) return;
    lastSession.style = styleId;
    clearGroup(buildings);
    for (const p of lastSession.placements) buildings.add(buildMassing(p, styleId, kit));
    renderer.shadowMap.needsUpdate = true;
  }

  function setDusk(on) {
    dusk = !!on;
    const L = dusk ? DUSK : DAY;
    // The background is a texture now, not a Color, so it is swapped rather than set().
    // The environment is re-derived from the dusk sky: a warm low sun must light the gold
    // from a warm sphere, which a single shared IBL cannot do without dulling both.
    scene.background = skyBackground(dusk);
    scene.environment = environment(renderer, dusk);
    scene.fog.color.set(L.fog);
    scene.fog.near = L.fogNear;
    scene.fog.far = L.fogFar;
    hemi.color.set(L.hemiSky);
    hemi.groundColor.set(L.hemiGround);
    hemi.intensity = L.hemiI;
    sun.color.set(L.sunColor);
    sun.intensity = L.sunI;
    sun.position.set(...L.sunPos);
    renderer.toneMappingExposure = L.exposure;
    scene.environmentIntensity = L.envI;
    arrivalGlow.intensity = dusk ? 26 : 0;
    heritageGlow.intensity = dusk ? 20 : 0;
    applyDusk(world, dusk);
    renderer.shadowMap.needsUpdate = true;   // the sun has moved
  }

  function setGrid(on) {
    gridVisible = !!on;
    if (grid) grid.visible = gridVisible;
  }

  /** Show the land for sale: dashed outlines only, so it cannot be mistaken for owned land. */
  function setExpandMode(on) {
    expandMode = !!on;
    offerHolder.visible = expandMode;
  }

  /** Translucent plate over the selected footprint. */
  function setSelection(uid, session) {
    selectedUid = uid || null;
    clearGroup(selHolder);
    if (!uid || !session) return;
    const p = session.placements.find((x) => x.uid === uid);
    if (!p) return;
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(p.w * SITE.cell, 0.14, p.h * SITE.cell),
      kit.selected,
    );
    plate.position.set(
      (p.col + p.w / 2) * SITE.cell - W / 2,
      0.07,
      (p.row + p.h / 2) * SITE.cell - D / 2,
    );
    selHolder.add(plate);
  }

  /** Ghost preview of a pending placement, tinted by whether the spot is legal. */
  function setGhost(fnId, session, placement = null) {
    clearGroup(ghostHolder);
    if (!fnId) return null;
    const f = FUNCTION_BY_ID[fnId];
    if (!f) return null;
    // A ghost for an existing building carries its real footprint, size, storeys, style
    // and add-ons, so moving or re-placing a resized wing previews at its true mass.
    const src = placement
      ? { w: placement.w, h: placement.h, rot: placement.rot || 0 }
      : { w: f.w, h: f.h, rot: 0 };
    const g = buildMassing({
      uid: 'ghost', fnId, col: 0, row: 0, w: src.w, h: src.h, rot: src.rot,
      size: placement ? placement.size : 'M',
      storeyDelta: placement ? placement.storeyDelta : 0,
      variant: placement ? placement.variant : null,
      addons: placement ? placement.addons : [],
    }, session.style, kit);
    const clones = [];
    g.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      // Clone so the ghost can be translucent without mutating the shared look.
      // Facades are now per-building materials, so the displaced original must be
      // freed here or it is orphaned on every tool selection.
      const original = o.material;
      o.material = original.clone();
      if (original.userData && original.userData.dynamic) original.dispose();
      o.material.transparent = true;
      o.material.opacity = 0.45;
      clones.push(o.material);
    });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1, 0.12, 1), kit.valid);
    plate.scale.set(src.w * SITE.cell, 1, src.h * SITE.cell);
    plate.position.y = 0.06;
    plate.name = 'ghostPlate';
    g.add(plate);
    g.userData.ghostClones = clones;
    ghostHolder.add(g);
    ghostHolder.visible = true;
    return g;
  }

  function moveGhost(col, row, valid, dims = null) {
    const g = ghostHolder.children[0];
    if (!g) return;
    const f = FUNCTION_BY_ID[g.userData.fnId];
    if (!f) return;
    // A resized building must centre on its OWN footprint: centring a 5x3 wing on the
    // catalogue's 4x3 offset puts the ghost half a cell off the real placement.
    const gw = dims ? dims.w : f.w;
    const gh = dims ? dims.h : f.h;
    const x = (col + gw / 2) * SITE.cell - W / 2;
    const z = (row + gh / 2) * SITE.cell - D / 2;
    g.position.set(x, 0, z);
    // Re-aim at the arrival court: the ghost was built facing it from cell 0,0.
    g.rotation.y = Math.atan2(arrivalC.x - x, arrivalC.z - z);
    const plate = g.getObjectByName('ghostPlate');
    if (plate) plate.material = valid ? kit.valid : kit.invalid;
    ghostHolder.visible = true;
  }

  function hideGhost() { ghostHolder.visible = false; }
  /* --------------------------------------------------------------- showcase */

  const arrivalC = cellCentre(SITE.arrival.col, SITE.arrival.row);
  const heritageC = {
    x: (SITE.heritage.col + SITE.heritage.w / 2) * SITE.cell - W / 2,
    z: (SITE.heritage.row + SITE.heritage.h / 2) * SITE.cell - D / 2,
  };

  /**
   * Shot list for the showcase. Each shot eases from the previous framing, so the
   * sequence reads as one continuous move rather than a slideshow.
   */
  const SHOTS = [
    { dur: 6, caption: 'The hotel as built', from: { theta: -1.6, phi: 1.08, radius: 112, tx: 0, ty: 2, tz: 0 }, to: { theta: -0.5, phi: 0.86, radius: 74, tx: 0, ty: 4, tz: 0 } },
    { dur: 5, caption: 'Arrival court', to: { theta: 0.28, phi: 0.72, radius: 30, tx: arrivalC.x, ty: 2, tz: arrivalC.z + 1 } },
    { dur: 5, caption: 'The signature element', to: { theta: -1.05, phi: 0.66, radius: 22, tx: arrivalC.x - 9.6, ty: 2, tz: arrivalC.z + 1.4 } },
    { dur: 5, caption: 'The heritage pavilion', to: { theta: -2.05, phi: 0.7, radius: 24, tx: heritageC.x, ty: 2.5, tz: heritageC.z } },
    { dur: 6, caption: 'River frontage', to: { theta: 1.55, phi: 0.68, radius: 54, tx: W / 2 - 4, ty: 3, tz: 0 } },
    { dur: 5, caption: 'Service yard', to: { theta: 3.05, phi: 0.82, radius: 38, tx: 0, ty: 2, tz: -D / 2 + 2 } },
    { dur: 8, caption: 'The year in review', to: { theta: 3.95, phi: 0.95, radius: 104, tx: 0, ty: 5, tz: 0 } },
  ];
  const SHOWCASE_TOTAL = SHOTS.reduce((s, x) => s + x.dur, 0);

  function startShowcase(onShot) {
    showcase = { t: 0, onShot: onShot || null, shot: -1 };
    setDusk(true);
    setGrid(false);
    overlaysRef.setVisible(false);
  }

  function stopShowcase() {
    showcase = null;
    setGrid(true);
  }

  const smooth = (u) => u * u * (3 - 2 * u);

  function updateShowcase(dt) {
    showcase.t += dt;
    let acc = 0;
    for (let i = 0; i < SHOTS.length; i++) {
      const shot = SHOTS[i];
      if (showcase.t < acc + shot.dur || i === SHOTS.length - 1) {
        const u = smooth(clamp((showcase.t - acc) / shot.dur, 0, 1));
        const from = shot.from || SHOTS[i - 1].to;
        rig.theta = from.theta + (shot.to.theta - from.theta) * u;
        rig.phi = from.phi + (shot.to.phi - from.phi) * u;
        rig.radius = from.radius + (shot.to.radius - from.radius) * u;
        rig.tx = from.tx + (shot.to.tx - from.tx) * u;
        rig.ty = from.ty + (shot.to.ty - from.ty) * u;
        rig.tz = from.tz + (shot.to.tz - from.tz) * u;
        if (showcase.shot !== i) {
          showcase.shot = i;
          if (showcase.onShot) showcase.onShot(i, shot.caption);
        }
        return;
      }
      acc += shot.dur;
    }
  }

  /* ------------------------------------------------------------ frame loop */

  let elapsed = 0;

  function update(dt) {
    elapsed += dt;
    if (showcase) {
      updateShowcase(dt);
    } else {
      const k = 1 - Math.exp(-6 * dt);
      rig.theta += (goal.theta - rig.theta) * k;
      rig.phi += (goal.phi - rig.phi) * k;
      rig.radius += (goal.radius - rig.radius) * k;
      rig.tx += (goal.tx - rig.tx) * k;
      rig.ty += (goal.ty - rig.ty) * k;
      rig.tz += (goal.tz - rig.tz) * k;
    }
    applyRig();
    agentsRef.update(dt, elapsed);
    if (overlaysRef.group.visible) overlaysRef.update(dt);
  }

  /* ---------------------------------------------------------------- capture */

  /**
   * Render the CURRENT view at a multiple of its on-screen size and return a JPEG data URL.
   *
   * This is what replaced the panel of pre-baked photographs. Those were renders of a
   * demo build, so the app had to keep telling the user the picture was not their hotel;
   * this renders the hotel actually on screen — the team's own layout, their palette,
   * their camera, their day/dusk — so the panel cannot claim anything the session does
   * not contain.
   *
   * The pixel ratio is raised rather than the CSS size, so the framing is identical to
   * what the user is looking at: only the drawing buffer grows. The capture happens in
   * the same task as the render, which is why no preserveDrawingBuffer is needed (that
   * would cost every frame of the normal path).
   */
  function capture(scale = 2, quality = 0.92) {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    const pr = renderer.getPixelRatio();
    // Build furniture, not the building: the grid, the selection plate and a pending ghost
    // are tools. A capture is a picture of the hotel.
    const hidden = [grid, selHolder, ghostHolder].filter(Boolean).map((o) => [o, o.visible]);
    for (const [o] of hidden) o.visible = false;
    renderer.setPixelRatio(Math.min(pr * scale, 4));
    renderer.setSize(w, h, false);
    renderer.render(scene, camera);
    const url = canvas.toDataURL('image/jpeg', quality);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    for (const [o, v] of hidden) o.visible = v;
    renderer.render(scene, camera);
    return { url, w: Math.round(w * Math.min(pr * scale, 4)), h: Math.round(h * Math.min(pr * scale, 4)) };
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  function render() { renderer.render(scene, camera); }

  function dispose() {
    clearGroup(buildings);
    disposeGroup(terrain); disposeGroup(heritage); disposeGroup(grid);
    disposeGroup(landscape); disposeGroup(signature); disposeGroup(paths);
    agentsRef.dispose(); overlaysRef.dispose();
    kit.dispose();
    renderer.dispose();
  }

  return {
    scene, camera, renderer, world,
    get kit() { return kit; },
    get agents() { return agentsRef; },
    get overlays() { return overlaysRef; },
    get rig() { return rig; },
    get isDusk() { return dusk; },
    get showcaseTotal() { return SHOWCASE_TOTAL; },
    rebuild, setPalette, setStyle, setDusk, setGrid, setExpandMode, setSelection,
    setGhost, moveGhost, hideGhost,
    pick, groundCell, fit, focusOn, snap, resize, render, update, dispose, capture,
    // Photographic surface maps arrive after the first frame; gates and the shot tool wait
    // on this so a frame is never measured half drawn, half photographed.
    texturesReady,
    startShowcase, stopShowcase,
    set onTap(fn) { onTap = fn; },
    set onHover(fn) { onHover = fn; },
  };
}
