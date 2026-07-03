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

const lockOk = await page.evaluate(() => document.pointerLockElement !== null);
console.log('pointer locked:', lockOk);

// double-tap W -> sprint (fov should rise toward 82)
await page.keyboard.down('KeyW');
await page.keyboard.up('KeyW');
await new Promise((r) => setTimeout(r, 100));
await page.keyboard.down('KeyW');
await new Promise((r) => setTimeout(r, 900));
const sprint = await page.evaluate(() => ({
  sprinting: window.__game.player.sprinting,
  toggle: window.__game.player.sprintToggle,
  fov: +window.__game.player.camera.fov.toFixed(1),
}));
await page.keyboard.up('KeyW');
console.log('double-tap sprint:', JSON.stringify(sprint));

// after releasing W, sprint toggle must reset
await new Promise((r) => setTimeout(r, 200));
const reset = await page.evaluate(() => window.__game.player.sprintToggle);
console.log('sprint toggle after release (want false):', reset);

// Escape -> pause overlay
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 400));
const paused = await page.evaluate(() => ({
  overlayVisible: !document.getElementById('overlay').classList.contains('hidden'),
  locked: document.pointerLockElement !== null,
}));
console.log('after Escape:', JSON.stringify(paused));

// E opens inventory, Escape closes it
await page.click('#play-btn');
await new Promise((r) => setTimeout(r, 1600)); // pointer lock re-acquire cooldown
await page.keyboard.press('KeyE');
await new Promise((r) => setTimeout(r, 300));
const invOpen = await page.evaluate(() => !document.getElementById('inventory-screen').classList.contains('hidden'));
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 300));
const invClosed = await page.evaluate(() => document.getElementById('inventory-screen').classList.contains('hidden'));
console.log('inventory open via E:', invOpen, '- closed via Escape:', invClosed);

if (errors.length) {
  console.log('ERRORS:'); for (const e of errors) console.log(' ', e);
  process.exitCode = 1;
} else console.log('No console errors.');
await browser.close();
