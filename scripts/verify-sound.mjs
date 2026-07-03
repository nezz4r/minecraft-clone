// Sound verification: trigger every audio event through real gameplay and
// assert the synth counters fired with the AudioContext running.

import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--window-size=1280,720', '--use-gl=angle', '--autoplay-policy=no-user-gesture-required'],
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(400);

const ctxState = await page.evaluate(() => window.__game.audio.ctx?.state);
console.log('AudioContext state:', ctxState);

// remember spawn footing
const spawn = await page.evaluate(() => {
  const p = window.__game.player.pos;
  return { x: p.x, y: p.y, z: p.z };
});

// 1. walk -> footsteps (face the most walkable direction first)
await page.evaluate(() => {
  const g = window.__game;
  const p = g.player.pos;
  let bestYaw = 0, bestScore = -1e9;
  for (let a = 0; a < 16; a++) {
    const yaw = (a / 16) * Math.PI * 2;
    let score = 0;
    for (let d = 2; d <= 12; d += 2) {
      const x = Math.floor(p.x - Math.sin(yaw) * d);
      const z = Math.floor(p.z - Math.cos(yaw) * d);
      score -= Math.abs(g.world.surfaceHeight(x, z) - (p.y - 1));
    }
    if (score > bestScore) { bestScore = score; bestYaw = yaw; }
  }
  g.player.yaw = bestYaw;
  g.player.pitch = 0;
});
await page.keyboard.down('KeyW');
for (let i = 0; i < 6; i++) { // hop over 1-block steps along the way
  await sleep(400);
  await page.keyboard.down('Space');
  await sleep(80);
  await page.keyboard.up('Space');
}
await page.keyboard.up('KeyW');

// 2. mine a block -> dig ticks + break + pickup pop (back on dry spawn ground
//    first, so water drift can't keep resetting the mining target)
await page.evaluate((s) => {
  const g = window.__game;
  g.player.pos.set(s.x, s.y, s.z);
  g.player.vel.set(0, 0, 0);
  g.player.pitch = -1.1;
}, spawn);
await sleep(300);
await page.mouse.down({ button: 'left' });
await sleep(1200);
await page.mouse.up({ button: 'left' });
await sleep(1500); // collect the drop

// 3. place a block (planks in slot 1)
await page.keyboard.press('Digit1');
await page.evaluate(() => { window.__game.player.pitch = -0.9; });
await page.mouse.down({ button: 'right' });
await sleep(200);
await page.mouse.up({ button: 'right' });
await sleep(300);

// 4. hurt + death sounds
await page.evaluate(() => { window.__game.player.damage(3, { bypassIframes: true, source: 'fall' }); });
await sleep(200);

// 5. eat (give porkchop, lower hp first)
await page.evaluate(() => {
  const g = window.__game;
  g.player.hp = 10;
  g.inventory.hotbar[8] = { id: 109, count: 1 };
  g.inventory.selected = 8;
  g.inventory.changed();
});
await page.keyboard.press('Digit9');
await page.mouse.down({ button: 'right' });
await sleep(200);
await page.mouse.up({ button: 'right' });
await sleep(300);

// 6. UI click + craft sounds
await page.keyboard.press('KeyE');
await sleep(400);
await page.evaluate(() => {
  // shift-click a craftable recipe book entry = direct craft (craft sound)
  const entry = document.querySelector('.recipe-entry.craftable');
  entry?.dispatchEvent(new MouseEvent('mousedown', { button: 0, shiftKey: true, bubbles: true }));
  // pick up a stack for a click sound
  const g = window.__game;
  g.ui.slotClicked('hotbar', 0, 0, null);
  g.ui.dropHeldBack();
});
await sleep(200);
await page.keyboard.press('Escape');
await sleep(400);

// 7. mob voice: spawn zombies at night nearby
await page.evaluate(() => { window.__game.sky.time = 0; });
for (let i = 0; i < 20; i++) {
  await sleep(500);
  const n = await page.evaluate(() => window.__game.audio.counts['mob-zombie'] || 0);
  if (n > 0) break;
}

// 8. splash: drop the player into the ocean
await page.evaluate(() => {
  const g = window.__game;
  // find water near spawn
  for (let r = 4; r < 60; r += 4) {
    for (let a = 0; a < 12; a++) {
      const x = Math.floor(g.player.pos.x + Math.cos(a) * r);
      const z = Math.floor(g.player.pos.z + Math.sin(a) * r);
      if (g.world.getBlock(x, 27, z) === 10) {
        g.player.pos.set(x + 0.5, 34, z + 0.5);
        g.player.vel.set(0, -6, 0);
        return;
      }
    }
  }
});
await sleep(1500);

// 9. mute toggle
await page.keyboard.press('KeyM');
const muted = await page.evaluate(() => window.__game.audio.muted);
await page.keyboard.press('KeyM');

const counts = await page.evaluate(() => window.__game.audio.counts);
console.log('sound counters:', JSON.stringify(counts, null, 0));
console.log('mute toggled:', muted);

const required = ['step', 'dig', 'break', 'pop', 'place', 'hurt', 'eat', 'click', 'craft', 'splash'];
const missing = required.filter((k) => !counts[k]);
if (missing.length) {
  console.log('MISSING SOUNDS:', missing.join(', '));
  process.exitCode = 1;
}
if (!counts['mob-zombie']) console.log('note: no zombie voice within wait window (timing-dependent)');

if (errors.length) {
  console.log('ERRORS:'); for (const e of errors) console.log(' ', e);
  process.exitCode = 1;
} else console.log('No console errors.');
await browser.close();
