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
await new Promise((r) => setTimeout(r, 400));

// 1. place a furnace in front of the player, right-click it -> UI opens
const furnaceSetup = await page.evaluate(() => {
  const g = window.__game;
  const p = g.player.pos;
  const fx = Math.floor(p.x) + 2, fy = Math.floor(p.y), fz = Math.floor(p.z);
  g.world.setBlock(fx, fy, fz, 19); // furnace
  // face it
  // aim at the block center (it sits below eye level)
  const dx = fx + 0.5 - p.x, dz = fz + 0.5 - p.z;
  const dy = fy + 0.5 - (p.y + 1.62);
  g.player.yaw = Math.atan2(-dx, -dz);
  g.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  return { fx, fy, fz };
});
await new Promise((r) => setTimeout(r, 400));
await page.mouse.down({ button: 'right' });
await new Promise((r) => setTimeout(r, 200));
await page.mouse.up({ button: 'right' });
await new Promise((r) => setTimeout(r, 400));
const furnaceOpen = await page.evaluate(() => ({
  invOpen: !document.getElementById('inventory-screen').classList.contains('hidden'),
  furnaceVisible: !document.getElementById('furnace-section').classList.contains('hidden'),
  craftHidden: document.getElementById('craft-section').classList.contains('hidden'),
}));
console.log('furnace UI:', JSON.stringify(furnaceOpen));

// 2. load it via state, watch it smelt
const smelted = await page.evaluate(async (pos) => {
  const g = window.__game;
  const f = g.furnaces.at(pos.fx, pos.fy, pos.fz);
  f.slots[0] = { id: 13, count: 2 }; // iron ore
  f.slots[1] = { id: 110, count: 1 }; // coal
  g.ui.refreshFurnace();
  await new Promise((r) => setTimeout(r, 3800));
  return { output: f.slots[2], burning: f.burn > 0 };
}, furnaceSetup);
console.log('after ~3.8s smelting:', JSON.stringify(smelted));
await page.screenshot({ path: 'scripts/shots/v3-1-furnace.png' });

// 3. crafting screen with categories
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => {
  const g = window.__game;
  g.inventory.add(111, 9); // iron ingots
  g.inventory.add(113, 3); // diamonds
  g.inventory.add(100, 8); // sticks
  g.inventory.add(4, 12);  // cobblestone
});
await page.keyboard.press('KeyE');
await new Promise((r) => setTimeout(r, 400));
const craftInfo = await page.evaluate(() => ({
  categories: [...document.querySelectorAll('.craft-category')].map((e) => e.textContent),
  rows: document.querySelectorAll('.craft-row').length,
  craftable: document.querySelectorAll('.craft-row:not(.disabled)').length,
}));
console.log('crafting screen:', JSON.stringify(craftInfo));
await page.screenshot({ path: 'scripts/shots/v3-2-crafting.png' });
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 300));

// 4. glass wall: place glass blocks and look at them
await page.evaluate(() => {
  const g = window.__game;
  const p = g.player.pos;
  const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
  for (let dy = 0; dy < 3; dy++)
    for (let dx = -2; dx <= 2; dx++)
      g.world.setBlock(bx + dx, by + 1 + dy, bz - 3, 20); // glass
  g.player.yaw = 0;
  g.player.pitch = 0.1;
});
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: 'scripts/shots/v3-3-glass.png' });

// 5. hold a diamond sword (hand viewmodel) + hotbar icons
await page.evaluate(() => {
  const g = window.__game;
  g.inventory.hotbar[0] = { id: 124, count: 1 }; // diamond sword
  g.inventory.hotbar[1] = { id: 112, count: 5 }; // gold ingots
  g.inventory.hotbar[2] = { id: 110, count: 12 }; // coal
  g.inventory.hotbar[3] = { id: 113, count: 2 }; // diamonds
  g.inventory.selected = 0;
  g.inventory.changed();
});
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: 'scripts/shots/v3-4-sword.png' });

const fps = await page.evaluate(() => window.__game.fps);
console.log('fps:', fps);

if (errors.length) {
  console.log('ERRORS:'); for (const e of errors) console.log(' ', e);
  process.exitCode = 1;
} else console.log('No console errors.');
await browser.close();
