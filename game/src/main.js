// SOLMAR entry point: builds the renderer and every system, then runs the
// frame loop. This file owns the game state (menu, playing, paused), the
// third-person camera, collisions, getting in and out of cars, and the
// busted / wasted flow. Everything else lives in its own module.

import * as THREE from 'three';
import { WORLD, SPOTS, TUNE } from './config.js';
import { clamp, damp, angleLerp, dist2, mulberry32 } from './utils.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { buildCity } from './city.js';
import { Car } from './vehicles.js';
import { Player } from './player.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { MissionManager } from './missions.js';
import { Hud } from './hud.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { applyShot } from './shots.js';

export class Game {
  constructor() {
    const params = new URLSearchParams(location.search);
    const seed = parseInt(params.get('seed') || '1', 10) || 1;
    this.shotName = params.get('shot') || null;
    this.rng = mulberry32(seed);

    const canvas = document.getElementById('scene');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.camera.position.set(0, 60, 190);

    this.city = buildCity(this.scene, this.rng);
    this.traffic = new Traffic(this.scene, this.rng);
    this.traffic.spawn();

    // The three cars the story hands Dario, parked where the missions say.
    this.missionCars = {
      sedan: new Car({ color: 0x2a6fc2, x: SPOTS.sedan.x, z: SPOTS.sedan.z, heading: 0, name: 'sedan' }),
      sport: new Car({ color: 0xf2c200, sport: true, x: SPOTS.sport.x, z: SPOTS.sport.z, heading: Math.PI / 2, name: 'sport' }),
      getaway: new Car({ color: 0xc22e2e, sport: true, x: SPOTS.getaway.x, z: SPOTS.getaway.z, heading: 0, name: 'getaway' }),
    };
    this.cars = Object.values(this.missionCars);
    for (const car of this.cars) this.scene.add(car.group);

    this.player = new Player(this.scene);
    this.player.x = SPOTS.spawn.x;
    this.player.z = SPOTS.spawn.z;
    this.player.sync();

    this.audio = new AudioEngine();
    this.input = new Input();
    this.input.attach(canvas);
    this.hud = new Hud();
    this.police = new Police(this.scene, this.rng, this.audio);
    this.missions = new MissionManager(this.scene, this.hud);

    this.state = 'menu';
    this.money = 250;
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.lastDragT = -10;
    this.elapsed = 0;
    this.menuOrbitT = 0;
    this.saveT = 0;
    this.crashCooldown = 0;
    this.damageCooldown = 0;
    this.shotMode = false;
    this.shotCamera = null;
    this.shotChase = null;
    this.shotFrames = 0;
    this.camPos = new THREE.Vector3(0, 60, 190);
    this.camSnap = true;

    this.hud.el.btnStart.addEventListener('click', () => this.startNewGame());
    this.hud.el.btnContinue.addEventListener('click', () => this.continueGame());
    this.hud.el.btnResume.addEventListener('click', () => this.resumeGame());
    this.hud.el.btnQuit.addEventListener('click', () => this.quitToMenu());
    this.hud.el.btnMute.addEventListener('click', () => this.toggleMute());
    canvas.addEventListener('pointerdown', () => this.audio.ensure());
    window.addEventListener('keydown', () => this.audio.ensure());
    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pauseGame();
    });

    if (this.shotName) {
      applyShot(this, this.shotName);
    } else {
      this.hud.showStart(hasSave());
    }

    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.tick());
    window.__solmar = this;
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  startNewGame() {
    this.money = 250;
    this.player.health = 100;
    this.player.x = SPOTS.spawn.x;
    this.player.z = SPOTS.spawn.z;
    this.player.y = 0;
    this.player.inCar = null;
    this.player.sync();
    this.police.clearHeat();
    this.missions.start(0);
    this.state = 'playing';
    this.hud.hideStart();
    this.hud.show();
    this.hud.showHint(25);
    this.audio.ensure();
    this.audio.startMusic();
    this.camSnap = true;
    this.save();
  }

  continueGame() {
    const data = loadGame();
    if (!data) {
      this.startNewGame();
      return;
    }
    this.money = data.money ?? 250;
    this.player.health = data.health ?? 100;
    this.player.x = data.px ?? SPOTS.spawn.x;
    this.player.z = data.pz ?? SPOTS.spawn.z;
    this.player.inCar = null;
    this.player.sync();
    this.police.clearHeat();
    this.missions.start(data.mission ?? 0);
    this.state = 'playing';
    this.hud.hideStart();
    this.hud.show();
    this.hud.showHint(15);
    this.audio.ensure();
    this.audio.startMusic();
    this.camSnap = true;
  }

  pauseGame() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.audio.setEngine(0, false);
    this.hud.showPause(this.audio.muted);
    this.save();
  }

  resumeGame() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.hud.hidePause();
  }

  quitToMenu() {
    this.save();
    this.state = 'menu';
    this.hud.hidePause();
    this.hud.hide();
    this.hud.showStart(hasSave());
  }

  toggleMute() {
    this.audio.setMuted(!this.audio.muted);
    if (this.state === 'paused') this.hud.showPause(this.audio.muted);
  }

  save() {
    const p = this.player;
    const px = p.inCar ? p.inCar.x : p.x;
    const pz = p.inCar ? p.inCar.z : p.z;
    saveGame({ money: this.money, mission: this.missions.index, health: Math.round(p.health), px, pz });
  }

  damagePlayer(n) {
    if (this.state !== 'playing' || this.damageCooldown > 0) return;
    this.damageCooldown = 0.6;
    this.player.health -= n;
    this.player.hurtT = 0.5;
    this.audio.thud(false);
    if (this.player.health <= 0) this.onWasted();
  }

  respawn() {
    const p = this.player;
    if (p.inCar) {
      p.inCar.speed = 0;
      p.inCar = null;
    }
    p.x = SPOTS.safehouse.x;
    p.z = SPOTS.safehouse.z + 12;
    p.y = 0;
    p.health = 100;
    p.sync();
    this.police.clearHeat();
    this.camSnap = true;
    this.save();
  }

  onBusted() {
    this.money = Math.max(0, this.money - 100);
    this.hud.banner('BUSTED', 'The Solmar PD caught up with you. -$100');
    this.audio.jingle(false);
    this.respawn();
  }

  onWasted() {
    this.money = Math.max(0, this.money - 150);
    this.hud.banner('WASTED', 'Dario wakes up at the safehouse. -$150');
    this.audio.jingle(false);
    this.respawn();
  }

  // Push a point out of every building box and keep it inside the world.
  resolveCircle(x, z, r) {
    for (const b of this.city.colliders) {
      const cx = clamp(x, b.minX, b.maxX);
      const cz = clamp(z, b.minZ, b.maxZ);
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 < 0.0001) {
          x = b.maxX + r;
        } else {
          const d = Math.sqrt(d2);
          x = cx + (dx / d) * r;
          z = cz + (dz / d) * r;
        }
      }
    }
    x = clamp(x, -WORLD.bound + 2, WORLD.bound - 2);
    z = clamp(z, -WORLD.bound + 2, WORLD.bound - 2);
    if (x < WORLD.seaEdge + 2) x = WORLD.seaEdge + 2;
    return { x, z };
  }

  allCars() {
    return [
      ...this.cars,
      ...this.traffic.cars.map((e) => e.car),
      ...this.police.copCars.map((e) => e.car),
    ];
  }

  // A car against buildings, the sea wall and every other car.
  resolveCarCollision(car) {
    const fixed = this.resolveCircle(car.x, car.z, 2.1);
    if (fixed.x !== car.x || fixed.z !== car.z) {
      if (Math.abs(car.speed) > 8 && car === this.player.inCar && this.crashCooldown <= 0) {
        this.crashCooldown = 0.8;
        this.damagePlayer(6);
        this.audio.thud(true);
      }
      car.speed *= 0.4;
      car.x = fixed.x;
      car.z = fixed.z;
    }
    for (const other of this.allCars()) {
      if (other === car) continue;
      const d = dist2(car.x, car.z, other.x, other.z);
      if (d < 4.0 && d > 0.01) {
        const push = (4.0 - d) / 2;
        const nx = (car.x - other.x) / d;
        const nz = (car.z - other.z) / d;
        car.x += nx * push;
        car.z += nz * push;
        if (!other.ai || other === this.player.inCar) {
          other.x -= nx * push;
          other.z -= nz * push;
        }
        const impact = Math.abs(car.speed) + Math.abs(other.speed);
        if (impact > 12 && (car === this.player.inCar || other === this.player.inCar) && this.crashCooldown <= 0) {
          this.crashCooldown = 0.8;
          this.damagePlayer(5 + impact * 0.25);
          this.audio.thud(true);
        }
        car.speed *= 0.85;
      }
    }
    car.sync();
  }

  tryEnterExitCar() {
    const p = this.player;
    if (p.inCar) {
      const car = p.inCar;
      const rx = -Math.cos(car.heading);
      const rz = Math.sin(car.heading);
      const spot = this.resolveCircle(car.x + rx * 2.8, car.z + rz * 2.8, 0.6);
      p.x = spot.x;
      p.z = spot.z;
      p.y = 0;
      p.inCar = null;
      car.speed = 0;
      p.sync();
      return;
    }
    let best = null;
    let bestD = 4.5;
    for (const car of this.cars) {
      const d = dist2(p.x, p.z, car.x, car.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    const trafficCar = this.traffic.nearestCar(p.x, p.z, bestD);
    if (trafficCar) best = trafficCar;
    if (!best) return;
    if (this.traffic.cars.some((e) => e.car === best)) {
      this.traffic.steal(best);
      this.police.addHeat(25);
      this.hud.toast('Car stolen');
    }
    best.ai = false;
    p.inCar = best;
    p.sync();
    this.audio.blip(240, 0.1, 'triangle', 0.18);
  }

  // The punch landing: officers first, then anyone else standing close.
  resolvePunch() {
    const p = this.player;
    if (this.police.tryPunch(p.x, p.z, p.heading)) {
      this.audio.thud(false);
      return;
    }
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    for (const ped of this.traffic.peds) {
      if (ped.fallen) continue;
      const dx = ped.mesh.position.x - p.x;
      const dz = ped.mesh.position.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.3 && (dx * fx + dz * fz) / Math.max(d, 0.01) > 0.2) {
        ped.fallen = true;
        ped.fallT = 0;
        this.traffic.placePed(ped);
        this.police.addHeat(15);
        this.audio.thud(false);
        this.hud.toast('Pedestrian down!');
        return;
      }
    }
  }

  updatePlaying(dt) {
    const p = this.player;
    const input = this.input;

    if (input.deltaX !== 0 || input.deltaY !== 0) {
      this.camYaw -= input.deltaX * 0.005;
      this.camPitch = clamp(this.camPitch + input.deltaY * 0.004, 0.08, 0.9);
      this.lastDragT = this.elapsed;
    }

    if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
      this.pauseGame();
      return;
    }
    if (input.wasPressed('KeyM')) this.toggleMute();

    if (p.inCar) {
      p.inCar.drive(dt, input);
      this.resolveCarCollision(p.inCar);
    } else {
      p.update(dt, input, this.camYaw);
      const fixed = this.resolveCircle(p.x, p.z, 0.6);
      p.x = fixed.x;
      p.z = fixed.z;
      p.sync();
      if (p.punchT > 0.18 && !p.punchDidHit) {
        p.punchDidHit = true;
        this.resolvePunch();
      }
    }

    if (input.wasPressed('KeyE')) this.tryEnterExitCar();

    // A moving car clipping Dario on foot hurts.
    if (!p.inCar) {
      for (const car of this.allCars()) {
        if (Math.abs(car.speed) > 3 && dist2(p.x, p.z, car.x, car.z) < 2.4) {
          this.damagePlayer(10);
          const dx = p.x - car.x;
          const dz = p.z - car.z;
          const d = Math.max(0.5, Math.hypot(dx, dz));
          const spot = this.resolveCircle(p.x + (dx / d) * 2, p.z + (dz / d) * 2, 0.6);
          p.x = spot.x;
          p.z = spot.z;
          break;
        }
      }
    }

    this.traffic.update(dt);
    this.traffic.checkPlayerCarHit(p.inCar, () => {
      this.police.addHeat(25);
      this.audio.thud(true);
      this.hud.toast('Pedestrian down!');
    });
    this.police.update(dt, this);
    this.missions.update(dt, this);

    for (const entry of this.police.copCars) this.resolveCarCollision(entry.car);
    this.city.update(dt, p.inCar ? p.inCar.x : p.x, p.inCar ? p.inCar.z : p.z);

    // Engine hum follows the speedometer.
    if (p.inCar) this.audio.setEngine(Math.abs(p.inCar.speed) / p.inCar.maxSpeed, true);
    else this.audio.setEngine(0, false);

    this.saveT += dt;
    if (this.saveT > 20) {
      this.saveT = 0;
      this.save();
    }
    if (this.crashCooldown > 0) this.crashCooldown -= dt;
    if (this.damageCooldown > 0) this.damageCooldown -= dt;
  }

  updateCamera(dt) {
    const p = this.player;
    if (this.shotCamera) {
      this.camera.position.set(...this.shotCamera.pos);
      this.camera.lookAt(...this.shotCamera.look);
      return;
    }
    if (this.state === 'menu') {
      this.menuOrbitT += dt;
      const a = this.menuOrbitT * 0.03;
      const target = new THREE.Vector3(Math.sin(a) * 270, 70, Math.cos(a) * 270);
      this.camPos.set(
        damp(this.camPos.x, target.x, 1, dt),
        damp(this.camPos.y, target.y, 1, dt),
        damp(this.camPos.z, target.z, 1, dt),
      );
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(0, 12, 0);
      return;
    }
    const inCar = !!p.inCar;
    const px = inCar ? p.inCar.x : p.x;
    const pz = inCar ? p.inCar.z : p.z;
    if (inCar && !this.shotMode && this.elapsed - this.lastDragT > 1.2) {
      this.camYaw = angleLerp(this.camYaw, p.inCar.heading + Math.PI, Math.min(1, 1.8 * dt));
    }
    const dist = this.shotMode && this.shotName === 'chase' ? 12 : inCar ? 11 : 7.5;
    const target = new THREE.Vector3(px, inCar ? 1.8 : 1.5, pz);
    const want = new THREE.Vector3(
      px + Math.sin(this.camYaw) * Math.cos(this.camPitch) * dist,
      target.y + Math.sin(this.camPitch) * dist + 0.6,
      pz + Math.cos(this.camYaw) * Math.cos(this.camPitch) * dist,
    );
    if (this.camSnap) {
      this.camPos.copy(want);
      this.camSnap = false;
    } else {
      const k = 1 - Math.exp(-10 * dt);
      this.camPos.lerp(want, k);
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(target);
  }

  updateHud(dt) {
    const p = this.player;
    this.hud.setMoney(this.money);
    this.hud.setHealth(p.health);
    this.hud.setStars(this.police.stars);
    this.hud.setSpeed(p.inCar ? Math.abs(p.inCar.speed) * 3.6 : null);
    this.hud.setObjective(this.missions.objectiveText(this));
    this.hud.drawMinimap(this, this.elapsed);
    this.hud.tickHint(dt);
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;

    if (this.state === 'playing') {
      this.updatePlaying(dt);
      // Chase shot: hold the staged pursuit together. The drive model would
      // otherwise coast the Comet to a stop with no keys pressed, and the
      // patrol cars would bunch up on top of the camera.
      if (this.shotMode && this.shotName === 'chase' && this.player.inCar && this.shotChase) {
        const car = this.player.inCar;
        car.speed = this.shotChase.speed;
        const fx = Math.sin(car.heading);
        const fz = Math.cos(car.heading);
        const rx = -fz;
        const rz = fx;
        this.police.copCars.forEach((entry, i) => {
          const off = this.shotChase.offsets[i % this.shotChase.offsets.length];
          entry.car.x = car.x - fx * off[0] + rx * off[1];
          entry.car.z = car.z - fz * off[0] + rz * off[1];
          entry.car.heading = car.heading;
          entry.car.speed = this.shotChase.speed;
          entry.car.sync();
        });
      }
      this.updateCamera(dt);
      this.updateHud(dt);
    } else if (this.state === 'menu') {
      this.traffic.update(dt);
      this.city.update(dt, 0, 0);
      this.updateCamera(dt);
    }
    // Paused: the frame just renders, nothing moves.

    if (this.shotMode) {
      this.shotFrames++;
      const need = this.shotName === 'start' ? 30 : 45;
      if (this.shotFrames >= need && !window.__shotReady) window.__shotReady = true;
    }

    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }
}

new Game();
