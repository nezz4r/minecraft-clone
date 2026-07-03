// Furnace smelting. Each placed furnace has its own state (input/fuel/output
// slots + burn/progress timers) keyed by block position, and keeps smelting
// while the UI is closed.

import { B, I } from './blocks.js';

export const SMELT_TIME = 3; // seconds per item

export const SMELTING = {
  [B.IRON_ORE]: I.IRON_INGOT,
  [B.GOLD_ORE]: I.GOLD_INGOT,
  [B.SAND]: B.GLASS,
  [I.PORKCHOP]: I.COOKED_PORKCHOP,
};

// how many items one unit of fuel smelts
export const FUEL_VALUES = {
  [I.COAL]: 8,
  [B.LOG]: 3,
  [B.PLANKS]: 1.5,
  [I.STICK]: 0.5,
};

const key = (x, y, z) => x + ',' + y + ',' + z;

export class FurnaceManager {
  constructor() {
    this.furnaces = new Map();
  }

  at(x, y, z) {
    const k = key(x, y, z);
    let f = this.furnaces.get(k);
    if (!f) {
      f = {
        slots: [null, null, null], // input, fuel, output
        burn: 0,      // seconds of burn left
        burnMax: 1,   // for the flame bar
        progress: 0,  // seconds into current item
      };
      this.furnaces.set(k, f);
    }
    return f;
  }

  // Furnace block broken: return its contents and forget it.
  breakAt(x, y, z) {
    const k = key(x, y, z);
    const f = this.furnaces.get(k);
    if (!f) return [];
    this.furnaces.delete(k);
    return f.slots.filter(Boolean);
  }

  canSmelt(f) {
    const input = f.slots[0];
    if (!input) return false;
    const result = SMELTING[input.id];
    if (result === undefined) return false;
    const out = f.slots[2];
    return !out || (out.id === result && out.count < 64);
  }

  update(dt) {
    for (const f of this.furnaces.values()) {
      const smeltable = this.canSmelt(f);

      // ignite: consume one fuel item when ready to smelt with no flame
      if (f.burn <= 0 && smeltable && f.slots[1]) {
        const fuel = f.slots[1];
        const value = FUEL_VALUES[fuel.id];
        if (value) {
          f.burn = f.burnMax = value * SMELT_TIME;
          fuel.count--;
          if (fuel.count <= 0) f.slots[1] = null;
        }
      }

      if (f.burn > 0) {
        f.burn -= dt;
        if (smeltable) {
          f.progress += dt;
          if (f.progress >= SMELT_TIME) {
            f.progress = 0;
            const input = f.slots[0];
            const result = SMELTING[input.id];
            if (f.slots[2]) f.slots[2].count++;
            else f.slots[2] = { id: result, count: 1 };
            input.count--;
            if (input.count <= 0) f.slots[0] = null;
          }
        } else {
          f.progress = 0;
        }
      } else {
        f.progress = Math.max(0, f.progress - dt * 2);
      }
    }
  }
}
