// Infinite chunked voxel world: deterministic generation, lazy chunk data,
// per-chunk greedy-culled meshes with baked ambient occlusion, separate water mesh.

import * as THREE from 'three';
import { Noise2D, Noise3D, hash2, hash3 } from './noise.js';
import { B, BLOCKS, isOpaque, isSolid, isWater, waterLevel, flowId } from './blocks.js';
import { tileUV } from './textures.js';

export const CHUNK = 16;
export const HEIGHT = 64;
export const SEA_LEVEL = 28;

const key = (cx, cz) => cx + ',' + cz;
const idx = (x, y, z) => x + (z << 4) + (y << 8);

export class World {
  constructor(scene, atlasTexture, seed = 1337) {
    this.scene = scene;
    this.seed = seed;
    this.chunks = new Map();      // key -> { data, mesh, waterMesh, dirty }
    this.renderDistance = 8;

    this.heightNoise = new Noise2D(seed);
    this.hillNoise = new Noise2D(seed ^ 0x9e3779b9);
    this.caveNoise = new Noise3D(seed ^ 0x51ab3c);
    this.oreNoise = { coal: seed ^ 111, iron: seed ^ 222, gold: seed ^ 333, diamond: seed ^ 444 };

    this.opaqueMat = new THREE.MeshLambertMaterial({
      map: atlasTexture,
      vertexColors: true,
      alphaTest: 0.5, // glass tiles have fully transparent pixels
    });
    this.waterMat = new THREE.MeshLambertMaterial({
      map: atlasTexture,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.meshQueue = [];
    this.waterQueue = new Set(); // cells to re-evaluate, seeded by block edits
  }

  // ---------- terrain ----------

  surfaceHeight(wx, wz) {
    // fbm concentrates around 0.5, so stretch it out to get real oceans/hills
    const n = this.heightNoise.fbm(wx * 0.008, wz * 0.008, 4);
    const t = Math.min(1, Math.max(0, (n - 0.34) / 0.32));
    const hills = this.hillNoise.fbm(wx * 0.03, wz * 0.03, 3);
    const m = this.hillNoise.sample(wx * 0.004, wz * 0.004);
    const mountains = Math.pow(Math.max(0, (m - 0.55) / 0.45), 2) * 30;
    let h = 21 + t * 26 + (hills - 0.5) * 9 + mountains;
    return Math.max(4, Math.min(HEIGHT - 8, h | 0));
  }

  // surfaceH: cave carving fades out near the surface so terrain stays intact
  isCave(wx, wy, wz, surfaceH) {
    if (wy < 3) return false;
    const depth = surfaceH - wy;
    if (depth < 5) return false;
    const n = this.caveNoise.sample(wx * 0.075, wy * 0.11, wz * 0.075);
    const n2 = this.caveNoise.sample(wx * 0.062 + 100.5, wy * 0.09 + 100.5, wz * 0.062 + 100.5);
    return n > 0.74 && n2 > 0.66;
  }

  generateChunkData(cx, cz) {
    const data = new Uint8Array(CHUNK * CHUNK * HEIGHT);
    const heights = new Int16Array(CHUNK * CHUNK);

    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const wx = cx * CHUNK + x, wz = cz * CHUNK + z;
        const h = this.surfaceHeight(wx, wz);
        heights[x + z * CHUNK] = h;

        for (let y = 0; y < HEIGHT; y++) {
          let b = B.AIR;
          if (y === 0) b = B.BEDROCK;
          else if (y <= h) {
            if (this.isCave(wx, y, wz, h)) {
              b = B.AIR;
            } else if (y === h) {
              if (h <= SEA_LEVEL + 1) b = B.SAND;
              else b = B.GRASS;
            } else if (y >= h - 3) {
              b = h <= SEA_LEVEL + 1 ? B.SAND : B.DIRT;
            } else {
              b = B.STONE;
              // ore veins
              if (this.oreAt(wx, y, wz)) b = this.oreAt(wx, y, wz);
            }
          } else if (y <= SEA_LEVEL) {
            b = B.WATER;
          }
          data[idx(x, y, z)] = b;
        }
      }
    }

    this.plantTrees(cx, cz, data, heights);
    this.plantFlora(cx, cz, data, heights);
    return data;
  }

  // tall grass and flowers scattered on open grass blocks
  plantFlora(cx, cz, data, heights) {
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const h = heights[x + z * CHUNK];
        if (h <= SEA_LEVEL + 1 || h >= HEIGHT - 2) continue;
        if (data[idx(x, h, z)] !== B.GRASS) continue;
        if (data[idx(x, h + 1, z)] !== B.AIR) continue;
        const wx = cx * CHUNK + x, wz = cz * CHUNK + z;
        const r = hash2(wx, wz, this.seed ^ 0xf10a);
        if (r < 0.09) {
          data[idx(x, h + 1, z)] = B.TALL_GRASS;
        } else if (r < 0.105) {
          data[idx(x, h + 1, z)] = hash2(wx, wz, this.seed ^ 0xf10b) < 0.5 ? B.FLOWER_YELLOW : B.FLOWER_RED;
        }
      }
    }
  }

  oreAt(wx, y, wz) {
    const h3 = (s) => hash3(wx, y, wz, s);
    if (y < 14 && h3(this.oreNoise.diamond) < 0.004) return B.DIAMOND_ORE;
    if (y < 20 && h3(this.oreNoise.gold) < 0.006) return B.GOLD_ORE;
    if (y < 34 && h3(this.oreNoise.iron) < 0.012) return B.IRON_ORE;
    if (y < 50 && h3(this.oreNoise.coal) < 0.016) return B.COAL_ORE;
    if (h3(this.seed ^ 0x6a7e) < 0.008) return B.GRAVEL;
    return 0;
  }

  // Forest patches: dense clusters of trees where the forest noise is high,
  // occasional lone trees elsewhere (feels like MC plains vs forest biomes).
  treeDensity(wx, wz) {
    const f = this.hillNoise.sample(wx * 0.012 + 77.7, wz * 0.012 + 77.7);
    if (f > 0.68) return 0.045; // deep forest
    if (f > 0.58) return 0.018; // forest edge
    return 0.003;               // scattered plains trees
  }

  // Trees are deterministic per world column, so chunks can independently
  // write the parts of border-crossing trees that fall inside them.
  plantTrees(cx, cz, data, heights) {
    const MARGIN = 3;
    for (let z = -MARGIN; z < CHUNK + MARGIN; z++) {
      for (let x = -MARGIN; x < CHUNK + MARGIN; x++) {
        const wx = cx * CHUNK + x, wz = cz * CHUNK + z;
        if (hash2(wx, wz, this.seed ^ 0x7ee5) > this.treeDensity(wx, wz)) continue;

        const inChunk = x >= 0 && x < CHUNK && z >= 0 && z < CHUNK;
        const h = inChunk ? heights[x + z * CHUNK] : this.surfaceHeight(wx, wz);
        if (h <= SEA_LEVEL + 1 || h > HEIGHT - 12) continue;

        const th = 4 + Math.floor(hash2(wx, wz, this.seed ^ 0xabc) * 3); // trunk height 4-6

        const put = (lx, ly, lz, b) => {
          if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || ly < 0 || ly >= HEIGHT) return;
          const i = idx(lx, ly, lz);
          if (data[i] === B.AIR || data[i] === B.LEAVES) data[i] = b;
        };

        // trunk
        for (let t = 1; t <= th; t++) put(x, h + t, z, B.LOG);

        // leaf canopy
        for (let ly = h + th - 2; ly <= h + th + 1; ly++) {
          const top = ly - (h + th);
          const r = top >= 0 ? 1 : 2;
          for (let dz = -r; dz <= r; dz++) {
            for (let dx = -r; dx <= r; dx++) {
              if (dx === 0 && dz === 0 && ly <= h + th) continue;
              // trim corners for a rounder canopy
              if (Math.abs(dx) === r && Math.abs(dz) === r && hash3(wx + dx, ly, wz + dz, this.seed) < 0.6) continue;
              put(x + dx, ly, z + dz, B.LEAVES);
            }
          }
        }
        put(x, h + th + 1, z, B.LEAVES);
      }
    }
  }

  // ---------- access ----------

  getChunk(cx, cz) {
    const k = key(cx, cz);
    let c = this.chunks.get(k);
    if (!c) {
      c = { data: this.generateChunkData(cx, cz), mesh: null, waterMesh: null, dirty: true, cx, cz };
      this.chunks.set(k, c);
    }
    return c;
  }

  getBlock(wx, wy, wz) {
    if (wy < 0) return B.BEDROCK;
    if (wy >= HEIGHT) return B.AIR;
    const cx = Math.floor(wx / CHUNK), cz = Math.floor(wz / CHUNK);
    const c = this.getChunk(cx, cz);
    return c.data[idx(wx - cx * CHUNK, wy, wz - cz * CHUNK)];
  }

  setBlock(wx, wy, wz, b) {
    if (wy < 0 || wy >= HEIGHT) return;
    const cx = Math.floor(wx / CHUNK), cz = Math.floor(wz / CHUNK);
    const c = this.getChunk(cx, cz);
    const lx = wx - cx * CHUNK, lz = wz - cz * CHUNK;
    c.data[idx(lx, wy, lz)] = b;
    this.markDirty(cx, cz);
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK - 1) this.markDirty(cx, cz + 1);
    this.scheduleWaterAround(wx, wy, wz);
  }

  // ---------- water flow ----------
  // Oceans stay quiet until an edit wakes cells near them; from then on the
  // local rules relax until stable: water falls into air below, spreads
  // sideways with decreasing level when grounded, and dries when cut off.

  scheduleWaterAround(x, y, z) {
    this.waterQueue.add(x + ',' + y + ',' + z);
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      this.waterQueue.add((x + dx) + ',' + (y + dy) + ',' + (z + dz));
    }
  }

  // can this cell be flooded? (air and plants wash away)
  floodable(id) {
    if (id === B.AIR) return true;
    const def = BLOCKS[id];
    return !!(def && def.cross);
  }

  tickWater(budget = 240) {
    if (!this.waterQueue.size) return;
    const batch = [];
    for (const k of this.waterQueue) {
      batch.push(k);
      if (batch.length >= budget) break;
    }
    for (const k of batch) {
      this.waterQueue.delete(k);
      const [x, y, z] = k.split(',').map(Number);
      this.updateWaterCell(x, y, z);
    }
  }

  updateWaterCell(x, y, z) {
    if (y < 1 || y >= HEIGHT) return;
    const id = this.getBlock(x, y, z);
    const lvl = waterLevel(id);

    if (lvl === 0) {
      if (!this.floodable(id)) return;
      // empty cell: does water want to flow in?
      const desired = this.desiredLevel(x, y, z);
      if (desired > 0) this.setBlock(x, y, z, flowId(desired));
      return;
    }

    if (lvl < 8) {
      // flowing water re-derives its level from neighbors; dries if cut off
      const desired = this.desiredLevel(x, y, z);
      if (desired !== lvl) {
        this.setBlock(x, y, z, desired <= 0 ? B.AIR : flowId(desired));
        return;
      }
    }

    // stable water pushes outward
    this.spreadFrom(x, y, z, lvl);
  }

  // what level should this (non-source) cell have, from its neighbors?
  desiredLevel(x, y, z) {
    if (waterLevel(this.getBlock(x, y + 1, z)) > 0) return 7; // fed from above
    let best = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nb = this.getBlock(x + dx, y, z + dz);
      const nl = waterLevel(nb);
      if (nl < 2) continue;
      // a neighbor only donates sideways if it can't fall itself
      const nbBelow = this.getBlock(x + dx, y - 1, z + dz);
      if (this.floodable(nbBelow)) continue;
      best = Math.max(best, nl);
    }
    return best - 1;
  }

  spreadFrom(x, y, z, lvl) {
    const below = this.getBlock(x, y - 1, z);
    if (this.floodable(below)) {
      this.setBlock(x, y - 1, z, flowId(7));
      return;
    }
    const grounded = isSolid(below) || waterLevel(below) > 0;
    if (!grounded || lvl < 2) return;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      const target = this.getBlock(nx, y, nz);
      const tl = waterLevel(target);
      if (this.floodable(target) || (tl > 0 && tl < lvl - 1 && target !== B.WATER)) {
        this.setBlock(nx, y, nz, flowId(lvl - 1));
      }
    }
  }

  markDirty(cx, cz) {
    const c = this.chunks.get(key(cx, cz));
    if (c) c.dirty = true;
  }

  // ---------- meshing ----------

  buildChunkMesh(c) {
    const opaque = { pos: [], norm: [], uv: [], col: [], index: [] };
    const water = { pos: [], norm: [], uv: [], col: [], index: [] };
    const baseX = c.cx * CHUNK, baseZ = c.cz * CHUNK;

    const get = (lx, ly, lz) => {
      if (ly < 0) return B.BEDROCK;
      if (ly >= HEIGHT) return B.AIR;
      if (lx >= 0 && lx < CHUNK && lz >= 0 && lz < CHUNK) return c.data[idx(lx, ly, lz)];
      return this.getBlock(baseX + lx, ly, baseZ + lz);
    };

    // face definitions: dir, 4 corners (CCW from outside), normal
    // corners given as offsets from block origin
    const FACES = [
      { // +x
        dir: [1, 0, 0],
        corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
        shade: 0.8, tile: 'side',
      },
      { // -x
        dir: [-1, 0, 0],
        corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
        shade: 0.8, tile: 'side',
      },
      { // +y
        dir: [0, 1, 0],
        corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
        shade: 1.0, tile: 'top',
      },
      { // -y
        dir: [0, -1, 0],
        corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
        shade: 0.5, tile: 'bottom',
      },
      { // +z
        dir: [0, 0, 1],
        corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
        shade: 0.65, tile: 'side',
      },
      { // -z
        dir: [0, 0, -1],
        corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
        shade: 0.65, tile: 'side',
      },
    ];

    const aoFor = (lx, ly, lz, corner, dir) => {
      // For a corner vertex, sample the two edge neighbors + corner neighbor
      // in the plane of the face.
      const [cx0, cy0, cz0] = corner;
      const ox = cx0 === 0 ? -1 : 1, oy = cy0 === 0 ? -1 : 1, oz = cz0 === 0 ? -1 : 1;
      let s1, s2, cc;
      if (dir[0] !== 0) {
        s1 = isOpaque(get(lx + dir[0], ly + oy, lz));
        s2 = isOpaque(get(lx + dir[0], ly, lz + oz));
        cc = isOpaque(get(lx + dir[0], ly + oy, lz + oz));
      } else if (dir[1] !== 0) {
        s1 = isOpaque(get(lx + ox, ly + dir[1], lz));
        s2 = isOpaque(get(lx, ly + dir[1], lz + oz));
        cc = isOpaque(get(lx + ox, ly + dir[1], lz + oz));
      } else {
        s1 = isOpaque(get(lx + ox, ly, lz + dir[2]));
        s2 = isOpaque(get(lx, ly + oy, lz + dir[2]));
        cc = isOpaque(get(lx + ox, ly + oy, lz + dir[2]));
      }
      const n = (s1 && s2) ? 3 : (s1 ? 1 : 0) + (s2 ? 1 : 0) + (cc ? 1 : 0);
      return 1 - n * 0.18;
    };

    // two crossed diagonal quads for plants, drawn double-sided via two windings
    const emitCross = (x, y, z, def) => {
      const [u0, v0, u1, v1] = tileUV(def.tiles.side);
      const quads = [
        [[0.15, 0.15], [0.85, 0.85]],
        [[0.15, 0.85], [0.85, 0.15]],
      ];
      for (const [[ax, az], [bx, bz]] of quads) {
        for (const flip of [false, true]) {
          const vi = opaque.pos.length / 3;
          const corners = flip
            ? [[bx, 0, bz], [ax, 0, az], [ax, 1, az], [bx, 1, bz]]
            : [[ax, 0, az], [bx, 0, bz], [bx, 1, bz], [ax, 1, az]];
          const uvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
          for (let i = 0; i < 4; i++) {
            opaque.pos.push(x + corners[i][0], y + corners[i][1], z + corners[i][2]);
            opaque.norm.push(0, 1, 0);
            opaque.uv.push(uvs[i][0], uvs[i][1]);
            opaque.col.push(0.95, 0.95, 0.95);
          }
          opaque.index.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
        }
      }
    };

    for (let y = 0; y < HEIGHT; y++) {
      for (let z = 0; z < CHUNK; z++) {
        for (let x = 0; x < CHUNK; x++) {
          const b = c.data[idx(x, y, z)];
          if (b === B.AIR) continue;
          const def = BLOCKS[b];
          if (def.cross) {
            emitCross(x, y, z, def);
            continue;
          }
          const bIsWater = !!def.water;
          const buf = bIsWater ? water : opaque;
          // surface height: sources sit at 0.875, flowing water lower per level
          const lvl = waterLevel(b);
          const surfaceY = lvl === 8 ? 0.875 : 0.125 + lvl * 0.105;

          for (const face of FACES) {
            const nb = get(x + face.dir[0], y + face.dir[1], z + face.dir[2]);
            let sideBottom = 0; // for partial water-water step faces
            if (bIsWater) {
              if (isWater(nb)) {
                // step face between two waters of different surface heights
                if (face.dir[1] !== 0) continue;
                const ownTop = isWater(get(x, y + 1, z)) ? 1 : surfaceY;
                const nl = waterLevel(nb);
                const nbTop = isWater(get(x + face.dir[0], y + 1, z + face.dir[2]))
                  ? 1 : (nl === 8 ? 0.875 : 0.125 + nl * 0.105);
                if (ownTop <= nbTop + 0.01) continue;
                sideBottom = nbTop;
              } else if (isOpaque(nb)) {
                continue; // buried face
              }
            } else {
              if (isOpaque(nb)) continue;
              if (nb === b) continue; // no faces between two glass blocks
              if (isWater(nb) && bIsWater) continue;
            }

            const tileIdx = def.tiles[face.tile];
            const [u0, v0, u1, v1] = tileUV(tileIdx);
            const uvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
            const vi = buf.pos.length / 3;

            for (let i = 0; i < 4; i++) {
              const [ox, oy, oz] = face.corners[i];
              let vy = y + oy;
              if (bIsWater && oy === 1 && !isWater(get(x, y + 1, z))) vy = y + surfaceY;
              if (bIsWater && oy === 0 && sideBottom > 0) vy = y + sideBottom;
              buf.pos.push(x + ox, vy, z + oz);
              buf.norm.push(...face.dir);
              buf.uv.push(uvs[i][0], uvs[i][1]);
              const ao = bIsWater ? 1 : aoFor(x, y, z, face.corners[i], face.dir);
              const l = face.shade * ao;
              buf.col.push(l, l, l);
            }
            buf.index.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
          }
        }
      }
    }

    // dispose old
    if (c.mesh) { this.scene.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh = null; }
    if (c.waterMesh) { this.scene.remove(c.waterMesh); c.waterMesh.geometry.dispose(); c.waterMesh = null; }

    if (opaque.pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(opaque.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(opaque.norm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(opaque.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(opaque.col, 3));
      g.setIndex(opaque.index);
      const m = new THREE.Mesh(g, this.opaqueMat);
      m.position.set(baseX, 0, baseZ);
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      this.scene.add(m);
      c.mesh = m;
    }
    if (water.pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(water.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(water.norm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(water.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(water.col, 3));
      g.setIndex(water.index);
      const m = new THREE.Mesh(g, this.waterMat);
      m.position.set(baseX, 0, baseZ);
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      m.renderOrder = 1;
      this.scene.add(m);
      c.waterMesh = m;
    }
    c.dirty = false;
  }

  // Load/unload around the player, remesh a budgeted number of chunks per call.
  update(playerX, playerZ, budget = 2) {
    const pcx = Math.floor(playerX / CHUNK), pcz = Math.floor(playerZ / CHUNK);
    const R = this.renderDistance;

    // collect wanted chunks sorted by distance
    const wanted = [];
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dz * dz > (R + 0.5) * (R + 0.5)) continue;
        wanted.push([pcx + dx, pcz + dz, dx * dx + dz * dz]);
      }
    }
    wanted.sort((a, b) => a[2] - b[2]);

    let done = 0;
    for (const [cx, cz] of wanted) {
      const c = this.getChunk(cx, cz);
      if (c.dirty) {
        this.buildChunkMesh(c);
        if (++done >= budget) break;
      }
    }

    // unload far chunks
    const unloadR2 = (R + 3) * (R + 3);
    for (const [k, c] of this.chunks) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx * dx + dz * dz > unloadR2) {
        if (c.mesh) { this.scene.remove(c.mesh); c.mesh.geometry.dispose(); }
        if (c.waterMesh) { this.scene.remove(c.waterMesh); c.waterMesh.geometry.dispose(); }
        this.chunks.delete(k);
      }
    }
    return done;
  }

  // Count of chunks still needing a mesh within render distance (for loading screen).
  pendingMeshes(playerX, playerZ) {
    const pcx = Math.floor(playerX / CHUNK), pcz = Math.floor(playerZ / CHUNK);
    const R = this.renderDistance;
    let n = 0;
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dz * dz > (R + 0.5) * (R + 0.5)) continue;
        const c = this.chunks.get(key(pcx + dx, pcz + dz));
        if (!c || c.dirty) n++;
      }
    }
    return n;
  }

  isSolidAt(wx, wy, wz) {
    return isSolid(this.getBlock(Math.floor(wx), Math.floor(wy), Math.floor(wz)));
  }
}
