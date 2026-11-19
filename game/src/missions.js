// Dario's story in four jobs. Each mission is a short list of steps: go
// somewhere, get in a car, pick something up. The beacon in the world and the
// line in the HUD always point at the current step, and finishing a job pays
// out and unlocks the next one.

import * as THREE from 'three';
import { SPOTS } from './config.js';
import { dist2 } from './utils.js';

const MISSIONS = [
  {
    name: 'First Fare',
    reward: 150,
    briefing: [
      { who: 'Dario', text: 'Another sunny day in Solmar. My dispatcher says the sedan is parked up the street.' },
      { who: 'Dario', text: 'Time to earn. Get in the car, pick up the fare, drop them at the marina.' },
    ],
    steps: [
      { text: 'Get in the blue sedan', target: SPOTS.sedan, r: 5, kind: 'enterCar', car: 'sedan' },
      { text: 'Pick up the passenger', target: SPOTS.pickup, r: 6, kind: 'driveTo' },
      { text: 'Drop the passenger at the marina', target: SPOTS.dropoff, r: 6, kind: 'driveTo' },
    ],
  },
  {
    name: 'Hot Wheels',
    reward: 400,
    briefing: [
      { who: 'Rico', text: 'A friend needs a yellow Comet moved. No questions asked, and quick.' },
      { who: 'Dario', text: 'Borrow it, then. The owner will notice, so I drive straight to the garage.' },
    ],
    steps: [
      {
        text: 'Steal the yellow Comet', target: SPOTS.sport, r: 5, kind: 'enterCar', car: 'sport',
        onDone: (game) => { game.police.addHeat(40); game.hud.toast('STOLEN - the cops are coming'); },
      },
      { text: 'Deliver the Comet to the garage', target: SPOTS.fence, r: 7, kind: 'driveTo' },
    ],
    onComplete: (game) => game.police.clearHeat(),
  },
  {
    name: 'The Drop',
    reward: 600,
    briefing: [
      { who: 'Rico', text: 'A package is waiting in the alley by the market. On foot, no car.' },
      { who: 'Dario', text: 'The moment I touch it, every cop in Solmar will know. Then I run.' },
    ],
    steps: [
      {
        text: 'Pick up the package', target: SPOTS.package, r: 3.5, kind: 'pickup',
        onDone: (game) => { game.police.addHeat(60); game.hud.toast('PACKAGE TAKEN - wanted level 3'); },
      },
      { text: 'Reach the safehouse', target: SPOTS.safehouse, r: 7, kind: 'goto' },
    ],
    onComplete: (game) => game.police.clearHeat(),
  },
  {
    name: 'Solmar Heist',
    reward: 1500,
    briefing: [
      { who: 'Dario', text: 'Last job. The getaway car is ready, and the whole city will be looking for it.' },
      { who: 'Dario', text: 'Drive like the sea is behind you. Get to the safehouse in one piece.' },
    ],
    steps: [
      {
        text: 'Get in the getaway car', target: SPOTS.getaway, r: 5, kind: 'enterCar', car: 'getaway',
        onDone: (game) => { game.police.addHeat(80); game.hud.toast('FOUR STARS - outrun them all'); },
      },
      { text: 'Outrun the police - reach the safehouse', target: SPOTS.safehouse, r: 8, kind: 'driveTo' },
    ],
  },
];

export class MissionManager {
  constructor(scene, hud) {
    this.scene = scene;
    this.hud = hud;
    this.index = 0;
    this.stepIdx = 0;
    this.active = false;
    this.done = false;
    this.waitT = 0;
    this.briefing = null;
    this.briefT = 0;

    // The beacon: a light pillar, a floating marker and a ring on the ground.
    const g = new THREE.Group();
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 2.4, 26, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    pillar.position.y = 13;
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.1),
      new THREE.MeshBasicMaterial({ color: 0xffd23f }),
    );
    gem.position.y = 6;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.2, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    g.add(pillar, gem, ring);
    g.visible = false;
    scene.add(g);
    this.marker = g;
    this.markerGem = gem;
    this.elapsed = 0;
  }

  get current() {
    return MISSIONS[this.index];
  }

  get step() {
    if (!this.current) return null;
    return this.current.steps[this.stepIdx] || null;
  }

  get target() {
    const s = this.step;
    return s && s.target ? s.target : null;
  }

  start(i) {
    this.index = i;
    this.stepIdx = 0;
    this.active = true;
    this.done = false;
    this.briefing = [...this.current.briefing];
    this.briefT = 0;
    this.showBriefLine();
    this.placeMarker();
  }

  showBriefLine() {
    if (!this.briefing || this.briefing.length === 0) {
      this.briefing = null;
      this.hud.hideDialogue();
      return;
    }
    const line = this.briefing[0];
    this.hud.showDialogue(line.who, line.text);
  }

  placeMarker() {
    const t = this.target;
    if (!t) {
      this.marker.visible = false;
      return;
    }
    this.marker.position.set(t.x, 0, t.z);
    this.marker.visible = true;
  }

  completeStep(game) {
    const s = this.step;
    if (s && s.onDone) s.onDone(game);
    this.stepIdx++;
    if (this.stepIdx >= this.current.steps.length) {
      this.completeMission(game);
    } else {
      this.placeMarker();
    }
  }

  completeMission(game) {
    const m = this.current;
    game.money += m.reward;
    game.audio.jingle(true);
    this.hud.banner('MISSION COMPLETE', m.name + '  +$' + m.reward);
    this.marker.visible = false;
    this.active = false;
    if (m.onComplete) m.onComplete(game);
    game.save();
    if (this.index + 1 < MISSIONS.length) {
      this.waitT = 3;
      this.index++;
    } else {
      this.done = true;
      this.hud.banner('SOLMAR COMPLETE', 'Dario owns this city now. Free roam!');
    }
  }

  update(dt, game) {
    this.elapsed += dt;
    if (this.marker.visible) {
      this.markerGem.position.y = 6 + Math.sin(this.elapsed * 2.4) * 0.6;
      this.markerGem.rotation.y += dt * 1.5;
    }
    if (this.waitT > 0) {
      this.waitT -= dt;
      if (this.waitT <= 0) this.start(this.index);
      return;
    }
    if (!this.active) return;
    if (this.briefing) {
      this.briefT += dt;
      if (this.briefT > 4.5) {
        this.briefT = 0;
        this.briefing.shift();
        this.showBriefLine();
      }
      return;
    }
    const s = this.step;
    if (!s) return;
    const p = game.player;
    const px = p.inCar ? p.inCar.x : p.x;
    const pz = p.inCar ? p.inCar.z : p.z;
    if (s.kind === 'goto' || s.kind === 'driveTo') {
      if (s.kind === 'driveTo' && !p.inCar) return;
      if (dist2(px, pz, s.target.x, s.target.z) < s.r) this.completeStep(game);
    } else if (s.kind === 'enterCar') {
      const want = game.missionCars[s.car];
      if (p.inCar === want) this.completeStep(game);
    } else if (s.kind === 'pickup') {
      if (!p.inCar && dist2(px, pz, s.target.x, s.target.z) < s.r && game.input.wasPressed('KeyE')) {
        this.completeStep(game);
      }
    }
  }

  // What the HUD shows for the current job, with the distance to the target.
  objectiveText(game) {
    if (this.done) return { title: 'Free Roam', text: 'Solmar is yours. Drive, explore, stay out of trouble.', dist: null };
    if (!this.active) return { title: '', text: '', dist: null };
    const s = this.step;
    if (!s) return { title: this.current.name, text: '', dist: null };
    const p = game.player;
    const px = p.inCar ? p.inCar.x : p.x;
    const pz = p.inCar ? p.inCar.z : p.z;
    const dist = s.target ? Math.round(dist2(px, pz, s.target.x, s.target.z)) : null;
    return { title: this.current.name, text: s.text, dist };
  }
}
