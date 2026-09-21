'use strict';
// Aspect-ratio QA for Snack Catch sprites (worker-owned).
// Measures real on-screen sprite pixels via canvas getImageData at 360x640
// and 390x844: basket must be ~square aspect (w/h ~ 1.4 crop aspect), aligned
// to catch line; falling snacks must be non-elliptical (w/h within tolerance).
// Usage: node games/snack-catch/aspect-qa.cjs [baseURL]
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.argv[2] || 'http://127.0.0.1:4173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const [w, h] of [[360, 640], [390, 844]]) {
    const page = await browser.newPage({
      viewport: { width: w, height: h }, hasTouch: true, isMobile: true,
    });
    page.on('pageerror', e => { throw new Error('pageerror: ' + e.message); });
    await page.goto(base + '/games/snack-catch/?qa=1');
    await page.waitForFunction(() => !!window.__gameTest);
    await page.locator('#btnStart').tap();

    // advance the round so several items are on screen, then measure pixels
    await page.waitForTimeout(1600);
    // park basket left so items fall past and more sprites are visible
    await page.evaluate(() => window.__gameTest.setInput(40));
    await page.waitForTimeout(400);

    const m = await page.evaluate(() => {
      const cv = document.getElementById('game');
      const rect = cv.getBoundingClientRect();
      const scaleX = rect.width / cv.width, scaleY = rect.height / cv.height;
      const tmp = document.createElement('canvas');
      tmp.width = cv.width; tmp.height = cv.height;
      const tctx = tmp.getContext('2d');
      tctx.drawImage(cv, 0, 0);
      const g = window.__gameTest.game;
      const img = tctx.getImageData(0, 0, cv.width, cv.height).data;
      function bbox(cx, cy, rad) {
        // canvas px, in logical units * dpr transform handled by caller
        let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
        const R = rad * (cv.width / 360) * 1.6;
        const px = cx * (cv.width / 360), py = cy * (cv.height / 640);
        for (let y = Math.max(0, (py - R) | 0); y < Math.min(cv.height, py + R); y++) {
          for (let x = Math.max(0, (px - R) | 0); x < Math.min(cv.width, px + R); x++) {
            const i = (y * cv.width + x) * 4;
            if (img[i + 3] > 40) {
              if (x < x0) x0 = x; if (x > x1) x1 = x;
              if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
          }
        }
        return x1 < 0 ? null : { w: x1 - x0 + 1, h: y1 - y0 + 1, x0, y0 };
      }
      const out = { items: [], basket: null };
      for (const it of g.items) {
        const b = bbox(it.x, it.y, 30);
        if (b) out.items.push({ kind: it.kind, y: Math.round(it.y), ...b });
      }
      out.basket = bbox(g.basket.x, g.basket.y - g.basket.h / 2, 70);
      out.catchLineCanvas = Math.round((g.basket.y - g.basket.h / 2) * (cv.height / 640));
      out.cssRect = { w: Math.round(rect.width), h: Math.round(rect.height) };
      return out;
    });

    // items: aspect close to sprite crop aspect (120/120 = 1.0)
    let measured = 0;
    for (const it of m.items) {
      if (it.y < 0 || it.w < 4) continue;
      const ar = it.w / it.h;
      assert.ok(Math.abs(ar - 1) < 0.45, `${w}x${h}: ${it.kind} on-screen aspect ${ar.toFixed(2)} must be ~square (no ellipse squash)`);
      measured++;
    }
    assert.ok(measured >= 1, w + 'x' + h + ': at least one falling sprite visible');

    // basket: crop aspect 128/92 = 1.39; measured should be close
    const bar = m.basket.w / m.basket.h;
    assert.ok(Math.abs(bar - 1.39) < 0.25, `${w}x${h}: basket on-screen aspect ${bar.toFixed(2)} should match crop 1.39 (squash fixed)`);
    // readable size: ~60px wide on screen (css px)
    const cssW = m.basket.w * (m.cssRect.w / (await page.evaluate(() => document.getElementById('game').width)));
    console.log(`${w}x${h}: items=${measured} basketAspect=${bar.toFixed(2)} (target 1.39) basketCanvasPx=${m.basket.w}x${m.basket.h}`);

    await page.screenshot({ path: `artifacts/snack-aspect-${w}x${h}.png` });
    await page.close();
  }
  await browser.close();
  console.log('PASS aspect QA both viewports');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
