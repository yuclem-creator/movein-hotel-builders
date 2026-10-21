// overlays.js — the visible operating model. Journey routes are drawn from the
// stops the simulation actually resolved, so an overlay is a diagram of the
// scorecard, not a decorative line. Pulses travel the route to show direction.
import * as THREE from '../../vendor/three/three.module.min.js';
import { doorPoint } from './agents.js';
import { cellCentre } from './site.js';

const LIFT = 1.35;

/** Route colours by journey: guest gold, colleague sage, the rest read as service lines. */
const ROUTE_COLOR = {
  arrival: '#B59060',
  recovery: '#A9714B',
  linen: '#D9D2C4',
  goods: '#8E8577',
  colleague: '#B7CDC2',
};

function stopPoint(stop) {
  if (stop.fixed) {
    const c = stop.tag === 'arrival' ? cellCentre(5, 8) : cellCentre(5, 0);
    return new THREE.Vector3(c.x, LIFT, c.z);
  }
  if (!stop.resolved || !stop.rect) return null;
  const p = doorPoint(stop.rect);
  return new THREE.Vector3(p.x, LIFT, p.z);
}

export function createOverlays(kit) {
  const group = new THREE.Group();
  group.name = 'overlays';
  group.visible = false;

  const owned = [];
  const pulses = [];   // { mesh, curve, t, speed }

  function clear() {
    for (const child of group.children.slice()) {
      group.remove(child);
      if (child.geometry) child.geometry.dispose();
    }
    owned.length = 0;
    pulses.length = 0;
  }

  /** Draw every resolved journey. Gaps are drawn as a broken, dimmer segment. */
  function setJourneys(journeys) {
    clear();
    for (const j of journeys) {
      const pts = [];
      for (const stop of j.stops) {
        const p = stopPoint(stop);
        if (p) pts.push(p);
      }
      if (pts.length < 2) continue;

      const colour = new THREE.Color(ROUTE_COLOR[j.id] || '#B59060');
      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.25);
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, Math.max(24, pts.length * 12), 0.11, 6, false),
        new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: j.gaps ? 0.42 : 0.85 }),
      );
      tube.userData.kind = 'route';
      group.add(tube);
      owned.push(tube.material);

      // Stop markers: a disc on the ground with a pin rising to the route.
      for (const p of pts) {
        const disc = new THREE.Mesh(
          new THREE.CylinderGeometry(0.42, 0.42, 0.06, 16),
          new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.7 }),
        );
        disc.position.set(p.x, 0.06, p.z);
        group.add(disc);
        owned.push(disc.material);
        const pin = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.035, LIFT, 5),
          new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.5 }),
        );
        pin.position.set(p.x, LIFT / 2, p.z);
        group.add(pin);
        owned.push(pin.material);
      }

      // Pulses: three markers travelling the route, so direction is unambiguous.
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(
          new THREE.SphereGeometry(0.2, 10, 8),
          new THREE.MeshBasicMaterial({ color: colour }),
        );
        group.add(m);
        owned.push(m.material);
        pulses.push({ mesh: m, curve, t: i / 3, speed: 0.09 });
      }
    }
  }

  function update(dt) {
    for (const p of pulses) {
      p.t = (p.t + p.speed * dt) % 1;
      p.curve.getPointAt(p.t, p.mesh.position);
    }
  }

  return {
    group, setJourneys, update,
    setVisible(v) { group.visible = v; },
    dispose() { clear(); for (const m of owned) m.dispose(); },
  };
}
