// Street life: cars cruising the road grid and pedestrians strolling the
// sidewalks. Traffic cars follow lanes and turn at junctions; walkers loop
// around block edges. A walker hit by a fast car goes down and stays down
// for a while, which is also how the wanted system notices the player.

import * as THREE from 'three';
import { WORLD, CAR_COLORS, TUNE } from './config.js';
import { range, pick, dist2 } from './utils.js';
import { Car } from './vehicles.js';

function makeWalkerMesh(rng) {
  const g = new THREE.Group();
  const shirt = pick(rng, [0xd86a5a, 0x5a8fd8, 0x6ab86a, 0xd8b45a, 0x9a6ad8, 0xe8e8e8]);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.28), new THREE.MeshLambertMaterial({ color: shirt }));
  torso.position.y = 0.85;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), new THREE.MeshLambertMaterial({ color: pick(rng, [0xe8b98d, 0xc98d5f, 0x8a5a3a, 0xf0c8a0]) }));
  head.position.y = 1.32;
  head.castShadow = true;
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.18), legMat);
  legL.geometry.translate(0, -0.27, 0);
  legL.position.set(-0.12, 0.55, 0);
  const legR = legL.clone();
  legR.position.x = 0.12;
  g.add(torso, head, legL, legR);
  g.userData.legL = legL;
  g.userData.legR = legR;
  return g;
}

export class Traffic {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.cars = [];
    this.peds = [];
  }

  spawn() {
    const rng = this.rng;
    // Fourteen cars spread over the grid, each on its own lane.
    for (let i = 0; i < 14; i++) {
      const axis = rng() < 0.5 ? 'x' : 'z';
      const road = pick(rng, WORLD.roads);
      const dir = rng() < 0.5 ? 1 : -1;
      const car = new Car({
        color: pick(rng, CAR_COLORS),
        x: 0, z: 0,
        heading: 0,
        name: 'traffic' + i,
      });
      car.ai = true;
      const entry = {
        car,
        axis,
        road,
        along: range(rng, -230, 230),
        dir,
        speed: range(rng, 7, 11),
        baseSpeed: 0,
        turnCooldown: 0,
      };
      entry.baseSpeed = entry.speed;
      this.placeCar(entry);
      this.scene.add(car.group);
      this.cars.push(entry);
    }
    // Walkers, one per block edge to start.
    for (let i = 0; i < 22; i++) this.spawnPed();
  }

  // Put an AI car on its lane from its axis/road/along state.
  placeCar(e) {
    if (e.axis === 'x') {
      e.car.x = e.along;
      e.car.z = e.road + (e.dir > 0 ? 2.8 : -2.8);
      e.car.heading = e.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      e.car.x = e.road + (e.dir > 0 ? -2.8 : 2.8);
      e.car.z = e.along;
      e.car.heading = e.dir > 0 ? 0 : Math.PI;
    }
    e.car.sync();
  }

  spawnPed() {
    const rng = this.rng;
    const mesh = makeWalkerMesh(rng);
    const blockX = pick(rng, WORLD.roads.slice(0, -1)).valueOf() + 28;
    const blockZ = pick(rng, WORLD.roads.slice(0, -1)).valueOf() + 28;
    const ped = {
      mesh,
      blockX,
      blockZ,
      edge: Math.floor(rng() * 4),
      t: range(rng, 0, 44),
      dir: rng() < 0.5 ? 1 : -1,
      speed: range(rng, 1.0, 1.7),
      phase: range(rng, 0, 6),
      fallen: false,
      fallT: 0,
    };
    this.scene.add(mesh);
    this.peds.push(ped);
    this.placePed(ped);
  }

  placePed(p) {
    const o = 22.5;
    let x = p.blockX;
    let z = p.blockZ;
    if (p.edge === 0) { x = p.blockX - o + p.t; z = p.blockZ - o; }
    if (p.edge === 1) { x = p.blockX + o; z = p.blockZ - o + p.t; }
    if (p.edge === 2) { x = p.blockX + o - p.t; z = p.blockZ + o; }
    if (p.edge === 3) { x = p.blockX - o; z = p.blockZ + o - p.t; }
    p.mesh.position.set(x, p.fallen ? 0.25 : 0, z);
    p.mesh.rotation.y = p.edge === 0 ? Math.PI / 2 : p.edge === 1 ? 0 : p.edge === 2 ? -Math.PI / 2 : Math.PI;
    if (p.dir < 0) p.mesh.rotation.y += Math.PI;
    if (p.fallen) p.mesh.rotation.x = -Math.PI / 2;
    else p.mesh.rotation.x = 0;
    const swing = Math.sin(p.phase) * 0.5;
    p.mesh.userData.legL.rotation.x = swing;
    p.mesh.userData.legR.rotation.x = -swing;
  }

  // Steal a traffic car out of the AI list (the player just took it).
  steal(car) {
    const i = this.cars.findIndex((e) => e.car === car);
    if (i >= 0) this.cars.splice(i, 1);
  }

  nearestCar(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const e of this.cars) {
      const d = dist2(x, z, e.car.x, e.car.z);
      if (d < bestD) { bestD = d; best = e.car; }
    }
    return best;
  }

  // A fast player car hitting a walker knocks them down.
  checkPlayerCarHit(playerCar, onHit) {
    if (!playerCar || Math.abs(playerCar.speed) < 4) return;
    for (const p of this.peds) {
      if (p.fallen) continue;
      if (dist2(playerCar.x, playerCar.z, p.mesh.position.x, p.mesh.position.z) < 2.4) {
        p.fallen = true;
        p.fallT = 0;
        this.placePed(p);
        onHit(p);
      }
    }
  }

  update(dt) {
    // Cars: roll along, turn at junctions sometimes, slow for the car ahead.
    for (const e of this.cars) {
      if (e.turnCooldown > 0) e.turnCooldown -= dt;
      let speed = e.baseSpeed;
      for (const o of this.cars) {
        if (o === e || o.axis !== e.axis || o.road !== e.road || o.dir !== e.dir) continue;
        const gap = (o.along - e.along) * e.dir;
        if (gap > 0 && gap < 9) speed = Math.min(speed, o.speed);
      }
      e.speed = speed;
      e.along += e.dir * e.speed * dt;
      const nearRoad = WORLD.roads.find((r) => Math.abs(e.along - r) < 1.4);
      if (nearRoad !== undefined && e.turnCooldown <= 0 && this.rng() < 0.3) {
        e.turnCooldown = 4;
        if (e.axis === 'x') {
          e.axis = 'z';
          e.road = nearRoad;
          e.along = e.car.z;
          e.dir = this.rng() < 0.5 ? 1 : -1;
        } else {
          e.axis = 'x';
          e.road = nearRoad;
          e.along = e.car.x;
          e.dir = this.rng() < 0.5 ? 1 : -1;
        }
      }
      if (Math.abs(e.along) > 238) {
        if (this.rng() < 0.7) {
          // Turn onto the edge road instead of reversing.
          const edge = e.along > 0 ? 224 : -224;
          if (e.axis === 'x') { e.axis = 'z'; e.road = edge; e.along = e.car.z; }
          else { e.axis = 'x'; e.road = edge; e.along = e.car.x; }
          e.dir = this.rng() < 0.5 ? 1 : -1;
        } else {
          e.dir *= -1;
        }
        e.turnCooldown = 4;
      }
      this.placeCar(e);
    }
    // Walkers: stroll their block edge, turn the corner, keep going.
    for (const p of this.peds) {
      if (p.fallen) {
        p.fallT += dt;
        if (p.fallT > 6) {
          // Get up somewhere else and walk on.
          const rng = this.rng;
          p.blockX = pick(rng, WORLD.roads.slice(0, -1)).valueOf() + 28;
          p.blockZ = pick(rng, WORLD.roads.slice(0, -1)).valueOf() + 28;
          p.edge = Math.floor(rng() * 4);
          p.t = range(rng, 0, 44);
          p.fallen = false;
          p.fallT = 0;
        }
        this.placePed(p);
        continue;
      }
      p.t += p.dir * p.speed * dt;
      p.phase += dt * p.speed * 4;
      if (p.t >= 44) {
        p.t = 0;
        p.edge = (p.edge + 1) % 4;
      } else if (p.t <= 0) {
        p.t = 44;
        p.edge = (p.edge + 3) % 4;
      }
      this.placePed(p);
    }
  }
}
