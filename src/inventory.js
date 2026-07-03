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
// Shaped recipe:    { out, outCount, pattern: ['XXX',' S ',' S '], key: { X: id, S: id }, category }
// Shapeless recipe: { out, outCount, shapeless: [id, id, ...], category }
// A recipe fits the 2x2 personal grid when its pattern is at most 2x2
// (shapeless: at most 4 items); otherwise it needs a crafting table (3x3).

import { B, I, TIERS } from './blocks.js';

export const CATEGORIES = ['Basics', 'Building Blocks', 'Tools & Weapons'];

export const RECIPES = [
  { out: B.PLANKS, outCount: 4, shapeless: [B.LOG], category: 'Basics' },
  { out: I.STICK, outCount: 4, pattern: ['P', 'P'], key: { P: B.PLANKS }, category: 'Basics' },
  { out: B.CRAFTING_TABLE, outCount: 1, pattern: ['PP', 'PP'], key: { P: B.PLANKS }, category: 'Basics' },
  { out: B.FURNACE, outCount: 1, pattern: ['CCC', 'C C', 'CCC'], key: { C: B.COBBLESTONE }, category: 'Basics' },
  { out: B.STONE_BRICKS, outCount: 4, pattern: ['CC', 'CC'], key: { C: B.COBBLESTONE }, category: 'Building Blocks' },
  { out: B.IRON_BLOCK, outCount: 1, pattern: ['III', 'III', 'III'], key: { I: I.IRON_INGOT }, category: 'Building Blocks' },
  { out: B.GOLD_BLOCK, outCount: 1, pattern: ['GGG', 'GGG', 'GGG'], key: { G: I.GOLD_INGOT }, category: 'Building Blocks' },
  { out: B.DIAMOND_BLOCK, outCount: 1, pattern: ['DDD', 'DDD', 'DDD'], key: { D: I.DIAMOND }, category: 'Building Blocks' },
  { out: I.IRON_INGOT, outCount: 9, shapeless: [B.IRON_BLOCK], category: 'Building Blocks' },
  { out: I.GOLD_INGOT, outCount: 9, shapeless: [B.GOLD_BLOCK], category: 'Building Blocks' },
  { out: I.DIAMOND, outCount: 9, shapeless: [B.DIAMOND_BLOCK], category: 'Building Blocks' },
];

// tool recipes for every tier, with authentic MC shapes
const TOOL_PATTERNS = {
  PICKAXE: ['MMM', ' S ', ' S '],
  SWORD: ['M', 'M', 'S'],
  AXE: ['MM', 'MS', ' S'],
  SHOVEL: ['M', 'S', 'S'],
};
for (const [tierKey, t] of Object.entries(TIERS)) {
  const prefix = tierKey.toUpperCase();
  for (const [tool, pattern] of Object.entries(TOOL_PATTERNS)) {
    RECIPES.push({
      out: I[`${prefix}_${tool}`],
      outCount: 1,
      pattern,
      key: { M: t.mat, S: I.STICK },
      category: 'Tools & Weapons',
    });
  }
}

// smallest square grid the recipe fits in: 2 or 3
export function recipeGridSize(recipe) {
  if (recipe.pattern) {
    const h = recipe.pattern.length;
    const w = Math.max(...recipe.pattern.map((r) => r.length));
    return Math.max(h, w) <= 2 ? 2 : 3;
  }
  return recipe.shapeless.length <= 4 ? 2 : 3;
}

// total items needed per id, for one craft
export function ingredientTotals(recipe) {
  const totals = new Map();
  if (recipe.pattern) {
    for (const row of recipe.pattern) {
      for (const ch of row) {
        if (ch === ' ') continue;
        const id = recipe.key[ch];
        totals.set(id, (totals.get(id) || 0) + 1);
      }
    }
  } else {
    for (const id of recipe.shapeless) totals.set(id, (totals.get(id) || 0) + 1);
  }
  return totals;
}

// has materials in inventory AND fits the available grid
export function canCraft(recipe, inv, gridSize = 3) {
  if (recipeGridSize(recipe) > gridSize) return false;
  for (const [id, n] of ingredientTotals(recipe)) {
    if (inv.countOf(id) < n) return false;
  }
  return true;
}

// direct craft (recipe book quick-craft): consume from inventory, add output
export function craft(recipe, inv, gridSize = 3) {
  if (!canCraft(recipe, inv, gridSize)) return false;
  for (const [id, n] of ingredientTotals(recipe)) inv.remove(id, n);
  inv.add(recipe.out, recipe.outCount);
  return true;
}

// ---------- grid matching ----------
// cells: array of size*size stacks (row-major). Returns the matching recipe.

function gridBounds(cells, size) {
  let minX = size, minY = size, maxX = -1, maxY = -1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (cells[y * size + x]) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
  }
  return maxX < 0 ? null : { minX, minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function matchShaped(recipe, cells, size, bounds, mirrored) {
  const rows = recipe.pattern;
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  if (w !== bounds.w || h !== bounds.h) return false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = mirrored ? w - 1 - x : x;
      const ch = rows[y][px] ?? ' ';
      const want = ch === ' ' ? null : recipe.key[ch];
      const cell = cells[(bounds.minY + y) * size + (bounds.minX + x)];
      if (want === null ? cell : (!cell || cell.id !== want)) return false;
    }
  }
  return true;
}

function matchShapeless(recipe, cells) {
  const present = cells.filter(Boolean).map((c) => c.id).sort((a, b) => a - b);
  const want = [...recipe.shapeless].sort((a, b) => a - b);
  if (present.length !== want.length) return false;
  return present.every((id, i) => id === want[i]);
}

export function matchGrid(cells, size) {
  const bounds = gridBounds(cells, size);
  if (!bounds) return null;
  for (const r of RECIPES) {
    if (r.pattern) {
      if (matchShaped(r, cells, size, bounds, false) || matchShaped(r, cells, size, bounds, true)) return r;
    } else if (matchShapeless(r, cells)) {
      return r;
    }
  }
  return null;
}

// take one item from every occupied cell (after a successful craft)
export function consumeGrid(cells) {
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (!c) continue;
    c.count--;
    if (c.count <= 0) cells[i] = null;
  }
}
