// Dario on foot: a small low-poly figure with a walk swing, a jump and a
// punch. Movement is relative to the camera, so W always walks away from the
// viewer. Driving is handled by the car he is in, not here.

import * as THREE from 'three';
import { TUNE } from './config.js';
import { clamp, angleLerp } from './utils.js';

function limb(w, h, d, color, x, y) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, 0);
  m.castShadow = true;
  return m;
}

export class Player {
  constructor(scene) {
    this.x = 8;
    this.z = 8;
    this.y = 0;
    this.vy = 0;
    this.heading = 0;
    this.onGround = true;
    this.walkPhase = 0;
    this.punchT = 0;
    this.punchDidHit = false;
    this.inCar = null;
    this.health = 100;
    this.hurtT = 0;

    const g = new THREE.Group();
    this.group = g;
    // Legs pivot at the hip so the walk swing looks right.
    this.legL = limb(0.22, 0.55, 0.22, 0x2a2a30, -0.14, 0.28);
    this.legR = limb(0.22, 0.55, 0.22, 0x2a2a30, 0.14, 0.28);
    this.legL.geometry.translate(0, -0.27, 0);
    this.legR.geometry.translate(0, -0.27, 0);
    this.legL.position.y = 0.55;
    this.legR.position.y = 0.55;
    const torso = limb(0.56, 0.62, 0.3, 0x2f6fb2, 0, 0.86);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), new THREE.MeshLambertMaterial({ color: 0xe8b98d }));
    head.position.y = 1.36;
    head.castShadow = true;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.1, 0.44), new THREE.MeshLambertMaterial({ color: 0xc23b2e }));
    cap.position.y = 1.52;
    this.armL = limb(0.16, 0.55, 0.16, 0x2f6fb2, -0.37, 1.08);
    this.armR = limb(0.16, 0.55, 0.16, 0x2f6fb2, 0.37, 1.08);
    this.armL.geometry.translate(0, -0.27, 0);
    this.armR.geometry.translate(0, -0.27, 0);
    this.armL.position.y = 1.08;
    this.armR.position.y = 1.08;
    g.add(this.legL, this.legR, torso, head, cap, this.armL, this.armR);
    scene.add(g);
    this.sync();
  }

  get pos() {
    return { x: this.x, z: this.z };
  }

  update(dt, input, camYaw) {
    if (this.inCar) return;
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.punchT > 0) this.punchT -= dt;

    let mx = 0;
    let mz = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) { mx += -Math.sin(camYaw); mz += -Math.cos(camYaw); }
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) { mx += Math.sin(camYaw); mz += Math.cos(camYaw); }
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) { mx += -Math.cos(camYaw); mz += Math.sin(camYaw); }
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) { mx += Math.cos(camYaw); mz += -Math.sin(camYaw); }
    const len = Math.hypot(mx, mz);
    const running = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = running ? TUNE.runSpeed : TUNE.walkSpeed;
    if (len > 0) {
      mx /= len;
      mz /= len;
      this.x += mx * speed * dt;
      this.z += mz * speed * dt;
      this.heading = angleLerp(this.heading, Math.atan2(mx, mz), Math.min(1, 12 * dt));
      this.walkPhase += dt * speed * 1.6;
    }

    if (input.wasPressed('Space') && this.onGround) {
      this.vy = TUNE.jumpSpeed;
      this.onGround = false;
    }
    if (!this.onGround) {
      this.vy -= TUNE.gravity * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.onGround = true;
      }
    }

    if (input.wasPressed('KeyF') && this.punchT <= 0) {
      this.punchT = 0.3;
      this.punchDidHit = false;
    }

    // Walk swing, idle breathing, and the punch arm.
    const swing = len > 0 ? Math.sin(this.walkPhase) * 0.55 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    if (this.punchT > 0) {
      this.armR.rotation.x = -1.5 * (this.punchT / 0.3);
    } else {
      this.armR.rotation.x = swing * 0.8;
    }
    this.sync();
  }

  sync() {
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.heading;
    this.group.visible = !this.inCar;
  }
}
