const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');

const root = path.resolve(__dirname, '../web');
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.jpg': 'image/jpeg' };
let server, base;

function launchBrowser() {
  return chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage', ...(process.env.CHROMIUM_PATH ? ['--no-zygote', '--single-process'] : [])]
  });
}

test.before(async () => {
  server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(target, (err, data) => {
      if (err) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
});

// View and dialog transitions focus on the next animation frame. Wait for it
// instead of assuming a particular speed of the host or WebView.
const focusId = (page, id) => page.waitForFunction(value => document.activeElement?.id === value, id);
const focusLabel = (page, label) => page.waitForFunction(value => document.activeElement?.getAttribute('aria-label') === value, label);
const focusText = (page, text) => page.waitForFunction(value => document.activeElement?.textContent.trim() === value, text);

async function open(page) {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'hero-details');
}

test('D-pad focus, details, search, filters, saved titles, settings, and Back work', async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await open(page);
    assert.equal(await page.locator('#home-picks .title-card').count(), 5);
    assert.equal(await page.locator('#home-series .title-card').count(), 4);
    assert.equal(await page.locator('.demo-badge').innerText(), 'DEMO CATALOG');
    assert.equal(await page.evaluate(() => Array.from(document.images).filter(i => !i.complete || !i.naturalWidth).length), 0);

    // Arrow keys move between on-screen controls, rather than a fixed tab order.
    await page.keyboard.press('ArrowRight');
    await focusId(page, 'hero-save');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#saved-count').innerText(), '1');
    await page.keyboard.press('ArrowLeft');
    await focusId(page, 'hero-details');
    await page.keyboard.press('ArrowDown');
    await focusLabel(page, 'Midnight District, Series, open details');
    await page.keyboard.press('ArrowRight');
    await focusLabel(page, 'Northbound, Movie, open details');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#details-dialog:not([hidden])');
    assert.equal(await page.locator('#detail-title').innerText(), 'Northbound');
    assert.match(await page.locator('.dialog-notice').innerText(), /No video is available/);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#dialog-backdrop').isHidden(), true);
    await focusLabel(page, 'Northbound, Movie, open details');

    await page.locator('.nav-item[data-nav="search"]').click();
    await page.waitForSelector('[data-page="search"]:not([hidden])');
    await page.locator('#search-input').fill('nature');
    assert.equal(await page.locator('#search-results .title-card').count(), 1);
    assert.equal(await page.locator('#search-results .card-title').innerText(), 'Wild Earth');
    await page.locator('#search-input').press('ArrowDown');
    await focusLabel(page, 'Wild Earth, Series, open details');
    await page.keyboard.press('Enter');
    await page.locator('#detail-save').click();
    assert.equal(await page.locator('#saved-count').innerText(), '2');
    await page.keyboard.press('Escape');

    await page.locator('.saved-link').click();
    await page.waitForSelector('[data-page="saved"]:not([hidden])');
    assert.equal(await page.locator('#saved-results .title-card').count(), 2);
    await page.locator('.nav-item[data-nav="movies"]').click();
    assert.equal(await page.locator('#movie-results .title-card').count(), 4);
    await page.locator('[data-filter="Sci-Fi"]').click();
    assert.equal(await page.locator('#movie-results .title-card').count(), 1);
    assert.equal(await page.locator('#movie-results .card-title').innerText(), 'The Last Light');

    await page.locator('.nav-item[data-nav="live"]').click();
    assert.match(await page.locator('.empty-copy').innerText(), /doesn't include live channels or a player/);
    await page.locator('.nav-item[data-nav="settings"]').click();
    await page.locator('#motion-switch').click();
    assert.equal(await page.locator('#motion-switch').getAttribute('aria-checked'), 'true');
    await page.locator('#clear-saved').click();
    await page.waitForSelector('#clear-dialog:not([hidden])');
    await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'cancel-clear');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#saved-count').innerText(), '2');
    await page.locator('#clear-saved').click();
    await page.locator('#confirm-clear').click();
    assert.equal(await page.locator('#saved-count').innerText(), '0');
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.nav-item[data-nav="settings"]').click();
    assert.equal(await page.locator('#motion-switch').getAttribute('aria-checked'), 'true');
    assert.equal(await page.locator('#saved-count').innerText(), '0');
    assert.equal(await page.evaluate(() => window.lumenBack()), true);
    assert.equal(await page.locator('[data-page="home"]').isVisible(), true);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('navigation rail, remote search and modal focus are keyboard accessible', async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  try {
    await open(page);
    await page.keyboard.press('ArrowLeft');
    await focusText(page, 'Movies');
    await page.keyboard.press('ArrowUp');
    await focusText(page, 'Search');
    await page.keyboard.press('Enter');
    await focusId(page, 'search-input');
    await page.keyboard.type('slow');
    await page.keyboard.press('ArrowDown');
    await focusLabel(page, 'Slow Burn, Series, open details');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement.id === 'detail-save');
    await page.keyboard.press('ArrowRight');
    await focusText(page, 'Back to browse');
    await page.keyboard.press('Tab');
    await focusLabel(page, 'Close title details');
    await page.keyboard.press('Shift+Tab');
    await focusText(page, 'Back to browse');
    await page.keyboard.press('Escape');
    await focusLabel(page, 'Slow Burn, Series, open details');
    await page.keyboard.press('ArrowLeft');
    await focusText(page, 'Settings');
    await page.keyboard.press('ArrowUp');
    await focusText(page, 'Live TV');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('[data-page="live"]').isVisible(), true);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement.id === 'hero-details');
  } finally { await browser.close(); }
});

test('dashboard fits TV and phone widths without horizontal overflow', async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  try {
    for (const viewport of [{ width: 1920, height: 1080 }, { width: 960, height: 540 }, { width: 640, height: 360 }, { width: 390, height: 844 }, { width: 3840, height: 2160 }, { width: 7680, height: 4320 }]) {
      await page.setViewportSize(viewport);
      await open(page);
      const dimensions = await page.evaluate(() => ({ viewport: innerWidth, body: document.documentElement.scrollWidth, main: document.querySelector('#main').scrollWidth, mainWidth: document.querySelector('#main').clientWidth }));
      assert.ok(dimensions.body <= dimensions.viewport, `${viewport.width}: body overflow ${JSON.stringify(dimensions)}`);
      assert.ok(dimensions.main <= dimensions.mainWidth, `${viewport.width}: main overflow ${JSON.stringify(dimensions)}`);
      assert.equal(await page.locator('#hero-details').isVisible(), true);
      const settingsBottom = await page.locator('.nav-item[data-nav="settings"]').evaluate(node => node.getBoundingClientRect().bottom);
      assert.ok(settingsBottom <= viewport.height, `${viewport.width}: Settings was clipped below the viewport`);
      if (viewport.width <= 700) {
        const [actions, kicker] = await Promise.all([page.locator('.topbar-actions').boundingBox(), page.locator('.eyebrow').boundingBox()]);
        assert.ok(kicker.y >= actions.y + actions.height, `${viewport.width}: header overlaps the hero title`);
      }
      if (viewport.width === 7680) {
        const titleSize = await page.locator('.hero h1').evaluate(node => parseFloat(getComputedStyle(node).fontSize));
        assert.ok(titleSize >= 300, `8K headline did not scale: ${titleSize}px`);
      }
    }
  } finally { await browser.close(); }
});
