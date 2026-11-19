// Small shared helpers for SOLMAR: math, angles and a seeded random source.
// Nothing here touches the scene; every system imports only what it needs.

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Frame-rate independent smoothing: lambda ~ how fast a follows b.
export function damp(a, b, lambda, dt) {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}

// Wrap an angle into the -PI..PI range so turns always take the short way.
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function angleLerp(a, b, t) {
  return a + wrapAngle(b - a) * t;
}

export function dist2(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

// Deterministic random stream: same seed, same city, every run.
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(rng, a, b) {
  return a + rng() * (b - a);
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function money(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}
