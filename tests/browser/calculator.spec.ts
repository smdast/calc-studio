import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import type { MathfieldElement } from 'mathlive';

const origin = 'http://127.0.0.1:5173';

async function enter(field: Locator, latex: string) {
  await field.evaluate((node, value) => {
    (node as HTMLElement & { setValue: (value: string) => void }).setValue(value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  }, latex);
}

async function mode(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click();
  const panel = page.getByRole('tabpanel', { name, exact: true });
  await expect(panel).toBeVisible();
  return panel;
}

for (const mobile of [false, true]) {
  test.describe(mobile ? 'phone layout' : 'desktop layout', () => {
    test.use({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 920 }, isMobile: mobile, hasTouch: mobile,
      colorScheme: 'light' });

    test('evaluates formulas and keeps systems, linear algebra, and plots in separate modes', async ({ page }, info) => {
      const external: string[] = [];
      const runtimeErrors: string[] = [];
      page.on('pageerror', error => runtimeErrors.push(error.message));
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin === origin) await route.continue();
        else {
          external.push(url.origin);
          await route.abort();
        }
      });
      await page.goto('/');
      const calc = await mode(page, '関数電卓');
      await expect(page.getByRole('tab')).toHaveCount(4);
      const input = calc.locator('math-field[aria-label="入力式"]');
      const key = (name: string) => calc.locator('.calculator-card').getByRole('button', { name, exact: true });
      await expect(input).toBeVisible();
      const fraction = calc.getByRole('button', { name: '分数', exact: true });
      const fractionOperands = await fraction.locator('.ML__ams').evaluateAll(items => items.map(item => ({
        glyph: item.textContent, y: item.getBoundingClientRect().y,
      })));
      expect(fractionOperands.map(operand => operand.glyph)).toEqual(['■', '■']);
      expect(Math.abs(fractionOperands[0].y - fractionOperands[1].y)).toBeGreaterThan(6);
      await expect(fraction.locator('.ML__frac-line')).toBeVisible();
      const exponent = calc.getByRole('button', { name: 'べき乗', exact: true });
      await expect(exponent.locator('.ML__ams')).toHaveCount(2);
      await expect(exponent.locator('.ML__msubsup')).toBeVisible();
      await fraction.click();
      expect(await input.evaluate(node => (node as HTMLElement & { value: string }).value)).toContain('\\frac{');
      const slots = () => input.evaluate(node => {
        const field = node as MathfieldElement;
        return field.getPrompts().map(id => field.getPromptValue(id));
      });
      await expect.poll(slots).toEqual(['', '']);
      await expect(input.locator('.ML__focusedPromptBox')).toHaveCSS('outline-width', '2px');
      await key('1').click();
      await expect.poll(slots).toEqual(['1', '']);
      if (mobile) await key('一文字削除').tap();
      else await page.keyboard.press('Backspace');
      await expect.poll(slots).toEqual(['', '']);
      await expect(input.locator('.ML__focusedPromptBox')).toHaveCSS('outline-width', '2px');
      await key('1').click();
      await page.keyboard.press('Tab');
      await key('2').click();
      await expect.poll(slots).toEqual(['1', '2']);
      await page.keyboard.press('Shift+Tab');
      await key('3').click();
      await expect.poll(slots).toEqual(['3', '2']);
      await calc.getByRole('button', { name: 'クリア', exact: true }).click();
      await page.screenshot({ path: info.outputPath('calculator.png') });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(mobile ? 390 : 1440);

      const result = calc.getByTestId('calculator-result').getByRole('math');
      if (mobile) {
        await calc.getByRole('button', { name: '履歴', exact: true }).tap();
        await page.getByRole('dialog', { name: '計算履歴' }).getByRole('button', { name: /分数の加算/ }).tap();
      } else {
        await calc.getByRole('button', { name: /分数の加算/ }).click();
      }
      await expect(result).toHaveAttribute('aria-label', '\\frac{1}{2}');
      await calc.getByRole('radio', { name: '小数', exact: true }).click();
      await expect(result).toHaveAttribute('aria-label', '0.5');
      await calc.getByRole('radio', { name: '厳密値', exact: true }).click();
      await calc.getByRole('button', { name: 'クリア', exact: true }).click();
      if (mobile) {
        await calc.getByRole('button', { name: '1', exact: true }).tap();
        await calc.getByRole('button', { name: '足し算', exact: true }).tap();
        await calc.getByRole('button', { name: '2', exact: true }).tap();
        await key('決定').tap();
      } else {
        await input.focus();
        await page.keyboard.type('1+2');
        await page.keyboard.press('Enter');
      }
      await expect(result).toHaveAttribute('aria-label', '3');
      await enter(input, '\\frac{1}{}');
      await key('決定').click();
      await expect(calc.getByRole('alert')).toContainText('数式');
      await enter(input, '\\sin(30)');
      await calc.getByRole('radio', { name: 'DEG', exact: true }).click();
      await key('決定').click();
      await expect(result).toHaveAttribute('aria-label', '\\frac{1}{2}');
      await calc.getByRole('radio', { name: 'RAD', exact: true }).click();

      await key('クリア').click();
      await key('微分').click();
      await key('変数 x を入力').click();
      await key('Tab').click();
      await key('変数 x を入力').click();
      await key('二乗').click();
      await key('決定').click();
      await expect(result).toHaveAttribute('aria-label', /^2.*x$/);

      await key('クリア').click();
      await key('定積分').click();
      await expect.poll(slots).toEqual(['', '', '', '']);
      await key('0').click();
      await key('Tab').click();
      await key('1').click();
      await key('Tab').click();
      await key('変数 x を入力').click();
      await key('二乗').click();
      await key('Tab').click();
      await key('変数 x を入力').click();
      await key('決定').click();
      await expect(result).toHaveAttribute('aria-label', '\\frac{1}{3}');

      await enter(input, '2x+3x');
      await key('決定').click();
      await expect(result).toHaveAttribute('aria-label', /^5.*x$/);

      await key('クリア').click();
      await enter(input, 'x^2+1');
      await input.focus();
      await page.keyboard.press('End');
      if (mobile) await key('式の等号を入力').tap();
      else await page.keyboard.press('=');
      await expect(input).toHaveJSProperty('value', 'x^2+1=');
      await expect(result).toHaveAttribute('aria-label', '0');
      await key('0').click();
      await key('決定').click();
      await expect(result).toHaveAttribute('aria-label', /x_\{1\}=-?i.*x_\{2\}=-?i/);

      const system = await mode(page, '連立方程式');
      await system.getByRole('button', { name: '解を求める' }).click();
      await expect(system.locator('.tool-result').getByRole('math')).toHaveAttribute('aria-label', /x\\approx 3.*y\\approx 2/);
      await expect(system.getByRole('button', { name: '係数を再入力' })).toHaveCount(1);

      const linear = await mode(page, '行列・ベクトル');
      await linear.getByRole('button', { name: '計算する' }).click();
      await expect(linear.getByRole('math')).toHaveAttribute('aria-label', /bmatrix/);
      await linear.getByRole('radio', { name: 'ベクトル' }).click();
      await linear.getByRole('button', { name: '計算する' }).click();
      await expect(linear.getByRole('math')).toHaveAttribute('aria-label', /1\\end/);

      const graph = await mode(page, 'グラフ');
      await expect(graph.locator('.scatterlayer .js-line').first()).toBeVisible({ timeout: 20000 });
      await expect(graph.getByText('極小 (0, -1)')).toBeVisible();
      if (mobile) {
        await graph.locator('math-field[aria-label="y ="]').tap();
        await expect.poll(() => page.evaluate(() => window.mathVirtualKeyboard.visible)).toBe(true);
        await page.evaluate(() => { window.mathVirtualKeyboard.hide(); (document.activeElement as HTMLElement | null)?.blur(); });
      }
      await graph.getByLabel('接線の x 座標').fill('1');
      await graph.getByRole('button', { name: '接線を表示' }).click();
      await expect(graph.getByText('傾き')).toBeVisible();
      await graph.getByRole('button', { name: '拡大', exact: true }).click();
      await expect(graph.locator('.scatterlayer .js-line').first()).toBeVisible();
      await graph.getByLabel('グラフの種類').selectOption('polar');
      await expect(graph.getByLabel('開始値')).toBeVisible();
      await expect.poll(() => graph.locator('.plot-host').evaluate(node =>
        (node as unknown as { data?: { x: number[] }[] }).data?.[0]?.x[0])).toBe(2);
      await graph.getByLabel('グラフの種類').selectOption('parametric');
      await expect(graph.locator('math-field[aria-label="y(t) ="]')).toBeVisible();
      await expect.poll(() => graph.locator('.plot-host').evaluate(node =>
        (node as unknown as { data?: { x: number[] }[] }).data?.[0]?.x[0])).toBe(3);
      await graph.getByLabel('グラフの種類').selectOption('implicit');
      await expect(graph.locator('.contourlayer path').first()).toBeVisible({ timeout: 15000 });
      await page.screenshot({ path: info.outputPath('graph.png') });

      await page.getByRole('button', { name: '設定' }).click();
      await page.getByRole('menuitem', { name: 'ダークモードに切り替え' }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(page.getByRole('radio', { name: 'RAD', exact: true })).toHaveAttribute('aria-checked', 'true');
      if (mobile) await page.getByRole('button', { name: '履歴', exact: true }).tap();
      const history = mobile ? page.getByRole('dialog', { name: '計算履歴' }) : page.locator('.history-card');
      await expect(history.getByRole('button', { name: '数式を再入力' })).toHaveCount(7);
      await history.getByRole('button', { name: '数式を再入力' }).nth(2).click();
      await expect(result).toHaveAttribute('aria-label', '\\frac{1}{3}');
      await expect(input).toHaveJSProperty('value', '\\int_0^1\\left(x^2\\right)\\,\\mathrm{d}x');
      if (mobile) await page.getByRole('button', { name: '履歴', exact: true }).tap();
      await history.getByRole('button', { name: '数式を再入力' }).nth(5).click();
      await expect(result).toHaveAttribute('aria-label', '3');
      await page.screenshot({ path: info.outputPath('dark-history.png') });

      await key('文字キーボード').click();
      await expect.poll(() => page.evaluate(() => window.mathVirtualKeyboard.visible)).toBe(true);
      await page.evaluate(() => { window.mathVirtualKeyboard.hide(); });
      await enter(input, 'ax+b=0');
      await key('決定').click();
      await expect(result).toHaveAttribute('aria-label', 'x=-\\frac{b}{a}');
      await expect(calc.getByRole('math', { name: 'a\\ne 0', exact: true })).toBeVisible();
      await key('クリア').click();
      await input.evaluate((node, formula) => {
        const data = new DataTransfer();
        data.setData('text/plain', formula);
        node.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
      }, '$$ \\int_0^{\\frac{\\pi}{4}}\\left(\\sqrt{\\tan\\left(x\\right)}\\right)\\\\,\\mathrm{d}x $$');
      await key('決定').click();
      await expect(result).toHaveAttribute('aria-label', /\\ln\\left\(\\sqrt\{2\}-1\\right\)/);
      await expect(calc.locator('.display-output .display-label')).toHaveText('定積分');
      await calc.getByRole('radio', { name: '小数', exact: true }).click();
      await expect(result).toHaveAttribute('aria-label', /^0\.48749549439\d$/);

      expect(external).toEqual([]);
      expect(runtimeErrors).toEqual([]);
    });

    if (mobile) test('fits the entire keypad on a 320×568 phone with a formula and result', async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 568 });
      await page.goto('/');
      const calc = page.getByRole('tabpanel', { name: '関数電卓', exact: true });
      const field = calc.locator('math-field');
      const result = calc.getByTestId('calculator-result').getByRole('math');
      await expect(page.getByText('Calc Studio', { exact: true })).toHaveCount(0);
      await expect(calc.getByRole('heading', { name: '関数電卓', exact: true })).toHaveCount(0);
      await enter(field, '\\int_0^1\\frac{3x^2}{2}\\,\\mathrm{d}x');
      const submit = calc.getByRole('button', { name: '決定', exact: true });
      await expect(submit).toBeInViewport({ ratio: 1 });
      await submit.tap();
      await expect(result).toHaveAttribute('aria-label', '\\frac{1}{2}');
      await expect(submit).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
      await expect(page.getByRole('tab', { name: 'グラフ', exact: true })).toBeInViewport({ ratio: 1 });
    });

    test('finds exact integrals across unrelated families with local assets only', async ({ page, context }) => {
      const external: string[] = [];
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin === origin) return route.continue();
        external.push(url.href);
        await route.abort();
      });
      await page.goto('/');
      const calc = await mode(page, '関数電卓');
      const input = calc.locator('math-field[aria-label="入力式"]');
      const result = calc.getByTestId('calculator-result').getByRole('math');
      const decision = calc.getByRole('button', { name: '決定', exact: true });
      const compute = async (expression: string, expected: RegExp) => {
        await enter(input, expression);
        await decision.click();
        await expect(result).toHaveAttribute('aria-label', expected, { timeout: 15000 });
      };

      await compute('\\int_0^1\\exp(-x^2)\\,\\mathrm{d}x', /\\sqrt\{\\pi\}.*\\operatorname\{erf\}/);
      await compute('2\\mathrm{Ans}', /^\\sqrt\{\\pi\}.*\\operatorname\{erf\}/);
      await compute('\\int_{-\\infty}^{\\infty}\\exp(-x^2)\\,\\mathrm{d}x', /^\\sqrt\{\\pi\}$/);
      await compute('\\int_0^{\\pi/4}\\sqrt{1+\\sin(x)^2}\\,\\mathrm{d}x', /^E.*\\middle\| -1/);
      await compute('\\int_0^1\\frac{\\sin(x)}{x}\\,\\mathrm{d}x', /\\operatorname\{Si\}/);
      await compute('\\int_0^1\\frac{\\ln(1+x)}{x}\\,\\mathrm{d}x', /^\\frac\{\\pi\^\{2\}\}\{12\}$/);
      await compute('\\int\\exp(-a x^2)\\,\\mathrm{d}x', /\\begin\{cases\}.*\\operatorname\{erf\}/);
      await compute('\\int_0^{\\pi/4}\\sqrt{\\sin(x)}\\,\\mathrm{d}x', /^0\.\d+$/);
      await expect(calc.locator('.display-output .display-label')).toHaveText('定積分（近似値）');
      await enter(input, '\\int_0^1\\frac{1}{x-0.3}\\,\\mathrm{d}x');
      await decision.click();
      await expect(calc.getByRole('alert')).toContainText(/定義|収束/);
      expect(external).toEqual([]);
    });
  });
}
