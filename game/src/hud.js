// Everything the player reads while playing: money, wanted stars, health,
// speed, the current job, dialogue, banners and the minimap. The minimap is
// a plain 2D canvas drawn from the live world state every frame.

import { WORLD, SPOTS } from './config.js';
import { money } from './utils.js';

const MAP_SIZE = 200;
const MAP_SCALE = MAP_SIZE / 600;

export class Hud {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      hud: $('hud'),
      money: $('money'),
      objTitle: $('obj-title'),
      objText: $('obj-text'),
      objDist: $('obj-dist'),
      objPanel: $('objective'),
      stars: $('stars'),
      healthFill: $('health-fill'),
      speed: $('speed'),
      speedBox: $('speed-box'),
      map: $('minimap'),
      dialogue: $('dialogue'),
      dlgWho: $('dlg-who'),
      dlgText: $('dlg-text'),
      banner: $('banner'),
      bannerTitle: $('banner-title'),
      bannerSub: $('banner-sub'),
      toast: $('toast'),
      hint: $('hint'),
      startScreen: $('start-screen'),
      btnStart: $('btn-start'),
      btnContinue: $('btn-continue'),
      pauseScreen: $('pause-screen'),
      btnResume: $('btn-resume'),
      btnQuit: $('btn-quit'),
      btnMute: $('btn-mute'),
    };
    this.mapCtx = this.el.map.getContext('2d');
    this.lastStars = -1;
    this.lastMoney = -1;
    this.lastHealth = -1;
    this.bannerTimer = null;
    this.toastTimer = null;
    this.hintTimer = 0;
    // Build the five star slots once; only their fill changes.
    this.starSpans = [];
    for (let i = 0; i < 5; i++) {
      const s = document.createElement('span');
      s.className = 'star';
      s.textContent = '★';
      this.el.stars.appendChild(s);
      this.starSpans.push(s);
    }
  }

  show() { this.el.hud.style.display = 'block'; }
  hide() { this.el.hud.style.display = 'none'; }

  setMoney(n) {
    if (n === this.lastMoney) return;
    this.lastMoney = n;
    this.el.money.textContent = money(n);
  }

  setHealth(h) {
    const v = Math.round(h);
    if (v === this.lastHealth) return;
    this.lastHealth = v;
    this.el.healthFill.style.width = Math.max(0, v) + '%';
    this.el.healthFill.style.background = v > 50 ? '#58c96b' : v > 25 ? '#e8b23f' : '#d8402e';
  }

  setStars(n) {
    if (n === this.lastStars) return;
    this.lastStars = n;
    this.starSpans.forEach((s, i) => {
      s.classList.toggle('on', i < n);
    });
    this.el.stars.style.display = n > 0 ? 'block' : 'none';
  }

  setSpeed(kmh) {
    if (kmh === null) {
      this.el.speedBox.style.display = 'none';
      return;
    }
    this.el.speedBox.style.display = 'block';
    this.el.speed.textContent = Math.round(kmh);
  }

  setObjective(o) {
    this.el.objPanel.style.display = o.title ? 'block' : 'none';
    if (!o.title) return;
    this.el.objTitle.textContent = o.title || '';
    this.el.objText.textContent = o.text || '';
    this.el.objDist.textContent = o.dist === null || o.dist === undefined ? '' : o.dist + ' m';
  }

  showDialogue(who, text) {
    this.el.dialogue.style.display = 'block';
    this.el.dlgWho.textContent = who;
    this.el.dlgText.textContent = text;
  }

  hideDialogue() {
    this.el.dialogue.style.display = 'none';
  }

  banner(title, sub) {
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub || '';
    this.el.banner.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => this.el.banner.classList.remove('show'), 3000);
  }

  toast(text) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.el.toast.classList.remove('show'), 2600);
  }

  showStart(hasSave) {
    this.el.startScreen.style.display = 'flex';
    this.el.btnContinue.style.display = hasSave ? 'block' : 'none';
  }

  hideStart() {
    this.el.startScreen.style.display = 'none';
  }

  showPause(muted) {
    this.el.pauseScreen.style.display = 'flex';
    this.el.btnMute.textContent = muted ? 'Sound: Off' : 'Sound: On';
  }

  hidePause() {
    this.el.pauseScreen.style.display = 'none';
  }

  showHint(seconds) {
    this.el.hint.style.display = 'block';
    this.hintTimer = seconds;
  }

  hideHint() {
    this.el.hint.style.display = 'none';
    this.hintTimer = 0;
  }

  tickHint(dt) {
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.el.hint.style.display = 'none';
    }
  }

  // Top-down map: sea and sand on the west, roads as a grid, the player as
  // an arrow, traffic as white dots, police as blue dots, the job target
  // as a pulsing yellow diamond. North (-z) is up.
  drawMinimap(game, time) {
    const ctx = this.mapCtx;
    const S = MAP_SCALE;
    const toX = (x) => (x + 300) * S;
    const toY = (z) => (z + 300) * S;
    ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
    ctx.fillStyle = '#10181f';
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    // Sea and sand on the west edge.
    ctx.fillStyle = '#1e5f8a';
    ctx.fillRect(0, 0, toX(-252), MAP_SIZE);
    ctx.fillStyle = '#c9ad72';
    ctx.fillRect(toX(-300), 0, toX(-252) - toX(-300), MAP_SIZE);
    // Roads.
    ctx.strokeStyle = '#4a4f55';
    ctx.lineWidth = 3;
    for (const r of WORLD.roads) {
      ctx.beginPath();
      ctx.moveTo(toX(-252), toY(r));
      ctx.lineTo(toX(252), toY(r));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(toX(r), toY(-252));
      ctx.lineTo(toX(r), toY(252));
      ctx.stroke();
    }
    // Safehouse and garage marks.
    ctx.fillStyle = '#5aa0e0';
    ctx.fillRect(toX(SPOTS.safehouse.x) - 3, toY(SPOTS.safehouse.z) - 3, 6, 6);
    ctx.fillStyle = '#e0a020';
    ctx.fillRect(toX(SPOTS.fence.x) - 3, toY(SPOTS.fence.z) - 3, 6, 6);
    // Objective diamond, pulsing.
    const target = game.missions.target;
    if (target && game.missions.active) {
      const pulse = 5 + Math.sin(time * 5) * 1.5;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(toX(target.x), toY(target.z) - pulse);
      ctx.lineTo(toX(target.x) + pulse, toY(target.z));
      ctx.lineTo(toX(target.x), toY(target.z) + pulse);
      ctx.lineTo(toX(target.x) - pulse, toY(target.z));
      ctx.closePath();
      ctx.fill();
    }
    // Traffic as white dots.
    ctx.fillStyle = '#e8e8e8';
    for (const e of game.traffic.cars) {
      ctx.fillRect(toX(e.car.x) - 1.5, toY(e.car.z) - 1.5, 3, 3);
    }
    // Police as blue dots with a red edge when their lights flash.
    for (const entry of game.police.copCars) {
      ctx.fillStyle = '#3f8cff';
      ctx.beginPath();
      ctx.arc(toX(entry.car.x), toY(entry.car.z), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const f of game.police.footCops) {
      if (f.fallen) continue;
      ctx.fillStyle = '#3f8cff';
      ctx.fillRect(toX(f.mesh.position.x) - 2, toY(f.mesh.position.z) - 2, 4, 4);
    }
    // The player: a white arrow pointing where Dario faces.
    const p = game.player;
    const px = p.inCar ? p.inCar.x : p.x;
    const pz = p.inCar ? p.inCar.z : p.z;
    const heading = p.inCar ? p.inCar.heading : p.heading;
    ctx.save();
    ctx.translate(toX(px), toY(pz));
    ctx.rotate(Math.atan2(Math.sin(heading), -Math.cos(heading)) + Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
