// The wanted system: heat builds when the player commits crimes and cools
// off when the police lose sight of them. Stars decide how many patrol cars
// and foot officers come after Dario, and standing still near a patrol car
// for too long gets him busted.

import * as THREE from 'three';
import { WORLD, TUNE } from './config.js';
import { clamp, dist2 } from './utils.js';
import { Car } from './vehicles.js';

function makeCopMesh() {
  const g = new THREE.Group();
  const navy = new THREE.MeshLambertMaterial({ color: 0x1e2f4a });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.3), navy);
  torso.position.y = 0.86;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), new THREE.MeshLambertMaterial({ color: 0xe8b98d }));
  head.position.y = 1.36;
  head.castShadow = true;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.1, 0.44), new THREE.MeshLambertMaterial({ color: 0x14263c }));
  cap.position.y = 1.52;
  const legMat = new THREE.MeshLambertMaterial({ color: 0x14263c });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 0.22), legMat);
  legL.geometry.translate(0, -0.27, 0);
  legL.position.set(-0.14, 0.55, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.16), navy);
  armR.geometry.translate(0, -0.27, 0);
  armR.position.set(0.37, 1.08, 0);
  g.add(torso, head, cap, legL, legR, armR);
  g.userData.armR = armR;
  g.userData.legL = legL;
  g.userData.legR = legR;
  return g;
}

export class Police {
  constructor(scene, rng, audio) {
    this.scene = scene;
    this.rng = rng;
    this.audio = audio;
    this.heat = 0;
    this.copCars = [];
    this.footCops = [];
    this.bustT = 0;
    this.flashT = 0;
    this.spawnT = 0;
  }

  get stars() {
    if (this.heat <= 0) return 0;
    return Math.min(5, Math.ceil(this.heat / 20));
  }

  addHeat(n) {
    this.heat = clamp(this.heat + n, 0, 100);
  }

  clearHeat() {
    this.heat = 0;
    this.bustT = 0;
    for (const c of this.copCars) this.scene.remove(c.group);
    for (const f of this.footCops) this.scene.remove(f.mesh);
    this.copCars = [];
    this.footCops = [];
    if (this.audio) this.audio.setSiren(false);
  }

  nearestCopDist(px, pz) {
    let best = Infinity;
    for (const c of this.copCars) best = Math.min(best, dist2(px, pz, c.x, c.z));
    for (const f of this.footCops) best = Math.min(best, dist2(px, pz, f.mesh.position.x, f.mesh.position.z));
    return best;
  }

  spawnCopCar(px, pz) {
    const angle = this.rng() * Math.PI * 2;
    const d = 60 + this.rng() * 25;
    const x = clamp(px + Math.sin(angle) * d, -WORLD.bound + 10, WORLD.bound - 10);
    const z = clamp(pz + Math.cos(angle) * d, -WORLD.bound + 10, WORLD.bound - 10);
    const car = new Car({ police: true, x, z, heading: Math.atan2(px - x, pz - z), name: 'cop' });
    car.ai = true;
    this.scene.add(car.group);
    this.copCars.push({ car, lastX: x, lastZ: z, stuckT: 0 });
  }

  spawnFootCop(px, pz) {
    const angle = this.rng() * Math.PI * 2;
    const x = clamp(px + Math.sin(angle) * 26, -WORLD.bound + 5, WORLD.bound - 5);
    const z = clamp(pz + Math.cos(angle) * 26, -WORLD.bound + 5, WORLD.bound - 5);
    const mesh = makeCopMesh();
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    this.footCops.push({ mesh, hp: 30, punchT: 0, fallen: false, fallT: 0, phase: 0 });
  }

  // A punch from the player: nearest officer in front takes the hit.
  tryPunch(px, pz, heading) {
    let hit = null;
    let bestD = 2.4;
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    for (const f of this.footCops) {
      if (f.fallen) continue;
      const dx = f.mesh.position.x - px;
      const dz = f.mesh.position.z - pz;
      const d = Math.hypot(dx, dz);
      if (d < bestD && (dx * fx + dz * fz) / Math.max(d, 0.01) > 0.2) {
        bestD = d;
        hit = f;
      }
    }
    if (!hit) return false;
    hit.hp -= 15;
    const dx = hit.mesh.position.x - px;
    const dz = hit.mesh.position.z - pz;
    const d = Math.max(0.5, Math.hypot(dx, dz));
    hit.mesh.position.x += (dx / d) * 2.5;
    hit.mesh.position.z += (dz / d) * 2.5;
    if (hit.hp <= 0) {
      hit.fallen = true;
      hit.fallT = 0;
      hit.mesh.rotation.x = -Math.PI / 2;
      hit.mesh.position.y = 0.25;
      this.addHeat(15);
    }
    return true;
  }

  update(dt, game) {
    const p = game.player;
    const px = p.inCar ? p.inCar.x : p.x;
    const pz = p.inCar ? p.inCar.z : p.z;
    const playerSpeed = p.inCar ? Math.abs(p.inCar.speed) : 0;
    this.flashT += dt;

    // Heat cools faster when no officer is close enough to see Dario.
    const near = this.nearestCopDist(px, pz);
    this.heat = clamp(this.heat - (near > 45 ? 2.4 : 0.35) * dt, 0, 100);
    const stars = this.stars;
    if (this.audio) this.audio.setSiren(stars > 0);

    // Keep the right number of patrol cars on the street.
    const wantCars = stars === 0 ? 0 : stars === 1 ? 1 : stars === 2 ? 2 : 3;
    this.spawnT -= dt;
    if (this.copCars.length < wantCars && this.spawnT <= 0) {
      this.spawnCopCar(px, pz);
      this.spawnT = 1.2;
    }
    const wantFoot = p.inCar ? 0 : clamp(stars - 1, 0, 3);
    if (this.footCops.filter((f) => !f.fallen).length < wantFoot && this.spawnT <= 0) {
      this.spawnFootCop(px, pz);
      this.spawnT = 1.2;
    }

    // Patrol cars chase; if one gets wedged on a building, move it.
    let busted = false;
    for (let i = this.copCars.length - 1; i >= 0; i--) {
      const entry = this.copCars[i];
      const car = entry.car;
      const d = dist2(px, pz, car.x, car.z);
      if (d > 260) {
        this.scene.remove(car.group);
        this.copCars.splice(i, 1);
        continue;
      }
      car.chase(dt, px, pz);
      game.resolveCarCollision(car);
      const moved = dist2(car.x, car.z, entry.lastX, entry.lastZ);
      if (moved < 0.4 && Math.abs(car.speed) > 3) entry.stuckT += dt;
      else entry.stuckT = 0;
      entry.lastX = car.x;
      entry.lastZ = car.z;
      if (entry.stuckT > 2) {
        const angle = this.rng() * Math.PI * 2;
        car.x = clamp(px + Math.sin(angle) * 55, -WORLD.bound + 10, WORLD.bound - 10);
        car.z = clamp(pz + Math.cos(angle) * 55, -WORLD.bound + 10, WORLD.bound - 10);
        car.speed = 8;
        entry.stuckT = 0;
      }
      // Light bar flashes red and blue in turn.
      const on = Math.sin(this.flashT * 9) > 0;
      if (car.lightL) car.lightL.material.emissiveIntensity = on ? 2.4 : 0.3;
      if (car.lightR) car.lightR.material.emissiveIntensity = on ? 0.3 : 2.4;
      car.sync();
      // Caught while crawling: the bust clock runs.
      if (d < 3.4 && playerSpeed < 4) {
        this.bustT += dt;
        if (this.bustT > 2) busted = true;
      }
    }
    if (this.copCars.length === 0 && this.footCops.length === 0) this.bustT = Math.max(0, this.bustT - dt);

    // Foot officers run Dario down and swing when they reach him.
    for (let i = this.footCops.length - 1; i >= 0; i--) {
      const f = this.footCops[i];
      if (f.fallen) {
        f.fallT += dt;
        if (f.fallT > 2.5) {
          this.scene.remove(f.mesh);
          this.footCops.splice(i, 1);
        }
        continue;
      }
      const dx = px - f.mesh.position.x;
      const dz = pz - f.mesh.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 210) {
        this.scene.remove(f.mesh);
        this.footCops.splice(i, 1);
        continue;
      }
      const step = 6.6 * dt;
      if (d > 1.6) {
        f.mesh.position.x += (dx / d) * step;
        f.mesh.position.z += (dz / d) * step;
        f.phase += dt * 9;
      }
      f.mesh.rotation.y = Math.atan2(dx, dz);
      const swing = Math.sin(f.phase) * 0.5;
      f.mesh.userData.legL.rotation.x = swing;
      f.mesh.userData.legR.rotation.x = -swing;
      if (f.punchT > 0) f.punchT -= dt;
      if (d < 1.8 && f.punchT <= 0) {
        f.punchT = 1.0;
        f.mesh.userData.armR.rotation.x = -1.4;
        game.damagePlayer(8);
      } else if (f.punchT <= 0.2) {
        f.mesh.userData.armR.rotation.x = 0;
      }
      // Cornered on foot while barely moving: the bust clock runs.
      if (!p.inCar && d < 1.9 && playerSpeed < 2.5) {
        this.bustT += dt;
        if (this.bustT > 1.5) busted = true;
      }
    }

    if (busted) game.onBusted();
  }
}
