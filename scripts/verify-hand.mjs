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
await new Promise((r) => setTimeout(r, 600));

// 1. bare hand (empty slot 3)
await page.keyboard.press('Digit3');
await page.evaluate(() => { window.__game.player.pitch = -0.1; });
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: 'scripts/shots/h1-bare-hand.png' });

// 2. held block (slot 1 = planks)
await page.keyboard.press('Digit1');
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: 'scripts/shots/h2-held-block.png' });

// 3. mining swing + crack overlay on a slow block (look at ground = dirt/grass ok,
//    but use stone-ish angle: just mine grass and catch mid-progress)
await page.evaluate(() => { window.__game.player.pitch = -1.1; });
await page.mouse.down({ button: 'left' });
await new Promise((r) => setTimeout(r, 450));
await page.screenshot({ path: 'scripts/shots/h3-mining-crack.png' });
const mid = await page.evaluate(() => ({
  progress: +window.__game.player.mineProgress.toFixed(2),
  swing: +window.__game.__handSwing?.toFixed?.(2) ?? 'n/a',
}));
await page.mouse.up({ button: 'left' });
console.log('mining progress mid-hold:', JSON.stringify(mid));

// 4. right-click place block with swing
await page.evaluate(() => { window.__game.player.pitch = -0.9; });
await page.mouse.down({ button: 'right' });
await new Promise((r) => setTimeout(r, 250));
await page.mouse.up({ button: 'right' });
await new Promise((r) => setTimeout(r, 150));
await page.screenshot({ path: 'scripts/shots/h4-placed.png' });

// 5. inventory: right-click stack splitting
await page.keyboard.press('KeyE');
await new Promise((r) => setTimeout(r, 400));
const split = await page.evaluate(() => {
  const g = window.__game;
  const ui = g.ui;
  // planks stack in hotbar slot 0
  const before = g.inventory.hotbar[0] ? { ...g.inventory.hotbar[0] } : null;
  ui.slotClicked('hotbar', 0, 2, null);       // right click: pick up half
  const held = ui.held ? { ...ui.held } : null;
  ui.slotClicked('main', 5, 2, null);          // right click: place one
  ui.slotClicked('main', 6, 0, null);          // left click: place rest
  return {
    before,
    heldAfterSplit: held,
    slot0: g.inventory.hotbar[0],
    main5: g.inventory.main[5],
    main6: g.inventory.main[6],
    heldNow: ui.held,
  };
});
console.log('split test:', JSON.stringify(split));
await page.screenshot({ path: 'scripts/shots/h5-inv-split.png' });

// 6. craft-all: give logs, shift-click planks recipe
const craftAll = await page.evaluate(() => {
  const g = window.__game;
  g.inventory.add(7, 5); // 5 logs
  g.ui.refreshScreen();
  const row = document.querySelector('.craft-row:not(.disabled)');
  if (!row) return 'no craftable row';
  const ev = new MouseEvent('mousedown', { button: 0, shiftKey: true, bubbles: true });
  row.dispatchEvent(ev);
  return { logs: g.inventory.countOf(7), planks: g.inventory.countOf(9) };
});
console.log('craft-all (5 logs -> planks):', JSON.stringify(craftAll));

if (errors.length) {
  console.log('ERRORS:'); for (const e of errors) console.log(' ', e);
  process.exitCode = 1;
} else console.log('No console errors.');
await browser.close();
