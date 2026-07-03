// Browser integration test: loads the game headless, waits for world gen,
// starts play, walks/mines/opens inventory, screenshots along the way.

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://localhost:5173';
const OUT = 'scripts/shots';

fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--window-size=1280,720', '--use-gl=angle'],
  defaultViewport: { width: 1280, height: 720 },
});

const page = await browser.newPage();
const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push('console: ' + msg.text());
});
page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

await page.goto(URL, { waitUntil: 'networkidle0' });

// wait for world generation to finish (play button appears)
await page.waitForSelector('#play-btn:not(.hidden)', { timeout: 60000 });
console.log('world generated, play button visible');
await page.screenshot({ path: `${OUT}/1-title.png` });

// Pointer lock doesn't work headless, so force the game into "playing" state
// and drive the player through the exposed test hooks.
await page.evaluate(() => {
  document.getElementById('overlay').classList.add('hidden');
});

// give the render loop a moment, then check game state through window hooks
await new Promise((r) => setTimeout(r, 500));

const state1 = await page.evaluate(() => {
  const g = window.__game;
  if (!g) return null;
  return {
    pos: g.player.pos.toArray().map((v) => +v.toFixed(1)),
    chunks: g.world.chunks.size,
    daylight: +g.sky.dayFraction.toFixed(2),
    mobs: g.mobs.mobs.length,
    hotbarFirst: g.inventory.hotbar[0],
  };
});
console.log('state after boot:', JSON.stringify(state1));

// force-render some frames and screenshot the world
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: `${OUT}/2-world.png` });

// simulate walking forward for 2 seconds via key state
await page.evaluate(() => {
  const g = window.__game;
  g.forceLocked(true);
  g.player.keys['KeyW'] = true;
});
await new Promise((r) => setTimeout(r, 2000));
const state2 = await page.evaluate(() => {
  const g = window.__game;
  g.player.keys['KeyW'] = false;
  return { pos: g.player.pos.toArray().map((v) => +v.toFixed(1)) };
});
console.log('after walking:', JSON.stringify(state2));

// jump
await page.evaluate(() => {
  const g = window.__game;
  g.player.keys['Space'] = true;
});
await new Promise((r) => setTimeout(r, 300));
const jumpY = await page.evaluate(() => {
  const g = window.__game;
  g.player.keys['Space'] = false;
  return g.player.pos.y;
});
console.log('jump y (should exceed ground):', jumpY.toFixed(2));

// look down and mine the block under the crosshair
await page.evaluate(() => {
  const g = window.__game;
  g.player.pitch = -0.9;
  g.player.leftDown = true;
});
await new Promise((r) => setTimeout(r, 2500));
const mined = await page.evaluate(() => {
  const g = window.__game;
  g.player.leftDown = false;
  const inv = [...g.inventory.hotbar, ...g.inventory.main].filter(Boolean);
  return inv.map((s) => s.id + 'x' + s.count).join(',');
});
console.log('inventory after mining:', mined);
await page.screenshot({ path: `${OUT}/3-mined.png` });

// place a block: select planks (given as starter kit)
const placed = await page.evaluate(() => {
  const g = window.__game;
  // find planks slot
  const i = g.inventory.hotbar.findIndex((s) => s && s.id === 9);
  if (i < 0) return 'no planks';
  g.inventory.selected = i;
  const before = g.inventory.hotbar[i].count;
  g.player.pitch = -0.8;
  g.player.rightDown = true;
  return 'planks before: ' + before;
});
await new Promise((r) => setTimeout(r, 600));
const placedAfter = await page.evaluate(() => {
  const g = window.__game;
  g.player.rightDown = false;
  const i = g.inventory.hotbar.findIndex((s) => s && s.id === 9);
  return 'planks after: ' + (i >= 0 ? g.inventory.hotbar[i].count : 0);
});
console.log('placing:', placed, '->', placedAfter);

// inventory screen
await page.keyboard.press('KeyE');
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: `${OUT}/4-inventory.png` });
const invOpen = await page.evaluate(() => !document.getElementById('inventory-screen').classList.contains('hidden'));
console.log('inventory screen open:', invOpen);
await page.keyboard.press('KeyE');

// speed up time to check night sky
await page.evaluate(() => {
  window.__game.sky.time += 300; // jump ~half a day
});
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: `${OUT}/5-night.png` });

// fps check
const fps = await page.evaluate(() => window.__game.fps);
console.log('fps:', fps);

if (errors.length) {
  console.log('\nERRORS:');
  for (const e of errors) console.log(' ', e);
  process.exitCode = 1;
} else {
  console.log('\nNo console errors.');
}

await browser.close();
