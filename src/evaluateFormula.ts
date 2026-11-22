import { calculate, scalar, symbolic } from './calculations';
import { parse, restoreSymbolGlyphs, splitEquation, unwrap, variableName, variablesIn } from './expressions';
import type { Expression } from './expressions';
import type { Calculation, CasOperation, Requests } from './model';
import { equation } from './solvers';

export function evaluateFormula(request: Requests['calculate'],
  expression = unwrap(parse(request.input)), onlyFastAntiderivatives = false): Calculation {
  const { ans } = request;
  const integral = readIntegral(expression);
  if (integral) {
    return evaluateSymbolic(integral.body, integral.bounds ? 'definite' : 'integrate', {
      variable: integral.variable, bounds: integral.bounds, ans, onlyFastAntiderivatives,
    });
  }
  if (Array.isArray(expression)) {
    const [operator, body, variable] = expression;
    if (operator === 'D') {
      if (typeof variable !== 'string' || expression.length !== 3) throw new Error('微分する式と変数を入力してください。');
      return evaluateSymbolic(body, 'differentiate', { variable, ans });
    }
    if (operator === 'Equal') return solve(expression, request);
    if (operator === 'InvisibleOperator' && expression.length === 3 && isGroup(variable)) {
      const argument = unwrap(variable);
      if (body === 'simplify' || body === 'expand' || body === 'factor') return evaluateSymbolic(argument, body, { ans });
      if (body === 'solve') {
        if (Array.isArray(argument) && argument[0] === 'Sequence') {
          if (argument.length === 3 && typeof argument[2] === 'string') {
            return solve(unwrap(argument[1]), request, undefined, variableName(argument[2]));
          }
          if (argument.length === 4) return solve(unwrap(argument[1]), request, [argument[2], argument[3]]);
        }
        throw new Error('方程式と解く文字、または方程式と探索区間の上下限を入力してください。');
      }
    }
  }
  if (variablesIn(expression, () => scalar(ans).variables()).length) return evaluateSymbolic(expression, 'simplify', { ans });
  return { ...calculate(request, expression), operation: 'calculate' };
}

export function readIntegral(expression: Expression): { body: Expression; variable: string; bounds?: [Expression, Expression] } | undefined {
  if (!Array.isArray(expression) || expression[0] !== 'Integrate') return;
  const [, body, variable] = expression;
  if (typeof variable === 'string') return { body, variable: variableName(variable) };
  if (Array.isArray(variable) && variable[0] === 'Tuple' && typeof variable[1] === 'string' && variable.length === 4) {
    return { body, variable: variableName(variable[1]), bounds: [variable[2], variable[3]] };
  }
  throw new Error('積分する式と変数を入力してください。定積分では上下限も必要です。');
}

function isGroup(expression: Expression) {
  return Array.isArray(expression) && expression[0] === 'Delimiter';
}

function evaluateSymbolic(expression: Expression, operation: CasOperation, options: Parameters<typeof symbolic>[2]) {
  return { ...symbolic(expression, operation, options), operation };
}

function solve(expression: Expression, request: Requests['calculate'], interval?: [Expression, Expression], target?: string): Calculation {
  const variables = variablesIn(expression, () => scalar(request.ans).variables());
  const options = { angle: request.angle, ans: request.ans, interval };
  if (!variables.length && !target) {
    const [left, right] = splitEquation(expression);
    const matches = calculate(request, ['Subtract', left, right]).answer === '0';
    return {
      exact: matches ? '\\text{等式が成り立ちます}' : '\\text{等式が成り立ちません}',
      answer: '0', approximate: false, operation: 'equation',
    };
  }
  const common = variables.filter(name => ['t', 'y', 'z'].includes(name));
  const variable = target ?? (variables.includes('x') ? 'x' :
    variables.length === 1 ? variables[0] : common.length === 1 ? common[0] : undefined);
  if (!variable) throw new Error('どの文字を解くか判断できません。2nd の「解く文字」で指定してください。');
  if (!variables.includes(variable)) throw new Error('指定した文字が方程式に含まれていません。');
  const name = restoreSymbolGlyphs(scalar(variable).latex());
  const { values, approximate, range, condition, allWhen } = equation(expression, variable, options);
  const exact = values.length
    ? values.map((value, i) => (values.length > 1
      ? (variable.includes('_') ? '{' + name + '}' : name) + '_{' + (i + 1) + '}' : name) +
      (approximate ? '\\approx ' : '=') + value).join('\\qquad ')
    : allWhen ? '\\text{条件が成り立つとき任意の }' + name :
      range ? '\\text{探索範囲に解は見つかりませんでした}' : '\\text{解なし}';
  return {
    exact, approximate, answer: '0', operation: 'equation',
    note: range ? '数値探索の範囲 ' + range[0] + ' ～ ' + range[1] : undefined,
    condition: allWhen ?? condition,
  };
}
