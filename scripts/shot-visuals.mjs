// Quick visual check: plants in the world + cumulative crack stages.
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

// 1. find a spot with plants nearby and look at it
const found = await page.evaluate(() => {
  const g = window.__game;
  const p = g.player.pos;
  for (let r = 2; r < 40; r++) {
    for (let a = 0; a < 24; a++) {
      const ang = (a / 24) * Math.PI * 2;
      const x = Math.floor(p.x + Math.cos(ang) * r);
      const z = Math.floor(p.z + Math.sin(ang) * r);
      for (let y = 20; y < 50; y++) {
        const b = g.world.getBlock(x, y, z);
        if (b >= 24 && b <= 26) {
          const dx = x + 0.5 - p.x, dz = z + 0.5 - p.z;
          const dy = y + 0.5 - (p.y + 1.62);
          g.player.yaw = Math.atan2(-dx, -dz);
          g.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
          return { x, y, z, b, dist: +Math.hypot(dx, dz).toFixed(1) };
        }
      }
    }
  }
  return null;
});
console.log('plant found:', JSON.stringify(found));
await sleep(600);
await page.screenshot({ path: 'scripts/shots/vis-1-plants.png' });

// 2. crack stages: mine a log slowly by hand and capture 3 moments
await page.evaluate(() => {
  const g = window.__game;
  const p = g.player.pos;
  const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
  // place a log 2 blocks ahead at eye level on a dirt pillar
  g.world.setBlock(bx + 2, by, bz, 7);
  g.world.setBlock(bx + 2, by + 1, bz, 7);
  const dx = bx + 2 + 0.5 - p.x, dz = bz + 0.5 - p.z;
  const dy = by + 1.5 - (p.y + 1.62);
  g.player.yaw = Math.atan2(-dx, -dz);
  g.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
});
await sleep(400);
await page.mouse.down({ button: 'left' });
await sleep(700);  // ~23% of 3s
await page.screenshot({ path: 'scripts/shots/vis-2-crack-early.png' });
await sleep(900);  // ~53%
await page.screenshot({ path: 'scripts/shots/vis-3-crack-mid.png' });
await sleep(900);  // ~83%
await page.screenshot({ path: 'scripts/shots/vis-4-crack-late.png' });
await page.mouse.up({ button: 'left' });

await browser.close();
console.log('done');
