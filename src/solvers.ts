import nerdamer from 'nerdamer';
import { add, subtract, multiply, transpose, det, inv, norm, dot, cross, lusolve, evaluate } from 'mathjs';
import { approximateLatex, scalar } from './calculations';
import { notation, numericFunction, parse, realValue, restoreSymbolGlyphs, splitEquation, variableName, variablesIn } from './expressions';
import type { Expression } from './expressions';
import { numberLatex } from './numberFormat';
import { symbolicMatrix, symbolicSystem } from './symbolicLinearAlgebra';
import type { Angle, Range, Requests, Responses } from './model';

interface EquationResult {
  values: string[];
  approximate: boolean;
  range?: Range;
  condition?: string;
  allWhen?: string;
}

export function equation(expression: Expression, variable: string,
  options: { interval?: [Expression, Expression]; angle?: Angle; ans?: string } = {}): EquationResult {
  const v = variableName(variable);
  const { interval, angle, ans } = options;
  const [left, right] = splitEquation(expression);
  const difference = ['Subtract', left, right];
  const variables = variablesIn(difference);
  const source = notation(difference, { variables, angle, ans });
  const value = scalar(source);
  if (value.text() === '0') throw new Error('不定です。すべての値が式を満たします。');
  const parameters = value.variables().filter(name => name !== v);
  if (!value.variables().includes(v)) {
    return { values: [], approximate: false, allWhen: parameters.length ? restoreSymbolGlyphs(value.latex()) + '=0' : undefined };
  }
  if (interval && parameters.length) throw new Error('区間探索には数値が必要です。文字定数を残す場合は区間指定を外してください。');

  let coefficients: ReturnType<typeof nerdamer>[] = [];
  try {
    const result = nerdamer.coeffs(value, v);
    coefficients = result.elements;
  } catch {
    // Coefficient extraction fails for non-polynomial expressions.
  }
  const polynomial = coefficients.length > 1 &&
    coefficients.every(coefficient => !coefficient.variables().includes(v)) &&
    nerdamer('(' + source + ')-(' + coefficients.map((c, k) => '(' + c.text() + ')*' + v + '^' + k).join('+') + ')').expand().text() === '0';
  if ((polynomial || parameters.length) && !interval) {
    if (coefficients.length > 33) throw new Error('多項式は32次まで計算できます。');
    const solution = nerdamer.solve(value, v);
    if (solution.partial || !solution.elements.length) {
      throw new Error(parameters.length
        ? 'この式の解を文字定数のまま求められませんでした。'
        : '多項式の解を求める計算が収束しませんでした。');
    }
    const approximate = solution.solutionsType === 'numeric' || solution.solutionsType === 'mixed';
    const values = solution.elements.map(root => {
      if (!approximate || root.variables().length) return restoreSymbolGlyphs(root.latex());
      const latex = approximateLatex(evaluate(root.text()));
      if (!latex) throw new Error('多項式の解を表示できませんでした。');
      return latex;
    });
    const leading = polynomial ? scalar(coefficients.at(-1)!.text()) : undefined;
    const denominator = value.denominator();
    const conditions = new Set<string>();
    const nonzero = (term: typeof value) => {
      const simplified = term.simplify();
      if (simplified.variables().some(name => parameters.includes(name))) {
        conditions.add(restoreSymbolGlyphs(simplified.latex()) + '\\ne 0');
      }
    };
    if (leading) nonzero(leading);
    if (parameters.length && !denominator.isOne()) {
      solution.elements.forEach(root => nonzero(denominator.sub(v, root.text())));
    }
    if (!polynomial && parameters.length) solution.elements.forEach(root => nonzero(root.denominator()));
    return { values, approximate, condition: conditions.size ? [...conditions].join(',\\; ') : undefined };
  }

  const range: Range = interval
    ? [realValue(interval[0], { angle, ans }), realValue(interval[1], { angle, ans })]
    : [-10, 10];
  assertRange(range);
  const evaluator = numericFunction(difference, [v], { angle, ans });
  const roots = searchRoots(x => evaluator({ [v]: x }), range);
  if (!roots.validCount) throw new Error('指定区間内で関数を評価できませんでした。');
  if (!roots.values.length && roots.unresolved) throw new Error('指定区間で試した数値計算は収束しませんでした。');
  return { values: roots.values.map(numberLatex), approximate: true, range };
}

export function assertRange([min, max]: Range) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(max - min) || min >= max) {
    throw new Error('範囲は最小値より大きい最大値を指定してください。');
  }
}

export function searchRoots(f: (x: number) => number, range: Range, samples = 800) {
  const [min, max] = range;
  const step = (max - min) / samples;
  const x = Array.from({ length: samples + 1 }, (_, i) => i === samples ? max : min + step * i);
  const y = x.map(f);
  const found: number[] = [];
  let unresolved = false;
  const record = (value: number) => {
    if (found.length < 40 && !found.some(item => Math.abs(item - value) < Math.max(Math.abs(step) * 1e-5, Number.EPSILON * Math.abs(value)))) {
      found.push(value);
    }
  };
  for (let i = 0; i <= samples; i++) {
    const center = y[i];
    if (!Number.isFinite(center)) continue;
    if (center === 0) {
      if (i === 0 || y[i - 1] !== 0) record(x[i]);
      continue;
    }
    const next = y[i + 1];
    if (Number.isFinite(next) && next !== 0 && Math.sign(center) !== Math.sign(next)) {
      let left = x[i];
      let right = x[i + 1];
      let middle = left;
      let residual = center;
      for (let j = 0; j < 55; j++) {
        middle = left + (right - left) / 2;
        residual = f(middle);
        if (!Number.isFinite(residual) || residual === 0 || middle === left || middle === right) break;
        if (Math.sign(residual) === Math.sign(center)) left = middle;
        else right = middle;
      }
      if (Number.isFinite(residual) && Math.abs(residual) <= 1e-8 * Math.min(Math.abs(center), Math.abs(next))) {
        record(middle);
      } else if (Number.isFinite(residual) && Math.abs(residual) < Math.max(Math.abs(center), Math.abs(next))) {
        unresolved = true;
      }
    }
    const previous = y[i - 1];
    if (Number.isFinite(previous) && Number.isFinite(next) && Math.sign(previous) === Math.sign(next) &&
        Math.abs(center) < Math.min(Math.abs(previous), Math.abs(next))) {
      let left = x[i - 1];
      let right = x[i + 1];
      for (let j = 0; j < 48; j++) {
        const a = left + (right - left) / 3;
        const b = right - (right - left) / 3;
        if (Math.abs(f(a)) < Math.abs(f(b))) right = b;
        else left = a;
      }
      const middle = (left + right) / 2;
      if (Math.abs(f(middle)) <= 1e-8 * Math.min(Math.abs(previous), Math.abs(next))) record(middle);
    }
  }
  return { values: found.sort((a, b) => a - b), unresolved, validCount: y.filter(Number.isFinite).length };
}

export function system({ a, b }: Requests['system']): Responses['system'] {
  const leftCells = a.map(row => row.map(parse));
  const rightCells = b.map(parse);
  if ([...leftCells.flat(), ...rightCells].some(cell => variablesIn(cell).length)) return symbolicSystem(leftCells, rightCells);
  const left = leftCells.map(row => row.map(cell => realValue(cell)));
  const right = rightCells.map(cell => realValue(cell));
  if (rank(left.map((row, i) => [...row, right[i]])) > rank(left)) throw new Error('解なし。方程式が互いに矛盾しています。');
  if (rank(left) < left.length) throw new Error('不定です。条件を満たす解が複数あります。');
  const solutions = lusolve(left, right) as number[][];
  return { values: solutions.map(row => numberLatex(row[0])), approximate: true };
}

function rank(input: number[][]): number {
  const matrix = input.map(row => {
    const scale = Math.max(...row.map(Math.abs)) || 1;
    return row.map(value => value / scale);
  });
  let pivot = 0;
  for (let column = 0; column < matrix[0].length && pivot < matrix.length; column++) {
    let best = pivot;
    for (let i = pivot + 1; i < matrix.length; i++) {
      if (Math.abs(matrix[i][column]) > Math.abs(matrix[best][column])) best = i;
    }
    if (Math.abs(matrix[best][column]) < 1e-12) continue;
    [matrix[pivot], matrix[best]] = [matrix[best], matrix[pivot]];
    for (let i = pivot + 1; i < matrix.length; i++) {
      const ratio = matrix[i][column] / matrix[pivot][column];
      for (let j = column; j < matrix[i].length; j++) matrix[i][j] -= ratio * matrix[pivot][j];
    }
    pivot++;
  }
  return pivot;
}

export function matrix({ operation, a, b }: Requests['matrix']): Responses['matrix'] {
  const binary = ['add', 'subtract', 'multiply', 'dot', 'cross'].includes(operation);
  if ((operation === 'det' || operation === 'inv') && a.length !== a[0].length) throw new Error('正方行列を入力してください。');
  if ((operation === 'add' || operation === 'subtract') &&
      (a.length !== b.length || a[0].length !== b[0].length)) throw new Error('行列の行数と列数を揃えてください。');
  if (operation === 'multiply' && a[0].length !== b.length) throw new Error('A の列数と B の行数を揃えてください。');
  const leftCells = a.map(row => row.map(parse));
  const rightCells = binary ? b.map(row => row.map(parse)) : [];
  if ([...leftCells.flat(), ...rightCells.flat()].some(cell => variablesIn(cell).length)) {
    return symbolicMatrix(operation, leftCells, rightCells);
  }
  const first = leftCells.map(row => row.map(cell => realValue(cell)));
  const second = rightCells.map(row => row.map(cell => realValue(cell)));
  if (operation === 'inv' && rank(first) !== first.length) throw new Error('特異行列なので逆行列は存在しません。');
  const vector = first[0];
  const other = second[0];
  const operations = {
    add: () => add(first, second),
    subtract: () => subtract(first, second),
    multiply: () => multiply(first, second),
    transpose: () => transpose(first),
    det: () => det(first),
    inv: () => inv(first),
    norm: () => norm(vector, 2),
    dot: () => dot(vector, other),
    cross: () => cross(vector, other),
  };
  const result = operations[operation]();
  if (typeof result === 'number') return { latex: requireFinite(result) };
  const rows = result as Array<number | number[]>;
  return { latex: '\\begin{bmatrix}' + rows.map(row => Array.isArray(row)
    ? row.map(requireFinite).join('&') : requireFinite(row)).join('\\\\') + '\\end{bmatrix}' };
}

function requireFinite(value: number): string {
  if (!Number.isFinite(value)) throw new Error('有限の結果を求められませんでした。');
  return numberLatex(value);
}
