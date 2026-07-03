// Collision regression test: walk into a placed block from all 4 sides and
// jump under a ceiling - the player must never end up on the other side.

import assert from 'node:assert';
import * as THREE from 'three';
import { World } from '../src/world.js';
import { Player } from '../src/player.js';
import { B } from '../src/blocks.js';

const fakeScene = { add() {}, remove() {} };
const world = new World(fakeScene, null, 1);
const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 400);
const inventory = { heldItem: () => null };

// build a flat test arena: stone floor at y=10, air above
for (let z = 0; z < 32; z++) {
  for (let x = 0; x < 32; x++) {
    for (let y = 0; y < 30; y++) {
      world.setBlock(x, y, z, y <= 10 ? B.STONE : B.AIR);
    }
  }
}
// the "placed block" in the middle (1 wide, 2 tall so it can't be stepped over)
const BX = 16, BZ = 16;
world.setBlock(BX, 11, BZ, B.PLANKS);
world.setBlock(BX, 12, BZ, B.PLANKS);

const player = new Player(world, camera);

function run(startX, startZ, yaw, seconds = 1.5) {
  player.pos.set(startX, 11.001, startZ);
  player.vel.set(0, 0, 0);
  player.yaw = yaw;
  player.pitch = 0;
  player.keys = { KeyW: true };
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i++) player.update(dt, inventory);
  player.keys = {};
  return player.pos;
}

// walk into the block from each side; assert we stay on our side of it
// yaw: forward = (-sin yaw, 0, -cos yaw)
const cases = [
  { name: '+x (west side)', start: [BX - 1.5 + 0.5, BZ + 0.5], yaw: -Math.PI / 2, check: (p) => p.x < BX },
  { name: '-x (east side)', start: [BX + 2.5 - 0.5, BZ + 0.5], yaw: Math.PI / 2, check: (p) => p.x > BX + 1 },
  { name: '+z (north side)', start: [BX + 0.5, BZ - 1.5 + 0.5], yaw: Math.PI, check: (p) => p.z < BZ },
  { name: '-z (south side)', start: [BX + 0.5, BZ + 2.5 - 0.5], yaw: 0, check: (p) => p.z > BZ + 1 },
];

for (const c of cases) {
  const p = run(c.start[0], c.start[1], c.yaw);
  const pass = c.check(p);
  console.log(`${pass ? 'ok' : 'FAIL'}: walk ${c.name} -> ended at ${p.x.toFixed(2)}, ${p.z.toFixed(2)}`);
  assert.ok(pass, `walked through the block from ${c.name}`);
}

// ceiling: jump under a slab, must not teleport above it
world.setBlock(20, 13, 20, B.PLANKS);
player.pos.set(20.5, 11.001, 20.5);
player.vel.set(0, 0, 0);
player.keys = { Space: true };
let maxY = 0;
for (let i = 0; i < 120; i++) {
  player.update(1 / 60, inventory);
  maxY = Math.max(maxY, player.pos.y);
}
player.keys = {};
console.log(`${maxY < 13 ? 'ok' : 'FAIL'}: ceiling jump -> max feet y ${maxY.toFixed(2)} (ceiling at 13)`);
assert.ok(maxY < 13, 'jumped through the ceiling');

// wedge check: player must never end up stuck inside a solid block
assert.ok(!player.collides(), 'player ended inside a block');

console.log('\nAll physics tests passed.');
