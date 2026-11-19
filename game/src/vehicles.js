// Cars: a boxy low-poly build shared by traffic, police and the player, plus
// the arcade driving model. A car is a heading, a speed and a steer angle;
// the mesh just follows. Forward is +z when heading is 0.

import * as THREE from 'three';
import { TUNE } from './config.js';
import { clamp, angleLerp } from './utils.js';

export function makeCarMesh({ color, police = false, sport = false }) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: police ? 0xf2f2f2 : color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1c });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, sport ? 0.5 : 0.62, 4.4), bodyMat);
  body.position.y = sport ? 0.5 : 0.56;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.55, 2.2), glassMat);
  cabin.position.set(0, 1.05, -0.25);
  cabin.castShadow = true;
  group.add(cabin);

  if (police) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.2, 4.42), darkMat);
    stripe.position.y = 0.62;
    group.add(stripe);
  }
  if (sport) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.5), darkMat);
    wing.position.set(0, 1.0, -2.15);
    group.add(wing);
  }

  // Headlights and tail lights.
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff6c0, emissive: 0xfff2a0, emissiveIntensity: 0.7 });
  for (const sx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.06), lightMat);
    h.position.set(sx, 0.58, 2.22);
    group.add(h);
  }
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xc02020, emissive: 0x800000, emissiveIntensity: 0.6 });
  for (const sx of [-0.6, 0.6]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.06), tailMat);
    t.position.set(sx, 0.58, -2.22);
    group.add(t);
  }

  // Light bar for police cars; the two halves flash in turn.
  let lightL = null;
  let lightR = null;
  if (police) {
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.4), darkMat);
    barBase.position.set(0, 1.38, -0.25);
    group.add(barBase);
    const redMat = new THREE.MeshLambertMaterial({ color: 0xd02020, emissive: 0xff2020, emissiveIntensity: 0.4 });
    const blueMat = new THREE.MeshLambertMaterial({ color: 0x2050d0, emissive: 0x2050ff, emissiveIntensity: 0.4 });
    lightL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.36), redMat);
    lightL.position.set(-0.32, 1.48, -0.25);
    lightR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.36), blueMat);
    lightR.position.set(0.32, 1.48, -0.25);
    group.add(lightL);
    group.add(lightR);
  }

  // Four wheels; the front pair also yaws with the steering.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [[-0.88, 1.45], [0.88, 1.45], [-0.88, -1.45], [0.88, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.position.set(wx, 0.36, wz);
    w.castShadow = true;
    group.add(w);
    wheels.push(w);
  }

  return { group, wheels, lightL, lightR };
}

export class Car {
  constructor({ color = 0x888888, police = false, sport = false, x = 0, z = 0, heading = 0, name = 'car' }) {
    const built = makeCarMesh({ color, police, sport });
    this.group = built.group;
    this.wheels = built.wheels;
    this.lightL = built.lightL;
    this.lightR = built.lightR;
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.police = police;
    this.sport = sport;
    this.name = name;
    this.maxSpeed = sport ? TUNE.sportMax : police ? TUNE.copMax : TUNE.sedanMax;
    this.ai = false;
    this.stuckT = 0;
    this.sync();
  }

  forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  // Arcade player driving: W/S throttle and brake, A/D steering, Space
  // handbrake for sharper turns. Returns nothing; the world resolves hits.
  drive(dt, input) {
    const fwd = this.speed >= 0 ? 1 : -1;
    let throttle = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) throttle = 1;
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) throttle = -1;
    const handbrake = input.isDown('Space');

    if (throttle > 0) this.speed += TUNE.carAccel * dt;
    else if (throttle < 0) {
      this.speed += this.speed > 0.5 ? -TUNE.carBrake * dt : -TUNE.carAccel * 0.6 * dt;
    } else {
      this.speed -= Math.sign(this.speed) * 6 * dt;
      if (Math.abs(this.speed) < 0.2) this.speed = 0;
    }
    if (handbrake) {
      this.speed -= Math.sign(this.speed) * 22 * dt;
    }
    // Drag grows with speed; reverse is capped low.
    this.speed -= this.speed * 0.35 * dt;
    this.speed = clamp(this.speed, -TUNE.carReverseMax, this.maxSpeed);

    let steerTarget = 0;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) steerTarget = 1;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) steerTarget = -1;
    const steerSpeed = handbrake ? 6 : 4;
    this.steer = clamp(this.steer + (steerTarget - this.steer) * Math.min(1, steerSpeed * dt), -0.62, 0.62);

    const grip = handbrake ? 1.7 : 1;
    this.heading += (this.steer * this.speed * dt * grip) / 3.1 * fwd;
    const f = this.forward();
    this.x += f.x * this.speed * dt;
    this.z += f.z * this.speed * dt;
  }

  // Police chase driving: steer toward a target point, full throttle unless
  // right on top of it. Same integrator as the player, different input.
  chase(dt, tx, tz) {
    const dx = tx - this.x;
    const dz = tz - this.z;
    const want = Math.atan2(dx, dz);
    const diff = ((want - this.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.steer = clamp(diff * 1.4, -0.62, 0.62);
    const dist = Math.hypot(dx, dz);
    const target = dist < 6 ? this.maxSpeed * 0.35 : this.maxSpeed;
    this.speed += clamp(target - this.speed, -TUNE.carBrake * dt, TUNE.carAccel * dt);
    this.heading += (this.steer * this.speed * dt) / 3.1;
    const f = this.forward();
    this.x += f.x * this.speed * dt;
    this.z += f.z * this.speed * dt;
  }

  // Cruise along a straight road line (traffic use).
  cruise(dt, dirX, dirZ, speed) {
    this.speed = speed;
    this.heading = Math.atan2(dirX, dirZ);
    this.x += dirX * speed * dt;
    this.z += dirZ * speed * dt;
  }

  sync() {
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;
    const spin = (this.speed * 0.016) / 0.36;
    for (const w of this.wheels) w.rotation.x += spin;
    if (this.wheels[0]) this.wheels[0].rotation.y = this.steer * 0.45;
    if (this.wheels[1]) this.wheels[1].rotation.y = this.steer * 0.45;
  }
}
