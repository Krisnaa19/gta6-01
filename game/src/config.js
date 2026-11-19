// World layout and tuning numbers for SOLMAR. Pure data, no scene code here,
// so every system agrees on the same streets, spots and limits.

// Streets run on a 56 m grid. Roads sit on the coordinates below; the blocks
// between them hold the buildings. The beach and the sea are on the west side
// (negative x), the rest of the city is wrapped by a drivable edge.
export const WORLD = {
  spacing: 56,
  roadHalf: 6,
  roads: [-224, -168, -112, -56, 0, 56, 112, 168, 224],
  cityHalf: 252,
  seaEdge: -296,
  bound: 296,
  sandFrom: -300,
  sandTo: -252,
};

// Named places the missions point at. All of them sit on or beside a road.
export const SPOTS = {
  spawn: { x: 8, z: 8 },
  sedan: { x: 56, z: 14 },
  pickup: { x: 112, z: -56 },
  dropoff: { x: -56, z: 168 },
  sport: { x: -112, z: 112 },
  fence: { x: -196, z: 196 },
  package: { x: 168, z: 56 },
  safehouse: { x: 196, z: -196 },
  getaway: { x: 0, z: -168 },
};

export const BUILDING_COLORS = [
  0xe8ddc9, 0xd9c7a7, 0xc9b8a3, 0xb8c4cc, 0xd8cfc0,
  0xe0a878, 0xc98f6a, 0xa8b8c8, 0xe8e0d0, 0x9fb8a8,
];

export const CAR_COLORS = [
  0xc23b2e, 0x2e6fc2, 0xe8e8e8, 0x2a2a2e, 0x3f8f4f,
  0xd8a020, 0x7a4a9e, 0x40a0a8, 0xc2682a, 0x8a94a0,
];

// Arcade tuning: forgiving on purpose, a city drive should feel loose.
export const TUNE = {
  walkSpeed: 4.2,
  runSpeed: 8.0,
  jumpSpeed: 7.5,
  gravity: 20,
  carAccel: 16,
  carBrake: 26,
  carReverseMax: 10,
  sedanMax: 30,
  sportMax: 40,
  copMax: 33,
  carRadius: 2.1,
  playerRadius: 0.6,
  pedRadius: 0.5,
};

export const SAVE_KEY = 'solmar-save-v1';
