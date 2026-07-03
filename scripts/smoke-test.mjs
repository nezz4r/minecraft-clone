// Headless smoke test: exercises world gen, meshing, raycast/physics math,
// and inventory/crafting without a browser (DOM-touching code paths avoided).

import assert from 'node:assert';
import { Noise2D, Noise3D, hash2 } from '../src/noise.js';
import { B, BLOCKS, isSolid } from '../src/blocks.js';
import { Inventory, RECIPES, canCraft, craft } from '../src/inventory.js';
import { World, CHUNK, HEIGHT, SEA_LEVEL } from '../src/world.js';

// --- noise determinism and range ---
{
  const n = new Noise2D(123);
  const a = n.fbm(1.5, 2.5), b = n.fbm(1.5, 2.5);
  assert.strictEqual(a, b, 'noise deterministic');
  for (let i = 0; i < 500; i++) {
    const v = n.sample(i * 0.13, i * 0.29);
    assert.ok(v >= 0 && v < 1, 'noise2d in range');
  }
  const n3 = new Noise3D(9);
  for (let i = 0; i < 200; i++) {
    const v = n3.sample(i * 0.11, i * 0.07, i * 0.19);
    assert.ok(v >= 0 && v < 1, 'noise3d in range');
  }
  assert.ok(hash2(5, 7, 1) !== hash2(7, 5, 1), 'hash asymmetric');
}
console.log('ok: noise');

// --- world generation ---
const fakeScene = { add() {}, remove() {} };
const world = new World(fakeScene, null, 1337);
{
  const c = world.getChunk(0, 0);
  assert.strictEqual(c.data.length, CHUNK * CHUNK * HEIGHT);

  // bedrock floor everywhere
  for (let z = 0; z < CHUNK; z++)
    for (let x = 0; x < CHUNK; x++)
      assert.strictEqual(world.getBlock(x, 0, z), B.BEDROCK, 'bedrock at y=0');

  // some surface exists, and every surface column is sane
  let grass = 0, sand = 0, water = 0, trees = 0, ores = 0;
  for (let z = -80; z < 80; z++) {
    for (let x = -80; x < 80; x++) {
      for (let y = 0; y < HEIGHT; y++) {
        const b = world.getBlock(x, y, z);
        if (b === B.GRASS) grass++;
        else if (b === B.SAND) sand++;
        else if (b === B.WATER) water++;
        else if (b === B.LOG) trees++;
        else if (b === B.COAL_ORE || b === B.IRON_ORE || b === B.GOLD_ORE || b === B.DIAMOND_ORE) ores++;
      }
    }
  }
  assert.ok(grass > 100, `grass exists (${grass})`);
  assert.ok(trees > 0, `trees exist (${trees})`);
  assert.ok(ores > 0, `ores exist (${ores})`);
  console.log(`ok: worldgen (grass=${grass} sand=${sand} water=${water} logs=${trees} ores=${ores})`);

  // determinism: same block from a fresh world
  const world2 = new World(fakeScene, null, 1337);
  for (let i = 0; i < 200; i++) {
    const x = (i * 37) % 60 - 30, z = (i * 53) % 60 - 30, y = (i * 7) % HEIGHT;
    assert.strictEqual(world.getBlock(x, y, z), world2.getBlock(x, y, z), 'gen deterministic');
  }
  console.log('ok: determinism');

  // tree parts must be identical whether generated from either side of a chunk border
  const wA = new World(fakeScene, null, 42);
  const wB = new World(fakeScene, null, 42);
  wA.getChunk(0, 0); // generate left first
  wB.getChunk(1, 0); // generate right first
  for (let y = 20; y < HEIGHT; y++) {
    for (let z = 0; z < CHUNK; z++) {
      for (const x of [14, 15, 16, 17]) {
        assert.strictEqual(wA.getBlock(x, y, z), wB.getBlock(x, y, z),
          `border tree consistency at ${x},${y},${z}`);
      }
    }
  }
  console.log('ok: cross-chunk trees');
}

// --- set/get block and dirty flags ---
{
  world.setBlock(5, 30, 5, B.PLANKS);
  assert.strictEqual(world.getBlock(5, 30, 5), B.PLANKS);
  assert.ok(world.getChunk(0, 0).dirty, 'chunk marked dirty');
  world.setBlock(0, 30, 0, B.STONE);
  // neighbor chunk should also be dirtied by an edge edit
  assert.ok(world.getChunk(-1, 0).dirty, 'neighbor dirtied on edge edit');
}
console.log('ok: setBlock/dirty');

// --- meshing (BufferGeometry works headless) ---
{
  const c = world.getChunk(0, 0);
  world.buildChunkMesh(c);
  assert.ok(c.mesh, 'opaque mesh built');
  assert.ok(c.mesh.geometry.getAttribute('position').count > 0, 'mesh has vertices');
  const idxAttr = c.mesh.geometry.getIndex();
  assert.strictEqual(idxAttr.count % 6, 0, 'quads = 6 indices each');
  assert.ok(!c.dirty, 'dirty cleared after mesh');
}
console.log('ok: meshing');

// --- inventory + crafting ---
{
  const inv = new Inventory();
  inv.add(B.LOG, 5);
  assert.strictEqual(inv.countOf(B.LOG), 5);
  inv.add(B.LOG, 70); // should overflow into second stack
  assert.strictEqual(inv.countOf(B.LOG), 75);
  assert.strictEqual(inv.hotbar[0].count, 64);
  assert.strictEqual(inv.hotbar[1].count, 11);

  const planksRecipe = RECIPES.find((r) => r.out === B.PLANKS);
  assert.ok(canCraft(planksRecipe, inv, false));
  craft(planksRecipe, inv, false);
  assert.strictEqual(inv.countOf(B.LOG), 74);
  assert.strictEqual(inv.countOf(B.PLANKS), 4);

  // pickaxe needs table
  const stickRecipe = RECIPES.find((r) => r.out === 100);
  craft(stickRecipe, inv, false);
  const woodPick = RECIPES.find((r) => r.out === 101);
  assert.ok(!canCraft(woodPick, inv, false), 'pickaxe blocked without table');
  // craft more planks so we have 3 + the table cost
  craft(planksRecipe, inv, false);
  craft(planksRecipe, inv, false);
  assert.ok(canCraft(woodPick, inv, true), 'pickaxe ok with table');
  craft(woodPick, inv, true);
  assert.strictEqual(inv.countOf(101), 1);

  inv.remove(B.LOG, 100);
  assert.strictEqual(inv.countOf(B.LOG), 0);
}
console.log('ok: inventory/crafting');

// --- block registry sanity ---
{
  for (const [id, def] of Object.entries(BLOCKS)) {
    if (Number(id) === B.AIR) continue;
    assert.ok(def.tiles, `block ${def.name} has tiles`);
    assert.ok(def.hardness !== undefined, `block ${def.name} has hardness`);
  }
  assert.ok(isSolid(B.STONE) && !isSolid(B.WATER) && !isSolid(B.AIR));
}
console.log('ok: block registry');

console.log('\nAll smoke tests passed.');
