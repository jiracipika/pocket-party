'use strict';
// Snack Catch browser QA (worker-owned). Real Playwright + real server.
// Usage: node games/snack-catch/browser-qa.cjs [baseURL]
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.argv[2] || 'http://127.0.0.1:4173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true,
  });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.goto(base + '/games/snack-catch/?qa=1');
  await page.waitForFunction(() => !!window.__gameTest);
  const state = () => page.evaluate(() => window.__gameTest.getState());

  // sprites actually load (illustrated gameplay, not fallback)
  await page.waitForFunction(() => {
    const img = new Image(); img.src = '../../assets/snack-sprites.png';
    return new Promise(res => { img.onload = () => res(img.naturalWidth === 768); img.onerror = () => res(false); });
  }, { timeout: 5000 }).then(ok => assert.ok(ok, 'sprite atlas 768x128 reachable'));
  console.log('PASS sprite atlas loads (768x128)');
  // start
  assert.equal((await state()).state, 'ready');
  await page.locator('#btnStart').tap();
  assert.equal((await state()).state, 'playing');
  console.log('PASS start');

  // real touch catch: follow lowest non-bomb item with taps
  let caught = false;
  for (let i = 0; i < 100 && !caught; i++) {
    const target = await page.evaluate(() => {
      const g = window.__gameTest.game;
      const it = [...g.items].filter(i => i.kind !== 'bomb').sort((a, b) => b.y - a.y)[0];
      return it ? it.x : null;
    });
    if (target !== null) {
      const c = await page.locator('canvas').boundingBox();
      await page.touchscreen.tap(c.x + target / 360 * c.width, c.y + c.height * 0.84);
    }
    await page.waitForTimeout(120);
    caught = (await state()).catches > 0;
  }
  assert.ok(caught, 'caught a snack by touch');
  assert.ok((await state()).score >= 10, 'score counted');
  console.log('PASS touch catch (score ' + (await state()).score + ')');

  // pause / resume
  await page.locator('#btnPause').tap();
  assert.equal((await state()).state, 'paused');
  const t = (await state()).timeLeft;
  await page.waitForTimeout(400);
  assert.equal((await state()).timeLeft, t, 'timer frozen while paused');
  await page.locator('#btnResume').tap();
  assert.equal((await state()).state, 'playing');
  await page.waitForTimeout(300);
  assert.notEqual((await state()).timeLeft, t, 'timer advances after resume');
  console.log('PASS pause/resume');

  // game over via forceOver QA hook (valid, real UI path runs endRound)
  await page.evaluate(() => window.__gameTest.forceOver());
  assert.equal((await state()).state, 'over');
  assert.ok(await page.locator('#ovOver:not(.hidden)').count(), 'recap visible');
  const scoreShown = await page.locator('#finalScore').innerText();
  assert.equal(scoreShown, String((await state()).score), 'recap shows real score');
  console.log('PASS game over recap');

  // replay
  await page.locator('#btnReplay').tap();
  const s2 = await state();
  assert.equal(s2.state, 'playing');
  assert.equal(s2.score, 0);
  assert.equal(s2.hearts, 3);
  console.log('PASS replay');

  // canvas fits the 360x640 viewport
  const c = await page.locator('canvas').boundingBox();
  assert.ok(c.y >= 0 && c.y + c.height <= 642, 'canvas in viewport');
  await page.screenshot({ path: 'artifacts/snack-catch-qa-360.png' });
  console.log('PASS viewport fit 360x640');

  assert.equal(errors.length, 0, 'no page errors: ' + JSON.stringify(errors));
  console.log('PASS zero page errors / HTTP 4xx');
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
