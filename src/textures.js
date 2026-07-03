// Procedural 16x16 pixel-art texture atlas, Minecraft-flavored, no external files.

import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { B, I, T, BLOCKS, ITEMS } from './blocks.js';

export const TILE = 16;
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 5;

function px(ctx, x, y, r, g, b, a = 1) {
  ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${a})`;
  ctx.fillRect(x, y, 1, 1);
}

function shade([r, g, b], f) {
  return [r * f, g * f, b * f];
}

// Fill a tile with per-pixel brightness jitter around a base color.
function noisyFill(ctx, ox, oy, base, jitter, rng) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const f = 1 + (rng() * 2 - 1) * jitter;
      const [r, g, b] = shade(base, f);
      px(ctx, ox + x, oy + y, r, g, b);
    }
  }
}

function speckle(ctx, ox, oy, color, count, rng, size = 1) {
  for (let i = 0; i < count; i++) {
    const x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
    ctx.fillStyle = `rgb(${color[0] | 0},${color[1] | 0},${color[2] | 0})`;
    ctx.fillRect(ox + x, oy + y, size, size);
  }
}

// Ore = stone base + clustered colored blobs.
function oreTile(ctx, ox, oy, oreColor, rng) {
  noisyFill(ctx, ox, oy, [127, 127, 127], 0.12, rng);
  const clusters = 3 + (rng() * 2) | 0;
  for (let c = 0; c < clusters; c++) {
    const cx = 2 + rng() * 12, cy = 2 + rng() * 12;
    const n = 3 + (rng() * 4) | 0;
    for (let i = 0; i < n; i++) {
      const x = (cx + rng() * 3 - 1.5) | 0, y = (cy + rng() * 3 - 1.5) | 0;
      if (x < 0 || y < 0 || x > 15 || y > 15) continue;
      const f = 0.85 + rng() * 0.35;
      px(ctx, ox + x, oy + y, oreColor[0] * f, oreColor[1] * f, oreColor[2] * f);
    }
  }
}

const painters = {
  [T.GRASS_TOP](ctx, ox, oy, rng) {
    noisyFill(ctx, ox, oy, [110, 168, 68], 0.10, rng);
    speckle(ctx, ox, oy, [88, 140, 52], 40, rng);
    speckle(ctx, ox, oy, [130, 190, 84], 24, rng);
  },
  [T.GRASS_SIDE](ctx, ox, oy, rng) {
    noisyFill(ctx, ox, oy, [134, 96, 67], 0.14, rng);
    speckle(ctx, ox, oy, [110, 78, 52], 24, rng);
    // grass fringe on top with ragged bottom edge
    for (let x = 0; x < TILE; x++) {
      const depth = 2 + ((rng() * 3) | 0);
      for (let y = 0; y < depth; y++) {
        const f = 0.9 + rng() * 0.2;
        px(ctx, ox + x, oy + y, 110 * f, 168 * f, 68 * f);
      }
    }
  },
  [T.DIRT](ctx, ox, oy, rng) {
    noisyFill(ctx, ox, oy, [134, 96, 67], 0.14, rng);
    speckle(ctx, ox, oy, [110, 78, 52], 28, rng);
    speckle(ctx, ox, oy, [155, 118, 83], 18, rng);
  },
  [T.STONE](ctx, ox, oy, rng) {
    noisyFill(ctx, ox, oy, [127, 127, 127], 0.09, rng);
    // subtle horizontal cracks
    for (let i = 0; i < 4; i++) {
      let x = (rng() * TILE) | 0;
      const y = (rng() * TILE) | 0;
      const len = 3 + (rng() * 5) | 0;
      for (let j = 0; j < len && x < TILE; j++, x++) {
        px(ctx, ox + x, oy + Math.min(15, y + ((rng() * 2) | 0)), 105, 105, 105);
      }
    }
  },
  [T.COBBLESTONE](ctx, ox, oy, rng) {
    noisyFill(ctx, ox, oy, [90, 90, 90], 0.10, rng);
    // rounded stones
    const stones = [[3, 3, 3], [10, 2, 3], [4, 10, 3], [11, 10, 3], [8, 6, 2], [1, 8, 2], [14, 6, 2]];
    for (const [sx, sy, sr] of stones) {
      const base = 115 + rng() * 30;
      for (let y = -sr; y <= sr; y++) {
        for (let x = -sr; x <= sr; x++) {
          if (x * x + y * y > sr * sr + 0.5) continue;
          const tx = sx + x, ty = sy + y;
          if (tx < 0 || ty < 0 || tx > 15 || ty > 15) continue;
          const f = 1 + (rng() * 2 - 1) * 0.08;
          px(ctx, ox + tx, oy + ty, base * f, base * f, base * f);
        }
      }
    }
  },
  [T.BEDROCK](ctx, ox, oy, rng) {
    noisyFill(ctx, ox, oy, [70, 70, 70], 0.35, rng);
    speckle(ctx, ox, oy, [30, 30, 30], 40, rng, 2);
    speckle(ctx, ox, oy, [120, 120, 120], 20, rng);
  },
  [T.SAND](ctx, ox, oy, rng) {
    noisyFill(ctx, ox, oy, [219, 207, 163], 0.06, rng);
    speckle(ctx, ox, oy, [196, 184, 138], 26, rng);
    speckle(ctx, ox, oy, [232, 222, 182], 20, rng);
  },
  [T.LOG_SIDE](ctx, ox, oy, rng) {
    for (let x = 0; x < TILE; x++) {
      // vertical bark stripes
      const stripe = 0.85 + 0.3 * Math.abs(Math.sin(x * 1.7 + 0.8));
      for (let y = 0; y < TILE; y++) {
        const f = stripe * (0.92 + rng() * 0.16);
        px(ctx, ox + x, oy + y, 106 * f, 82 * f, 48 * f);
      }
    }
    speckle(ctx, ox, oy, [70, 52, 30], 14, rng);
  },
  [T.LOG_TOP](ctx, ox, oy, rng) {
    noisyFill(ctx, ox, oy, [106, 82, 48], 0.1, rng);
    // growth rings
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        const ring = (d | 0) % 2 === 0 ? 1.25 : 0.95;
        const f = ring * (0.94 + rng() * 0.12);
        px(ctx, ox + x, oy + y, 160 * f * 0.9, 130 * f * 0.9, 78 * f * 0.9);
      }
    }
  },
  [T.LEAVES](ctx, ox, oy, rng) {
    noisyFill(ctx, ox, oy, [58, 122, 40], 0.22, rng);
    speckle(ctx, ox, oy, [36, 90, 26], 46, rng);
    speckle(ctx, ox, oy, [84, 152, 58], 30, rng);
  },
  [T.PLANKS](ctx, ox, oy, rng) {
    noisyFill(ctx, ox, oy, [156, 127, 78], 0.07, rng);
    // horizontal boards with seams
    for (const y of [3, 7, 11, 15]) {
      for (let x = 0; x < TILE; x++) px(ctx, ox + x, oy + y, 110, 88, 52);
    }
    for (const [x, y] of [[4, 0], [12, 4], [6, 8], [10, 12]]) {
      for (let i = 0; i < 3; i++) px(ctx, ox + x, oy + y + i, 118, 94, 56);
    }
  },
  [T.WATER](ctx, ox, oy, rng) {
    noisyFill(ctx, ox, oy, [47, 92, 203], 0.08, rng);
    speckle(ctx, ox, oy, [64, 110, 220], 24, rng);
  },
  [T.TABLE_TOP](ctx, ox, oy, rng) {
    painters[T.PLANKS](ctx, ox, oy, rng);
    // grid engraving
    ctx.fillStyle = 'rgb(90,70,40)';
    ctx.fillRect(ox + 2, oy + 2, 12, 1); ctx.fillRect(ox + 2, oy + 13, 12, 1);
    ctx.fillRect(ox + 2, oy + 2, 1, 12); ctx.fillRect(ox + 13, oy + 2, 1, 12);
    ctx.fillRect(ox + 2, oy + 7, 12, 1); ctx.fillRect(ox + 7, oy + 2, 1, 12);
  },
  [T.TABLE_SIDE](ctx, ox, oy, rng) {
    painters[T.PLANKS](ctx, ox, oy, rng);
    ctx.fillStyle = 'rgb(94,74,44)';
    ctx.fillRect(ox + 3, oy + 4, 4, 4); ctx.fillRect(ox + 9, oy + 4, 4, 4);
    ctx.fillStyle = 'rgb(170,140,90)';
    ctx.fillRect(ox + 4, oy + 5, 2, 2); ctx.fillRect(ox + 10, oy + 5, 2, 2);
  },
  [T.COAL_ORE](ctx, ox, oy, rng) { oreTile(ctx, ox, oy, [35, 35, 35], rng); },
  [T.IRON_ORE](ctx, ox, oy, rng) { oreTile(ctx, ox, oy, [216, 175, 147], rng); },
  [T.GOLD_ORE](ctx, ox, oy, rng) { oreTile(ctx, ox, oy, [250, 210, 60], rng); },
  [T.DIAMOND_ORE](ctx, ox, oy, rng) { oreTile(ctx, ox, oy, [92, 219, 213], rng); },
  [T.GRAVEL](ctx, ox, oy, rng) {
    noisyFill(ctx, ox, oy, [131, 127, 126], 0.16, rng);
    speckle(ctx, ox, oy, [96, 92, 90], 30, rng, 2);
    speckle(ctx, ox, oy, [160, 156, 152], 20, rng);
  },
};

// Mining crack overlays, Minecraft style: cracks radiate outward from the
// center, and every stage is strictly cumulative - stage n+1 shows the exact
// same cracks as stage n, extended further plus a few new branches.
export const CRACK_BASE = 35;
export const CRACK_STAGES = 5;

// one master set of crack strokes, shared by all stages
const CRACK_STROKES = (() => {
  const rng = mulberry32(0xc4ac);
  const strokes = [];
  for (let i = 0; i < 12; i++) {
    // spread start angles evenly so cracks fan out from the middle
    const ang = (i / 12) * Math.PI * 2 + (rng() - 0.5) * 0.6;
    let x = 7.5 + (rng() - 0.5) * 2;
    let y = 7.5 + (rng() - 0.5) * 2;
    let dx = Math.cos(ang), dy = Math.sin(ang);
    const pts = [];
    for (let s = 0; s < 11; s++) {
      pts.push([Math.round(x), Math.round(y)]);
      x += dx * (0.7 + rng() * 0.6);
      y += dy * (0.7 + rng() * 0.6);
      const turn = (rng() - 0.5) * 0.8; // wander, but keep heading outward
      const ndx = dx * Math.cos(turn) - dy * Math.sin(turn);
      dy = dx * Math.sin(turn) + dy * Math.cos(turn);
      dx = ndx;
      if (x < 0 || x > 15 || y < 0 || y > 15) break;
    }
    strokes.push(pts);
  }
  return strokes;
})();

function crackPainter(stage) {
  return (ctx, ox, oy) => {
    ctx.clearRect(ox, oy, TILE, TILE);
    ctx.fillStyle = 'rgba(15,15,15,0.9)';
    const t = (stage + 1) / CRACK_STAGES;
    // more strokes appear as the stage rises...
    const strokeCount = Math.max(3, Math.round(CRACK_STROKES.length * t));
    for (let i = 0; i < strokeCount; i++) {
      const pts = CRACK_STROKES[i];
      // ...and existing strokes creep outward from the center
      const len = Math.max(2, Math.round(pts.length * (0.35 + 0.65 * t)));
      for (let s = 0; s < len && s < pts.length; s++) {
        ctx.fillRect(ox + pts[s][0], oy + pts[s][1], 1, 1);
      }
    }
  };
}
for (let s = 0; s < CRACK_STAGES; s++) {
  painters[CRACK_BASE + s] = crackPainter(s);
}

// ---------- cross plants (tall grass, flowers) ----------

painters[T.TALL_GRASS] = (ctx, ox, oy, rng) => {
  ctx.clearRect(ox, oy, TILE, TILE);
  for (let i = 0; i < 13; i++) {
    const bx = 1 + rng() * 13;
    const h = 7 + rng() * 8;
    const lean = (rng() - 0.5) * 4;
    const g = 0.75 + rng() * 0.4;
    ctx.fillStyle = `rgb(${88 * g | 0},${150 * g | 0},${56 * g | 0})`;
    for (let s = 0; s < h; s++) {
      const x = bx + lean * (s / h);
      // blades are 2px wide near the ground, 1px at the tip
      ctx.fillRect(ox + (x | 0), oy + 15 - s, s < h * 0.45 ? 2 : 1, 1);
    }
  }
};

function flowerPainter(petal, center) {
  return (ctx, ox, oy, rng) => {
    ctx.clearRect(ox, oy, TILE, TILE);
    // stem with a leaf
    ctx.fillStyle = 'rgb(62,120,40)';
    for (let s = 0; s < 8; s++) ctx.fillRect(ox + 7, oy + 15 - s, 1, 1);
    ctx.fillRect(ox + 5, oy + 11, 2, 1);
    ctx.fillRect(ox + 5, oy + 10, 1, 1);
    // petals in a plus shape around the head
    ctx.fillStyle = petal;
    ctx.fillRect(ox + 6, oy + 3, 3, 3);
    ctx.fillRect(ox + 5, oy + 4, 5, 1);
    ctx.fillRect(ox + 7, oy + 2, 1, 5);
    ctx.fillStyle = center;
    ctx.fillRect(ox + 7, oy + 4, 1, 1);
  };
}
painters[T.FLOWER_YELLOW] = flowerPainter('rgb(240,214,50)', 'rgb(190,140,20)');
painters[T.FLOWER_RED] = flowerPainter('rgb(216,50,40)', 'rgb(40,40,40)');

painters[T.WOOL] = (ctx, ox, oy, rng) => {
  noisyFill(ctx, ox, oy, [232, 232, 232], 0.05, rng);
  // swirly wool texture
  speckle(ctx, ox, oy, [210, 210, 210], 34, rng);
  speckle(ctx, ox, oy, [246, 246, 246], 26, rng);
  for (let i = 0; i < 5; i++) {
    const x = (rng() * 13) | 0, y = (rng() * 13) | 0;
    ctx.fillStyle = 'rgb(200,200,200)';
    ctx.fillRect(ox + x, oy + y, 2, 1);
    ctx.fillRect(ox + x + 1, oy + y + 1, 2, 1);
  }
};

function metalBlockPainter(base, edge) {
  return (ctx, ox, oy, rng) => {
    noisyFill(ctx, ox, oy, base, 0.04, rng);
    ctx.fillStyle = `rgb(${edge.join(',')})`;
    ctx.fillRect(ox, oy, TILE, 1); ctx.fillRect(ox, oy + 15, TILE, 1);
    ctx.fillRect(ox, oy, 1, TILE); ctx.fillRect(ox + 15, oy, 1, TILE);
    // inner panel highlight
    ctx.fillStyle = `rgba(255,255,255,0.25)`;
    ctx.fillRect(ox + 2, oy + 2, 12, 1);
    ctx.fillRect(ox + 2, oy + 2, 1, 12);
  };
}

painters[T.FURNACE_SIDE] = (ctx, ox, oy, rng) => {
  noisyFill(ctx, ox, oy, [110, 110, 110], 0.08, rng);
  ctx.fillStyle = 'rgb(75,75,75)';
  ctx.fillRect(ox, oy, TILE, 1); ctx.fillRect(ox, oy + 15, TILE, 1);
  ctx.fillRect(ox, oy, 1, TILE); ctx.fillRect(ox + 15, oy, 1, TILE);
};

painters[T.FURNACE_FRONT] = (ctx, ox, oy, rng) => {
  painters[T.FURNACE_SIDE](ctx, ox, oy, rng);
  // dark mouth with ember glow
  ctx.fillStyle = 'rgb(25,25,25)';
  ctx.fillRect(ox + 4, oy + 8, 8, 6);
  ctx.fillStyle = 'rgb(50,50,50)';
  ctx.fillRect(ox + 4, oy + 6, 8, 2);
  ctx.fillStyle = 'rgb(255,140,30)';
  ctx.fillRect(ox + 6, oy + 12, 1, 1); ctx.fillRect(ox + 9, oy + 11, 1, 1);
  ctx.fillStyle = 'rgb(255,60,20)';
  ctx.fillRect(ox + 7, oy + 13, 2, 1);
};

painters[T.FURNACE_TOP] = (ctx, ox, oy, rng) => {
  noisyFill(ctx, ox, oy, [95, 95, 95], 0.08, rng);
  ctx.fillStyle = 'rgb(70,70,70)';
  ctx.fillRect(ox + 3, oy + 3, 10, 10);
};

painters[T.GLASS] = (ctx, ox, oy, rng) => {
  ctx.clearRect(ox, oy, TILE, TILE);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  // frame
  ctx.fillRect(ox, oy, TILE, 1); ctx.fillRect(ox, oy + 15, TILE, 1);
  ctx.fillRect(ox, oy, 1, TILE); ctx.fillRect(ox + 15, oy, 1, TILE);
  // diagonal streaks
  ctx.fillStyle = 'rgba(220,240,255,0.85)';
  for (let i = 0; i < 4; i++) ctx.fillRect(ox + 3 + i, oy + 6 - i, 1, 1);
  for (let i = 0; i < 3; i++) ctx.fillRect(ox + 9 + i, oy + 12 - i, 1, 1);
};

painters[T.IRON_BLOCK] = metalBlockPainter([216, 216, 216], [140, 140, 140]);
painters[T.GOLD_BLOCK] = metalBlockPainter([250, 216, 70], [190, 150, 30]);
painters[T.DIAMOND_BLOCK] = metalBlockPainter([100, 227, 214], [50, 160, 150]);

painters[T.STONE_BRICKS] = (ctx, ox, oy, rng) => {
  noisyFill(ctx, ox, oy, [122, 122, 122], 0.07, rng);
  ctx.fillStyle = 'rgb(80,80,80)';
  // mortar lines: rows every 4px, staggered column seams
  for (const y of [3, 7, 11, 15]) ctx.fillRect(ox, oy + y, TILE, 1);
  for (let row = 0; row < 4; row++) {
    const off = row % 2 === 0 ? 7 : 3;
    ctx.fillRect(ox + off, oy + row * 4, 1, 4);
    ctx.fillRect(ox + ((off + 8) % 16), oy + row * 4, 1, 4);
  }
  ctx.fillStyle = 'rgba(160,160,160,0.6)';
  for (const y of [0, 4, 8, 12]) ctx.fillRect(ox, oy + y, TILE, 1);
};

let atlasCanvas = null;

export function buildAtlas() {
  atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = ATLAS_COLS * TILE;
  atlasCanvas.height = ATLAS_ROWS * TILE;
  const ctx = atlasCanvas.getContext('2d');
  ctx.fillStyle = '#f0f';
  ctx.fillRect(0, 0, atlasCanvas.width, atlasCanvas.height);

  for (const key of Object.keys(painters)) {
    const idx = Number(key);
    const ox = (idx % ATLAS_COLS) * TILE;
    const oy = Math.floor(idx / ATLAS_COLS) * TILE;
    painters[idx](ctx, ox, oy, mulberry32(1000 + idx));
  }

  const tex = new THREE.CanvasTexture(atlasCanvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// UV rect for a tile index: [u0, v0, u1, v1] with v flipped for three.js
export function tileUV(idx) {
  const cx = idx % ATLAS_COLS, cy = Math.floor(idx / ATLAS_COLS);
  const e = 0.0005; // bleed guard
  const u0 = cx / ATLAS_COLS + e, u1 = (cx + 1) / ATLAS_COLS - e;
  const v1 = 1 - cy / ATLAS_ROWS - e, v0 = 1 - (cy + 1) / ATLAS_ROWS + e;
  return [u0, v0, u1, v1];
}

// Copy one atlas tile to its own canvas, optionally darkened (only the
// tile's own pixels are shaded, so transparent areas like glass stay clear).
function tileToCanvas(idx, brightness = 1) {
  const c = document.createElement('canvas');
  c.width = TILE; c.height = TILE;
  const cc = c.getContext('2d');
  cc.drawImage(atlasCanvas, (idx % ATLAS_COLS) * TILE, Math.floor(idx / ATLAS_COLS) * TILE, TILE, TILE, 0, 0, TILE, TILE);
  if (brightness < 1) {
    cc.globalCompositeOperation = 'source-atop';
    cc.fillStyle = `rgba(0,0,0,${1 - brightness})`;
    cc.fillRect(0, 0, TILE, TILE);
  }
  return c;
}

// Fake-3D isometric cube icon for the UI, built from the block's top + side
// tiles. Each face is a unit-square-to-parallelogram affine map:
//   top:   (S/2,0) (S,S/4) (S/2,S/2) (0,S/4)
//   left:  (0,S/4) (S/2,S/2) (S/2,S) (0,3S/4)
//   right: (S/2,S/2) (S,S/4) (S,3S/4) (S/2,S)
function cubeIcon(blockId) {
  const def = BLOCKS[blockId];
  const S = 48;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const top = tileToCanvas(def.tiles.top);
  const left = tileToCanvas(def.tiles.side, 0.8);
  const right = tileToCanvas(def.tiles.side, 0.6);

  ctx.setTransform(0.5, 0.25, -0.5, 0.25, S / 2, 0);
  ctx.drawImage(top, 0, 0, S, S);

  ctx.setTransform(0.5, 0.25, 0, 0.5, 0, S / 4);
  ctx.drawImage(left, 0, 0, S, S);

  ctx.setTransform(0.5, -0.25, 0, 0.5, S / 2, S / 2);
  ctx.drawImage(right, 0, 0, S, S);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return c.toDataURL();
}

const TIER_COLORS = {
  wooden: '#9c7f4e',
  stone: '#8a8a8a',
  iron: '#dcdcdc',
  gold: '#f5d442',
  diamond: '#4fe3d0',
};

// 16x16 bitmap sprites: X = tool material, H = handle wood, . = transparent
const PICKAXE_SPRITE = [
  '.....XXXXXX.....',
  '...XXX....XXX...',
  '..XX...HH...XX..',
  '.XX....HH....XX.',
  '.X.....HH.....X.',
  'XX.....HH.....XX',
  'X......HH......X',
  '.......HH.......',
  '.......HH.......',
  '.......HH.......',
  '.......HH.......',
  '.......HH.......',
  '.......HH.......',
  '.......HH.......',
  '................',
  '................',
];

const AXE_SPRITE = [
  '...XXXXX........',
  '..XXXXXXX.......',
  '..XXXXXXXHH.....',
  '..XXXXXX.HH.....',
  '..XXXXX..HH.....',
  '...XXXX..HH.....',
  '....XX...HH.....',
  '.........HH.....',
  '.........HH.....',
  '.........HH.....',
  '.........HH.....',
  '.........HH.....',
  '.........HH.....',
  '.........HH.....',
  '................',
  '................',
];

function drawSprite(ctx, rows, colors) {
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const color = colors[rows[y][x]];
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
}

function ingotIcon(ctx, color, dark) {
  ctx.fillStyle = dark;
  ctx.fillRect(3, 7, 11, 5);
  ctx.fillStyle = color;
  ctx.fillRect(2, 6, 11, 5);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(3, 7, 6, 1);
}

function itemIcon(itemId) {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  const ctx = c.getContext('2d');
  const stick = () => {
    ctx.fillStyle = '#6e502e';
    for (let i = 0; i < 8; i++) ctx.fillRect(4 + i, 12 - i, 2, 2);
  };
  const def = ITEMS[itemId] || {};
  const mat = TIER_COLORS[def.tierKey] || '#8a8a8a';

  if (itemId === I.STICK) {
    stick();
  } else if (def.tool === 'pick') {
    drawSprite(ctx, PICKAXE_SPRITE, { X: mat, H: '#6e502e' });
  } else if (def.tool === 'axe') {
    drawSprite(ctx, AXE_SPRITE, { X: mat, H: '#6e502e' });
  } else if (def.tool === 'shovel') {
    stick();
    ctx.fillStyle = mat;
    ctx.fillRect(10, 1, 5, 5);
    ctx.fillRect(9, 2, 2, 3);
  } else if (def.damage) {
    // sword: diagonal blade with handle at bottom-left
    ctx.fillStyle = mat;
    for (let i = 0; i < 9; i++) ctx.fillRect(5 + i, 9 - i, 2, 2);
    ctx.fillStyle = '#4a3520';
    ctx.fillRect(3, 10, 4, 2); ctx.fillRect(5, 8, 2, 2);
    ctx.fillStyle = '#6e502e';
    ctx.fillRect(2, 12, 3, 3);
  } else if (itemId === I.PORKCHOP || itemId === I.COOKED_PORKCHOP) {
    const cooked = itemId === I.COOKED_PORKCHOP;
    ctx.fillStyle = cooked ? '#b56a45' : '#e89890';
    ctx.fillRect(5, 3, 8, 7);
    ctx.fillRect(4, 4, 10, 5);
    ctx.fillStyle = cooked ? '#d18a5e' : '#f7b5ad';
    ctx.fillRect(6, 4, 5, 4);
    ctx.fillStyle = '#d8c8b0';
    ctx.fillRect(4, 10, 3, 2);
    ctx.fillRect(3, 11, 2, 3);
  } else if (itemId === I.COAL) {
    ctx.fillStyle = '#2e2e2e';
    ctx.fillRect(4, 4, 8, 8);
    ctx.fillRect(3, 6, 10, 5);
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(5, 5, 3, 2);
  } else if (itemId === I.IRON_INGOT) {
    ingotIcon(ctx, '#dcdcdc', '#909090');
  } else if (itemId === I.GOLD_INGOT) {
    ingotIcon(ctx, '#f5d442', '#b8901e');
  } else if (itemId === I.DIAMOND) {
    ctx.fillStyle = '#2ea89a';
    ctx.fillRect(4, 5, 8, 4);
    ctx.fillRect(6, 9, 4, 4);
    ctx.fillStyle = '#4fe3d0';
    ctx.fillRect(5, 4, 6, 4);
    ctx.fillRect(6, 8, 4, 3);
    ctx.fillStyle = '#b8fff5';
    ctx.fillRect(6, 5, 2, 2);
  }
  return c.toDataURL();
}

// cross blocks (plants) use their tile directly as a flat icon
function flatTileIcon(blockId) {
  const c = document.createElement('canvas');
  c.width = 48; c.height = 48;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tileToCanvas(BLOCKS[blockId].tiles.side), 0, 0, 48, 48);
  return c.toDataURL();
}

const iconCache = new Map();

export function iconFor(id) {
  if (iconCache.has(id)) return iconCache.get(id);
  const url = id >= 100 ? itemIcon(id) : (BLOCKS[id].cross ? flatTileIcon(id) : cubeIcon(id));
  iconCache.set(id, url);
  return url;
}

// Apply per-face atlas tiles to a BoxGeometry (face order: +x -x +y -y +z -z).
export function setBoxTileUVs(geo, tiles) {
  const uv = geo.getAttribute('uv');
  const faceTiles = [tiles.side, tiles.side, tiles.top, tiles.bottom, tiles.side, tiles.side];
  for (let f = 0; f < 6; f++) {
    const [u0, v0, u1, v1] = tileUV(faceTiles[f]);
    const o = f * 4;
    uv.setXY(o + 0, u0, v1);
    uv.setXY(o + 1, u1, v1);
    uv.setXY(o + 2, u0, v0);
    uv.setXY(o + 3, u1, v0);
  }
  uv.needsUpdate = true;
}

// Shared THREE textures for item icons (hand viewmodel + floating drops).
const itemTexCache = new Map();

export function itemTexture(id) {
  let tex = itemTexCache.get(id);
  if (!tex) {
    tex = new THREE.TextureLoader().load(iconFor(id));
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    itemTexCache.set(id, tex);
  }
  return tex;
}
