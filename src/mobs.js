// Mobs: passive pigs/sheep that wander, and hostile zombies that spawn at
// night and chase the player. All are box-built, with HP, knockback, red hurt
// flash, and loot drops on death.

import * as THREE from 'three';
import { B, I, isSolid } from './blocks.js';
import { HEIGHT } from './world.js';
import { hash2 } from './noise.js';

const MAX_PASSIVE = 10;
const MAX_ZOMBIES = 6;
const SPAWN_RADIUS = 40;
const DESPAWN_RADIUS = 70;

function boxMesh(w, h, d, color) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  );
}

function buildPig() {
  const g = new THREE.Group();
  const pink = 0xf0a5a2, dark = 0xd98d8a;
  const body = boxMesh(0.9, 0.55, 0.6, pink); body.position.y = 0.55; g.add(body);
  const head = boxMesh(0.45, 0.45, 0.45, pink); head.position.set(0.62, 0.62, 0); g.add(head);
  const snout = boxMesh(0.1, 0.16, 0.2, dark); snout.position.set(0.88, 0.55, 0); g.add(snout);
  for (const [lx, lz] of [[0.3, 0.18], [0.3, -0.18], [-0.3, 0.18], [-0.3, -0.18]]) {
    const leg = boxMesh(0.18, 0.3, 0.18, dark);
    leg.position.set(lx, 0.15, lz);
    g.add(leg);
  }
  return g;
}

function buildSheep() {
  const g = new THREE.Group();
  const wool = 0xe8e8e8, skin = 0xc4a484;
  const body = boxMesh(0.95, 0.62, 0.65, wool); body.position.y = 0.68; g.add(body);
  const head = boxMesh(0.4, 0.4, 0.38, skin); head.position.set(0.62, 0.85, 0); g.add(head);
  const woolHead = boxMesh(0.3, 0.28, 0.42, wool); woolHead.position.set(0.55, 0.98, 0); g.add(woolHead);
  for (const [lx, lz] of [[0.3, 0.2], [0.3, -0.2], [-0.3, 0.2], [-0.3, -0.2]]) {
    const leg = boxMesh(0.16, 0.38, 0.16, skin);
    leg.position.set(lx, 0.19, lz);
    g.add(leg);
  }
  return g;
}

function buildZombie() {
  const g = new THREE.Group();
  const skin = 0x44a044, shirt = 0x2a7d7d, pants = 0x35357d;
  const legs = boxMesh(0.35, 0.75, 0.3, pants); legs.position.y = 0.375; g.add(legs);
  const torso = boxMesh(0.5, 0.65, 0.3, shirt); torso.position.y = 1.05; g.add(torso);
  const head = boxMesh(0.42, 0.42, 0.42, skin); head.position.y = 1.6; g.add(head);
  // arms stretched forward, classic zombie pose
  for (const lz of [0.34, -0.34]) {
    const arm = boxMesh(0.55, 0.16, 0.16, skin);
    arm.position.set(0.35, 1.25, lz);
    g.add(arm);
  }
  return g;
}

const MOB_TYPES = {
  pig: { build: buildPig, hp: 10, speed: 1.2, halfW: 0.35, height: 1.0, hostile: false, drops: [{ id: I.PORKCHOP, min: 1, max: 2 }] },
  sheep: { build: buildSheep, hp: 8, speed: 1.0, halfW: 0.35, height: 1.1, hostile: false, drops: [{ id: B.WOOL, min: 1, max: 2 }] },
  zombie: { build: buildZombie, hp: 20, speed: 2.1, halfW: 0.3, height: 1.9, hostile: true, drops: [{ id: I.GOLD_INGOT, min: 0, max: 1 }] },
};

class Mob {
  constructor(type, x, y, z) {
    this.type = type;
    this.def = MOB_TYPES[type];
    this.mesh = this.def.build();
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.heading = Math.random() * Math.PI * 2;
    this.state = 'idle';
    this.stateTimer = 1 + Math.random() * 3;
    this.hp = this.def.hp;
    this.halfW = this.def.halfW;
    this.height = this.def.height;
    this.flash = 0;
    this.attackCooldown = 0;
    this.dead = false;
  }

  get aabb() {
    return {
      minX: this.pos.x - this.halfW, maxX: this.pos.x + this.halfW,
      minY: this.pos.y, maxY: this.pos.y + this.height,
      minZ: this.pos.z - this.halfW, maxZ: this.pos.z + this.halfW,
    };
  }

  hurt(dmg, knockDir) {
    this.hp -= dmg;
    this.flash = 0.35;
    if (knockDir) {
      this.vel.x += knockDir.x * 7;
      this.vel.z += knockDir.z * 7;
      this.vel.y = Math.max(this.vel.y, 5);
    }
    // fleeing panic for passive mobs
    if (!this.def.hostile) {
      this.state = 'walk';
      this.stateTimer = 3;
      if (knockDir) this.heading = Math.atan2(knockDir.z, knockDir.x);
    }
    if (this.hp <= 0) this.dead = true;
  }

  collides(world) {
    const { x, z } = this.pos;
    const y = this.pos.y;
    for (let yy = Math.floor(y); yy <= Math.floor(y + this.height); yy++) {
      for (let zz = Math.floor(z - this.halfW); zz <= Math.floor(z + this.halfW); zz++) {
        for (let xx = Math.floor(x - this.halfW); xx <= Math.floor(x + this.halfW); xx++) {
          if (isSolid(world.getBlock(xx, yy, zz))) return true;
        }
      }
    }
    return false;
  }

  moveAxis(world, delta, axis) {
    if (delta === 0) return false;
    this.pos[axis] += delta;
    if (this.collides(world)) {
      this.pos[axis] -= delta;
      if (axis === 'y') {
        if (delta < 0) this.onGround = true;
        this.vel.y = 0;
      }
      return true;
    }
    return false;
  }

  update(dt, world, player) {
    this.stateTimer -= dt;
    this.flash = Math.max(0, this.flash - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    let vx = 0, vz = 0;
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const distToPlayer = Math.hypot(dx, dz);

    if (this.def.hostile && !player.dead && distToPlayer < 34) {
      // chase the player
      this.heading = Math.atan2(dz, dx);
      if (distToPlayer > 1.1) {
        vx = Math.cos(this.heading) * this.def.speed;
        vz = Math.sin(this.heading) * this.def.speed;
      }
      // melee attack
      if (distToPlayer < 1.5 && Math.abs(player.pos.y - this.pos.y) < 2 && this.attackCooldown <= 0) {
        this.attackCooldown = 1.1;
        if (player.damage(3, { source: 'zombie' })) {
          const n = 1 / Math.max(distToPlayer, 0.01);
          player.vel.x += dx * n * 7;
          player.vel.z += dz * n * 7;
          player.vel.y += 3.5;
        }
      }
      this.state = 'walk';
    } else {
      // wander
      if (this.stateTimer <= 0) {
        if (this.state === 'idle') {
          this.state = 'walk';
          this.heading = Math.random() * Math.PI * 2;
          this.stateTimer = 2 + Math.random() * 4;
        } else {
          this.state = 'idle';
          this.stateTimer = 1 + Math.random() * 4;
        }
      }
      if (this.state === 'walk') {
        vx = Math.cos(this.heading) * this.def.speed;
        vz = Math.sin(this.heading) * this.def.speed;
      }
    }

    this.vel.y -= 26 * dt;
    this.vel.y = Math.max(this.vel.y, -40);
    // knockback decay
    this.vel.x *= 1 - Math.min(1, dt * 5);
    this.vel.z *= 1 - Math.min(1, dt * 5);

    this.onGround = false;
    this.moveAxis(world, this.vel.y * dt, 'y');
    const hitX = this.moveAxis(world, (vx + this.vel.x) * dt, 'x');
    const hitZ = this.moveAxis(world, (vz + this.vel.z) * dt, 'z');

    // hop up 1-block steps, otherwise turn around (hostiles keep chasing)
    if ((hitX || hitZ) && this.onGround) {
      const aheadX = Math.floor(this.pos.x + Math.cos(this.heading) * 0.8);
      const aheadZ = Math.floor(this.pos.z + Math.sin(this.heading) * 0.8);
      const feetY = Math.floor(this.pos.y);
      if (isSolid(world.getBlock(aheadX, feetY, aheadZ)) && !isSolid(world.getBlock(aheadX, feetY + 1, aheadZ))) {
        this.vel.y = 7.5;
      } else if (!this.def.hostile) {
        this.heading += Math.PI * (0.5 + Math.random());
      }
    }

    if (this.state === 'walk') {
      this.mesh.rotation.y = -this.heading;
    }
    this.mesh.position.copy(this.pos);

    // red hurt flash via emissive
    const em = this.flash > 0 ? 0.55 : 0;
    for (const child of this.mesh.children) {
      child.material.emissive.setRGB(em, 0, 0);
    }
  }
}

export class MobManager {
  constructor(scene, world, drops) {
    this.scene = scene;
    this.world = world;
    this.drops = drops;
    this.mobs = [];
    this.spawnTimer = 0;
  }

  count(hostile) {
    return this.mobs.filter((m) => m.def.hostile === hostile).length;
  }

  trySpawn(px, pz, night) {
    const hostile = night && Math.random() < 0.65;
    if (hostile && this.count(true) >= MAX_ZOMBIES) return;
    if (!hostile && this.count(false) >= MAX_PASSIVE) return;
    // passive mobs only appear in daylight
    if (!hostile && night) return;

    const angle = Math.random() * Math.PI * 2;
    const r = 18 + Math.random() * (SPAWN_RADIUS - 18);
    const x = Math.floor(px + Math.cos(angle) * r);
    const z = Math.floor(pz + Math.sin(angle) * r);

    let y = HEIGHT - 2;
    while (y > 1 && !isSolid(this.world.getBlock(x, y, z))) y--;
    const ground = this.world.getBlock(x, y, z);
    if (!hostile && ground !== B.GRASS) return;
    if (hostile && (ground === B.WATER || ground === B.AIR)) return;
    if (this.world.getBlock(x, y + 1, z) !== B.AIR || this.world.getBlock(x, y + 2, z) !== B.AIR) return;

    const type = hostile ? 'zombie' : (hash2(x, z, 991) < 0.5 ? 'pig' : 'sheep');
    const mob = new Mob(type, x + 0.5, y + 1.05, z + 0.5);
    this.mobs.push(mob);
    this.scene.add(mob.mesh);
  }

  // Ray vs mob AABBs. Returns { mob, dist } of the closest hit within reach.
  raycast(origin, dir, reach) {
    let best = null;
    for (const m of this.mobs) {
      const b = m.aabb;
      let tmin = 0, tmax = reach;
      let ok = true;
      for (const [o, d, lo, hi] of [
        [origin.x, dir.x, b.minX, b.maxX],
        [origin.y, dir.y, b.minY, b.maxY],
        [origin.z, dir.z, b.minZ, b.maxZ],
      ]) {
        if (Math.abs(d) < 1e-9) {
          if (o < lo || o > hi) { ok = false; break; }
        } else {
          let t1 = (lo - o) / d, t2 = (hi - o) / d;
          if (t1 > t2) [t1, t2] = [t2, t1];
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) { ok = false; break; }
        }
      }
      if (ok && (!best || tmin < best.dist)) best = { mob: m, dist: tmin };
    }
    return best;
  }

  killMob(mob) {
    // loot pops out where the mob died
    for (const d of mob.def.drops) {
      const n = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
      for (let i = 0; i < n; i++) {
        this.drops.spawn(d.id, 1, mob.pos.x, mob.pos.y + 0.5, mob.pos.z);
      }
    }
    this.scene.remove(mob.mesh);
    this.mobs.splice(this.mobs.indexOf(mob), 1);
  }

  update(dt, player, daylight) {
    const night = daylight < 0.25;

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = night ? 1.2 : 2;
      this.trySpawn(player.pos.x, player.pos.z, night);
    }

    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];

      if (m.dead) {
        this.killMob(m);
        continue;
      }

      const dx = m.pos.x - player.pos.x, dz = m.pos.z - player.pos.z;
      const d2 = dx * dx + dz * dz;
      const tooFar = d2 > DESPAWN_RADIUS * DESPAWN_RADIUS;
      // zombies crumble in daylight
      const zombieAtDay = m.def.hostile && daylight > 0.35;
      if (tooFar || zombieAtDay || m.pos.y < -10) {
        this.scene.remove(m.mesh);
        this.mobs.splice(i, 1);
        continue;
      }
      if (d2 < 55 * 55) m.update(dt, this.world, player);
    }
  }
}
