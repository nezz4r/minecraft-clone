// Block and item registry. Blocks have ids < 100, non-placeable items >= 100.

export const B = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  COBBLESTONE: 4,
  BEDROCK: 5,
  SAND: 6,
  LOG: 7,
  LEAVES: 8,
  PLANKS: 9,
  WATER: 10,
  CRAFTING_TABLE: 11,
  COAL_ORE: 12,
  IRON_ORE: 13,
  GOLD_ORE: 14,
  DIAMOND_ORE: 15,
  GRAVEL: 16,
  WOOL: 17,
  STONE_BRICKS: 18,
  FURNACE: 19,
  GLASS: 20,
  IRON_BLOCK: 21,
  GOLD_BLOCK: 22,
  DIAMOND_BLOCK: 23,
  TALL_GRASS: 24,
  FLOWER_YELLOW: 25,
  FLOWER_RED: 26,
};

export const I = {
  STICK: 100,
  WOODEN_PICKAXE: 101,
  STONE_PICKAXE: 102,
  WOODEN_SWORD: 103,
  STONE_SWORD: 104,
  WOODEN_AXE: 105,
  STONE_AXE: 106,
  WOODEN_SHOVEL: 107,
  STONE_SHOVEL: 108,
  PORKCHOP: 109,
  COAL: 110,
  IRON_INGOT: 111,
  GOLD_INGOT: 112,
  DIAMOND: 113,
  COOKED_PORKCHOP: 114,
  IRON_PICKAXE: 115,
  IRON_SWORD: 116,
  IRON_AXE: 117,
  IRON_SHOVEL: 118,
  GOLD_PICKAXE: 119,
  GOLD_SWORD: 120,
  GOLD_AXE: 121,
  GOLD_SHOVEL: 122,
  DIAMOND_PICKAXE: 123,
  DIAMOND_SWORD: 124,
  DIAMOND_AXE: 125,
  DIAMOND_SHOVEL: 126,
};

// Tile indices into the texture atlas (textures.js paints in this order;
// 19-22 are reserved for the mining crack stages).
export const T = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  COBBLESTONE: 4,
  BEDROCK: 5,
  SAND: 6,
  LOG_SIDE: 7,
  LOG_TOP: 8,
  LEAVES: 9,
  PLANKS: 10,
  WATER: 11,
  TABLE_TOP: 12,
  TABLE_SIDE: 13,
  COAL_ORE: 14,
  IRON_ORE: 15,
  GOLD_ORE: 16,
  DIAMOND_ORE: 17,
  GRAVEL: 18,
  WOOL: 23,
  STONE_BRICKS: 24,
  FURNACE_FRONT: 25,
  FURNACE_SIDE: 26,
  FURNACE_TOP: 27,
  GLASS: 28,
  IRON_BLOCK: 29,
  GOLD_BLOCK: 30,
  DIAMOND_BLOCK: 31,
  TALL_GRASS: 32,
  FLOWER_YELLOW: 33,
  FLOWER_RED: 34,
};

// hardness = seconds to mine by hand.
// tool: 'pick' | 'axe' | 'shovel' - a matching held tool multiplies mine speed.
// minTier: pick tier required to break at all (1 wood, 2 stone, 3 iron, 4 diamond).
// drops: what pops out (null = nothing, undefined = the block itself).
export const BLOCKS = {
  [B.AIR]: { name: 'Air', solid: false, opaque: false },
  [B.GRASS]: {
    name: 'Grass Block', solid: true, opaque: true, hardness: 0.9, tool: 'shovel',
    tiles: { top: T.GRASS_TOP, bottom: T.DIRT, side: T.GRASS_SIDE },
    drops: B.DIRT,
  },
  [B.DIRT]: {
    name: 'Dirt', solid: true, opaque: true, hardness: 0.75, tool: 'shovel',
    tiles: { top: T.DIRT, bottom: T.DIRT, side: T.DIRT },
  },
  [B.STONE]: {
    name: 'Stone', solid: true, opaque: true, hardness: 3.0, tool: 'pick', minTier: 1,
    tiles: { top: T.STONE, bottom: T.STONE, side: T.STONE },
    drops: B.COBBLESTONE,
  },
  [B.COBBLESTONE]: {
    name: 'Cobblestone', solid: true, opaque: true, hardness: 3.3, tool: 'pick', minTier: 1,
    tiles: { top: T.COBBLESTONE, bottom: T.COBBLESTONE, side: T.COBBLESTONE },
  },
  [B.BEDROCK]: {
    name: 'Bedrock', solid: true, opaque: true, hardness: Infinity,
    tiles: { top: T.BEDROCK, bottom: T.BEDROCK, side: T.BEDROCK },
  },
  [B.SAND]: {
    name: 'Sand', solid: true, opaque: true, hardness: 0.75, tool: 'shovel',
    tiles: { top: T.SAND, bottom: T.SAND, side: T.SAND },
  },
  [B.LOG]: {
    name: 'Oak Log', solid: true, opaque: true, hardness: 3.0, tool: 'axe',
    tiles: { top: T.LOG_TOP, bottom: T.LOG_TOP, side: T.LOG_SIDE },
  },
  [B.LEAVES]: {
    name: 'Oak Leaves', solid: true, opaque: true, hardness: 0.3,
    tiles: { top: T.LEAVES, bottom: T.LEAVES, side: T.LEAVES },
    drops: null, // like MC: breaking leaves gives nothing
  },
  [B.PLANKS]: {
    name: 'Oak Planks', solid: true, opaque: true, hardness: 3.0, tool: 'axe',
    tiles: { top: T.PLANKS, bottom: T.PLANKS, side: T.PLANKS },
  },
  [B.WATER]: {
    name: 'Water', solid: false, opaque: false, hardness: Infinity, water: true, level: 8,
    tiles: { top: T.WATER, bottom: T.WATER, side: T.WATER },
  },
  [B.CRAFTING_TABLE]: {
    name: 'Crafting Table', solid: true, opaque: true, hardness: 3.0, tool: 'axe',
    tiles: { top: T.TABLE_TOP, bottom: T.PLANKS, side: T.TABLE_SIDE },
  },
  [B.COAL_ORE]: {
    name: 'Coal Ore', solid: true, opaque: true, hardness: 4.5, tool: 'pick', minTier: 1,
    tiles: { top: T.COAL_ORE, bottom: T.COAL_ORE, side: T.COAL_ORE },
    drops: I.COAL,
  },
  [B.IRON_ORE]: {
    name: 'Iron Ore', solid: true, opaque: true, hardness: 4.5, tool: 'pick', minTier: 2,
    tiles: { top: T.IRON_ORE, bottom: T.IRON_ORE, side: T.IRON_ORE },
  },
  [B.GOLD_ORE]: {
    name: 'Gold Ore', solid: true, opaque: true, hardness: 4.5, tool: 'pick', minTier: 3,
    tiles: { top: T.GOLD_ORE, bottom: T.GOLD_ORE, side: T.GOLD_ORE },
  },
  [B.DIAMOND_ORE]: {
    name: 'Diamond Ore', solid: true, opaque: true, hardness: 4.5, tool: 'pick', minTier: 3,
    tiles: { top: T.DIAMOND_ORE, bottom: T.DIAMOND_ORE, side: T.DIAMOND_ORE },
    drops: I.DIAMOND,
  },
  [B.GRAVEL]: {
    name: 'Gravel', solid: true, opaque: true, hardness: 0.9, tool: 'shovel',
    tiles: { top: T.GRAVEL, bottom: T.GRAVEL, side: T.GRAVEL },
  },
  [B.WOOL]: {
    name: 'Wool', solid: true, opaque: true, hardness: 0.9,
    tiles: { top: T.WOOL, bottom: T.WOOL, side: T.WOOL },
  },
  [B.STONE_BRICKS]: {
    name: 'Stone Bricks', solid: true, opaque: true, hardness: 3.5, tool: 'pick', minTier: 1,
    tiles: { top: T.STONE_BRICKS, bottom: T.STONE_BRICKS, side: T.STONE_BRICKS },
  },
  [B.FURNACE]: {
    name: 'Furnace', solid: true, opaque: true, hardness: 3.5, tool: 'pick', minTier: 1,
    tiles: { top: T.FURNACE_TOP, bottom: T.FURNACE_TOP, side: T.FURNACE_FRONT },
  },
  [B.GLASS]: {
    name: 'Glass', solid: true, opaque: false, hardness: 0.4,
    tiles: { top: T.GLASS, bottom: T.GLASS, side: T.GLASS },
  },
  [B.IRON_BLOCK]: {
    name: 'Iron Block', solid: true, opaque: true, hardness: 5, tool: 'pick', minTier: 2,
    tiles: { top: T.IRON_BLOCK, bottom: T.IRON_BLOCK, side: T.IRON_BLOCK },
  },
  [B.GOLD_BLOCK]: {
    name: 'Gold Block', solid: true, opaque: true, hardness: 5, tool: 'pick', minTier: 3,
    tiles: { top: T.GOLD_BLOCK, bottom: T.GOLD_BLOCK, side: T.GOLD_BLOCK },
  },
  [B.DIAMOND_BLOCK]: {
    name: 'Diamond Block', solid: true, opaque: true, hardness: 5, tool: 'pick', minTier: 3,
    tiles: { top: T.DIAMOND_BLOCK, bottom: T.DIAMOND_BLOCK, side: T.DIAMOND_BLOCK },
  },
  // cross: true renders as two crossed quads (plants); walk-through, instant break
  [B.TALL_GRASS]: {
    name: 'Grass', solid: false, opaque: false, hardness: 0.05, cross: true,
    tiles: { top: T.TALL_GRASS, bottom: T.TALL_GRASS, side: T.TALL_GRASS },
    drops: null,
  },
  [B.FLOWER_YELLOW]: {
    name: 'Dandelion', solid: false, opaque: false, hardness: 0.05, cross: true,
    tiles: { top: T.FLOWER_YELLOW, bottom: T.FLOWER_YELLOW, side: T.FLOWER_YELLOW },
  },
  [B.FLOWER_RED]: {
    name: 'Poppy', solid: false, opaque: false, hardness: 0.05, cross: true,
    tiles: { top: T.FLOWER_RED, bottom: T.FLOWER_RED, side: T.FLOWER_RED },
  },
};

// Material tiers. tier = pick gating level, speed = mining multiplier.
// Gold mines very fast but only at wood-level gating and low damage, like MC.
export const TIERS = {
  wooden: { label: 'Wooden', tier: 1, speed: 3, mat: B.PLANKS },
  stone: { label: 'Stone', tier: 2, speed: 5, mat: B.COBBLESTONE },
  iron: { label: 'Iron', tier: 3, speed: 7, mat: I.IRON_INGOT },
  gold: { label: 'Gold', tier: 1, speed: 10, mat: I.GOLD_INGOT },
  diamond: { label: 'Diamond', tier: 4, speed: 9, mat: I.DIAMOND },
};

// sword/pick/axe/shovel damage per tier (half-hearts; bare hand = 2)
const TIER_DAMAGE = {
  wooden: { sword: 5, pick: 3, axe: 4, shovel: 3 },
  stone: { sword: 6, pick: 4, axe: 5, shovel: 3 },
  iron: { sword: 7, pick: 5, axe: 6, shovel: 4 },
  gold: { sword: 5, pick: 3, axe: 4, shovel: 3 },
  diamond: { sword: 8, pick: 6, axe: 7, shovel: 5 },
};

// tool + speed: mining multiplier on blocks with a matching tool tag.
// tier: pick gating level. damage: attack damage. food: half-hearts healed.
export const ITEMS = {
  [I.STICK]: { name: 'Stick' },
  [I.PORKCHOP]: { name: 'Porkchop', food: 6 },
  [I.COOKED_PORKCHOP]: { name: 'Cooked Porkchop', food: 10 },
  [I.COAL]: { name: 'Coal' },
  [I.IRON_INGOT]: { name: 'Iron Ingot' },
  [I.GOLD_INGOT]: { name: 'Gold Ingot' },
  [I.DIAMOND]: { name: 'Diamond' },
};

// generate the 20 tier tools (5 tiers x pickaxe/sword/axe/shovel)
for (const [tierKey, t] of Object.entries(TIERS)) {
  const dmg = TIER_DAMAGE[tierKey];
  const prefix = tierKey.toUpperCase();
  ITEMS[I[`${prefix}_PICKAXE`]] = { name: `${t.label} Pickaxe`, tool: 'pick', speed: t.speed, tier: t.tier, damage: dmg.pick, tierKey };
  ITEMS[I[`${prefix}_SWORD`]] = { name: `${t.label} Sword`, damage: dmg.sword, tierKey };
  ITEMS[I[`${prefix}_AXE`]] = { name: `${t.label} Axe`, tool: 'axe', speed: t.speed, damage: dmg.axe, tierKey };
  ITEMS[I[`${prefix}_SHOVEL`]] = { name: `${t.label} Shovel`, tool: 'shovel', speed: t.speed, damage: dmg.shovel, tierKey };
}

export const BARE_HAND_DAMAGE = 2;

// ---------- flowing water ----------
// B.WATER (10) is a source (level 8). Flowing water uses ids 27-33 for
// levels 1-7; level determines spread distance and rendered surface height.

const FLOW_BASE = 26; // + level (1..7)

for (let level = 1; level <= 7; level++) {
  BLOCKS[FLOW_BASE + level] = {
    name: 'Water', solid: false, opaque: false, hardness: Infinity, water: true, level,
    tiles: { top: T.WATER, bottom: T.WATER, side: T.WATER },
  };
}

export function isWater(id) {
  return id === B.WATER || (id > FLOW_BASE && id <= FLOW_BASE + 7);
}

// 0 = not water, 1-7 = flowing, 8 = source
export function waterLevel(id) {
  if (id === B.WATER) return 8;
  if (id > FLOW_BASE && id <= FLOW_BASE + 7) return id - FLOW_BASE;
  return 0;
}

export function flowId(level) {
  return FLOW_BASE + Math.max(1, Math.min(7, level));
}

export function isSolid(id) {
  const b = BLOCKS[id];
  return b ? b.solid : false;
}

export function isOpaque(id) {
  const b = BLOCKS[id];
  return b ? b.opaque : false;
}

export function displayName(id) {
  return (BLOCKS[id] || ITEMS[id] || { name: '?' }).name;
}
