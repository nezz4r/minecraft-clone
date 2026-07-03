// Headless gameplay tests for v2: drops physics + pickup, player health
// (fall damage, drowning, death drops), combat, mob loot, eating, recipes.

import assert from 'node:assert';
import * as THREE from 'three';
import { World } from '../src/world.js';
import { Player } from '../src/player.js';
import { DropManager } from '../src/drops.js';
import { MobManager } from '../src/mobs.js';
import { Inventory, RECIPES, canCraft, craft } from '../src/inventory.js';
import { B, I, ITEMS } from '../src/blocks.js';

const fakeScene = { add() {}, remove() {} };
const world = new World(fakeScene, null, 7);
const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 400);

// flat arena: floor at y=10
for (let z = 0; z < 40; z++)
  for (let x = 0; x < 40; x++)
    for (let y = 0; y < 40; y++)
      world.setBlock(x, y, z, y <= 10 ? B.STONE : B.AIR);

const inventory = new Inventory();
const player = new Player(world, camera);
player.pos.set(20.5, 11.001, 20.5);
const drops = new DropManager(fakeScene, world, null);
const mobs = new MobManager(fakeScene, world, drops);

const step = (n, dt = 1 / 60) => {
  for (let i = 0; i < n; i++) {
    player.update(dt, inventory);
    drops.update(dt, player, inventory);
  }
};

// --- drop lands, bobs, and gets picked up ---
{
  drops.spawn(B.DIRT, 3, 25.5, 15, 20.5, false);
  for (let i = 0; i < 120; i++) drops.update(1 / 60, { pos: new THREE.Vector3(0, 0, 0), dead: false }, inventory);
  assert.strictEqual(drops.drops.length, 1, 'drop still exists far from player');
  const d = drops.drops[0];
  assert.ok(Math.abs(d.pos.y - 11.18) < 0.2, `drop rests on floor (y=${d.pos.y.toFixed(2)})`);

  // player walks near -> magnet + pickup
  player.pos.set(24.5, 11.001, 20.5);
  for (let i = 0; i < 90 && drops.drops.length; i++) drops.update(1 / 60, player, inventory);
  assert.strictEqual(drops.drops.length, 0, 'drop picked up');
  assert.strictEqual(inventory.countOf(B.DIRT), 3, 'inventory got the stack');
}
console.log('ok: drops physics + magnet pickup');

// --- mining spawns a drop via callback ---
{
  player.onBlockMined = (id, x, y, z) => drops.spawn(id, 1, x, y, z);
  world.setBlock(22, 11, 20, B.SAND);
  player.pos.set(20.5, 11.001, 20.5);
  player.yaw = -Math.PI / 2; // face +x
  player.pitch = -0.5;       // eye is above the block, aim down at it
  player.leftDown = true;
  step(70); // sand = 0.75s
  player.leftDown = false;
  assert.strictEqual(world.getBlock(22, 11, 20), B.AIR, 'sand mined');
  assert.ok(drops.drops.length === 1 || inventory.countOf(B.SAND) === 1, 'sand dropped');
  // walk into pickup range
  for (let i = 0; i < 120 && drops.drops.length; i++) drops.update(1 / 60, player, inventory);
  assert.strictEqual(inventory.countOf(B.SAND), 1, 'sand collected');
}
console.log('ok: mining -> floating drop -> pickup');

// --- fall damage ---
{
  player.hp = 20;
  player.pos.set(20.5, 25, 20.5); // 14-block fall
  player.vel.set(0, 0, 0);
  step(180);
  assert.ok(player.hp < 20, `fall damage applied (hp=${player.hp})`);
  assert.ok(player.hp > 0, 'fall not lethal from 14 blocks');
}
console.log('ok: fall damage');

// --- drowning ---
{
  // water pool with a solid lid so the player stays submerged
  for (let y = 11; y <= 14; y++) world.setBlock(30, y, 30, B.WATER);
  world.setBlock(30, 15, 30, B.PLANKS);
  player.hp = 20;
  player.air = 10;
  player.pos.set(30.5, 11.5, 30.5);
  player.vel.set(0, 0, 0);
  step(60 * 13); // 13 seconds under water
  assert.ok(player.air <= 0.01, 'air depleted');
  assert.ok(player.hp < 20, `drowning damage applied (hp=${player.hp})`);
}
console.log('ok: drowning');

// --- combat: hurt, knockback, death, loot ---
{
  mobs.mobs.length = 0;
  // grass patch so passive spawning can succeed, then force spawn attempts
  for (let z = 18; z < 23; z++) for (let x = 18; x < 23; x++) world.setBlock(x, 10, z, B.GRASS);
  let tries = 0;
  while (mobs.count(false) === 0 && tries++ < 500) {
    mobs.spawnTimer = 0;
    mobs.update(1 / 60, player, 1.0);
  }
  assert.ok(mobs.mobs.length > 0, 'a passive mob spawned');
  const mob = mobs.mobs[0];
  const hpBefore = mob.hp;
  mob.hurt(5, new THREE.Vector3(1, 0, 0));
  assert.strictEqual(mob.hp, hpBefore - 5, 'mob took damage');
  assert.ok(mob.vel.x > 0, 'knockback applied');

  const dropsBefore = drops.drops.length;
  mob.hurt(100, null);
  assert.ok(mob.dead, 'mob died');
  mobs.update(1 / 60, player, 1.0); // processes death -> loot
  assert.ok(drops.drops.length > dropsBefore, 'mob dropped loot');
  const lootIds = drops.drops.map((d) => d.id);
  assert.ok(lootIds.includes(I.PORKCHOP) || lootIds.includes(B.WOOL), `loot is porkchop/wool (${lootIds})`);
}
console.log('ok: combat, knockback, mob loot');

// --- mob AABB raycast ---
{
  mobs.mobs.length = 0;
  let tries = 0;
  while (mobs.count(false) === 0 && tries++ < 500) {
    mobs.spawnTimer = 0;
    mobs.update(1 / 60, player, 1.0);
  }
  const mob = mobs.mobs[0];
  const origin = new THREE.Vector3(mob.pos.x - 3, mob.pos.y + 0.5, mob.pos.z);
  const hit = mobs.raycast(origin, new THREE.Vector3(1, 0, 0), 5);
  assert.ok(hit && hit.mob === mob, 'raycast hits the mob');
  const miss = mobs.raycast(origin, new THREE.Vector3(-1, 0, 0), 5);
  assert.ok(!miss, 'raycast misses when facing away');
}
console.log('ok: mob raycast');

// --- eating ---
{
  player.hp = 10;
  inventory.add(I.PORKCHOP, 2);
  // move porkchop into selected hotbar slot
  const slot = inventory.hotbar.findIndex((s) => s && s.id === I.PORKCHOP);
  assert.ok(slot >= 0);
  inventory.selected = slot;
  player.rightDown = true;
  player.placeCooldown = 0;
  player.update(1 / 60, inventory);
  player.rightDown = false;
  assert.strictEqual(player.hp, 16, `porkchop healed 6 (hp=${player.hp})`);
  assert.strictEqual(inventory.countOf(I.PORKCHOP), 1, 'porkchop consumed');
}
console.log('ok: eating');

// --- death drops inventory + respawn ---
{
  const stacks = inventory.clearAll();
  assert.ok(stacks.length > 0, 'clearAll returns stacks');
  assert.strictEqual(inventory.countOf(B.DIRT), 0, 'inventory empty after clearAll');
  player.hp = 1;
  player.damage(5, { bypassIframes: true, source: 'zombie' });
  assert.ok(player.dead, 'player died');
  player.respawn();
  assert.ok(!player.dead && player.hp === player.maxHp, 'respawn restores hp');
}
console.log('ok: death + respawn');

// --- new recipes ---
{
  const inv = new Inventory();
  inv.add(B.COBBLESTONE, 8);
  inv.add(B.PLANKS, 10);
  inv.add(I.STICK, 6);
  const byOut = (id) => RECIPES.find((r) => r.out === id);
  assert.ok(canCraft(byOut(B.STONE_BRICKS), inv, 2), 'stone bricks craftable in the 2x2 grid');
  craft(byOut(B.STONE_BRICKS), inv, 2);
  assert.strictEqual(inv.countOf(B.STONE_BRICKS), 4);
  for (const id of [I.WOODEN_SWORD, I.STONE_SWORD, I.WOODEN_AXE, I.STONE_AXE, I.WOODEN_SHOVEL, I.STONE_SHOVEL]) {
    assert.ok(!canCraft(byOut(id), inv, 2), `${id} needs a 3x3 grid`);
    assert.ok(canCraft(byOut(id), inv, 3), `${id} craftable at a table`);
  }
  craft(byOut(I.STONE_SWORD), inv, 3);
  assert.strictEqual(inv.countOf(I.STONE_SWORD), 1);
  assert.ok(ITEMS[I.STONE_SWORD].damage > ITEMS[I.WOODEN_SWORD].damage - 2, 'sword damage defined');
}
console.log('ok: v2 recipes');

// --- tool speed system ---
{
  const inv = new Inventory();
  inv.add(I.STONE_SHOVEL, 1);
  inv.selected = 0;
  const shovelSpeed = player.mineSpeedFor(B.DIRT, inv);
  inv.hotbar[0] = null;
  const handSpeed = player.mineSpeedFor(B.DIRT, inv);
  assert.ok(shovelSpeed > handSpeed * 3, `shovel much faster on dirt (${shovelSpeed.toFixed(2)} vs ${handSpeed.toFixed(2)})`);
}
console.log('ok: tool speed system');

// --- tier gating: under-tier breaks are very slow and drop nothing (like MC) ---
{
  const inv = new Inventory();
  const withItem = (itemId) => {
    inv.hotbar[0] = itemId ? { id: itemId, count: 1 } : null;
    inv.selected = 0;
    return inv;
  };
  const speedWith = (blockId, itemId) => player.mineSpeedFor(blockId, withItem(itemId));

  assert.ok(player.underTier(B.STONE, withItem(null)), 'bare hand is under-tier for stone');
  assert.ok(speedWith(B.STONE, null) < speedWith(B.STONE, I.WOODEN_PICKAXE) / 5, 'hand-breaking stone is punishingly slow');
  assert.ok(!player.underTier(B.STONE, withItem(I.WOODEN_PICKAXE)), 'wooden pick mines stone properly');
  assert.ok(player.underTier(B.IRON_ORE, withItem(I.WOODEN_PICKAXE)), 'wooden pick under-tier for iron ore');
  assert.ok(!player.underTier(B.IRON_ORE, withItem(I.STONE_PICKAXE)), 'stone pick mines iron ore');
  assert.ok(player.underTier(B.DIAMOND_ORE, withItem(I.STONE_PICKAXE)), 'stone pick under-tier for diamond ore');
  assert.ok(!player.underTier(B.DIAMOND_ORE, withItem(I.IRON_PICKAXE)), 'iron pick mines diamond ore');
  assert.ok(player.underTier(B.DIAMOND_ORE, withItem(I.GOLD_PICKAXE)), 'gold pick is wood-tier for gating');
  assert.ok(speedWith(B.STONE, I.GOLD_PICKAXE) > speedWith(B.STONE, I.DIAMOND_PICKAXE), 'gold pick fastest on stone');
}
console.log('ok: tier gating');

// --- ore drops ---
{
  const { BLOCKS } = await import('../src/blocks.js');
  assert.strictEqual(BLOCKS[B.COAL_ORE].drops, I.COAL, 'coal ore drops coal');
  assert.strictEqual(BLOCKS[B.DIAMOND_ORE].drops, I.DIAMOND, 'diamond ore drops diamond');
  assert.strictEqual(BLOCKS[B.IRON_ORE].drops, undefined, 'iron ore drops itself (needs smelting)');
}
console.log('ok: ore drops');

// --- furnace smelting ---
{
  const { FurnaceManager, SMELT_TIME } = await import('../src/furnace.js');
  const fm = new FurnaceManager();
  const f = fm.at(1, 2, 3);
  f.slots[0] = { id: B.IRON_ORE, count: 2 };
  f.slots[1] = { id: I.COAL, count: 1 };
  const tick = (seconds) => { for (let i = 0; i < seconds * 60; i++) fm.update(1 / 60); };

  tick(SMELT_TIME + 0.5);
  assert.ok(f.slots[2] && f.slots[2].id === I.IRON_INGOT && f.slots[2].count === 1,
    `first ingot smelted (${JSON.stringify(f.slots[2])})`);
  assert.strictEqual(f.slots[1], null, 'coal consumed on ignition');
  tick(SMELT_TIME + 0.5);
  assert.strictEqual(f.slots[2].count, 2, 'second ingot smelted');
  assert.strictEqual(f.slots[0], null, 'input exhausted');
  assert.ok(f.burn > 0, 'coal still burning (8 smelts per coal)');

  // sand -> glass and porkchop -> cooked
  const f2 = fm.at(9, 9, 9);
  f2.slots[0] = { id: B.SAND, count: 1 };
  f2.slots[1] = { id: B.PLANKS, count: 2 };
  tick(SMELT_TIME + 0.5);
  assert.ok(f2.slots[2] && f2.slots[2].id === B.GLASS, 'sand smelts into glass');

  // breaking returns leftovers
  const f3 = fm.at(5, 5, 5);
  f3.slots[0] = { id: I.PORKCHOP, count: 3 };
  const spilled = fm.breakAt(5, 5, 5);
  assert.strictEqual(spilled.length, 1, 'break returns contents');
  assert.strictEqual(fm.furnaces.size, 2, 'furnace forgotten after break');
}
console.log('ok: furnace smelting');

// --- tier recipes ---
{
  const inv = new Inventory();
  inv.add(I.IRON_INGOT, 3);
  inv.add(I.DIAMOND, 3);
  inv.add(I.STICK, 8);
  const byOut = (id) => RECIPES.find((r) => r.out === id);
  assert.ok(byOut(I.IRON_PICKAXE) && byOut(I.GOLD_SWORD) && byOut(I.DIAMOND_SHOVEL), 'tier recipes exist');
  assert.ok(canCraft(byOut(I.IRON_PICKAXE), inv, 3), 'iron pickaxe craftable');
  craft(byOut(I.IRON_PICKAXE), inv, 3);
  assert.strictEqual(inv.countOf(I.IRON_PICKAXE), 1);
  assert.strictEqual(inv.countOf(I.IRON_INGOT), 0);
  assert.ok(canCraft(byOut(I.DIAMOND_SWORD), inv, 3), 'diamond sword craftable');
  assert.ok(ITEMS[I.DIAMOND_SWORD].damage > ITEMS[I.IRON_SWORD].damage, 'diamond sword strongest');
  const { ingredientTotals } = await import('../src/inventory.js');
  const furnaceCost = ingredientTotals(byOut(B.FURNACE));
  assert.strictEqual(furnaceCost.get(B.COBBLESTONE), 8, 'furnace costs 8 cobblestone');
}
console.log('ok: tier recipes');

// --- grid matching (shaped, mirrored, shapeless) ---
{
  const { matchGrid, consumeGrid } = await import('../src/inventory.js');
  const P = B.PLANKS, S = I.STICK, C = B.COBBLESTONE;
  const st = (id) => ({ id, count: 1 });

  // 2x2: crafting table from 4 planks
  let cells = [st(P), st(P), st(P), st(P)];
  assert.strictEqual(matchGrid(cells, 2)?.out, B.CRAFTING_TABLE, '2x2 table match');

  // sticks: vertical planks pair, any column
  cells = [null, st(P), null, st(P)];
  assert.strictEqual(matchGrid(cells, 2)?.out, I.STICK, 'sticks match offset column');

  // 3x3: wooden pickaxe shape
  cells = [st(P), st(P), st(P), null, st(S), null, null, st(S), null];
  const pick = matchGrid(cells, 3);
  assert.strictEqual(pick?.out, I.WOODEN_PICKAXE, 'pickaxe shape matches');

  // axe mirrored: ['MM','MS',' S'] mirrored -> ['MM','SM','S ']
  cells = [st(C), st(C), null, st(S), st(C), null, st(S), null, null];
  assert.strictEqual(matchGrid(cells, 3)?.out, I.STONE_AXE, 'mirrored axe matches');

  // wrong shape: pickaxe top row moved down must NOT match
  cells = [null, null, null, st(P), st(P), st(P), null, st(S), null];
  assert.notStrictEqual(matchGrid(cells, 3)?.out, I.WOODEN_PICKAXE, 'wrong shape rejected');

  // shapeless: single log anywhere -> planks
  cells = [null, null, null, null, st(B.LOG), null, null, null, null];
  assert.strictEqual(matchGrid(cells, 3)?.out, B.PLANKS, 'shapeless log -> planks');

  // consumeGrid: one item eaten per occupied cell
  cells = [{ id: P, count: 2 }, st(P), st(P), st(P)];
  consumeGrid(cells);
  assert.strictEqual(cells[0].count, 1, 'stacked cell decremented');
  assert.strictEqual(cells[1], null, 'single-item cell emptied');
}
console.log('ok: grid matching');

console.log('\nAll gameplay tests passed.');
