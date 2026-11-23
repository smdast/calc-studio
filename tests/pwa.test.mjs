import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';

test('installs under a GitHub Pages project path and calculates offline', { timeout: 60000 }, async () => {
  const server = await preview({ base: '/calc-studio/', logLevel: 'silent', preview: { host: '127.0.0.1', port: 0 } });
  let browser;
  try {
    if (!server.httpServer.listening) await once(server.httpServer, 'listening');
    const { port } = server.httpServer.address();
    const url = 'http://127.0.0.1:' + port + '/calc-studio/';
    browser = await chromium.launch({ channel: process.env.CALCULATOR_BROWSER_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined) });
    const context = await browser.newContext();
    const page = await context.newPage();
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    await page.goto(url);
    await page.getByRole('tabpanel', { name: '関数電卓', exact: true }).waitFor();
    const response = await page.request.get(new URL('manifest.webmanifest', url).href);
    const manifest = await response.json();
    assert.equal(manifest.display, 'standalone');
    assert.equal(new URL(manifest.start_url, url).href, url);
    assert.deepEqual(manifest.icons.map(icon => icon.sizes), ['192x192', '512x512']);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 25000 });
    const registration = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    assert.equal(registration, url);
    await context.setOffline(true);
    await page.reload();
    await page.getByRole('tabpanel', { name: '関数電卓', exact: true }).waitFor();

    const field = page.locator('math-field');
    await field.evaluate((node, value) => {
      node.setValue(value);
      node.dispatchEvent(new Event('input', { bubbles: true }));
    }, '\\int_{-\\infty}^{\\infty}\\exp(-x^2)\\,\\mathrm{d}x');
    await page.getByRole('button', { name: '決定', exact: true }).click();
    await expect(page.getByTestId('calculator-result').getByRole('math'))
      .toHaveAttribute('aria-label', '\\sqrt{\\pi}', { timeout: 18000 });

    await page.getByRole('tab', { name: 'グラフ', exact: true }).click();
    await expect(page.locator('.scatterlayer .js-line').first()).toBeVisible({ timeout: 15000 });
    assert.deepEqual(failures, []);
  } finally {
    await browser?.close();
    await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
  }
});
