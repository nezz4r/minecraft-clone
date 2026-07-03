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
// wait until pointer lock actually engages before sending mouse input
for (let i = 0; i < 30; i++) {
  const locked = await page.evaluate(() => document.pointerLockElement !== null);
  if (locked) break;
  if (i === 29) { console.log('pointer lock never engaged'); process.exit(1); }
  await new Promise((r) => setTimeout(r, 200));
  await page.click('#play-btn').catch(() => {});
}
await new Promise((r) => setTimeout(r, 400));

// 1. mine a block -> floating drop appears, then walk over it
await page.evaluate(() => { window.__game.player.pitch = -1.1; });
await page.mouse.down({ button: 'left' });
await new Promise((r) => setTimeout(r, 500));
const mineMid = await page.evaluate(() => ({
  target: window.__game.player.mineTarget,
  progress: +window.__game.player.mineProgress.toFixed(2),
  aimingAtMob: window.__game.player.aimingAtMob,
}));
console.log('mining mid-hold:', JSON.stringify(mineMid));
await new Promise((r) => setTimeout(r, 900));
await page.mouse.up({ button: 'left' });
const dropState = await page.evaluate(() => ({
  drops: window.__game.drops.drops.map((d) => ({ id: d.id, count: d.count })),
  inv: [...window.__game.inventory.hotbar, ...window.__game.inventory.main].filter(Boolean).map((s) => s.id + 'x' + s.count),
}));
console.log('after mining:', JSON.stringify(dropState));
await page.screenshot({ path: 'scripts/shots/v2-1-drop.png' });
await new Promise((r) => setTimeout(r, 1500)); // stand still; magnet pulls it in
const collected = await page.evaluate(() => ({
  drops: window.__game.drops.drops.length,
  inv: [...window.__game.inventory.hotbar, ...window.__game.inventory.main].filter(Boolean).map((s) => s.id + 'x' + s.count),
}));
console.log('after standing near drop:', JSON.stringify(collected));

// 2. hearts HUD: take damage
await page.evaluate(() => { window.__game.player.damage(7, { bypassIframes: true, source: 'fall' }); });
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: 'scripts/shots/v2-2-hearts.png' });
const hp = await page.evaluate(() => window.__game.player.hp);
console.log('hp after 7 damage:', hp);

// 3. spawn a zombie at night and let it chase
await page.evaluate(() => {
  const g = window.__game;
  g.sky.time = 0; // midnight
  g.player.hp = 20;
});
await new Promise((r) => setTimeout(r, 500));
let zombieInfo = null;
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 500));
  zombieInfo = await page.evaluate(() => {
    const g = window.__game;
    const z = g.mobs.mobs.find((m) => m.type === 'zombie');
    if (!z) return null;
    // face it
    const dx = z.pos.x - g.player.pos.x, dz = z.pos.z - g.player.pos.z;
    g.player.yaw = Math.atan2(-dx, -dz);
    g.player.pitch = -0.1;
    return { dist: +Math.hypot(dx, dz).toFixed(1), n: g.mobs.mobs.length };
  });
  if (zombieInfo) break;
}
console.log('zombie spawned:', JSON.stringify(zombieInfo));
if (zombieInfo) {
  // wait until the zombie closes in (it chases at ~2.1 blocks/s)
  let combat = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    combat = await page.evaluate(() => {
      const g = window.__game;
      g.player.hp = 20; // stay alive for the test
      const zombies = g.mobs.mobs.filter((m) => m.type === 'zombie');
      if (!zombies.length) return { gone: true };
      let z = zombies[0], best = 1e9;
      for (const c of zombies) {
        const d = Math.hypot(c.pos.x - g.player.pos.x, c.pos.z - g.player.pos.z);
        if (d < best) { best = d; z = c; }
      }
      const dx = z.pos.x - g.player.pos.x, dz = z.pos.z - g.player.pos.z;
      g.player.yaw = Math.atan2(-dx, -dz);
      g.player.pitch = -0.1;
      return { dist: +best.toFixed(1), zombieHp: z.hp, playerHp: g.player.hp, n: zombies.length };
    });
    if (combat.gone || combat.dist < 2.5) break;
  }
  console.log('combat state:', JSON.stringify(combat));
  await page.screenshot({ path: 'scripts/shots/v2-3-zombie.png' });
  // attack a few times
  for (let i = 0; i < 8; i++) {
    await page.mouse.down({ button: 'left' });
    await new Promise((r) => setTimeout(r, 120));
    await page.mouse.up({ button: 'left' });
    await new Promise((r) => setTimeout(r, 300));
  }
  const afterFight = await page.evaluate(() => {
    const g = window.__game;
    const zombies = g.mobs.mobs.filter((m) => m.type === 'zombie');
    let closest = null, best = 1e9;
    for (const c of zombies) {
      const d = Math.hypot(c.pos.x - g.player.pos.x, c.pos.z - g.player.pos.z);
      if (d < best) { best = d; closest = c; }
    }
    return { closestZombieHp: closest ? closest.hp : 'dead/gone', dist: +best.toFixed(1), playerHp: g.player.hp };
  });
  console.log('after attacking:', JSON.stringify(afterFight));
}

// 4. death screen: lethal damage
await page.evaluate(() => {
  const g = window.__game;
  g.player.damage(100, { bypassIframes: true, source: 'zombie' });
});
await new Promise((r) => setTimeout(r, 400));
const deathVisible = await page.evaluate(() => !document.getElementById('death-screen').classList.contains('hidden'));
console.log('death screen visible:', deathVisible);
await page.screenshot({ path: 'scripts/shots/v2-4-death.png' });

// 5. respawn
await page.click('#respawn-btn');
await new Promise((r) => setTimeout(r, 600));
const respawned = await page.evaluate(() => ({
  hp: window.__game.player.hp,
  dead: window.__game.player.dead,
  deathHidden: document.getElementById('death-screen').classList.contains('hidden'),
}));
console.log('after respawn:', JSON.stringify(respawned));

// 6. crafting list with new recipes
await page.evaluate(() => {
  const g = window.__game;
  g.sky.time = 600 * 0.4; // daytime
  g.inventory.add(7, 8);   // logs
  g.inventory.add(4, 8);   // cobblestone
});
await page.keyboard.press('KeyE');
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: 'scripts/shots/v2-5-crafting.png' });

if (errors.length) {
  console.log('ERRORS:'); for (const e of errors) console.log(' ', e);
  process.exitCode = 1;
} else console.log('No console errors.');
await browser.close();
