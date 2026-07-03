// Floating item drops, Minecraft style: mined blocks and mob loot pop out as
// small spinning entities that bob above the ground, get magnetized toward a
// nearby player, and merge into the inventory on contact.

import * as THREE from 'three';
import { BLOCKS } from './blocks.js';
import { setBoxTileUVs, itemTexture } from './textures.js';
import { isSolid } from './blocks.js';

const GRAVITY = 22;
const PICKUP_RADIUS = 0.9;
const MAGNET_RADIUS = 2.6;
const PICKUP_DELAY = 0.5;   // seconds before a fresh drop can be collected
const LIFETIME = 300;       // despawn after 5 minutes

const hasDOM = typeof document !== 'undefined';

export class DropManager {
  constructor(scene, world, atlasTexture) {
    this.scene = scene;
    this.world = world;
    this.atlas = atlasTexture;
    this.drops = [];
    this.blockMat = new THREE.MeshLambertMaterial({ map: atlasTexture, alphaTest: 0.5 });
    this.onPickup = null;
  }

  makeMesh(id) {
    if (id < 100 && !BLOCKS[id].cross) {
      const geo = new THREE.BoxGeometry(0.26, 0.26, 0.26);
      if (hasDOM || this.atlas) setBoxTileUVs(geo, BLOCKS[id].tiles);
      return new THREE.Mesh(geo, this.blockMat);
    }
    // flat item sprite (icon texture needs a canvas; plain color in headless tests)
    const mat = hasDOM
      ? new THREE.MeshBasicMaterial({ map: itemTexture(id), transparent: true, alphaTest: 0.1, side: THREE.DoubleSide })
      : new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
    return new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.35), mat);
  }

  spawn(id, count, x, y, z, scatter = true) {
    const mesh = this.makeMesh(id);
    const drop = {
      id, count, mesh,
      pos: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3(),
      age: 0,
      phase: Math.random() * Math.PI * 2,
    };
    if (scatter) {
      const a = Math.random() * Math.PI * 2;
      drop.vel.set(Math.cos(a) * 1.6, 3.4, Math.sin(a) * 1.6);
    }
    mesh.position.copy(drop.pos);
    this.scene.add(mesh);
    this.drops.push(drop);
    return drop;
  }

  // rest height for a drop at this column: just above the first solid block below
  groundY(d) {
    const bx = Math.floor(d.pos.x), bz = Math.floor(d.pos.z);
    let y = Math.floor(d.pos.y);
    while (y > 0 && !isSolid(this.world.getBlock(bx, y, bz))) y--;
    return y + 1 + 0.18;
  }

  update(dt, player, inventory) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;

      if (d.age > LIFETIME || d.pos.y < -20) {
        this.remove(i);
        continue;
      }

      const toPlayer = new THREE.Vector3(
        player.pos.x - d.pos.x,
        player.pos.y + 0.9 - d.pos.y,
        player.pos.z - d.pos.z
      );
      const dist = toPlayer.length();

      if (d.age > PICKUP_DELAY && dist < MAGNET_RADIUS && !player.dead) {
        // magnetize: fly toward the player, ignoring terrain
        const pull = 10 * (1 - dist / MAGNET_RADIUS) + 3;
        d.vel.addScaledVector(toPlayer.normalize(), pull * dt * 10);
        d.vel.multiplyScalar(1 - Math.min(1, dt * 4));
        d.pos.addScaledVector(d.vel, dt);

        if (dist < PICKUP_RADIUS) {
          const leftover = inventory.add(d.id, d.count);
          if (leftover < d.count && this.onPickup) this.onPickup();
          if (leftover > 0) d.count = leftover;
          else this.remove(i);
          continue;
        }
      } else {
        // normal physics: gravity, land on ground, bob in place
        d.vel.y -= GRAVITY * dt;
        d.vel.x *= 1 - Math.min(1, dt * 3);
        d.vel.z *= 1 - Math.min(1, dt * 3);
        d.pos.addScaledVector(d.vel, dt);

        const gy = this.groundY(d);
        if (d.pos.y <= gy) {
          d.pos.y = gy;
          d.vel.y = 0;
          d.vel.x *= 0.6;
          d.vel.z *= 0.6;
        }
      }

      d.mesh.position.copy(d.pos);
      d.mesh.position.y += Math.sin(d.age * 2.5 + d.phase) * 0.05 + 0.05;
      d.mesh.rotation.y = d.age * 1.8 + d.phase;
    }
  }

  remove(i) {
    const d = this.drops[i];
    this.scene.remove(d.mesh);
    d.mesh.geometry.dispose();
    if (d.id >= 100) d.mesh.material.dispose();
    this.drops.splice(i, 1);
  }
}
