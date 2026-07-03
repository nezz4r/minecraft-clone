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

// fill hotbar with a mix of blocks and tools, open inventory
await page.evaluate(() => {
  const g = window.__game;
  const items = [
    [1, 1],    // grass block
    [11, 1],   // crafting table
    [19, 1],   // furnace
    [20, 8],   // glass
    [22, 4],   // gold block
    [115, 1],  // iron pickaxe
    [125, 1],  // diamond axe
    [102, 1],  // stone pickaxe
    [105, 1],  // wooden axe
  ];
  g.inventory.hotbar = items.map(([id, count]) => ({ id, count }));
  g.inventory.changed();
});
await page.keyboard.press('KeyE');
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: 'scripts/shots/icons-1-inventory.png' });
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 500));

// hold the iron pickaxe to check the viewmodel
await page.evaluate(() => {
  const g = window.__game;
  g.inventory.selected = 5;
  g.inventory.changed();
  g.player.pitch = -0.1;
});
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: 'scripts/shots/icons-2-pickaxe-hand.png' });

// and the diamond axe
await page.evaluate(() => {
  const g = window.__game;
  g.inventory.selected = 6;
  g.inventory.changed();
});
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: 'scripts/shots/icons-3-axe-hand.png' });

if (errors.length) {
  console.log('ERRORS:'); for (const e of errors) console.log(' ', e);
  process.exitCode = 1;
} else console.log('No console errors.');
await browser.close();
