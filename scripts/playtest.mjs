// Playtest: drive the game like a player (real key/mouse events where
// possible) and measure how the numbers + visuals compare to Minecraft.

import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--window-size=1280,720', '--use-gl=angle'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
await page.waitForSelector('#play-btn:not(.hidden)', { timeout: 60000 });
await page.click('#play-btn');
for (let i = 0; i < 30; i++) {
  if (await page.evaluate(() => document.pointerLockElement !== null)) break;
  await new Promise((r) => setTimeout(r, 200));
  await page.click('#play-btn').catch(() => {});
}
await new Promise((r) => setTimeout(r, 500));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pos = () => page.evaluate(() => {
  const p = window.__game.player.pos;
  return { x: p.x, y: p.y, z: p.z };
});
const shot = (name) => page.screenshot({ path: `scripts/shots/play-${name}.png` });

console.log('=== MOVEMENT FEEL ===');

// pick an open direction: sample walkability by height delta
await page.evaluate(() => {
  const g = window.__game;
  const p = g.player.pos;
  let bestYaw = 0, bestScore = -1e9;
  for (let a = 0; a < 16; a++) {
    const yaw = (a / 16) * Math.PI * 2;
    let score = 0;
    for (let d = 2; d <= 14; d += 2) {
      const x = Math.floor(p.x - Math.sin(yaw) * d);
      const z = Math.floor(p.z - Math.cos(yaw) * d);
      const h = g.world.surfaceHeight(x, z);
      const dh = Math.abs(h - (p.y - 1));
      score -= dh;
      if (h <= 28) score -= 10; // avoid ocean for the walk test
    }
    if (score > bestScore) { bestScore = score; bestYaw = yaw; }
  }
  g.player.yaw = bestYaw;
  g.player.pitch = -0.05;
});

// walk speed (hold W 3s)
let a = await pos();
await page.keyboard.down('KeyW');
await sleep(3000);
let b = await pos();
const walkSpeed = Math.hypot(b.x - a.x, b.z - a.z) / 3;
console.log(`walk speed: ${walkSpeed.toFixed(2)} blocks/s (MC: 4.32)`);

// sprint via double-tap (release, tap, hold)
await page.keyboard.up('KeyW');
await sleep(120);
await page.keyboard.down('KeyW');
await page.keyboard.up('KeyW');
await sleep(90);
await page.keyboard.down('KeyW');
await sleep(400); // accelerate
a = await pos();
await sleep(2000);
b = await pos();
await page.keyboard.up('KeyW');
const sprintSpeed = Math.hypot(b.x - a.x, b.z - a.z) / 2;
const fovNow = await page.evaluate(() => window.__game.player.camera.fov);
console.log(`sprint speed: ${sprintSpeed.toFixed(2)} blocks/s (MC: 5.61), fov during: ${fovNow.toFixed(0)}`);

// jump height
const y0 = (await pos()).y;
let peak = y0;
await page.keyboard.down('Space');
for (let i = 0; i < 20; i++) {
  await sleep(40);
  peak = Math.max(peak, (await pos()).y);
}
await page.keyboard.up('Space');
console.log(`jump height: ${(peak - y0).toFixed(2)} blocks (MC: 1.25)`);
await shot('1-spawn-area');

console.log('=== CHOP A TREE ===');

// find the nearest log and walk to it with simple steering
const foundTree = await page.evaluate(() => {
  const g = window.__game;
  const p = g.player.pos;
  let best = null, bd = 1e9;
  for (let dz = -24; dz <= 24; dz++) {
    for (let dx = -24; dx <= 24; dx++) {
      for (let dy = -4; dy <= 4; dy++) {
        const x = Math.floor(p.x) + dx, y = Math.floor(p.y) + dy, z = Math.floor(p.z) + dz;
        if (g.world.getBlock(x, y, z) === 7) {
          const d = dx * dx + dz * dz;
          if (d < bd) { bd = d; best = [x, y, z]; }
        }
      }
    }
  }
  window.__tree = best;
  return best ? { tree: best, dist: Math.sqrt(bd).toFixed(1) } : null;
});
console.log('nearest tree:', JSON.stringify(foundTree));

if (foundTree) {
  // steer toward the tree while holding W (re-aim every 250ms), with jumps
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 60; i++) {
    const arrived = await page.evaluate(() => {
      const g = window.__game;
      const [tx, , tz] = window.__tree;
      const dx = tx + 0.5 - g.player.pos.x, dz = tz + 0.5 - g.player.pos.z;
      g.player.yaw = Math.atan2(-dx, -dz);
      g.player.pitch = 0;
      return Math.hypot(dx, dz) < 2.8;
    });
    if (arrived) break;
    await page.keyboard.down('Space');
    await sleep(120);
    await page.keyboard.up('Space');
    await sleep(130);
  }
  await page.keyboard.up('KeyW');

  // chop the trunk bottom-up (2 logs), aiming precisely each time
  let logs = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const target = await page.evaluate(() => {
      const g = window.__game;
      const p = g.player.pos;
      // lowest remaining log in the column
      const [tx, , tz] = window.__tree;
      for (let y = 1; y < 64; y++) {
        if (g.world.getBlock(tx, y, tz) === 7) {
          const dx = tx + 0.5 - p.x, dz = tz + 0.5 - p.z;
          const dy = y + 0.5 - (p.y + 1.62);
          g.player.yaw = Math.atan2(-dx, -dz);
          g.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
          return { y, dist: Math.hypot(dx, dz).toFixed(1) };
        }
      }
      return null;
    });
    if (!target) break;
    await sleep(150);
    const t0 = Date.now();
    await page.mouse.down({ button: 'left' });
    // wait until that block is gone (max 5s)
    let broke = false;
    while (Date.now() - t0 < 5000) {
      await sleep(120);
      const gone = await page.evaluate((y) => {
        const [tx, , tz] = window.__tree;
        return window.__game.world.getBlock(tx, y, tz) !== 7;
      }, target.y);
      if (gone) { broke = true; break; }
    }
    await page.mouse.up({ button: 'left' });
    if (broke) {
      logs++;
      console.log(`chopped log ${logs} in ${((Date.now() - t0) / 1000).toFixed(1)}s (MC hand: 3.0s)`);
    } else {
      console.log('failed to chop log (out of reach?)');
      break;
    }
  }
  await sleep(1200); // let drops magnetize
  const inv = await page.evaluate(() =>
    [...window.__game.inventory.hotbar, ...window.__game.inventory.main].filter(Boolean).map((s) => s.id + 'x' + s.count).join(','));
  console.log('inventory after chopping:', inv);
  await shot('2-chopped-tree');
}

console.log('=== CRAFT: PLANKS -> STICKS -> TABLE -> PICKAXE ===');

await page.keyboard.press('KeyE');
await sleep(400);
// click recipe rows like a player: planks (x2 if we have 2 logs), sticks, table
const craftRow = async (name, times = 1) => {
  for (let i = 0; i < times; i++) {
    const ok = await page.evaluate((n) => {
      const rows = [...document.querySelectorAll('.craft-row:not(.disabled)')];
      const row = rows.find((r) => r.querySelector('.craft-name')?.textContent.startsWith(n));
      if (!row) return false;
      row.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
      return true;
    }, name);
    if (!ok) return false;
    await sleep(150);
  }
  return true;
};
console.log('craft planks:', await craftRow('Oak Planks', 2));
console.log('craft sticks:', await craftRow('Stick', 1));
console.log('craft table:', await craftRow('Crafting Table', 1));
await shot('3-crafting');
await page.keyboard.press('Escape');
await sleep(600);

// place the table: select its hotbar slot, aim at the ground, right click
const tableSlot = await page.evaluate(() => {
  const g = window.__game;
  const i = g.inventory.hotbar.findIndex((s) => s && s.id === 11);
  return i;
});
if (tableSlot >= 0) {
  await page.keyboard.press(`Digit${tableSlot + 1}`);
  await page.evaluate(() => { window.__game.player.pitch = -0.85; });
  await sleep(200);
  await page.mouse.down({ button: 'right' });
  await sleep(150);
  await page.mouse.up({ button: 'right' });
  await sleep(300);
  console.log('placed crafting table');
}

// craft wooden pickaxe near the table
await page.keyboard.press('KeyE');
await sleep(400);
const nearTable = await page.evaluate(() => window.__game.ui.hasTableNearby);
console.log('table detected nearby:', nearTable);
console.log('craft wooden pickaxe:', await craftRow('Wooden Pickaxe', 1));
await page.keyboard.press('Escape');
await sleep(600);

console.log('=== DIG TO STONE WITH THE PICKAXE ===');

const pickSlot = await page.evaluate(() => window.__game.inventory.hotbar.findIndex((s) => s && s.id === 101));
if (pickSlot >= 0) {
  await page.keyboard.press(`Digit${pickSlot + 1}`);
  await page.evaluate(() => { window.__game.player.pitch = -Math.PI / 2 + 0.02; });
  // dig straight down 6 blocks, MC-style
  const t0 = Date.now();
  await page.mouse.down({ button: 'left' });
  const startY = (await pos()).y;
  while (Date.now() - t0 < 25000) {
    await sleep(250);
    if (startY - (await pos()).y >= 6) break;
  }
  await page.mouse.up({ button: 'left' });
  const depth = startY - (await pos()).y;
  console.log(`dug ${depth.toFixed(1)} blocks down in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await sleep(800);
  const cobble = await page.evaluate(() => window.__game.inventory.countOf(4));
  console.log('cobblestone collected:', cobble);
  await shot('4-in-the-hole');
}

console.log('=== SUNSET + NIGHT ===');

// climb out virtually: respawn-ish teleport up (we're in a 1x1 hole)
await page.evaluate(() => {
  const g = window.__game;
  const p = g.player.pos;
  let y = 63;
  while (y > 1 && g.world.getBlock(Math.floor(p.x), y, Math.floor(p.z)) === 0) y--;
  g.player.pos.y = y + 1.05;
  g.player.vel.set(0, 0, 0);
  g.player.pitch = 0.05;
  g.sky.time = 600 * 0.46; // late afternoon heading to sunset
});
await sleep(1200);
await shot('5-sunset');
await page.evaluate(() => { window.__game.sky.time = 600 * 0.55; }); // dusk
await sleep(1200);
await shot('6-dusk');
await page.evaluate(() => { window.__game.sky.time = 600 * 0.75; }); // deep night
await sleep(2500);

// wait for a zombie and look at it when it's close
for (let i = 0; i < 25; i++) {
  await sleep(800);
  const z = await page.evaluate(() => {
    const g = window.__game;
    const zs = g.mobs.mobs.filter((m) => m.type === 'zombie');
    if (!zs.length) return null;
    let best = null, bd = 1e9;
    for (const m of zs) {
      const d = Math.hypot(m.pos.x - g.player.pos.x, m.pos.z - g.player.pos.z);
      if (d < bd) { bd = d; best = m; }
    }
    const dx = best.pos.x - g.player.pos.x, dz = best.pos.z - g.player.pos.z;
    g.player.yaw = Math.atan2(-dx, -dz);
    g.player.pitch = -0.05;
    return { dist: +bd.toFixed(1), hp: window.__game.player.hp };
  });
  if (z && z.dist < 6) {
    console.log('zombie encounter:', JSON.stringify(z));
    await shot('7-zombie-night');
    // fight it with real clicks
    for (let hit = 0; hit < 10; hit++) {
      await page.mouse.down({ button: 'left' });
      await sleep(100);
      await page.mouse.up({ button: 'left' });
      await sleep(320);
      const state = await page.evaluate(() => {
        const g = window.__game;
        const zs = g.mobs.mobs.filter((m) => m.type === 'zombie');
        let bd = 1e9, best = null;
        for (const m of zs) {
          const d = Math.hypot(m.pos.x - g.player.pos.x, m.pos.z - g.player.pos.z);
          if (d < bd) { bd = d; best = m; }
        }
        if (best) {
          const dx = best.pos.x - g.player.pos.x, dz = best.pos.z - g.player.pos.z;
          g.player.yaw = Math.atan2(-dx, -dz);
        }
        return { zombies: zs.length, zHp: best ? best.hp : null, myHp: g.player.hp };
      });
      if (state.zHp === null || state.zHp <= 0) { console.log('zombie killed!', JSON.stringify(state)); break; }
      if (hit === 9) console.log('fight state:', JSON.stringify(state));
    }
    break;
  }
  if (i === 24) console.log('no zombie got close');
}

const fps = await page.evaluate(() => window.__game.fps);
const finalHp = await page.evaluate(() => window.__game.player.hp);
console.log(`\nfps: ${fps}, final hp: ${finalHp}`);
if (errors.length) { console.log('ERRORS:'); for (const e of errors) console.log(' ', e); }
else console.log('No console errors.');
await browser.close();
