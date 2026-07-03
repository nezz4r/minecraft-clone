// Visual check of water flow: breach a shoreline + spill a source on land.
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--window-size=1280,720', '--use-gl=angle'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
await page.waitForSelector('#play-btn:not(.hidden)', { timeout: 60000 });
await page.click('#play-btn');
for (let i = 0; i < 30; i++) {
  if (await page.evaluate(() => document.pointerLockElement !== null)) break;
  await new Promise((r) => setTimeout(r, 200));
  await page.click('#play-btn').catch(() => {});
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. shoreline breach: find a solid block at sea level with an ocean source
//    neighbor, dig a trench inland, then knock out the barrier
const breach = await page.evaluate(() => {
  const g = window.__game;
  const p = g.player.pos;
  const SEA = 28;
  for (let r = 3; r < 50; r++) {
    for (let a = 0; a < 32; a++) {
      const ang = (a / 32) * Math.PI * 2;
      const x = Math.floor(p.x + Math.cos(ang) * r);
      const z = Math.floor(p.z + Math.sin(ang) * r);
      const here = g.world.getBlock(x, SEA, z);
      if (here === 0 || here === 10) continue;
      // needs an ocean source neighbor and land behind it
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (g.world.getBlock(x + dx, SEA, z + dz) === 10 &&
            g.world.getBlock(x - dx, SEA, z - dz) !== 10 &&
            g.world.getBlock(x - dx * 2, SEA, z - dz * 2) !== 10) {
          // dig a 4-long trench inland behind the barrier
          for (let d = 1; d <= 4; d++) {
            g.world.setBlock(x - dx * d, SEA, z - dz * d, 0);
            g.world.setBlock(x - dx * d, SEA + 1, z - dz * d, 0);
          }
          // player watches from the side
          g.player.pos.set(x - dx * 2 + dz * 3 + 0.5, SEA + 3, z - dz * 2 + dx * 3 + 0.5);
          g.player.vel.set(0, 0, 0);
          const lx = x - dx * 2 + 0.5 - g.player.pos.x, lz = z - dz * 2 + 0.5 - g.player.pos.z;
          g.player.yaw = Math.atan2(-lx, -lz);
          g.player.pitch = -0.5;
          // breach!
          g.world.setBlock(x, SEA, z, 0);
          return { x, z, dir: [dx, dz] };
        }
      }
    }
  }
  return null;
});
console.log('breach at:', JSON.stringify(breach));
await sleep(1200);
await page.screenshot({ path: 'scripts/shots/water-1-breach-early.png' });
await sleep(3500);
await page.screenshot({ path: 'scripts/shots/water-2-breach-late.png' });
const trench = await page.evaluate((b) => {
  const g = window.__game;
  const out = [];
  for (let d = 0; d <= 4; d++) {
    out.push(g.world.getBlock(b.x - b.dir[0] * d, 28, b.z - b.dir[1] * d));
  }
  return out;
}, breach);
console.log('trench blocks (10=source, 27-33=flowing):', trench.join(','));

// 2. hilltop spill: place a source on open ground and watch it spread + fall
await page.evaluate(() => {
  const g = window.__game;
  const p = g.player.pos;
  // find nearby land spot a few blocks up
  let sx = Math.floor(p.x), sz = Math.floor(p.z);
  let sy = 50;
  while (sy > 1 && g.world.getBlock(sx, sy, sz) === 0) sy--;
  g.world.setBlock(sx, sy + 1, sz, 10); // water source
  g.player.pos.set(sx + 6.5, sy + 5, sz + 0.5);
  g.player.vel.set(0, 0, 0);
  g.player.yaw = Math.PI / 2;
  g.player.pitch = -0.5;
});
await sleep(4500);
await page.screenshot({ path: 'scripts/shots/water-3-spill.png' });

const fps = await page.evaluate(() => window.__game.fps);
console.log('fps:', fps);
await browser.close();
console.log('done');
