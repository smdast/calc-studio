import { ComputeEngine } from '@cortex-js/compute-engine';
import { compile, isComplex } from 'mathjs';
import { normalizeFormulaLatex } from './formulaTemplates';
import type { Angle } from './model';

const engine = new ComputeEngine({ precision: 80 });
export type Expression = string | number | { num?: string; sym?: string; fn?: Expression[] } | Expression[];
const constants: Record<string, string> = { Pi: 'pi', e: 'e', ExponentialE: 'e', i: 'i', ImaginaryUnit: 'i' };
const symbolAliases: Record<string, string> = { GoldenRatio: 'varphi', epsilonSymbol: 'varepsilon' };
const greek = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta', 'iota', 'kappa',
  'varkappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'rho', 'varrho', 'sigma', 'varsigma', 'tau', 'upsilon', 'phi',
  'varphi', 'chi', 'psi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',
]);
const trig: Record<string, string> = { Sin: 'sin', Cos: 'cos', Tan: 'tan', Sec: 'sec', Csc: 'csc', Cot: 'cot' };
const inverse: Record<string, string> = { Arcsin: 'asin', Arccos: 'acos', Arctan: 'atan' };
const functions: Record<string, string> = {
  Abs: 'abs', Sqrt: 'sqrt', Exp: 'exp', Ln: 'log', Lg: 'log10', Floor: 'floor', Ceil: 'ceil',
  Round: 'round', Sinh: 'sinh', Cosh: 'cosh', Tanh: 'tanh', GCD: 'gcd', LCM: 'lcm', Mod: 'mod',
  Factorial: 'factorial',
};

export function parse(input: string): Expression {
  if (!input.trim()) throw new Error('数式を入力してください。');
  if (input.length > 4000) throw new Error('数式が長すぎます。');
  const e = engine.parse(normalizeFormulaLatex(input), { form: 'raw' });
  if (!e.isValid) throw new Error('数式が途中か、構文に誤りがあります。');
  return e.json as Expression;
}

export function splitEquation(expression: Expression): [Expression, Expression] {
  if (Array.isArray(expression) && expression[0] === 'Equal' && expression.length === 3) {
    return [expression[1], expression[2]];
  }
  return [expression, 0];
}

export function unwrap(expression: Expression): Expression {
  while (Array.isArray(expression) && expression[0] === 'Delimiter' && expression.length >= 2) {
    expression = expression[1];
  }
  return expression;
}

export function variablesIn(expression: Expression, resolveAnswer?: () => string[]): string[] {
  const variables = new Set<string>();
  const pending = [expression];
  while (pending.length) {
    const node = pending.pop();
    if (typeof node === 'string') {
      if (node === 'Ans' && resolveAnswer) {
        resolveAnswer().forEach(name => variables.add(name));
        continue;
      }
      const name = symbolicName(node);
      if (name) variables.add(name);
    } else if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 1; i--) pending.push(node[i]);
    } else if (node && typeof node === 'object' && node.sym) {
      pending.push(node.sym);
    } else if (node && typeof node === 'object' && node.fn) {
      pending.push(node.fn);
    }
  }
  return [...variables];
}

interface Options {
  variables?: string[];
  angle?: Angle;
  ans?: string;
  numeric?: boolean;
}

export function notation(expression: Expression, { variables = [], angle = 'RAD', ans, numeric = false }: Options = {}): string {
  const angleFactor = angle === 'DEG' ? '(pi/180)' : angle === 'GRAD' ? '(pi/200)' : '1';
  let count = 0;

  function format(value: Expression, depth = 0): string {
    if (++count > 500 || depth > 60) throw new Error('数式が複雑すぎます。');
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('有限の値を入力してください。');
      return ordinaryNumber(String(value));
    }
    if (typeof value === 'string') {
      if (value === 'Nothing') throw new Error('数式の空欄を埋めてください。');
      if (value === 'Ans' && ans !== undefined) return '(' + ans + ')';
      if (value === 'e_upright') return 'e';
      if (value === 'i_upright') return 'i';
      if (Object.hasOwn(constants, value)) return constants[value];
      const name = symbolicName(value);
      if (name && variables.includes(name)) return name;
      throw new Error('このモードで使用できない記号です。 ' + value);
    }
    if (!Array.isArray(value)) {
      if (value.num && /^[+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value.num)) return ordinaryNumber(value.num);
      if (value.sym) return format(value.sym, depth + 1);
      if (value.fn) return format(value.fn, depth + 1);
      throw new Error('有限の値を入力してください。');
    }

    const [operator, ...args] = value;
    if (typeof operator !== 'string') throw new Error('この演算には対応していません。');
    if (operator === 'Delimiter' && args.length === 1) return '(' + format(args[0], depth + 1) + ')';
    if (operator === 'InvisibleOperator' && args[0] === 'factor' && args.length === 2 && !numeric) {
      return 'factor(' + format(args[1], depth + 1) + ')';
    }
    const parts = args.map(item => format(item, depth + 1));
    const [a, b] = parts;
    const infix = { Add: '+', Subtract: '-', Multiply: '*', InvisibleOperator: '*', Divide: '/', Rational: '/', Power: '^' };
    if (Object.hasOwn(infix, operator) && parts.length >= 2) {
      return '(' + parts.map(part => '(' + part + ')').join(infix[operator as keyof typeof infix]) + ')';
    }
    if (operator === 'Negate' && parts.length === 1) return '(-(' + a + '))';
    if (operator === 'Square' && parts.length === 1) return '((' + a + ')^2)';
    if (operator === 'Root' && parts.length === 2) return (numeric ? 'nthRoot(' + a + ',' + b : '(' + a + ')^(1/(' + b + ')') + ')';
    if (operator === 'Degrees' && parts.length === 1) return '((' + a + ')*pi/180)';
    if (Object.hasOwn(trig, operator) && parts.length === 1) {
      const isDegrees = Array.isArray(args[0]) && args[0][0] === 'Degrees';
      return trig[operator] + '((' + a + ')*' + (isDegrees ? '1' : angleFactor) + ')';
    }
    if (Object.hasOwn(inverse, operator) && parts.length === 1) {
      return '(' + inverse[operator] + '(' + a + ')/' + angleFactor + ')';
    }
    if (operator === 'Log' && parts.length >= 1 && parts.length <= 2) return 'log(' + a + ',' + (b ?? '10') + ')';
    if (operator === 'Lb' && parts.length === 1) return 'log(' + a + ',2)';
    if (operator === 'Choose' && parts.length === 2) {
      return numeric ? 'combinations(' + a + ',' + b + ')' : '(factorial(' + a + ')/(factorial(' + b + ')*factorial((' + a + ')-(' + b + '))))';
    }
    if (Object.hasOwn(functions, operator)) {
      const binary = operator === 'GCD' || operator === 'LCM' || operator === 'Mod';
      if (parts.length === (binary ? 2 : 1)) {
        return functions[operator] + '(' + parts.join(',') + ')';
      }
    }
    throw new Error('この演算には対応していません。 ' + operator);
  }

  return format(expression);
}

function ordinaryNumber(value: string): string {
  if (!/e/i.test(value)) return value;
  const [coefficient, exponent] = value.toLowerCase().split('e');
  return '(' + coefficient + '*10^(' + exponent + '))';
}

export function numericFunction(expression: Expression, variables: string[] = [], options: Pick<Options, 'angle' | 'ans'> = {}) {
  const node = compile(notation(expression, { ...options, variables, numeric: true }));
  return (scope: Record<string, number> = {}) => {
    try {
      const result: unknown = node.evaluate(scope);
      const real = isComplex(result) ? (Math.abs(result.im) < 1e-12 ? result.re : NaN) : result;
      return typeof real === 'number' && Number.isFinite(real) ? real : NaN;
    } catch {
      return NaN;
    }
  };
}

export function realValue(expression: Expression, options?: Pick<Options, 'angle' | 'ans'>): number {
  const value = numericFunction(expression, [], options)();
  if (!Number.isFinite(value)) throw new Error('有限の実数を入力してください。');
  return value;
}

export function variableName(value: string): string {
  const name = symbolicName(value);
  if (!name) throw new Error('変数には x や t などの文字を入力してください。');
  return name;
}

function symbolicName(value: string) {
  const name = (Object.hasOwn(symbolAliases, value) ? symbolAliases[value] : value).replace(/_upright(?=_|$)/g, '');
  if (Object.hasOwn(constants, name) || !/^[A-Za-z]+(?:_[A-Za-z0-9]+)*$/.test(name)) return undefined;
  const base = name.split('_')[0];
  return /^[A-Za-z]$/.test(base) || greek.has(base) ? name : undefined;
}

export function restoreSymbolGlyphs(latex: string) {
  return latex.replaceAll('\\mathrm{log}', '\\ln')
    .replace(/(^|[^\\a-zA-Z])(varepsilon|vartheta|varkappa|varrho|varsigma|varphi|omicron)(?![a-zA-Z])/g,
      (_, prefix: string, name: string) => prefix + '\\' + name);
}
