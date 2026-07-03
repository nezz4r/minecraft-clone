import * as THREE from 'three';
import { buildAtlas, CRACK_BASE, CRACK_STAGES, ATLAS_COLS, ATLAS_ROWS } from './textures.js';
import { Hand } from './hand.js';
import { World, CHUNK } from './world.js';
import { Player } from './player.js';
import { Inventory } from './inventory.js';
import { UI } from './ui.js';
import { Sky } from './sky.js';
import { MobManager } from './mobs.js';
import { DropManager } from './drops.js';
import { FurnaceManager } from './furnace.js';
import { GameAudio } from './audio.js';
import { ParticleManager } from './particles.js';
import { B, BLOCKS, ITEMS, BARE_HAND_DAMAGE, displayName } from './blocks.js';

// ---------- renderer / scene ----------

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 400);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  hand.resize(window.innerWidth / window.innerHeight);
});

// ---------- game objects ----------

const atlas = buildAtlas();
const seed = 1337;
const world = new World(scene, atlas, seed);
const player = new Player(world, camera);
const inventory = new Inventory();
const ui = new UI(inventory);
const sky = new Sky(scene);
const drops = new DropManager(scene, world, atlas);
const mobs = new MobManager(scene, world, drops);
const furnaces = new FurnaceManager();
const audio = new GameAudio();
const particles = new ParticleManager(scene, world, atlas);
const hand = new Hand(atlas, window.innerWidth / window.innerHeight);

// starter kit
inventory.add(B.PLANKS, 16);

// mined blocks pop out as floating drops; broken furnaces spill their contents
player.onBlockMined = (id, x, y, z, blockId, bx, by, bz) => {
  audio.breakBlock(blockId);
  particles.burst(blockId, bx + 0.5, by + 0.5, bz + 0.5);
  drops.spawn(id, 1, x, y, z);
  if (blockId === B.FURNACE) {
    for (const stack of furnaces.breakAt(bx, by, bz)) {
      drops.spawn(stack.id, stack.count, x, y, z);
    }
  }
};

// ---------- sound hooks ----------
player.onDigTick = (blockId) => {
  audio.dig(blockId);
  if (player.mineTarget) {
    const [tx, ty, tz] = player.mineTarget;
    particles.hit(blockId, tx + 0.5, ty + 0.5, tz + 0.5);
  }
};
drops.onPickup = () => audio.pop();
mobs.onMobSound = (type, event, pos) => audio.mob(type, event, pos);
ui.onSound = (name) => (name === 'craft' ? audio.craft() : audio.click());

let stepAccum = 0;
let wasInWater = false;
let lastStepPos = null;
let waterTickAccum = 0;

// right-clicking a furnace or crafting table opens its screen
player.onInteract = (blockId, [x, y, z]) => {
  if (blockId === B.FURNACE) {
    ui.openFurnace(furnaces.at(x, y, z));
    document.exitPointerLock();
    return true;
  }
  if (blockId === B.CRAFTING_TABLE) {
    ui.openTable();
    document.exitPointerLock();
    return true;
  }
  return false;
};

// damage feedback + death flow
const damageVignette = document.getElementById('damage-vignette');
player.onHurt = () => {
  audio.hurt();
  damageVignette.style.opacity = 1;
  setTimeout(() => { damageVignette.style.opacity = 0; }, 130);
};
player.onDeath = () => {
  audio.death();
  // scatter the whole inventory where we died
  for (const stack of inventory.clearAll()) {
    drops.spawn(stack.id, stack.count, player.pos.x, player.pos.y + 1, player.pos.z);
  }
  const causes = {
    fall: 'You hit the ground too hard.',
    drown: 'You drowned.',
    zombie: 'A zombie got you.',
    void: 'You fell out of the world.',
  };
  document.getElementById('death-cause').textContent = causes[player.lastDamageSource] || 'You died.';
  ui.showDeath(true);
  document.exitPointerLock();
};
document.getElementById('respawn-btn').addEventListener('click', () => {
  player.respawn();
  ui.showDeath(false);
  tryLock();
});

// block highlight wireframe
const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 })
);
highlight.visible = false;
scene.add(highlight);

// Mining crack overlay: thin quads laid over only the *exposed* faces of the
// target block (like MC), rebuilt when the target or crack stage changes.
const crackMesh = new THREE.Mesh(
  new THREE.BufferGeometry(),
  new THREE.MeshBasicMaterial({
    map: atlas, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  })
);
crackMesh.visible = false;
crackMesh.renderOrder = 2;
scene.add(crackMesh);

let crackKey = '';
const CRACK_FACES = [
  { dir: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { dir: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { dir: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

function updateCrackOverlay(target, progress) {
  if (!target || progress <= 0) {
    crackMesh.visible = false;
    crackKey = '';
    return;
  }
  const stage = Math.min(CRACK_STAGES - 1, Math.floor(progress * CRACK_STAGES));
  const [bx, by, bz] = target;
  const key = bx + ',' + by + ',' + bz + ':' + stage;
  if (key === crackKey) {
    crackMesh.visible = true;
    return;
  }
  crackKey = key;

  const idx = CRACK_BASE + stage;
  const cx = idx % ATLAS_COLS, cy = Math.floor(idx / ATLAS_COLS);
  const u0 = cx / ATLAS_COLS, u1 = (cx + 1) / ATLAS_COLS;
  const v1 = 1 - cy / ATLAS_ROWS, v0 = 1 - (cy + 1) / ATLAS_ROWS;
  const uvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];

  const pos = [], uv = [], index = [];
  const EPS = 0.002;
  for (const face of CRACK_FACES) {
    const nb = world.getBlock(bx + face.dir[0], by + face.dir[1], bz + face.dir[2]);
    const nbDef = BLOCKS[nb];
    if (nbDef && nbDef.opaque) continue; // buried face, never visible
    const vi = pos.length / 3;
    for (let i = 0; i < 4; i++) {
      const [ox, oy, oz] = face.corners[i];
      pos.push(
        bx + ox + face.dir[0] * EPS + (ox - 0.5) * EPS,
        by + oy + face.dir[1] * EPS + (oy - 0.5) * EPS,
        bz + oz + face.dir[2] * EPS + (oz - 0.5) * EPS
      );
      uv.push(uvs[i][0], uvs[i][1]);
    }
    index.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
  }
  crackMesh.geometry.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  crackMesh.geometry = g;
  crackMesh.visible = true;
}

// ---------- input ----------

const overlay = document.getElementById('overlay');
const playBtn = document.getElementById('play-btn');
const loadingText = document.getElementById('loading-text');
const controlsHelp = document.getElementById('controls-help');
const waterOverlay = document.getElementById('water-overlay');

let locked = false;
let debugVisible = false;
let started = false;

// unadjustedMovement bypasses OS mouse acceleration and works around a
// Chromium bug on scaled displays where locked mouse input gets confined /
// spikes. Falls back to a plain request where unsupported.
function tryLock() {
  try {
    const p = canvas.requestPointerLock({ unadjustedMovement: true });
    p?.catch?.(() => {
      try { canvas.requestPointerLock()?.catch?.(() => {}); } catch { /* cooldown */ }
    });
  } catch {
    try { canvas.requestPointerLock()?.catch?.(() => {}); } catch { /* cooldown */ }
  }
}

// entering/leaving fullscreen can silently drop pointer lock - re-acquire
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement && started && !locked && !ui.open && !player.dead) {
    setTimeout(tryLock, 100);
  }
});

// Fullscreen + Keyboard Lock: while fullscreen with the keyboard locked, the
// browser hands us Ctrl+W, Ctrl+T, Escape, etc. instead of acting on them.
// (Ctrl+W would otherwise close the tab - it cannot be intercepted windowed.)
async function tryFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
    await navigator.keyboard?.lock?.();
  } catch { /* fullscreen denied (e.g. headless) - game still works windowed */ }
}

playBtn.addEventListener('click', () => {
  audio.resume();
  tryFullscreen();
  tryLock();
});
document.addEventListener('mousedown', () => audio.resume(), { once: true });

// clicking the game (or the pause overlay) re-locks the pointer
canvas.addEventListener('click', () => {
  if (started && !locked && !ui.open) tryLock();
});
overlay.addEventListener('click', (e) => {
  if (started && e.target === overlay) {
    tryFullscreen();
    tryLock();
  }
});

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (locked) {
    overlay.classList.add('hidden');
  } else if (started && !ui.open && !player.dead) {
    overlay.classList.remove('hidden');
    loadingText.textContent = 'Paused';
  }
});

document.addEventListener('mousemove', (e) => {
  if (!locked) return;
  // discard spike events (browsers emit bogus huge deltas right after the
  // lock engages or on alt-tab, which makes the aim teleport)
  if (Math.abs(e.movementX) > 250 || Math.abs(e.movementY) > 250) return;
  const sens = 0.0023;
  player.yaw -= e.movementX * sens;
  player.pitch -= e.movementY * sens;
  player.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, player.pitch));
});

// ---------- combat ----------

let attackCooldown = 0;

function mobUnderCrosshair() {
  const origin = new THREE.Vector3().copy(camera.position);
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ'));
  const mobHit = mobs.raycast(origin, dir, 4);
  if (!mobHit) return null;
  // a block in front of the mob shields it
  const blockHit = player.raycast();
  if (blockHit && blockHit.dist < mobHit.dist) return null;
  return mobHit;
}

function tryAttack() {
  if (attackCooldown > 0 || player.dead) return;
  const hit = mobUnderCrosshair();
  if (!hit) return;
  attackCooldown = 0.35;
  hand.swingOnce();
  audio.attackSwing();
  const held = inventory.heldItem();
  const dmg = (held && ITEMS[held.id] && ITEMS[held.id].damage) || BARE_HAND_DAMAGE;
  const knock = new THREE.Vector3(hit.mob.pos.x - player.pos.x, 0, hit.mob.pos.z - player.pos.z).normalize();
  hit.mob.hurt(dmg, knock);
  audio.mob(hit.mob.type, 'hurt', hit.mob.pos);
}

document.addEventListener('mousedown', (e) => {
  if (!locked) return;
  if (e.button === 0) {
    player.leftDown = true;
    hand.swingOnce();
    tryAttack();
  }
  if (e.button === 2) player.rightDown = true;
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) player.leftDown = false;
  if (e.button === 2) player.rightDown = false;
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ControlLeft', 'ControlRight',
  'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyM', 'KeyQ', 'F3',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9',
]);

let lastWTap = 0;

document.addEventListener('keydown', (e) => {
  // swallow game keys and Ctrl-combos so the browser doesn't act on them
  // (needs fullscreen + keyboard lock for shortcuts like Ctrl+W to be ours)
  if ((locked || ui.open) && (GAME_KEYS.has(e.code) || e.ctrlKey)) e.preventDefault();

  if (e.code === 'Escape') {
    if (ui.open && started) {
      ui.close();
      tryLock();
    } else if (locked) {
      document.exitPointerLock(); // pause menu shows via pointerlockchange
    }
    return;
  }
  if (e.code === 'KeyE' && started) {
    e.preventDefault();
    const open = ui.toggle();
    if (open) {
      document.exitPointerLock();
    } else {
      tryLock();
    }
    return;
  }
  if (ui.open) {
    // inventory-screen shortcuts
    if (e.code === 'KeyQ') {
      e.preventDefault();
      ui.dropHovered(e.ctrlKey);
    }
    if (e.code.startsWith('Digit')) {
      const n = Number(e.code.slice(5));
      if (n >= 1 && n <= 9) ui.digitSwap(n - 1);
    }
    return;
  }
  // Q while playing: toss one of the held item (Ctrl+Q for the whole stack)
  if (e.code === 'KeyQ' && locked) {
    const sel = inventory.heldItem();
    if (sel) {
      const n = e.ctrlKey ? sel.count : 1;
      throwDrop({ id: sel.id, count: n });
      sel.count -= n;
      if (sel.count <= 0) inventory.hotbar[inventory.selected] = null;
      inventory.changed();
    }
  }
  // double-tap W = sprint (so Ctrl is never required)
  if (e.code === 'KeyW' && !e.repeat) {
    const now = performance.now();
    if (now - lastWTap < 280) player.sprintToggle = true;
    lastWTap = now;
  }
  player.keys[e.code] = true;
  if (e.code === 'F3') {
    e.preventDefault();
    debugVisible = !debugVisible;
  }
  if (e.code === 'KeyM') {
    audio.setMuted(!audio.muted);
  }
  if (e.code.startsWith('Digit')) {
    const n = Number(e.code.slice(5));
    if (n >= 1 && n <= 9) {
      inventory.selected = n - 1;
      ui.refresh();
    }
  }
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'KeyW') player.sprintToggle = false;
  player.keys[e.code] = false;
});

document.addEventListener('wheel', (e) => {
  if (!locked) return;
  inventory.selected = (inventory.selected + (e.deltaY > 0 ? 1 : -1) + 9) % 9;
  ui.refresh();
});

// throw a stack into the world in front of the player
function throwDrop(stack) {
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ'));
  const d = drops.spawn(stack.id, stack.count,
    player.pos.x + dir.x, player.pos.y + 1.4 + dir.y * 0.5, player.pos.z + dir.z, false);
  d.vel.set(dir.x * 5, 2.5 + dir.y * 3, dir.z * 5);
  audio.pop();
}
ui.onDropItem = (stack) => throwDrop(stack);

// ---------- boot: pregenerate spawn area ----------

player.spawn();

function bootLoad() {
  const pending = world.pendingMeshes(player.pos.x, player.pos.z);
  world.update(player.pos.x, player.pos.z, 6);
  if (pending > 0) {
    loadingText.textContent = `Generating world... (${pending} chunks left)`;
    requestAnimationFrame(bootLoad);
  } else {
    player.spawn(); // re-snap now that terrain is final
    loadingText.textContent = '';
    playBtn.classList.remove('hidden');
    controlsHelp.classList.remove('hidden');
    started = true;
    requestAnimationFrame(loop);
  }
}
requestAnimationFrame(bootLoad);

// ---------- main loop ----------

let last = performance.now();
let fps = 0, fpsCount = 0, fpsTime = 0;
let forceLockedFlag = false;
let lastDaylight = 1;

// hooks for automated testing / console tinkering
window.__game = {
  player, world, inventory, sky, mobs, ui, drops, furnaces, audio,
  get fps() { return fps; },
  forceLocked(v) { forceLockedFlag = v; },
};

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  fpsCount++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    fps = Math.round(fpsCount / fpsTime);
    fpsCount = 0;
    fpsTime = 0;
  }

  const isPlaying = (locked || forceLockedFlag) && !ui.open && !player.dead;
  if (isPlaying) {
    // pause mining while a mob is under the crosshair, and keep attacking
    // while the button is held
    attackCooldown = Math.max(0, attackCooldown - dt);
    player.aimingAtMob = !!mobUnderCrosshair();
    if (player.leftDown && player.aimingAtMob) tryAttack();
    player.update(dt, inventory);
  }

  world.update(player.pos.x, player.pos.z, 2);
  // water simulation ticks 4x per second
  waterTickAccum += dt;
  if (waterTickAccum >= 0.25) {
    waterTickAccum = 0;
    world.tickWater();
  }
  mobs.update(dt, player, lastDaylight);
  drops.update(dt, player, inventory);
  furnaces.update(dt);
  particles.update(dt, camera);
  lastDaylight = sky.update(dt, renderer, camera.position).daylight;
  ui.updateStatus(player);
  ui.updateFurnaceBars();

  // block highlight + mining crack (hidden while a mob is targeted)
  const hit = (locked || forceLockedFlag) && !player.aimingAtMob && !player.dead ? player.raycast() : null;
  if (hit) {
    highlight.visible = true;
    highlight.position.set(hit.block[0] + 0.5, hit.block[1] + 0.5, hit.block[2] + 0.5);
    updateCrackOverlay(player.mineTarget, player.mineProgress);
  } else {
    highlight.visible = false;
    updateCrackOverlay(null, 0);
  }

  // underwater tint
  waterOverlay.style.opacity = player.headInWater ? 1 : 0;

  // first-person hand
  if (player.justPlaced) {
    player.justPlaced = false;
    hand.swingOnce();
    if (player.justAte) {
      player.justAte = false;
      audio.eat();
    } else {
      audio.place(player.lastPlacedId);
    }
  }

  // footsteps: one tap roughly every 2.2 blocks walked on the ground
  audio.updateListener(player.pos.x, player.pos.z, player.yaw);
  if (isPlaying) {
    if (lastStepPos) {
      const walked = Math.hypot(player.pos.x - lastStepPos.x, player.pos.z - lastStepPos.z);
      if (player.onGround && !player.inWater) {
        stepAccum += walked;
        if (stepAccum > 2.2) {
          stepAccum = 0;
          audio.step(world.getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y - 0.01), Math.floor(player.pos.z)));
        }
      }
    }
    lastStepPos = { x: player.pos.x, z: player.pos.z };
    if (player.inWater && !wasInWater) audio.splash();
    wasInWater = player.inWater;
  }
  const moving = isPlaying && (player.keys['KeyW'] || player.keys['KeyA'] || player.keys['KeyS'] || player.keys['KeyD']) && player.onGround;
  hand.update(dt, {
    stack: inventory.heldItem(),
    moving,
    mining: isPlaying && player.leftDown && hit !== null,
    daylight: lastDaylight,
  });

  // debug
  if (debugVisible) {
    const held = inventory.heldItem();
    ui.setDebug(true,
      `FPS ${fps}\n` +
      `XYZ ${player.pos.x.toFixed(1)} / ${player.pos.y.toFixed(1)} / ${player.pos.z.toFixed(1)}\n` +
      `Chunk ${Math.floor(player.pos.x / CHUNK)}, ${Math.floor(player.pos.z / CHUNK)}\n` +
      `Chunks loaded ${world.chunks.size}\n` +
      `Time ${sky.clockString}\n` +
      `Mobs ${mobs.mobs.length}  Drops ${drops.drops.length}\n` +
      `HP ${player.hp}/${player.maxHp}  Air ${player.air.toFixed(0)}\n` +
      `Held ${held ? displayName(held.id) + ' x' + held.count : '-'}`
    );
  } else {
    ui.setDebug(false, '');
  }

  renderer.render(scene, camera);
  if (!ui.open) {
    renderer.clearDepth();
    renderer.autoClear = false;
    renderer.render(hand.scene, hand.camera);
    renderer.autoClear = true;
  }
}
