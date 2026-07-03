// First-person player: AABB physics vs voxels, swimming, sprint/FOV kick,
// voxel raycast for mining/placing with hold-to-mine timing.

import * as THREE from 'three';
import { B, BLOCKS, ITEMS, isSolid, isWater } from './blocks.js';
import { HEIGHT, SEA_LEVEL } from './world.js';

const GRAVITY = 26;
const JUMP_SPEED = 8.1; // v^2/2g = 1.26 blocks, matching MC's 1.25 jump
const WALK_SPEED = 4.3;
const SPRINT_SPEED = 6.1;
const WATER_SPEED = 2.6;
const PLAYER_W = 0.6;   // width (x/z)
const PLAYER_H = 1.8;   // height
export const EYE_HEIGHT = 1.62;
const REACH = 5;

export class Player {
  constructor(world, camera) {
    this.world = world;
    this.camera = camera;
    this.pos = new THREE.Vector3(8.5, HEIGHT, 8.5);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.inWater = false;
    this.headInWater = false;
    this.sprinting = false;
    this.sprintToggle = false;
    this.bobPhase = 0;
    this.bobAmount = 0; // eases in/out with movement

    this.keys = {};

    // mining state
    this.mining = false;
    this.mineTarget = null;   // {x,y,z}
    this.mineProgress = 0;    // seconds accumulated
    this.placeCooldown = 0;
    this.leftDown = false;
    this.rightDown = false;
    this.aimingAtMob = false; // set by main; pauses mining while a mob is targeted

    // health (half-hearts) and air (bubbles)
    this.maxHp = 20;
    this.hp = 20;
    this.maxAir = 10;
    this.air = 10;
    this.dead = false;
    this.hurtCooldown = 0;   // invulnerability frames
    this.regenTimer = 0;
    this.drownTimer = 0;
    this.onHurt = null;      // (amount) => void
    this.onDeath = null;
    this.onBlockMined = null; // (dropId, x, y, z, blockId, bx, by, bz) => void
    this.onInteract = null;   // (blockId, [x,y,z]) => bool; true = handled (e.g. furnace UI)
    this.onDigTick = null;    // (blockId) => void, fires repeatedly while mining
    this.digTickTimer = 0;
    this.lastPlacedId = 0;    // block id of the most recent placement
    this.justAte = false;
  }

  damage(n, opts = {}) {
    if (this.dead || n <= 0) return false;
    if (!opts.bypassIframes && this.hurtCooldown > 0) return false;
    if (opts.source) this.lastDamageSource = opts.source;
    this.hp -= n;
    this.hurtCooldown = 0.5;
    this.regenTimer = 0;
    if (this.onHurt) this.onHurt(n);
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
    return true;
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.leftDown = this.rightDown = false;
    this.keys = {};
    if (this.onDeath) this.onDeath();
  }

  respawn() {
    this.hp = this.maxHp;
    this.air = this.maxAir;
    this.dead = false;
    this.hurtCooldown = 1;
    this.spawn();
  }

  spawn() {
    // spiral outward from origin until we find dry land
    let x = 8, z = 8;
    outer:
    for (let r = 0; r < 64; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const cx = 8 + dx * 8, cz = 8 + dz * 8;
          if (this.world.surfaceHeight(cx, cz) > SEA_LEVEL + 2) {
            x = cx; z = cz;
            break outer;
          }
        }
      }
    }
    let y = HEIGHT - 2;
    while (y > 1 && !isSolid(this.world.getBlock(x, y, z))) y--;
    this.pos.set(x + 0.5, y + 1.01, z + 0.5);
    this.vel.set(0, 0, 0);
  }

  get aabb() {
    const hw = PLAYER_W / 2;
    return {
      minX: this.pos.x - hw, maxX: this.pos.x + hw,
      minY: this.pos.y, maxY: this.pos.y + PLAYER_H,
      minZ: this.pos.z - hw, maxZ: this.pos.z + hw,
    };
  }

  collides() {
    const b = this.aabb;
    const x0 = Math.floor(b.minX), x1 = Math.floor(b.maxX);
    const y0 = Math.floor(b.minY), y1 = Math.floor(b.maxY);
    const z0 = Math.floor(b.minZ), z1 = Math.floor(b.maxZ);
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          if (isSolid(this.world.getBlock(x, y, z))) return true;
        }
      }
    }
    return false;
  }

  moveAxis(delta, axis) {
    if (delta === 0) return;
    this.pos[axis] += delta;
    if (this.collides()) {
      // step back to just outside the block
      if (axis === 'y') {
        if (delta < 0) {
          // feet penetrated the block below: snap on top of it
          this.pos.y = Math.floor(this.pos.y) + 1 + 1e-4;
          this.onGround = true;
          // fall damage: ~3 safe blocks, then 1 half-heart per extra block
          const impact = -this.vel.y;
          if (impact > 13 && !this.inWater) {
            this.damage(Math.round(impact * impact / 52 - 3), { bypassIframes: true, source: 'fall' });
          }
        } else {
          // head penetrated the block above: snap just under its bottom face
          this.pos.y = Math.floor(this.pos.y + PLAYER_H) - PLAYER_H - 1e-4;
        }
        this.vel.y = 0;
      } else {
        const hw = PLAYER_W / 2;
        // leading edge penetrated a block: snap back to that block's near face
        if (delta > 0) this.pos[axis] = Math.floor(this.pos[axis] + hw) - hw - 1e-4;
        else this.pos[axis] = Math.floor(this.pos[axis] - hw) + 1 + hw + 1e-4;
        this.vel[axis === 'x' ? 'x' : 'z'] = 0;
      }
    }
  }

  update(dt, inventory) {
    dt = Math.min(dt, 0.05);

    // water state
    const feet = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.2), Math.floor(this.pos.z));
    const head = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + EYE_HEIGHT), Math.floor(this.pos.z));
    this.inWater = isWater(feet) || isWater(head);
    this.headInWater = isWater(head);

    // input direction in world space
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const wish = new THREE.Vector3();
    if (this.keys['KeyW']) wish.add(forward);
    if (this.keys['KeyS']) wish.sub(forward);
    if (this.keys['KeyD']) wish.add(right);
    if (this.keys['KeyA']) wish.sub(right);
    if (wish.lengthSq() > 0) wish.normalize();

    const sprintKey = this.keys['ControlLeft'] || this.keys['ControlRight'] || this.sprintToggle;
    this.sprinting = sprintKey && this.keys['KeyW'] && !this.inWater;
    const speed = this.inWater ? WATER_SPEED : (this.sprinting ? SPRINT_SPEED : WALK_SPEED);

    if (this.inWater) {
      // buoyant, damped movement
      this.vel.x += (wish.x * speed - this.vel.x) * Math.min(1, dt * 8);
      this.vel.z += (wish.z * speed - this.vel.z) * Math.min(1, dt * 8);
      this.vel.y -= GRAVITY * 0.28 * dt;
      this.vel.y *= 1 - Math.min(1, dt * 3.2);
      if (this.keys['Space']) this.vel.y += 24 * dt;
    } else {
      const accel = this.onGround ? 14 : 4;
      this.vel.x += (wish.x * speed - this.vel.x) * Math.min(1, dt * accel);
      this.vel.z += (wish.z * speed - this.vel.z) * Math.min(1, dt * accel);
      this.vel.y -= GRAVITY * dt;
      if (this.keys['Space'] && this.onGround) {
        this.vel.y = JUMP_SPEED;
        this.onGround = false;
      }
    }
    this.vel.y = Math.max(this.vel.y, -50);

    this.onGround = false;
    this.moveAxis(this.vel.y * dt, 'y');
    this.moveAxis(this.vel.x * dt, 'x');
    this.moveAxis(this.vel.z * dt, 'z');

    if (this.pos.y < -10) { this.lastDamageSource = 'void'; this.die(); }

    // drowning: ~10s of air, then half a heart per second
    this.hurtCooldown = Math.max(0, this.hurtCooldown - dt);
    if (this.headInWater) {
      this.air = Math.max(0, this.air - dt);
      if (this.air <= 0) {
        this.drownTimer += dt;
        if (this.drownTimer >= 1) {
          this.drownTimer = 0;
          this.damage(1, { bypassIframes: true, source: 'drown' });
        }
      }
    } else {
      this.air = Math.min(this.maxAir, this.air + dt * 4);
      this.drownTimer = 0;
    }

    // slow regeneration: half a heart every 4 seconds
    if (this.hp < this.maxHp && this.hp > 0) {
      this.regenTimer += dt;
      if (this.regenTimer >= 4) {
        this.regenTimer = 0;
        this.hp = Math.min(this.maxHp, this.hp + 1);
      }
    }

    // camera with walking view-bob
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    const bobbing = this.onGround && !this.inWater && hSpeed > 1;
    this.bobAmount += ((bobbing ? Math.min(1, hSpeed / 4) : 0) - this.bobAmount) * Math.min(1, dt * 8);
    if (bobbing) this.bobPhase += dt * hSpeed * 1.6;
    const bobY = -Math.abs(Math.cos(this.bobPhase)) * 0.055 * this.bobAmount;
    const bobRoll = Math.sin(this.bobPhase) * 0.008 * this.bobAmount;

    this.camera.position.set(this.pos.x, this.pos.y + EYE_HEIGHT + bobY, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, bobRoll, 'YXZ');

    // sprint FOV kick
    const targetFov = this.sprinting ? 82 : 75;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 10);
      this.camera.updateProjectionMatrix();
    }

    this.placeCooldown = Math.max(0, this.placeCooldown - dt);
    this.updateMining(dt, inventory);
    this.updatePlacing(inventory);
  }

  // DDA voxel raycast. Returns { block: [x,y,z], prev: [x,y,z] } or null.
  raycast() {
    const origin = new THREE.Vector3(this.pos.x, this.pos.y + EYE_HEIGHT, this.pos.z);
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));

    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const stepX = Math.sign(dir.x), stepY = Math.sign(dir.y), stepZ = Math.sign(dir.z);
    const tDeltaX = stepX !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const tDeltaY = stepY !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dir.z) : Infinity;
    let tMaxX = stepX > 0 ? (x + 1 - origin.x) * tDeltaX : stepX < 0 ? (origin.x - x) * tDeltaX : Infinity;
    let tMaxY = stepY > 0 ? (y + 1 - origin.y) * tDeltaY : stepY < 0 ? (origin.y - y) * tDeltaY : Infinity;
    let tMaxZ = stepZ > 0 ? (z + 1 - origin.z) * tDeltaZ : stepZ < 0 ? (origin.z - z) * tDeltaZ : Infinity;

    let px = x, py = y, pz = z;
    let t = 0;
    while (t <= REACH) {
      const b = this.world.getBlock(x, y, z);
      if (b !== B.AIR && !isWater(b)) {
        return { block: [x, y, z], prev: [px, py, pz], id: b, dist: t };
      }
      px = x; py = y; pz = z;
      if (tMaxX < tMaxY && tMaxX < tMaxZ) { t = tMaxX; tMaxX += tDeltaX; x += stepX; }
      else if (tMaxY < tMaxZ) { t = tMaxY; tMaxY += tDeltaY; y += stepY; }
      else { t = tMaxZ; tMaxZ += tDeltaZ; z += stepZ; }
    }
    return null;
  }

  // True when the held tool is too weak for this block: it will still break
  // (slowly), but drops nothing - same as Minecraft.
  underTier(blockId, inventory) {
    const def = BLOCKS[blockId];
    if (!def || !def.minTier) return false;
    const held = inventory.heldItem();
    const tool = held && ITEMS[held.id];
    const matches = def.tool && tool && tool.tool === def.tool;
    return (matches ? tool.tier || 0 : 0) < def.minTier;
  }

  mineSpeedFor(blockId, inventory) {
    const def = BLOCKS[blockId];
    if (!def || def.hardness === Infinity) return 0;
    const held = inventory.heldItem();
    const tool = held && ITEMS[held.id];
    const matches = def.tool && tool && tool.tool === def.tool;
    if (this.underTier(blockId, inventory)) {
      return 1 / (def.hardness * 3.3); // heavy penalty, no drop
    }
    return (matches ? tool.speed : 1) / def.hardness;
  }

  updateMining(dt, inventory) {
    if (!this.leftDown || this.aimingAtMob) {
      this.mineTarget = null;
      this.mineProgress = 0;
      return;
    }
    const hit = this.raycast();
    if (!hit) {
      this.mineTarget = null;
      this.mineProgress = 0;
      return;
    }
    const [x, y, z] = hit.block;
    if (!this.mineTarget || this.mineTarget[0] !== x || this.mineTarget[1] !== y || this.mineTarget[2] !== z) {
      this.mineTarget = [x, y, z];
      this.mineProgress = 0;
    }
    const speed = this.mineSpeedFor(hit.id, inventory);
    if (speed <= 0) return;
    // periodic dig sound while chipping away
    this.digTickTimer -= dt;
    if (this.digTickTimer <= 0) {
      this.digTickTimer = 0.22;
      if (this.onDigTick) this.onDigTick(hit.id);
    }
    this.mineProgress += speed * dt;
    if (this.mineProgress >= 1) {
      const def = BLOCKS[hit.id];
      let drop = def.drops === undefined ? hit.id : def.drops;
      if (this.underTier(hit.id, inventory)) drop = null;
      if (drop !== null) {
        if (this.onBlockMined) this.onBlockMined(drop, x + 0.5, y + 0.4, z + 0.5, hit.id, x, y, z);
        else inventory.add(drop, 1);
      }
      this.world.setBlock(x, y, z, B.AIR);
      // plants sitting on the broken block pop off with it
      const above = this.world.getBlock(x, y + 1, z);
      const aboveDef = BLOCKS[above];
      if (aboveDef && aboveDef.cross) {
        const plantDrop = aboveDef.drops === undefined ? above : aboveDef.drops;
        if (plantDrop !== null && this.onBlockMined) {
          this.onBlockMined(plantDrop, x + 0.5, y + 1.3, z + 0.5, above, x, y + 1, z);
        }
        this.world.setBlock(x, y + 1, z, B.AIR);
      }
      this.mineTarget = null;
      this.mineProgress = 0;
    }
  }

  updatePlacing(inventory) {
    if (!this.rightDown || this.placeCooldown > 0) return;
    const sel = inventory.heldItem();

    // interactable blocks (furnace) take priority over placing/eating
    if (this.onInteract) {
      const look = this.raycast();
      if (look && this.onInteract(look.id, look.block)) {
        this.placeCooldown = 0.4;
        this.rightDown = false;
        return;
      }
    }

    // eating: right click with food held
    if (sel && sel.id >= 100) {
      const def = ITEMS[sel.id];
      if (def && def.food && this.hp < this.maxHp) {
        this.hp = Math.min(this.maxHp, this.hp + def.food);
        inventory.consumeHeld(1);
        this.placeCooldown = 0.6;
        this.justPlaced = true; // reuse the hand swing as eating feedback
        this.justAte = true;
      }
      return;
    }

    const hit = this.raycast();
    if (!hit) return;
    if (!sel || sel.count <= 0) return;
    // placing into a plant replaces it, like MC tall grass
    let [x, y, z] = hit.prev;
    const hitDef = BLOCKS[hit.id];
    if (hitDef && hitDef.cross) [x, y, z] = hit.block;
    if (y < 1 || y >= HEIGHT) return;
    const cur = this.world.getBlock(x, y, z);
    const curDef = BLOCKS[cur];
    if (cur !== B.AIR && !isWater(cur) && !(curDef && curDef.cross)) return;

    // plants can only be planted on grass or dirt
    if (BLOCKS[sel.id].cross) {
      const below = this.world.getBlock(x, y - 1, z);
      if (below !== B.GRASS && below !== B.DIRT) return;
    }

    // don't place inside self
    const hw = PLAYER_W / 2;
    const a = this.aabb;
    const overlaps = a.maxX > x && a.minX < x + 1 && a.maxY > y && a.minY < y + 1 && a.maxZ > z && a.minZ < z + 1;
    if (overlaps && isSolid(sel.id)) return;

    this.world.setBlock(x, y, z, sel.id);
    inventory.consumeHeld(1);
    this.placeCooldown = 0.22;
    this.justPlaced = true;
    this.lastPlacedId = sel.id;
  }
}
