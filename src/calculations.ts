import nerdamer from 'nerdamer';
import { bignumber, evaluate, format, isComplex } from 'mathjs';
import { notation, numericFunction, parse, realValue, restoreSymbolGlyphs, unwrap, variableName, variablesIn } from './expressions';
import type { Expression } from './expressions';
import { numberLatex } from './numberFormat';
import { integrateNumerically } from './quadrature';
import type { Angle, Calculation, CasOperation, Requests } from './model';

type Scalar = Extract<ReturnType<typeof nerdamer>, { numerator: unknown }>;

export function scalar(source: string): Scalar {
  const value = nerdamer(source);
  if (!('numerator' in value)) throw new Error('単一の数式を入力してください。');
  return value;
}

function plainDecimal(value: string) {
  const [mantissa, exponent] = value.split(/e/i);
  return exponent ? mantissa + '\\times 10^{' + Number(exponent) + '}' : mantissa;
}

export function approximateLatex(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return numberLatex(value);
  if (isComplex(value) && Number.isFinite(value.re) && Number.isFinite(value.im)) {
    if (!value.im) return numberLatex(value.re);
    const magnitude = Math.abs(value.im) === 1 ? '' : numberLatex(Math.abs(value.im));
    const imaginary = magnitude + '\\mathrm{i}';
    if (!value.re) return (value.im < 0 ? '-' : '') + imaginary;
    return numberLatex(value.re) + (value.im < 0 ? '-' : '+') + imaginary;
  }
  return undefined;
}

function polarLatex(real: number, imaginary: number, angle: Angle) {
  const unit = angle === 'DEG' ? '\\,^{\\circ}' : angle === 'GRAD' ? '\\,\\mathrm{grad}' : '\\,\\mathrm{rad}';
  const arg = Math.atan2(imaginary, real) * (angle === 'DEG' ? 180 / Math.PI : angle === 'GRAD' ? 200 / Math.PI : 1);
  return numberLatex(Math.hypot(real, imaginary)) + '\\,\\angle\\,' + numberLatex(arg) + unit;
}

export function calculate({ input, angle, ans }: Requests['calculate'], expression = parse(input)): Calculation {
  const source = notation(expression, { angle, ans });
  try {
    const result = scalar(source);
    if (result.variables().length) throw new Error('数値として評価できない式です。');
    return formatResult(result, angle);
  } catch (error) {
    if (error instanceof Error && /division by zero|undefined|factorial|infinity/i.test(error.message)) {
      throw new Error('この値では演算を定義できません。入力と定義域を確認してください。');
    }
    throw error;
  }
}

export function formatResult(value: ReturnType<typeof scalar>, angle: Angle = 'RAD'): Calculation {
  let answer = value.text();
  const exact = restoreSymbolGlyphs(value.latex());
  if (!exact || /^(NaN|undefined|[-+]?Infinity)$/i.test(answer)) throw new Error('有限の結果を求められません。');
  let mixed: string | undefined;
  let decimal: string | undefined;
  let polar: string | undefined;
  if (value.isNumber()) {
    const numerator = value.numerator().text();
    const denominator = value.denominator().text();
    if (/^-?\d+$/.test(numerator) && /^[1-9]\d*$/.test(denominator)) {
      answer = denominator === '1' ? numerator : numerator + '/' + denominator;
      const signed = BigInt(numerator);
      const absolute = signed < 0n ? -signed : signed;
      const divisor = BigInt(denominator);
      const quotient = absolute / divisor;
      const remainder = absolute % divisor;
      if (quotient && remainder) {
        mixed = (signed < 0n ? '-' : '') + quotient + '\\frac{' + remainder + '}{' + divisor + '}';
      }
      decimal = divisor === 1n ? numerator : plainDecimal(format(bignumber(numerator).div(denominator), 14));
    }
  }
  if (!value.variables().length) try {
    const evaluated: unknown = evaluate(answer);
    decimal ??= approximateLatex(evaluated);
    if (isComplex(evaluated) && Number.isFinite(evaluated.re) && Number.isFinite(evaluated.im)) {
      polar = polarLatex(evaluated.re, evaluated.im, angle);
    }
  } catch {
    // Free variables and unsupported numeric special functions keep their exact form.
  }
  return { exact, decimal, mixed, polar, answer, approximate: false };
}

export function symbolic(expression: Expression, operation: CasOperation,
  options: { variable?: string; bounds?: [Expression, Expression]; ans?: string; onlyFastAntiderivatives?: boolean } = {}): Calculation {
  const { variable, bounds, ans, onlyFastAntiderivatives } = options;
  const source = notation(expression, { variables: variablesIn(expression), ans });
  const value = scalar(source);
  if (operation === 'simplify') return formatResult(value.simplify());
  if (operation === 'expand') return formatResult(value.expand());
  if (operation === 'factor') return formatResult(nerdamer.factor(value));
  const v = variableName(variable ?? '');
  if (operation === 'differentiate') return formatResult(nerdamer.diff(value, v));
  const fastAntiderivative = simpleNumericIntegrand(expression);

  if (operation === 'integrate') {
    const integral = !onlyFastAntiderivatives || fastAntiderivative ? antiderivative(value, v) : undefined;
    if (!integral) throw new Error('この式の原始関数を記号的に求められませんでした。');
    const result = formatResult(integral);
    const used = new Set([...value.variables(), ...integral.variables(), v]);
    let constant = 'C';
    for (let i = 1; used.has(constant); i++) constant = 'C_' + i;
    return { ...result, exact: result.exact + '+' + scalar(constant).latex(),
      answer: '(' + result.answer + ')+' + constant, decimal: undefined };
  }

  if (!bounds) throw new Error('積分の下限と上限を入力してください。');
  const [lower, upper] = bounds;
  const answerVariables = () => scalar(ans ?? '0').variables();
  const boundVariables = [...variablesIn(lower, answerVariables), ...variablesIn(upper, answerVariables)];
  if (!boundVariables.length) {
    const substituted = tangentRootIntegral(expression, v, bounds, ans);
    if (substituted) return substituted;
  }
  const parameters = [...value.variables().filter(name => name !== v), ...boundVariables];
  if (parameters.length) {
    const integral = !onlyFastAntiderivatives || fastAntiderivative ? antiderivative(value, v) : undefined;
    if (!integral) throw new Error('この式は記号的に積分できませんでした。');
    return { ...formatResult(integralDifference(integral, v, lower, upper, ans)),
      note: '被積分関数が積分区間で定義される場合の結果' };
  }
  const a = realValue(lower, { ans });
  const b = realValue(upper, { ans });
  const evaluateAt = numericFunction(expression, [v], { ans });
  const estimate = integrateNumerically(x => evaluateAt({ [v]: x }), a, b);
  if (fastAntiderivative) {
    try {
      const integral = antiderivative(value, v);
      if (integral) {
        const exact = integralDifference(integral, v, lower, upper, ans);
        if (matchesEstimate(exact, estimate)) return formatResult(exact);
      }
    } catch {
      // The estimate is independently validated by converging quadrature.
    }
  }
  const latex = numberLatex(estimate);
  return { exact: latex, decimal: latex, approximate: true, answer: String(estimate) };
}

function matchesEstimate(value: Scalar, estimate: number) {
  const numeric = evaluate(value.text());
  return typeof numeric === 'number' && Math.abs(numeric - estimate) <= 1e-10 * Math.max(1, Math.abs(estimate));
}

function tangentRootArgument(expression: Expression): Expression | undefined {
  const value = unwrap(expression);
  if (!Array.isArray(value)) return;
  const [operator, radicand, exponent] = value;
  if (operator !== 'Sqrt') {
    const half = Array.isArray(exponent) && ['Divide', 'Rational'].includes(String(exponent[0])) && exponent[1] === 1 && exponent[2] === 2;
    if (operator !== 'Power' || (exponent !== 0.5 && !half)) return;
  }
  const inner = unwrap(radicand);
  if (Array.isArray(inner) && inner[0] === 'Tan' && inner.length === 2) return inner[1];
}

function tangentRootIntegral(expression: Expression, variable: string, bounds: [Expression, Expression], ans?: string) {
  const body = unwrap(expression);
  const factors = Array.isArray(body) && (body[0] === 'Multiply' || body[0] === 'InvisibleOperator')
    ? body.slice(1) : Array.isArray(body) && body[0] === 'Negate' ? [-1, body[1]] : [body];
  const index = factors.findIndex(factor => tangentRootArgument(factor) !== undefined);
  if (index === -1) return;

  try {
    const source = (value: Expression) => notation(value, { variables: variablesIn(value), ans });
    const angle = scalar(source(tangentRootArgument(factors[index])!));
    const rate = nerdamer.diff(angle, variable).simplify();
    if (rate.isZero() || rate.variables().length || angle.variables().some(name => name !== variable)) return;
    const intercept = scalar('(' + angle.text() + ')-(' + rate.text() + ')*' + variable).expand().simplify();
    if (intercept.variables().length) return;
    const multiplier = scalar(factors.filter((_, i) => i !== index).map(factor => '(' + source(factor) + ')').join('*') || '1');
    if (multiplier.variables().includes(variable)) return;

    const [a, b] = bounds.map(bound => angle.sub(variable, source(bound)).simplify());
    const u = evaluate(a.text());
    const v = evaluate(b.text());
    if (typeof u !== 'number' || typeof v !== 'number' || !Number.isFinite(u) || !Number.isFinite(v)) return;
    if (a.text() === b.text()) return formatResult(scalar('0'));
    const min = Math.min(u, v);
    const max = Math.max(u, v);
    const period = Math.floor((min + (max - min) / 2) / Math.PI);
    const start = period * Math.PI;
    const tolerance = 8 * Number.EPSILON * Math.max(1, Math.abs(start), Math.abs(max));
    if (min < start - tolerance || max >= start + Math.PI / 2 - tolerance) return;

    // t = sqrt(tan(u)) turns sqrt(tan(u)) du into 2 t²/(1 + t⁴) dt.
    const endpoints = [a, b].map(bound => scalar('tan((' + bound.text() + ')-(' + period + ')*pi)').simplify());
    const [first, last] = endpoints.map(tSquared => evaluate(tSquared.text()));
    if (typeof first !== 'number' || typeof last !== 'number' || first < 0 || last < 0) return;
    const [lo, hi] = endpoints.map(tangentRootPrimitive);
    const reduced = scalar('(' + hi.text() + ')-(' + lo.text() + ')');
    const estimate = integrateNumerically(t => 2 * t * t / (1 + t ** 4), Math.sqrt(first), Math.sqrt(last));
    if (!matchesEstimate(reduced, estimate)) return;
    return formatResult(scalar('(' + reduced.text() + ')*(' + multiplier.text() + ')/(' + rate.text() + ')'));
  } catch {
    // Keep the regular CAS and quadrature paths available if substitution cannot be certified.
  }
}

function tangentRootPrimitive(tSquared: Scalar): Scalar {
  if (tSquared.isZero()) return scalar('0');
  const s = '(' + tSquared.text() + ')';
  const t = 'sqrt(' + s + ')';
  const logArgument = scalar('(' + s + '+1-sqrt(2)*' + t + ')/sqrt(' + s + '^2+1)').expand().simplify();
  return scalar('(pi/2+atan((' + s + '-1)/(sqrt(2)*' + t + '))+log(' + logArgument.text() + '))/sqrt(2)');
}

function integralDifference(integral: Scalar, variable: string, lower: Expression, upper: Expression, ans?: string) {
  const bound = (value: Expression) => notation(value, { variables: variablesIn(value), ans });
  return scalar('(' + integral.sub(variable, bound(upper)).text() +
    ')-(' + integral.sub(variable, bound(lower)).text() + ')').simplify();
}

function antiderivative(value: Scalar, variable: string): Scalar | undefined {
  try {
    const candidate = nerdamer.integrate(value, variable);
    if (candidate.text().includes('integrate(')) return undefined;
    const actual = nerdamer.diff(candidate, variable);
    if (scalar('(' + actual.text() + ')-(' + value.text() + ')').simplify().isZero()) return candidate;
    if (actual.isZero()) return undefined;
    // Correct an independent coefficient only when differentiating verifies the result.
    const scale = scalar('(' + value.text() + ')/(' + actual.text() + ')').simplify();
    if (scale.variables().includes(variable)) return undefined;
    const corrected = scalar('(' + scale.text() + ')*(' + candidate.text() + ')');
    const check = nerdamer.diff(corrected, variable);
    if (scalar('(' + check.text() + ')-(' + value.text() + ')').simplify().isZero()) return corrected;
  } catch {
    // Unsupported expressions can still be integrated numerically when all parameters are known.
  }
  return undefined;
}

const nonAlgebraic = new Set(['Sin', 'Cos', 'Tan', 'Exp', 'Ln', 'Log', 'Lg', 'Lb', 'Sinh', 'Cosh', 'Tanh',
  'Arcsin', 'Arccos', 'Arctan', 'Abs', 'Sqrt', 'Root']);

function simpleNumericIntegrand(expression: Expression) {
  let count = 0;
  function visit(node: Expression, insideFunction = false): boolean {
    if (++count > 35) return false;
    if (!Array.isArray(node)) return true;
    const [head, ...args] = node;
    const functionCall = typeof head === 'string' && nonAlgebraic.has(head);
    if (insideFunction && (functionCall || head === 'Power')) return false;
    return args.every(arg => visit(arg, insideFunction || functionCall));
  }
  return visit(expression);
}
