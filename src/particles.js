// Block particles, Minecraft style: little textured squares sampling random
// 4x4px regions of the block's texture. All particles live in one dynamic
// non-indexed BufferGeometry rebuilt each frame (billboarded quads).

import * as THREE from 'three';
import { BLOCKS, isSolid } from './blocks.js';
import { ATLAS_COLS, ATLAS_ROWS } from './textures.js';

const MAX = 400;
const GRAVITY = 18;

export class ParticleManager {
  constructor(scene, world, atlasTexture) {
    this.world = world;
    this.parts = [];

    this.positions = new Float32Array(MAX * 6 * 3);
    this.uvs = new Float32Array(MAX * 6 * 2);
    this.colors = new Float32Array(MAX * 6 * 3);

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);

    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({
      map: atlasTexture,
      vertexColors: true,
      alphaTest: 0.5,
    }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  // random 4x4px sub-square of the block's side tile
  tileUVFor(blockId) {
    const def = BLOCKS[blockId];
    if (!def || !def.tiles) return null;
    const idx = def.tiles.side;
    const tw = 1 / ATLAS_COLS, th = 1 / ATLAS_ROWS;
    const u0 = (idx % ATLAS_COLS) * tw, v0 = 1 - (Math.floor(idx / ATLAS_COLS) + 1) * th;
    const fx = Math.random() * 0.75, fy = Math.random() * 0.75;
    return [u0 + fx * tw, v0 + fy * th, tw * 0.25, th * 0.25];
  }

  spawn(blockId, x, y, z, spread, upKick) {
    if (this.parts.length >= MAX) return;
    const uv = this.tileUVFor(blockId);
    if (!uv) return;
    const shade = 0.75 + Math.random() * 0.25;
    this.parts.push({
      x, y, z,
      vx: (Math.random() - 0.5) * spread,
      vy: Math.random() * upKick + 1.2,
      vz: (Math.random() - 0.5) * spread,
      size: 0.055 + Math.random() * 0.05,
      life: 0.45 + Math.random() * 0.35,
      uv,
      shade,
    });
  }

  // full block destruction
  burst(blockId, x, y, z) {
    for (let i = 0; i < 14; i++) {
      this.spawn(blockId, x + (Math.random() - 0.5) * 0.8, y + (Math.random() - 0.5) * 0.6, z + (Math.random() - 0.5) * 0.8, 3.4, 2.6);
    }
  }

  // small chips while mining
  hit(blockId, x, y, z) {
    for (let i = 0; i < 2; i++) {
      this.spawn(blockId, x + (Math.random() - 0.5) * 0.9, y + (Math.random() - 0.3) * 0.9, z + (Math.random() - 0.5) * 0.9, 1.8, 1.2);
    }
  }

  update(dt, camera) {
    // integrate
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts.splice(i, 1);
        continue;
      }
      p.vy -= GRAVITY * dt;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      // cheap voxel collision: stop on solid ground, slide off walls
      if (isSolid(this.world.getBlock(Math.floor(p.x), Math.floor(ny), Math.floor(p.z)))) {
        p.vy = 0;
        p.vx *= 0.7;
        p.vz *= 0.7;
      } else {
        p.y = ny;
      }
      if (!isSolid(this.world.getBlock(Math.floor(nx), Math.floor(p.y), Math.floor(nz)))) {
        p.x = nx;
        p.z = nz;
      }
    }

    // rebuild billboarded quads
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    let v = 0;
    for (const p of this.parts) {
      const s = p.size;
      const rx = right.x * s, ry = right.y * s, rz = right.z * s;
      const ux = up.x * s, uy = up.y * s, uz = up.z * s;
      const [u0, v0, uw, vh] = p.uv;
      // two triangles: (-r-u, +r-u, +r+u), (-r-u, +r+u, -r+u)
      const corners = [
        [p.x - rx - ux, p.y - ry - uy, p.z - rz - uz, u0, v0],
        [p.x + rx - ux, p.y + ry - uy, p.z + rz - uz, u0 + uw, v0],
        [p.x + rx + ux, p.y + ry + uy, p.z + rz + uz, u0 + uw, v0 + vh],
        [p.x - rx - ux, p.y - ry - uy, p.z - rz - uz, u0, v0],
        [p.x + rx + ux, p.y + ry + uy, p.z + rz + uz, u0 + uw, v0 + vh],
        [p.x - rx + ux, p.y - ry + uy, p.z - rz + uz, u0, v0 + vh],
      ];
      for (const [cx, cy, cz, cu, cv] of corners) {
        this.positions[v * 3] = cx;
        this.positions[v * 3 + 1] = cy;
        this.positions[v * 3 + 2] = cz;
        this.uvs[v * 2] = cu;
        this.uvs[v * 2 + 1] = cv;
        this.colors[v * 3] = p.shade;
        this.colors[v * 3 + 1] = p.shade;
        this.colors[v * 3 + 2] = p.shade;
        v++;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.uv.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.setDrawRange(0, v);
  }
}
