'use strict';
/* Color Panic — real-browser round-flow QA (worker-owned).
 * Uses the project's Playwright against the built dist on :4173.
 * Run: node games/color-panic/browser-round.test.cjs
 */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
const URL = BASE + '/games/color-panic/?qa=1';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const passed = [];
  let failed = 0;
  async function check(name, fn) {
    try { await fn(); passed.push(name); console.log('PASS', name); }
    catch (e) { failed++; console.log('FAIL', name, '-', e.message); }
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => !!window.__gameTest);
  const state = () => page.evaluate(() => window.__gameTest.getState());
  await page.clock.install();

  await check('start via real tap, round timer 30 and HUD shows 30', async () => {
    await page.locator('#startBtn').tap();
    const s = await state();
    assert.equal(s.phase, 'playing');
    assert.ok(s.roundTimeLeft > 29 && s.roundTimeLeft <= 30, 'round timer at full 30 (got ' + s.roundTimeLeft + ')');
    const hud = Number(await page.locator('#roundVal').innerText());
    assert.ok(hud >= 29 && hud <= 30, 'HUD shows round countdown (got ' + hud + ')');
  });

  await check('wrong tap costs a heart and advances target', async () => {
    const s = await state();
    await page.evaluate(() => window.__gameTest.press((window.__gameTest.getState().targetIndex + 1) % 4));
    const s2 = await state();
    assert.equal(s2.hearts, s.hearts - 1);
    assert.notEqual(s2.targetIndex, s.targetIndex);
    await page.clock.runFor(220); // clear lockout
  });

  await check('key-repeat does not double-answer', async () => {
    await page.clock.runFor(250);
    const before = (await state()).score;
    const slot = (await state()).targetIndex;
    await page.evaluate(k => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: k, repeat: false }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: k, repeat: true })); // OS auto-repeat
      window.dispatchEvent(new KeyboardEvent('keydown', { key: k, repeat: true }));
    }, String(slot + 1));
    assert.equal((await state()).score, before + 10, 'one answer only despite repeat events');
    await page.clock.runFor(250);
  });

  await check('pause/resume freezes round timer, aria-pressed syncs', async () => {
    await page.locator('#pauseBtn').tap();
    assert.equal((await state()).phase, 'paused');
    assert.equal(await page.locator('#pauseBtn').getAttribute('aria-pressed'), 'true');
    const before = (await state()).roundTimeLeft;
    await page.clock.runFor(1500);
    assert.equal((await state()).roundTimeLeft, before, 'round timer frozen');
    await page.locator('#resumeBtn').tap();
    assert.equal((await state()).phase, 'playing');
    assert.equal(await page.locator('#pauseBtn').getAttribute('aria-pressed'), 'false');
    await page.clock.runFor(1100);
    assert.ok((await state()).roundTimeLeft < before);
  });

  await check('doing nothing to target expiry drains hearts and shows recap exactly once', async () => {
    // stay idle: each 2.5s target expiry costs a heart; 3 losses => over
    await page.clock.runFor(9000);
    assert.equal((await state()).phase, 'over', 'out of hearts via expiry');
    assert.ok(await page.locator('#replayBtn').isVisible(), 'recap visible');
    const overTitle = await page.locator('#overTitle').innerText();
    assert.match(overTitle, /HEARTS/i);
    await page.clock.runFor(2000);
    assert.equal(await page.locator('#overlay').count() > 0 && await page.locator('#replayBtn').isVisible(), true);
    assert.equal(await page.locator('#overlay[hidden]').count(), 0, 'overlay still shown once (no flicker/duplicate)');
  });

  await check('replay resets score/hearts/combo and restarts round timer', async () => {
    await page.locator('#replayBtn').tap();
    const s = await state();
    assert.equal(s.phase, 'playing');
    assert.equal(s.score, 0);
    assert.equal(s.hearts, 3);
    assert.equal(s.combo, 0);
    assert.equal(s.roundTimeLeft, 30);
    assert.equal(await page.locator('#roundVal').innerText(), '30');
  });

  await check('round timer ends round at 30s even with correct play and hearts left', async () => {
    let guard = 0;
    while ((await state()).phase === 'playing' && guard++ < 400) {
      await page.evaluate(() => window.__gameTest.press(window.__gameTest.getState().targetIndex));
      await page.clock.runFor(180); // clears lockout, keeps answering
    }
    const s = await state();
    assert.equal(s.phase, 'over', 'round ended by timer');
    assert.equal(s.roundTimeLeft, 0);
    assert.ok(s.hearts > 0, 'no hearts lost (perfect play)');
    assert.ok(s.score > 0, 'player scored');
    assert.ok(await page.locator('#replayBtn').isVisible(), 'recap shown for timer end');
  });

  await check('canvas fit and touch targets in 360x640', async () => {
    const q = await browser.newPage({ viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true });
    await q.goto(URL);
    await q.waitForFunction(() => !!window.__gameTest);
    await q.locator('#startBtn').tap();
    const canvasBox = await q.locator('#game').boundingBox();
    assert.ok(canvasBox.y >= 0 && canvasBox.y + canvasBox.height <= 642, 'canvas within viewport');
    assert.ok(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
    // real touch on the target button scores
    const slot = (await q.evaluate(() => window.__gameTest.getState())).targetIndex;
    const pad = 14, w = canvasBox.width, h = canvasBox.height;
    const bw = (w - pad * 3) / 2, bh = (h * 0.42 - pad * 2) / 2;
    const x = canvasBox.x + pad + (slot % 2) * (bw + pad) + bw / 2;
    const y = canvasBox.y + h - pad - bh / 2 - (slot >= 2 ? bh + pad : 0);
    await q.touchscreen.tap(x, y);
    assert.ok((await q.evaluate(() => window.__gameTest.getState())).score > 0, 'real touch scores at 360x640');
    await q.close();
  });

  await check('asset cues and grain actually load (no 404)', async () => {
    const loaded = await page.evaluate(() => new Promise(res => {
      const a = new Image(); const b = new Image(); let n = 0; const d = () => { if (++n === 2) res(true); };
      a.onload = b.onload = d; a.onerror = b.onerror = () => res(false);
      a.src = '../../assets/color-symbols.svg'; b.src = '../../assets/ink-grain.svg';
    }));
    assert.ok(loaded, 'sprite sheet + grain resolve from game page');
  });

  await check('no page errors during entire session', async () => {
    assert.deepEqual(errors, []);
  });

  await browser.close();
  console.log(failed === 0 ? 'ROUND-FLOW BROWSER QA: ALL ' + passed.length + ' PASS' : failed + ' FAILED');
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
