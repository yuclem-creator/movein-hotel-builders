// agents.js — the living site. Instanced figures and vehicles that walk the routes
// the simulation actually computed, so what moves on screen is evidence of the
// scorecard, not decoration. Routes come from the layout; nothing is hand-animated.
// Vendored path, not a bare specifier: an import map is only understood by Safari 16.4 and
// later, and an in-app browser or an older phone silently failed the whole module graph.
import * as THREE from '../../vendor/three/three.module.min.js';
import { SITE } from '../sim/catalogue.js';
import { footprintCentre } from './massing.js';
import { cellCentre, doorPoint } from './site.js';

const MAX = 72;
const W = SITE.cols * SITE.cell;
const D = SITE.rows * SITE.cell;

// Re-exported so callers that already import agents get the same front door the
// paving is drawn from: one definition, or paths and people drift apart.
export { doorPoint };

/** Build every route the site needs from the current layout. Missing stops are skipped. */
export function buildRoutes(session) {
  const find = (id) => session.placements.filter((p) => p.fnId === id);
  const arrival = (() => { const c = cellCentre(SITE.arrival.col, SITE.arrival.row); return new THREE.Vector3(c.x, 0, c.z + 2.4); })();
  const service = (() => { const c = cellCentre(SITE.service.col, SITE.service.row); return new THREE.Vector3(c.x, 0, c.z - 2.4); })();

  const guests = [];
  const front = find('front')[0];
  for (const rooms of find('rooms')) {
    const pts = [arrival.clone()];
    if (front) pts.push(doorPoint(front));
    pts.push(doorPoint(rooms));
    guests.push(pts);
  }
  if (!guests.length && front) guests.push([arrival.clone(), doorPoint(front)]);

  const colleagues = [];
  const chain = ['locker', 'canteen', 'train', 'house'];
  const pts = [service.clone()];
  for (const id of chain) { const p = find(id)[0]; if (p) pts.push(doorPoint(p)); }
  if (pts.length > 1) colleagues.push(pts);

  const porters = [];
  const goodsChain = ['recv', 'kitchen', 'fnb'];
  const gp = [service.clone()];
  for (const id of goodsChain) { const p = find(id)[0]; if (p) gp.push(doorPoint(p)); }
  if (gp.length > 1) porters.push(gp);

  // Vehicle loops: the arrival drop-off and the service yard, both off the plot.
  const a = cellCentre(SITE.arrival.col, SITE.arrival.row);
  const sv = cellCentre(SITE.service.col, SITE.service.row);
  const vehicles = [
    [new THREE.Vector3(a.x - 6, 0, a.z + 7), new THREE.Vector3(a.x + 6, 0, a.z + 7),
      new THREE.Vector3(a.x + 6, 0, a.z + 2), new THREE.Vector3(a.x - 6, 0, a.z + 2)],
    [new THREE.Vector3(sv.x - 7, 0, sv.z - 7), new THREE.Vector3(sv.x + 7, 0, sv.z - 7),
      new THREE.Vector3(sv.x + 7, 0, sv.z - 2), new THREE.Vector3(sv.x - 7, 0, sv.z - 2)],
  ];

  return { guests, colleagues, porters, vehicles, queueAt: front ? doorPoint(front) : arrival.clone() };
}

/** Point on a closed/looping polyline at t in [0,1). */
function pointOnLoop(pts, t) {
  const n = pts.length;
  if (n === 1) return { p: pts[0].clone(), dir: new THREE.Vector3(0, 0, 1) };
  const total = (() => {
    let s = 0;
    for (let i = 0; i < n; i++) s += pts[i].distanceTo(pts[(i + 1) % n]);
    return s || 1;
  })();
  let target = ((t % 1) + 1) % 1 * total;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const seg = a.distanceTo(b);
    if (target <= seg || i === n - 1) {
      const k = seg ? target / seg : 0;
      return { p: a.clone().lerp(b, k), dir: b.clone().sub(a).normalize() };
    }
    target -= seg;
  }
  return { p: pts[0].clone(), dir: new THREE.Vector3(0, 0, 1) };
}

/** Point on an open polyline, ping-ponging so figures walk there and back. */
function pointThereAndBack(pts, t) {
  const cycle = ((t % 1) + 1) % 1;
  const u = cycle < 0.5 ? cycle * 2 : (1 - cycle) * 2;
  const n = pts.length;
  if (n === 1) return { p: pts[0].clone(), dir: new THREE.Vector3(0, 0, 1) };
  let total = 0;
  for (let i = 0; i < n - 1; i++) total += pts[i].distanceTo(pts[i + 1]);
  let target = u * (total || 1);
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const seg = a.distanceTo(b);
    if (target <= seg || i === n - 2) {
      const k = seg ? target / seg : 0;
      return { p: a.clone().lerp(b, k), dir: b.clone().sub(a).normalize() };
    }
    target -= seg;
  }
  return { p: pts[n - 1].clone(), dir: new THREE.Vector3(0, 0, 1) };
}
/**
 * The agent system. One InstancedMesh for bodies, one for heads (head geometry is
 * pre-translated up, so both share the same instance matrix), plus instanced
 * vehicles. 72 figures cost 4 draw calls, which is what a phone can afford.
 */
export function createAgents(kit) {
  const group = new THREE.Group();
  group.name = 'agents';

  const bodyGeo = new THREE.CapsuleGeometry(0.2, 0.6, 3, 8);
  bodyGeo.translate(0, 0.5, 0);
  const headGeo = new THREE.SphereGeometry(0.16, 10, 8);
  headGeo.translate(0, 1.02, 0);
  const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0 });
  const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#E6D9C4'), roughness: 0.85 });
  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, MAX);
  const heads = new THREE.InstancedMesh(headGeo, headMat, MAX);
  bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Figures do not cast shadows, so the shadow map can be baked once instead of
  // being re-rendered every frame to chase a walking silhouette.
  bodies.castShadow = false;
  bodies.frustumCulled = false;
  heads.frustumCulled = false;
  group.add(bodies, heads);

  const vBodyGeo = new THREE.BoxGeometry(2.6, 0.9, 1.2); vBodyGeo.translate(0, 0.62, 0);
  const vCabGeo = new THREE.BoxGeometry(1.0, 0.66, 1.1); vCabGeo.translate(-0.85, 1.3, 0);
  // Glazing band and wheels: a car built from two boxes reads as a black brick from
  // any distance, which is what the review frame showed on the drop-off loop.
  const vGlassGeo = new THREE.BoxGeometry(1.04, 0.30, 1.14); vGlassGeo.translate(-0.85, 1.46, 0);
  const vWheelGeo = new THREE.CylinderGeometry(0.27, 0.27, 0.12, 10);
  vWheelGeo.rotateZ(Math.PI / 2);   // axis along X, so the vehicle's yaw orients it
  const vBodies = new THREE.InstancedMesh(vBodyGeo, kit.ink, 4);
  const vCabs = new THREE.InstancedMesh(vCabGeo, kit.accent, 4);
  const vGlass = new THREE.InstancedMesh(vGlassGeo, kit.glass, 4);
  const vWheels = new THREE.InstancedMesh(vWheelGeo, kit.ink, 16);
  vBodies.castShadow = false;
  vBodies.frustumCulled = false;
  vCabs.frustumCulled = false;
  vGlass.frustumCulled = false;
  vWheels.frustumCulled = false;
  group.add(vBodies, vCabs, vGlass, vWheels);

  // InstancedMesh starts with count === maxCount. Until setLayout() runs there are
  // no actors, so all four must start empty or update() walks undefined entries.
  bodies.count = 0;
  heads.count = 0;
  vBodies.count = 0;
  vCabs.count = 0;
  vGlass.count = 0;
  vWheels.count = 0;

  const actors = [];
  const vehicles = [];
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  let routes = { guests: [], colleagues: [], porters: [], vehicles: [], queueAt: null };

  /** Repopulate from the layout. counts come from the scorecard, so the site fills up as demand grows. */
  function setLayout(session, counts = {}) {
    routes = buildRoutes(session);
    actors.length = 0;
    vehicles.length = 0;

    const add = (kind, list, colorHex, speed, n) => {
      if (!list.length || !(n > 0)) return;
      for (let i = 0; i < n; i++) {
        actors.push({ kind, pts: list[i % list.length], color: colorHex, speed, t: (i * 0.137) % 1, lane: ((i % 3) - 1) * 0.5 });
      }
    };
    add('guest', routes.guests, '#F0E7D7', 0.045, counts.guests ?? 8);
    add('colleague', routes.colleagues, '#B7CDC2', 0.05, counts.colleagues ?? 6);
    add('porter', routes.porters, '#6E6A63', 0.055, counts.porters ?? 3);

    // Queue: guests who cannot be served. A visible line is the clearest proof of a capacity miss.
    const q = counts.queue ?? 0;
    if (q > 0 && routes.queueAt) {
      const back = routes.guests[0]?.length > 1 ? routes.guests[0][1].clone().sub(routes.queueAt).setY(0).normalize() : new THREE.Vector3(0, 0, 1);
      const side = new THREE.Vector3(-back.z, 0, back.x);
      for (let i = 0; i < q; i++) {
        actors.push({
          kind: 'queue', color: '#E4D8C2', speed: 0, t: 0, lane: 0,
          fixed: routes.queueAt.clone().addScaledVector(back, 1.1 + i * 0.85).addScaledVector(side, (i % 2) * 0.35),
          dir: back.clone().negate(),
        });
      }
    }

    bodies.count = Math.min(MAX, actors.length);
    heads.count = bodies.count;
    for (let i = 0; i < bodies.count; i++) { col.set(actors[i].color); bodies.setColorAt(i, col); }
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;

    routes.vehicles.forEach((pts, i) => vehicles.push({ pts, t: i * 0.41, speed: 0.028 }));
    vBodies.count = vehicles.length;
    vCabs.count = vehicles.length;
    vGlass.count = vehicles.length;
    vWheels.count = vehicles.length * 4;
    group.visible = bodies.count > 0 || vehicles.length > 0;
  }

  function update(dt, elapsed) {
    for (let i = 0; i < bodies.count; i++) {
      const a = actors[i];
      let pos, dir;
      if (a.kind === 'queue') {
        pos = a.fixed; dir = a.dir;
      } else {
        a.t = (a.t + a.speed * dt) % 1;
        const r = pointThereAndBack(a.pts, a.t);
        pos = r.p; dir = r.dir;
        pos.addScaledVector(new THREE.Vector3(-dir.z, 0, dir.x), a.lane);
      }
      dummy.position.set(pos.x, a.kind === 'queue' ? Math.sin(elapsed * 2 + i) * 0.02 : 0, pos.z);
      dummy.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
      dummy.scale.setScalar(a.kind === 'queue' ? 1 : 1);
      dummy.updateMatrix();
      bodies.setMatrixAt(i, dummy.matrix);
      heads.setMatrixAt(i, dummy.matrix);
    }
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < vBodies.count; i++) {
      const v = vehicles[i];
      v.t = (v.t + v.speed * dt) % 1;
      const r = pointOnLoop(v.pts, v.t);
      const yaw = Math.atan2(r.dir.x, r.dir.z);
      dummy.position.set(r.p.x, 0, r.p.z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      vBodies.setMatrixAt(i, dummy.matrix);
      vCabs.setMatrixAt(i, dummy.matrix);
      vGlass.setMatrixAt(i, dummy.matrix);

      // Wheels are one instanced batch for the whole site: four per vehicle, placed in
      // the vehicle's own frame (local x along the body, z across it).
      const cos = Math.cos(yaw), sin = Math.sin(yaw);
      for (let w = 0; w < 4; w++) {
        const lx = w < 2 ? 0.85 : -0.85;
        const lz = w % 2 ? 0.6 : -0.6;
        dummy.position.set(r.p.x + lx * cos + lz * sin, 0.27, r.p.z - lx * sin + lz * cos);
        dummy.updateMatrix();
        vWheels.setMatrixAt(i * 4 + w, dummy.matrix);
      }
    }
    vBodies.instanceMatrix.needsUpdate = true;
    vCabs.instanceMatrix.needsUpdate = true;
    vGlass.instanceMatrix.needsUpdate = true;
    vWheels.instanceMatrix.needsUpdate = true;
  }

  return {
    group, setLayout, update,
    setVisible(v) { group.visible = v; },
    dispose() { bodyGeo.dispose(); headGeo.dispose(); bodyMat.dispose(); headMat.dispose(); vBodyGeo.dispose(); vCabGeo.dispose(); },
  };
}
