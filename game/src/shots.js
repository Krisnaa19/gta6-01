// Deterministic screenshot setups for ?shot=. Each one arranges the live
// game into a single frozen moment the judges can compare with the real
// game: a police chase, the city from above, a mission on foot, and the
// start screen over the skyline. The main loop flags window.__shotReady
// after enough frames have rendered.

import { SPOTS } from './config.js';
import { Car } from './vehicles.js';

function placeCop(game, x, z, speed) {
  const car = new Car({ police: true, x, z, heading: Math.PI / 2, name: 'cop' });
  car.ai = true;
  car.speed = speed;
  game.scene.add(car.group);
  game.police.copCars.push({ car, lastX: x, lastZ: z, stuckT: 0 });
  return car;
}

export function applyShot(game, name) {
  const g = game;
  g.shotMode = true;
  g.hud.hideStart();
  g.hud.hidePause();
  g.hud.show();
  g.hud.hideHint();

  if (name === 'chase') {
    // Mission 2, second step: the stolen Comet, two patrol cars on Dario's
    // tail, three stars, the fence waiting across town.
    g.state = 'playing';
    const sport = g.missionCars.sport;
    sport.x = -40;
    sport.z = 0;
    sport.heading = Math.PI / 2;
    sport.speed = 24;
    sport.sync();
    g.player.inCar = sport;
    g.player.sync();
    placeCop(g, -58, 3.5, 24);
    placeCop(g, -66, -3.5, 24);
    g.police.heat = 55;
    // The two patrol cars are re-staged every frame by the main loop (see
    // the chase block in tick): flanking the Comet, just off its bumpers, so
    // they read at the same scale as the hero car instead of looming over
    // the camera from directly behind it.
    g.shotChase = { speed: 24, offsets: [[3, 5.5], [4, -5]] };
    g.missions.index = 1;
    g.missions.stepIdx = 1;
    g.missions.active = true;
    g.missions.briefing = null;
    g.hud.hideDialogue();
    g.missions.placeMarker();
    // A little traffic ahead so the road feels alive.
    const ahead = [[30, 0, 1], [72, -2.8, 1], [115, 2.8, -1]];
    g.traffic.cars.slice(0, 3).forEach((e, i) => {
      const [along, lane, dir] = ahead[i];
      e.axis = 'x';
      e.road = 0;
      e.along = along;
      e.dir = dir;
      e.car.z = lane;
      g.traffic.placeCar(e);
    });
    g.camYaw = Math.PI * 1.5;
    g.camPitch = 0.42;
  } else if (name === 'city') {
    // High over the east side, looking west across the grid to the sea.
    g.state = 'playing';
    g.player.x = 0;
    g.player.z = 0;
    g.player.heading = Math.PI;
    g.player.sync();
    g.shotCamera = {
      pos: [130, 80, 175],
      look: [-200, 0, -25],
    };
    g.missions.active = false;
    g.missions.done = false;
  } else if (name === 'mission') {
    // Mission 1, first step: Dario on foot a few steps from the blue sedan,
    // the beacon marking it, the job line in the HUD.
    g.state = 'playing';
    g.player.x = 46;
    g.player.z = 10;
    g.player.heading = Math.PI / 2;
    g.player.sync();
    g.missions.index = 0;
    g.missions.stepIdx = 0;
    g.missions.active = true;
    g.missions.briefing = null;
    g.hud.hideDialogue();
    g.missions.placeMarker();
    g.camYaw = Math.PI * 1.5;
    g.camPitch = 0.32;
  } else {
    // Start screen: menu state, camera low over the rooftops toward the sea.
    g.state = 'menu';
    g.hud.showStart(false);
    g.hud.hide();
    g.shotCamera = {
      pos: [200, 85, 120],
      look: [-160, 8, -30],
    };
  }
}
