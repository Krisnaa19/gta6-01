// Solmar, the city: a sunny coastal grid built procedurally from a seed.
// Buildings, road paint, lamps and palms are instanced meshes, so the whole
// city costs a handful of draw calls. The sea sits on the west edge, the sun
// casts one shadow map that follows the player around.

import * as THREE from 'three';
import { WORLD, SPOTS, BUILDING_COLORS } from './config.js';
import { range, pick } from './utils.js';

function windowTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#e9e4d8';
  g.fillRect(0, 0, 128, 256);
  for (let r = 0; r < 10; r++) {
    for (let col = 0; col < 4; col++) {
      const lit = Math.random() < 0.12;
      g.fillStyle = lit ? '#ffd98a' : '#33414f';
      g.fillRect(10 + col * 30, 12 + r * 24, 18, 13);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function signTexture(word, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = fg;
  g.font = 'bold 34px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(word, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene, rng) {
  const colliders = [];

  // Sky, haze and light.
  scene.background = new THREE.Color(0x8fc3e8);
  scene.fog = new THREE.Fog(0xa9cbe4, 380, 1200);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7f66, 1.3);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1cf, 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -170;
  sun.shadow.camera.right = 170;
  sun.shadow.camera.top = 170;
  sun.shadow.camera.bottom = -170;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 800;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.6;
  scene.add(sun);
  scene.add(sun.target);

  const lambert = (color, opts) => new THREE.MeshLambertMaterial({ color, ...(opts || {}) });

  // Base ground, then roads and sidewalks laid on top of it.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1500, 1500),
    lambert(0x9aa578),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const roadMat = lambert(0x55595f);
  const walkMat = lambert(0xc9c2b2);
  const roads = WORLD.roads;
  for (const r of roads) {
    const alongX = new THREE.Mesh(new THREE.PlaneGeometry(560, 12), roadMat);
    alongX.rotation.x = -Math.PI / 2;
    alongX.position.set(0, 0.02, r);
    alongX.receiveShadow = true;
    scene.add(alongX);
    const alongZ = new THREE.Mesh(new THREE.PlaneGeometry(12, 560), roadMat);
    alongZ.rotation.x = -Math.PI / 2;
    alongZ.position.set(r, 0.02, 0);
    alongZ.receiveShadow = true;
    scene.add(alongZ);
  }

  // Sidewalks: one instanced slab per block.
  const blockCenters = [];
  for (let i = 0; i < roads.length - 1; i++) blockCenters.push(roads[i] + WORLD.spacing / 2);
  const walkGeo = new THREE.PlaneGeometry(44, 44);
  const walks = new THREE.InstancedMesh(walkGeo, walkMat, blockCenters.length * blockCenters.length);
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    let n = 0;
    for (const bx of blockCenters) {
      for (const bz of blockCenters) {
        m.compose(new THREE.Vector3(bx, 0.05, bz), q, new THREE.Vector3(1, 1, 1));
        walks.setMatrixAt(n++, m);
      }
    }
    walks.instanceMatrix.needsUpdate = true;
  }
  walks.receiveShadow = true;
  scene.add(walks);

  // Dashed centre lines, skipping the crossings so junctions stay clean.
  const dashGeo = new THREE.BoxGeometry(3, 0.04, 0.35);
  const dashMat = lambert(0xd8c86a);
  const dashSpots = [];
  for (const r of roads) {
    for (let p = -244; p <= 244; p += 8) {
      const nearCross = roads.some((c) => Math.abs(p - c) < 9);
      if (!nearCross) dashSpots.push({ x: p, z: r, rot: 0 });
      if (!nearCross) dashSpots.push({ x: r, z: p, rot: Math.PI / 2 });
    }
  }
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashSpots.length);
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    dashSpots.forEach((d, i) => {
      e.set(0, d.rot, 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(d.x, 0.06, d.z), q, new THREE.Vector3(1, 1, 1));
      dashes.setMatrixAt(i, m);
    });
    dashes.instanceMatrix.needsUpdate = true;
  }
  scene.add(dashes);

  // Buildings: one instanced box per tower, tinted from the palette, taller
  // near the middle of town. Their footprints become the collision boxes.
  const towers = [];
  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      const fromCentre = Math.hypot(bx, bz) / 280;
      const tall = 1 - Math.min(1, fromCentre);
      const count = rng() < 0.35 ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const w = range(rng, 14, 24);
        const d = range(rng, 14, 24);
        const h = range(rng, 10, 22) + tall * range(rng, 8, 44);
        const ox = count === 1 ? 0 : (k === 0 ? -10 : 10);
        const oz = count === 1 ? 0 : (k === 0 ? -10 : 10);
        towers.push({
          x: bx + ox, z: bz + oz, w, d, h,
          color: pick(rng, BUILDING_COLORS),
        });
      }
    }
  }
  const towerGeo = new THREE.BoxGeometry(1, 1, 1);
  towerGeo.translate(0, 0.5, 0);
  const towerMat = new THREE.MeshLambertMaterial({ map: windowTexture() });
  const towersMesh = new THREE.InstancedMesh(towerGeo, towerMat, towers.length);
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    towers.forEach((t, i) => {
      m.compose(new THREE.Vector3(t.x, 0.05, t.z), q, new THREE.Vector3(t.w, t.h, t.d));
      towersMesh.setMatrixAt(i, m);
      towersMesh.setColorAt(i, col.setHex(t.color));
      colliders.push({
        minX: t.x - t.w / 2, maxX: t.x + t.w / 2,
        minZ: t.z - t.d / 2, maxZ: t.z + t.d / 2,
      });
    });
    towersMesh.instanceMatrix.needsUpdate = true;
    if (towersMesh.instanceColor) towersMesh.instanceColor.needsUpdate = true;
  }
  towersMesh.castShadow = true;
  towersMesh.receiveShadow = true;
  scene.add(towersMesh);

  // Street lamps along every road, alternating sides.
  const lampSpots = [];
  for (const r of roads) {
    for (let p = -238; p <= 238; p += 28) {
      lampSpots.push({ x: p, z: r + 7.5 });
      lampSpots.push({ x: r + 7.5, z: p });
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.1, 0.14, 5.6, 6);
  poleGeo.translate(0, 2.8, 0);
  const poles = new THREE.InstancedMesh(poleGeo, lambert(0x3a3f45), lampSpots.length);
  const headGeo = new THREE.BoxGeometry(0.5, 0.22, 1.4);
  const headMat = new THREE.MeshLambertMaterial({ color: 0x444444, emissive: 0xffe9a8, emissiveIntensity: 0.35 });
  const heads = new THREE.InstancedMesh(headGeo, headMat, lampSpots.length);
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    lampSpots.forEach((s, i) => {
      m.compose(new THREE.Vector3(s.x, 0, s.z), q, new THREE.Vector3(1, 1, 1));
      poles.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(s.x, 5.6, s.z), q, new THREE.Vector3(1, 1, 1));
      heads.setMatrixAt(i, m);
    });
    poles.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
  }
  scene.add(poles);
  scene.add(heads);

  // Palm trees: a row on the sand, plus a few on sidewalk corners.
  const palmSpots = [];
  for (let z = -238; z <= 238; z += 24) palmSpots.push({ x: -268, z, tilt: range(rng, -0.08, 0.08) });
  for (let i = 0; i < 26; i++) {
    palmSpots.push({
      x: pick(rng, blockCenters) + pick(rng, [-20, 20]),
      z: pick(rng, blockCenters) + pick(rng, [-20, 20]),
      tilt: range(rng, -0.08, 0.08),
    });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 5.4, 6);
  trunkGeo.translate(0, 2.7, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, lambert(0x8a6a48), palmSpots.length);
  const canopyGeo = new THREE.ConeGeometry(2.6, 2.0, 7);
  canopyGeo.translate(0, 1.0, 0);
  const canopies = new THREE.InstancedMesh(canopyGeo, lambert(0x2f7a3a), palmSpots.length);
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const col = new THREE.Color();
    palmSpots.forEach((s, i) => {
      e.set(s.tilt, 0, s.tilt * 0.6);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(s.x, 0, s.z), q, new THREE.Vector3(1, 1, 1));
      trunks.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(s.x, 5.2, s.z), q, new THREE.Vector3(1, 0.55, 1));
      canopies.setMatrixAt(i, m);
      canopies.setColorAt(i, col.setHex(0x2f7a3a).offsetHSL(0, 0, range(rng, -0.04, 0.05)));
    });
    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
  }
  trunks.castShadow = true;
  canopies.castShadow = true;
  scene.add(trunks);
  scene.add(canopies);

  // Beach umbrellas on the sand.
  const umbrellaSpots = [];
  for (let i = 0; i < 8; i++) umbrellaSpots.push({ x: range(rng, -292, -258), z: range(rng, -220, 220) });
  const umbPoleGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.2, 5);
  umbPoleGeo.translate(0, 1.1, 0);
  const umbPoles = new THREE.InstancedMesh(umbPoleGeo, lambert(0xe8e0d0), umbrellaSpots.length);
  const umbTopGeo = new THREE.ConeGeometry(1.9, 0.9, 8);
  umbTopGeo.translate(0, 0.45, 0);
  const umbTops = new THREE.InstancedMesh(umbTopGeo, lambert(0xffffff), umbrellaSpots.length);
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    umbrellaSpots.forEach((s, i) => {
      m.compose(new THREE.Vector3(s.x, 0, s.z), q, new THREE.Vector3(1, 1, 1));
      umbPoles.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(s.x, 2.1, s.z), q, new THREE.Vector3(1, 1, 1));
      umbTops.setMatrixAt(i, m);
      umbTops.setColorAt(i, col.setHex(pick(rng, [0xe84a5f, 0x2a9d8f, 0xf4a261, 0x4a7de8])));
    });
    umbPoles.instanceMatrix.needsUpdate = true;
    umbTops.instanceMatrix.needsUpdate = true;
    if (umbTops.instanceColor) umbTops.instanceColor.needsUpdate = true;
  }
  scene.add(umbPoles);
  scene.add(umbTops);

  // Sand strip and the sea beyond it, with a foam line at the shoreline.
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(48, 1300), lambert(0xe6d3a1));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(-276, 0.03, 0);
  sand.receiveShadow = true;
  scene.add(sand);
  const seaMat = lambert(0x2a7fc1);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(700, 1300), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(-650, -0.35, 0);
  scene.add(sea);
  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 1300),
    new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(-298, -0.1, 0);
  scene.add(foam);

  // Drifting clouds: flat clusters of white spheres.
  const clouds = [];
  const cloudMat = lambert(0xffffff);
  for (let i = 0; i < 12; i++) {
    const g = new THREE.Group();
    const puffs = 3 + Math.floor(rng() * 3);
    for (let k = 0; k < puffs; k++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(range(rng, 6, 12), 8, 6), cloudMat);
      s.position.set(k * range(rng, 7, 11) - puffs * 4, range(rng, -1, 2), range(rng, -4, 4));
      s.scale.y = 0.45;
      g.add(s);
    }
    g.position.set(range(rng, -350, 350), range(rng, 90, 150), range(rng, -350, 350));
    scene.add(g);
    clouds.push({ group: g, speed: range(rng, 0.8, 2.0) });
  }

  // Two landmarks the story points at: Dario's safehouse and the fence garage.
  function landmark(x, z, word, bg, fg, roofColor) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(11, 5, 8), lambert(0xe8ddc9));
    base.position.y = 2.5;
    base.castShadow = true;
    g.add(base);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(7.5, 3, 4), lambert(roofColor));
    roof.position.y = 6.5;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 1.75),
      new THREE.MeshBasicMaterial({ map: signTexture(word, bg, fg) }),
    );
    sign.position.set(0, 4.2, 4.05);
    g.add(sign);
    g.position.set(x, 0, z);
    scene.add(g);
    colliders.push({ minX: x - 5.5, maxX: x + 5.5, minZ: z - 4, maxZ: z + 4 });
    return g;
  }
  landmark(SPOTS.safehouse.x, SPOTS.safehouse.z, 'SAFEHOUSE', '#2a6db0', '#ffffff', 0x2a6db0);
  landmark(SPOTS.fence.x, SPOTS.fence.z, 'GARAGE', '#c2a020', '#222222', 0x444444);

  function update(dt, focusX, focusZ) {
    for (const c of clouds) {
      c.group.position.x += c.speed * dt;
      if (c.group.position.x > 420) c.group.position.x = -420;
    }
    sun.position.set(focusX + 180, 260, focusZ + 90);
    sun.target.position.set(focusX, 0, focusZ);
    sun.target.updateMatrixWorld();
  }

  return { colliders, update };
}
