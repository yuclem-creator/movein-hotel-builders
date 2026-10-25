// Shared evidence pre-flight: used by arch-shot and its regression test (not runtime code).
import * as THREE from '../vendor/three/three.module.min.js';
import { SITE } from '../js/sim/catalogue.js';

export function isolateArchitecture(view) {
  // Only world CONTENT is isolated. Lights are unnamed scene siblings, not furniture.
  const keep = new Set(['buildings', 'paths', 'terrain']);
  for (const child of view.world.children) child.visible = keep.has(child.name);
  // Practicals belong to the hidden arrival/pavilion; retain sun, hemi and their targets.
  for (const child of view.scene.children) if (child.isPointLight) child.visible = false;
  const yard = view.world.getObjectByName('serviceYard');
  if (yard) yard.visible = false;
  return assertArchitectureLighting(view.scene);
}

export function assertArchitectureLighting(scene) {
  const lights = [];
  scene.traverse((o) => {
    if (o.isDirectionalLight || o.isHemisphereLight) {
      let visible = true;
      for (let p = o; p; p = p.parent) visible = visible && p.visible;
      lights.push({ type: o.type, visible, intensity: o.intensity });
    }
  });
  for (const type of ['DirectionalLight', 'HemisphereLight']) {
    if (!lights.some((l) => l.type === type && l.visible && l.intensity > 0)) {
      throw new Error(`Reference lighting invalid: no visible, nonzero ${type}`);
    }
  }
  return lights;
}

export function assertReferenceTextures(state, expected) {
  const loaded = new Set(state.loaded);
  if (state.failed.length || expected.some((name) => !loaded.has(name))) {
    throw new Error(`Reference textures incomplete: loaded=${state.loaded.join(',')}; failed=${state.failed.join(',')}`);
  }
}

export function architectureBounds(group, placement, kit) {
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert();
  const local = new THREE.Box3(), world = new THREE.Box3();
  group.traverse((o) => {
    if (!o.isMesh || o.material === kit.contact) return;
    o.geometry.computeBoundingBox();
    const bounds = o.geometry.boundingBox;
    const add = (matrix) => {
      world.union(bounds.clone().applyMatrix4(matrix));
      local.union(bounds.clone().applyMatrix4(inverse.clone().multiply(matrix)));
    };
    if (o.isInstancedMesh) {
      const instance = new THREE.Matrix4();
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, instance);
        add(o.matrixWorld.clone().multiply(instance));
      }
    } else add(o.matrixWorld);
  });
  const describe = (b) => ({ min: b.min.toArray(), max: b.max.toArray(), size: b.getSize(new THREE.Vector3()).toArray() });
  return {
    // Local bounding dimensions include architectural overhangs, not placement footprint.
    plotMetres: [placement.w * SITE.cell, placement.h * SITE.cell],
    authoredBodyMetres: [placement.w * SITE.cell - 0.5, placement.h * SITE.cell - 0.5],
    local: describe(local), world: describe(world),
  };
}

// Probe both water and opaque occluders from a low side view. A spa pergola can legitimately
// cover a top-down ray; its courtyard water must still be visible from the open side.
export function waterVisibility(group, kit) {
  group.updateMatrixWorld(true);
  const water = [];
  group.traverse((o) => { if (o.isMesh && o.material === kit.water) water.push(o); });
  return water.map((mesh) => {
    mesh.geometry.computeBoundingBox();
    const b = mesh.geometry.boundingBox;
    const centre = b.getCenter(new THREE.Vector3());
    const top = new THREE.Vector3(centre.x, b.max.y - 0.001, centre.z).applyMatrix4(mesh.matrixWorld);
    const origin = new THREE.Vector3(b.max.x + 2, b.max.y + 0.35, centre.z).applyMatrix4(mesh.matrixWorld);
    const ray = new THREE.Raycaster(origin, top.clone().sub(origin).normalize());
    const hits = ray.intersectObject(group, true).filter((hit) => hit.object.material !== kit.contact);
    return { visible: hits[0]?.object === mesh, firstMaterial: hits[0]?.object.material?.name || 'unnamed', top: top.y };
  });
}
