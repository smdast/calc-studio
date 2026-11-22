import { describe, expect, test } from 'vitest';
import { calculate } from '../src/calculations';
import { evaluateFormula } from '../src/evaluateFormula';
import { parse } from '../src/expressions';
import { derivative, historyFormula, integral, namedFormula } from '../src/formulaTemplates';
import { equation, matrix, system } from '../src/solvers';
import { graph } from '../src/graph';
import type { Angle, Requests } from '../src/model';

const calc = (input: string, angle: Angle = 'DEG', ans = '0') => calculate({ input, angle, ans });
const auto = (input: string, angle: Angle = 'RAD') => evaluateFormula({ input, angle, ans: '0' });
const graphDefaults: Requests['graph'] = {
  type: 'cartesian', first: 'x^2-1', second: '', x: [-6, 6], y: [-4, 4], parameter: [0, Math.PI * 2],
};

describe('scientific calculations', () => {
  test('retains large integers along with exact, decimal and mixed fractions', () => {
    expect(calc('\\frac{1}{3}+\\frac{1}{6}')).toMatchObject({ answer: '1/2', decimal: '0.5' });
    expect(calc('\\frac{7}{3}').mixed).toBe('2\\frac{1}{3}');
    expect(calc('2^{100}').answer).toBe('1267650600228229401496703205376');
    expect(calc('12345678901234567890+1').answer).toBe('12345678901234567891');
    expect(calc('0.1+0.2').exact).toBe('\\frac{3}{10}');
  });

  test('respects angle settings and explicit degrees, including inverse trig', () => {
    expect(calc('\\sin(30)').answer).toBe('1/2');
    expect(calc('\\sin(30^\\circ)', 'RAD').answer).toBe('1/2');
    expect(calc('\\sin(100)', 'GRAD').answer).toBe('1');
    expect(calc('\\cos(\\pi)', 'RAD').answer).toBe('-1');
    expect(calc('\\arcsin(1)').answer).toBe('90');
  });

  test('supports complex and polar notation, combinatorics and Ans', () => {
    expect(calc('\\sqrt{-1}')).toMatchObject({ answer: 'i', polar: '1\\,\\angle\\,90\\,^{\\circ}' });
    expect(calc('\\operatorname{nCr}(6,2)').answer).toBe('15');
    expect(calc('\\operatorname{nPr}(6,2)').answer).toBe('30');
    expect(calc('\\operatorname{gcd}(24,18)').answer).toBe('6');
    expect(calc('\\operatorname{lcm}(6,8)').answer).toBe('24');
    expect(calc('\\operatorname{factor}(84)').exact).toContain('2^{2}');
    expect(calc('\\log(1000)+5!').answer).toBe('123');
    expect(calc('25\\%\\times8').answer).toBe('2');
    expect(calc('\\mathrm{Ans}+1', 'DEG', '1/2').answer).toBe('3/2');
  });

  test('reports incomplete formulas and undefined arithmetic', () => {
    expect(() => calc('\\frac{1}{}')).toThrow(/途中|空欄/);
    expect(() => calc('1/0')).toThrow(/定義/);
    expect(() => calc('\\tan(90)')).toThrow(/定義/);
  });
});

describe('CAS and equation solving', () => {
  test('simplifies, expands, differentiates and integrates', () => {
    expect(auto('\\frac{x+x}{2}')).toMatchObject({ answer: 'x', operation: 'simplify' });
    expect(auto(namedFormula('simplify', '2x+3x')).answer).toBe('5*x');
    expect(auto(namedFormula('expand', '(x+1)^3')).exact).toContain('x^{3}');
    expect(auto(namedFormula('factor', 'x^2-1')).exact).toContain('\\left');
    expect(auto(derivative('x', '\\sin(x^2)'), 'DEG').answer).toBe('2*x*cos(x^2)');
    expect(auto(integral('x', 'x^2'))).toMatchObject({ exact: expect.stringContaining('+C'), operation: 'integrate' });
    expect(auto(integral('x', 'x^2', ['0', '1']))).toMatchObject({ answer: '1/3', approximate: false, operation: 'definite' });
    expect(() => auto(integral('x', '1/x', ['-1', '1']))).toThrow(/定義/);
  });

  test('reports exact complex and approximate higher-degree roots', () => {
    expect(auto('x^2+1=0')).toMatchObject({ operation: 'equation', exact: 'x_{1}=i\\qquad x_{2}=-i' });
    const fifthDegree = equation(parse('x^5=2'), 'x');
    expect(fifthDegree.values).toHaveLength(5);
    expect(fifthDegree.approximate).toBe(true);
  });

  test('handles interval search, touching roots, no solution and identities', () => {
    expect(auto('\\cos(x)=x')).toMatchObject({ approximate: true, exact: 'x\\approx 0.739085133215', note: expect.stringContaining('-10') });
    expect(auto(namedFormula('solve', '\\cos(x)=x', '0', '1')).note).toContain('0 ～ 1');
    expect(Number(auto(namedFormula('solve', '(t-0.321)^2=0', '0', '1')).exact.split(' ').at(-1))).toBeCloseTo(0.321, 10);
    expect(auto('1/x=0').exact).toContain('解は見つかりませんでした');
    expect(auto('\\sin(x)=1', 'DEG').exact).toContain('解は見つかりませんでした');
    expect(auto(namedFormula('solve', '\\sin(x)=1', '80', '100'), 'DEG').exact).toContain('90');
    expect(() => auto('x=x')).toThrow(/不定/);
    expect(auto('x+y=2').exact).toMatch(/^x=.*y/);
  });

  test('keeps symbolic coefficients, bounds and variables in exact answers', () => {
    expect(auto('2A+3A+\\alpha+\\alpha').exact).toContain('\\alpha');
    expect(auto('(a_1+a_1)x').exact).toContain('a_{1}');
    expect(auto(derivative('x', 'Ax^2+Bx+C')).exact).toMatch(/A.*x|x.*A/);
    expect(auto(derivative('\\theta', 'a\\theta^2')).exact).toContain('\\theta');
    expect(auto(integral('x', 'x^2', ['0', 'a'])).exact).toBe('\\frac{a^{3}}{3}');
    expect(auto(integral('x', '1/(a*x)')).exact).toBe('\\frac{\\ln\\left(x\\right)}{a}+C');
    expect(auto('ax+b=0')).toMatchObject({ exact: 'x=-\\frac{b}{a}', approximate: false, condition: 'a\\ne 0' });
    expect(auto('ax^2+bx+c=0').exact).toContain('\\sqrt{b^{2}-4');
    expect(auto(namedFormula('solve', 'AB=D', 'B')).exact).toBe('B=\\frac{D}{A}');
    expect(() => auto('a=b')).toThrow(/解く文字/);
    expect(evaluateFormula({ input: '2\\mathrm{Ans}', angle: 'RAD', ans: '5*a' }).exact).toMatch(/^10.*a$/);
  });

  test('rationalizes tangent-root integrals and retains exact answers at finite endpoints', () => {
    const upper = '\\frac{\\pi}{4}';
    const radical = '\\sqrt{\\tan(x)}';
    const result = auto(integral('x', radical, ['0', upper]));
    const reference = Math.PI / (2 * Math.SQRT2) - Math.log(1 + Math.SQRT2) / Math.SQRT2;
    expect(result.approximate).toBe(false);
    expect(result.exact).toContain('\\ln\\left(\\sqrt{2}-1\\right)');
    expect(result.exact).toContain('\\pi');
    expect(Number(result.decimal)).toBeCloseTo(reference, 11);
    expect(auto('$$ \\int_0^{\\frac{\\pi}{4}}\\left(\\sqrt{\\tan\\left(x\\right)}\\right)\\\\,\\mathrm{d}x $$').exact).toBe(result.exact);
    expect(Number(auto(integral('x', radical, [upper, '0'])).decimal)).toBeCloseTo(-reference, 11);
    const shifted = auto(integral('x', '\\tan(x)^{1/2}', ['\\pi', '\\frac{5\\pi}{4}']));
    expect(shifted).toMatchObject({ exact: result.exact, approximate: false });
    const affine = auto(integral('x', '\\sqrt{\\tan(2x)}', ['0', '\\frac{\\pi}{8}']));
    expect(affine.approximate).toBe(false);
    expect(Number(affine.decimal)).toBeCloseTo(reference / 2, 11);
    const multiplied = auto(integral('x', 'a' + radical, ['0', upper]));
    expect(multiplied.approximate).toBe(false);
    expect(multiplied.exact).toContain('a');
    const otherBounds = auto(integral('x', radical, ['\\frac{\\pi}{12}', '\\frac{\\pi}{6}']));
    expect(otherBounds.approximate).toBe(false);
    expect(otherBounds.exact).toContain('\\arctan');
  });

  test('keeps the numerical fallback and rejects divergent integrals', () => {
    const result = auto(integral('x', '\\sqrt{\\sin(x)}', ['0', '\\frac{\\pi}{4}']));
    expect(result.approximate).toBe(true);
    expect(Number(result.decimal)).toBeGreaterThan(0);
    expect(() => auto(integral('x', '1/(x-0.3)', ['0', '1']))).toThrow(/定義|収束/);
  });

  test('restores expressions from the previous operation-based history', () => {
    const saved = {
      id: 'legacy', input: 't^2', angle: 'DEG', previousAnswer: '0', answer: '1/3', exact: '\\frac{1}{3}', approximate: false,
      settings: { operation: 'definite', variable: 't', lower: '0', upper: '1', systemRows: [] },
    } as const;
    expect(auto(historyFormula({ ...saved, settings: { ...saved.settings, systemRows: [] } })).answer).toBe('1/3');
  });

  test('solves linear systems and classifies inconsistent and dependent rows', () => {
    const a = [['1', '1'], ['1', '-1']];
    expect(system({ a, b: ['5', '1'] }).values).toEqual(['3', '2']);
    expect(() => system({ a: [['1', '1'], ['2', '2']], b: ['1', '3'] })).toThrow(/解なし/);
    expect(() => system({ a: [['1', '1'], ['2', '2']], b: ['1', '2'] })).toThrow(/不定/);
  });
});

describe('linear algebra and plots', () => {
  test('keeps parameters in a symbolic linear system and matrix operations', () => {
    const solutions = system({ a: [['a', '0'], ['0', 'b']], b: ['c', 'd'] });
    expect(solutions).toMatchObject({ approximate: false, values: ['\\frac{c}{a}', '\\frac{d}{b}'] });
    expect(solutions.condition).toContain('\\ne 0');
    expect(matrix({ operation: 'det', a: [['a', 'b'], ['c', 'd']], b: [] }).latex).toMatch(/a.*d.*b.*c/);
    expect(matrix({ operation: 'inv', a: [['a']], b: [] })).toMatchObject({ condition: 'a\\ne 0', latex: expect.stringContaining('\\frac{1}{a}') });
    expect(matrix({ operation: 'multiply', a: [['a', '0'], ['0', 'b']], b: [['b', '0'], ['0', 'a']] }).latex)
      .toContain('a \\cdot b');
    expect(matrix({ operation: 'cross', a: [['a', '0', '0']], b: [['0', 'b', '0']] }).latex).toContain('a \\cdot b');
  });

  test('computes inverse matrices, inner products and cross products', () => {
    expect(matrix({ operation: 'inv', a: [['2', '1'], ['1', '1']], b: [] }).latex)
      .toBe('\\begin{bmatrix}1&-1\\\\-1&2\\end{bmatrix}');
    expect(matrix({ operation: 'dot', a: [['1', '2']], b: [['3', '4']] }).latex).toBe('11');
    expect(matrix({ operation: 'cross', a: [['1', '0', '0']], b: [['0', '1', '0']] }).latex)
      .toBe('\\begin{bmatrix}0\\\\0\\\\1\\end{bmatrix}');
    expect(() => matrix({ operation: 'inv', a: [['1', '2'], ['2', '4']], b: [] })).toThrow(/特異行列/);
  });

  test('draws four types, keeps asymptotes separated and evaluates a tangent', () => {
    const parabola = graph({ ...graphDefaults, probe: 1 });
    expect(parabola.roots![0]).toBeCloseTo(-1, 9);
    expect(parabola.roots![1]).toBeCloseTo(1, 9);
    expect(parabola.extrema).toEqual([{ x: 0, y: -1, kind: 'min' }]);
    expect(parabola.slope).toBeCloseTo(2, 8);
    const asymptote = graph({ ...graphDefaults, x: [-4.9, 5], first: '1/x' }).series!;
    const cross = asymptote.x.findIndex(x => x !== null && x > 0);
    expect(asymptote.y[cross - 1]).toBeNull();
    expect(graph({ ...graphDefaults, type: 'polar', first: '2\\cos(3\\theta)' }).series?.y.length).toBeGreaterThan(800);
    expect(graph({ ...graphDefaults, type: 'parametric', first: '\\cos(t)', second: '\\sin(t)' }).series?.x[0]).toBe(1);
    expect(graph({ ...graphDefaults, type: 'implicit', first: 'x^2+y^2=9' }).contour?.z[70][70]).toBe(-9);
  });
});
