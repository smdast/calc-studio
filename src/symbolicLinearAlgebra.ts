import nerdamer from 'nerdamer';
import { scalar } from './calculations';
import { notation, restoreSymbolGlyphs, variablesIn } from './expressions';
import type { Expression } from './expressions';
import type { MatrixOperation, Responses } from './model';

type Scalar = ReturnType<typeof scalar>;
type Matrix = Scalar[][];

export function symbolicCells(rows: Expression[][]): Matrix {
  return rows.map(row => row.map(cell => scalar(notation(cell, { variables: variablesIn(cell) }))));
}

export function symbolicSystem(a: Expression[][], b: Expression[]): Responses['system'] {
  const matrix = symbolicCells(a);
  const [rhs] = symbolicCells([b]);
  const determinant = det(matrix);
  if (determinant.isZero()) throw new Error('行列式が 0 のため、一意に解けません。');
  const values = rhs.map((_, column) => latex(ratio(det(matrix.map((row, i) =>
    row.map((value, j) => j === column ? rhs[i] : value))), determinant)));
  return { values, approximate: false, condition: nonzero(determinant) };
}

export function symbolicMatrix(operation: MatrixOperation, a: Expression[][], b: Expression[][]): Responses['matrix'] {
  const first = symbolicCells(a);
  const second = symbolicCells(b);
  if (operation === 'det') return { latex: latex(det(first)) };
  if (operation === 'inv') {
    const determinant = det(first);
    if (determinant.isZero()) throw new Error('特異行列なので逆行列は存在しません。');
    const inverse = first.map((row, i) => row.map((_, j) => {
      const minor = first.filter((_, index) => index !== j).map(row => row.filter((_, index) => index !== i));
      const cofactor = det(minor);
      return ratio((i + j) % 2 ? scalar('-(' + cofactor.text() + ')') : cofactor, determinant);
    }));
    return { latex: matrixLatex(inverse), condition: nonzero(determinant) };
  }
  if (operation === 'transpose') return { latex: matrixLatex(first[0].map((_, j) => first.map(row => row[j]))) };
  if (operation === 'norm') {
    const sum = first[0].map(value => '(' + value.text() + ')^2').join('+');
    return { latex: latex(scalar('sqrt(' + sum + ')')), note: '成分を実数とした結果' };
  }
  if (operation === 'dot') return { latex: latex(scalar('dot(' + vector(first[0]) + ',' + vector(second[0]) + ')')) };
  if (operation === 'cross') {
    const results = nerdamer('cross(' + vector(first[0]) + ',' + vector(second[0]) + ')');
    if (!('elements' in results) || !Array.isArray(results.elements)) throw new Error('外積を計算できませんでした。');
    return { latex: matrixLatex(results.elements.map(value => {
      if (Array.isArray(value)) throw new Error('外積を計算できませんでした。');
      return [scalar(value.text())];
    })) };
  }
  const operator = operation === 'add' ? '+' : operation === 'subtract' ? '-' : '*';
  const result = nerdamer(matrixSource(first) + operator + matrixSource(second));
  if (!('elements' in result) || !Array.isArray(result.elements)) throw new Error('行列を計算できませんでした。');
  const rows = result.elements.map(row => {
    if (!Array.isArray(row)) throw new Error('行列を計算できませんでした。');
    return row.map(cell => scalar(cell.text()));
  });
  return { latex: matrixLatex(rows) };
}

function ratio(numerator: Scalar, denominator: Scalar) {
  return scalar('(' + numerator.text() + ')/(' + denominator.text() + ')').simplify();
}

function det(matrix: Matrix) {
  return matrix.length === 0 ? scalar('1') : scalar('determinant(' + matrixSource(matrix) + ')').simplify();
}

function vector(row: Scalar[]) {
  return '[' + row.map(value => value.text()).join(',') + ']';
}

function matrixSource(rows: Matrix) {
  return 'matrix(' + rows.map(vector).join(',') + ')';
}

function latex(value: Scalar) {
  return restoreSymbolGlyphs(value.simplify().latex());
}

function matrixLatex(rows: Matrix) {
  return '\\begin{bmatrix}' + rows.map(row => row.map(latex).join('&')).join('\\\\') + '\\end{bmatrix}';
}

function nonzero(value: Scalar) {
  return value.variables().length ? latex(value) + '\\ne 0' : undefined;
}
