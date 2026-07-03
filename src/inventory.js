// Inventory: 9 hotbar slots + 27 main slots, stack size 64.
// Slots are { id, count } or null.

const STACK = 64;
export const HOTBAR_SIZE = 9;
export const MAIN_SIZE = 27;

export class Inventory {
  constructor() {
    this.hotbar = new Array(HOTBAR_SIZE).fill(null);
    this.main = new Array(MAIN_SIZE).fill(null);
    this.selected = 0;
    this.onChange = null;
  }

  changed() {
    if (this.onChange) this.onChange();
  }

  heldItem() {
    return this.hotbar[this.selected];
  }

  add(id, count) {
    const lists = [this.hotbar, this.main];
    // top up existing stacks first
    for (const list of lists) {
      for (let i = 0; i < list.length && count > 0; i++) {
        const s = list[i];
        if (s && s.id === id && s.count < STACK) {
          const take = Math.min(STACK - s.count, count);
          s.count += take;
          count -= take;
        }
      }
    }
    // then empty slots
    for (const list of lists) {
      for (let i = 0; i < list.length && count > 0; i++) {
        if (!list[i]) {
          const take = Math.min(STACK, count);
          list[i] = { id, count: take };
          count -= take;
        }
      }
    }
    this.changed();
    return count; // leftover that didn't fit
  }

  consumeHeld(n) {
    const s = this.hotbar[this.selected];
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) this.hotbar[this.selected] = null;
    this.changed();
  }

  countOf(id) {
    let n = 0;
    for (const s of [...this.hotbar, ...this.main]) if (s && s.id === id) n += s.count;
    return n;
  }

  remove(id, count) {
    for (const list of [this.main, this.hotbar]) {
      for (let i = list.length - 1; i >= 0 && count > 0; i--) {
        const s = list[i];
        if (s && s.id === id) {
          const take = Math.min(s.count, count);
          s.count -= take;
          count -= take;
          if (s.count <= 0) list[i] = null;
        }
      }
    }
    this.changed();
  }

  // Empty every slot and return the stacks (used for death drops).
  clearAll() {
    const stacks = [];
    for (const list of [this.hotbar, this.main]) {
      for (let i = 0; i < list.length; i++) {
        if (list[i]) stacks.push(list[i]);
        list[i] = null;
      }
    }
    this.changed();
    return stacks;
  }

  // slot access for the inventory UI: list is 'hotbar' | 'main'
  getSlot(list, i) {
    return this[list][i];
  }

  setSlot(list, i, stack) {
    this[list][i] = stack;
    this.changed();
  }
}

// ---------- crafting ----------
// Recipe: { out, outCount, cost: [[id, count], ...], needsTable, category }

import { B, I, TIERS } from './blocks.js';

export const CATEGORIES = ['Basics', 'Building Blocks', 'Tools & Weapons'];

export const RECIPES = [
  { out: B.PLANKS, outCount: 4, cost: [[B.LOG, 1]], needsTable: false, category: 'Basics' },
  { out: I.STICK, outCount: 4, cost: [[B.PLANKS, 2]], needsTable: false, category: 'Basics' },
  { out: B.CRAFTING_TABLE, outCount: 1, cost: [[B.PLANKS, 4]], needsTable: false, category: 'Basics' },
  { out: B.FURNACE, outCount: 1, cost: [[B.COBBLESTONE, 8]], needsTable: true, category: 'Basics' },
  { out: B.STONE_BRICKS, outCount: 4, cost: [[B.COBBLESTONE, 4]], needsTable: false, category: 'Building Blocks' },
  { out: B.IRON_BLOCK, outCount: 1, cost: [[I.IRON_INGOT, 9]], needsTable: true, category: 'Building Blocks' },
  { out: B.GOLD_BLOCK, outCount: 1, cost: [[I.GOLD_INGOT, 9]], needsTable: true, category: 'Building Blocks' },
  { out: B.DIAMOND_BLOCK, outCount: 1, cost: [[I.DIAMOND, 9]], needsTable: true, category: 'Building Blocks' },
  { out: I.IRON_INGOT, outCount: 9, cost: [[B.IRON_BLOCK, 1]], needsTable: false, category: 'Building Blocks' },
  { out: I.GOLD_INGOT, outCount: 9, cost: [[B.GOLD_BLOCK, 1]], needsTable: false, category: 'Building Blocks' },
  { out: I.DIAMOND, outCount: 9, cost: [[B.DIAMOND_BLOCK, 1]], needsTable: false, category: 'Building Blocks' },
];

// tool recipes for every tier: pickaxe 3 mat, sword 2, axe 3, shovel 1 (+ sticks)
for (const [tierKey, t] of Object.entries(TIERS)) {
  const prefix = tierKey.toUpperCase();
  const tools = [
    ['PICKAXE', 3, 2],
    ['SWORD', 2, 1],
    ['AXE', 3, 2],
    ['SHOVEL', 1, 2],
  ];
  for (const [tool, matCount, stickCount] of tools) {
    RECIPES.push({
      out: I[`${prefix}_${tool}`],
      outCount: 1,
      cost: [[t.mat, matCount], [I.STICK, stickCount]],
      needsTable: true,
      category: 'Tools & Weapons',
    });
  }
}

export function canCraft(recipe, inv, hasTable) {
  if (recipe.needsTable && !hasTable) return false;
  return recipe.cost.every(([id, n]) => inv.countOf(id) >= n);
}

export function craft(recipe, inv, hasTable) {
  if (!canCraft(recipe, inv, hasTable)) return false;
  for (const [id, n] of recipe.cost) inv.remove(id, n);
  inv.add(recipe.out, recipe.outCount);
  return true;
}
