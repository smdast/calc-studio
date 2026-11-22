import { complex } from 'mathjs';
import { approximateLatex } from './calculations';
import { evaluateFormula, readIntegral } from './evaluateFormula';
import { notation, parse, unwrap, variableName, variablesIn } from './expressions';
import type { Expression } from './expressions';
import type { Calculation, Requests } from './model';
import type { ExactMessage, ExactReply, ExactRequest, ExactResult } from './exact-worker-types';

const answerPrefix = 'sympy:';
let worker: Worker | undefined;
let initialized = false;
let sequence = 0;

export async function extendedCalculation(request: Requests['calculate']): Promise<Calculation> {
  const expression = unwrap(parse(request.input));
  const integral = readIntegral(expression);
  let storedAnswer: string | undefined;
  if (request.ans.startsWith(answerPrefix)) {
    variablesIn(expression, () => {
      storedAnswer = request.ans.slice(answerPrefix.length);
      return [];
    });
  }
  if (!integral && !storedAnswer) return evaluateFormula(request, expression);

  let baseline: Calculation | undefined;
  let failure: unknown;
  if (!storedAnswer) {
    try {
      baseline = evaluateFormula(request, expression, true);
      if (!baseline.approximate) return baseline;
    } catch (error) {
      failure = error;
    }
  }

  const source = (value: Expression, angle?: Requests['calculate']['angle']) =>
    notation(value, { variables: variablesIn(value), angle, ans: storedAnswer ? 'CalculatorAnswer' : request.ans });
  let exactRequest: ExactRequest;
  let operation: NonNullable<Calculation['operation']>;
  if (integral) {
    const { body, variable, bounds } = integral;
    exactRequest = { operation: 'integrate', source: source(body), variable,
      bounds: bounds && [boundSource(bounds[0], source), boundSource(bounds[1], source)], answer: storedAnswer };
    operation = bounds ? 'definite' : 'integrate';
  } else if (Array.isArray(expression) && expression[0] === 'D' && typeof expression[2] === 'string') {
    exactRequest = { operation: 'differentiate', source: source(expression[1]), variable: variableName(expression[2]), answer: storedAnswer };
    operation = 'differentiate';
  } else if (Array.isArray(expression) && expression[0] === 'Equal' && expression.length === 3) {
    const choices = variablesIn(expression);
    const variable = choices.includes('x') ? 'x' : choices.length === 1 ? choices[0] : undefined;
    if (!variable) throw new Error('Ans を使う一元方程式では、解く変数を1つ入力してください。');
    exactRequest = { operation: 'solve', source: source(['Subtract', expression[1], expression[2]], request.angle), variable,
      answer: storedAnswer };
    operation = 'equation';
  } else if (Array.isArray(expression) && expression[0] === 'InvisibleOperator' &&
      (expression[1] === 'simplify' || expression[1] === 'expand' || expression[1] === 'factor') &&
      Array.isArray(expression[2]) && expression[2][0] === 'Delimiter') {
    operation = expression[1];
    exactRequest = { operation, source: source(unwrap(expression[2])), answer: storedAnswer };
  } else {
    exactRequest = { operation: 'simplify', source: source(expression, request.angle), answer: storedAnswer };
    operation = variablesIn(expression).length ? 'simplify' : 'calculate';
  }

  const exact = await runExact(exactRequest).catch(() => undefined);
  if (exact && validated(exact, operation, baseline)) {
    const [real, imaginary] = exact.numeric ?? [];
    const decimal = real === undefined ? undefined : approximateLatex(imaginary ? complex(real, imaginary) : real);
    return { exact: exact.latex, answer: answerPrefix + exact.expression, approximate: false, operation, decimal };
  }
  if (baseline) return baseline;
  if (failure) throw failure;
  throw new Error('この式の厳密値を求められませんでした。');
}

function boundSource(limit: Expression, source: (value: Expression) => string): string {
  const bound = unwrap(limit);
  if (bound === 'PositiveInfinity') return 'oo';
  if (bound === 'NegativeInfinity' ||
      (Array.isArray(bound) && bound[0] === 'Negate' && unwrap(bound[1]) === 'PositiveInfinity')) return '-oo';
  return source(bound);
}

function validated(exact: ExactResult, operation: Calculation['operation'], baseline?: Calculation) {
  if (operation !== 'definite') return true;
  if (exact.numeric && Math.abs(exact.numeric[1]) > 1e-10) return false;
  if (!baseline) return true;
  if (!exact.numeric) return false;
  const estimate = Number(baseline.answer);
  return Number.isFinite(estimate) && Math.abs(exact.numeric[0] - estimate) <= 1e-9 * Math.max(1, Math.abs(estimate));
}

function runExact(request: ExactRequest): Promise<ExactResult | undefined> {
  return new Promise(resolve => {
    const active = worker ??= new Worker(new URL('./sympy.worker.ts', import.meta.url), { type: 'module' });
    const id = ++sequence;

    function finish(result?: ExactResult, terminate = false) {
      clearTimeout(timeout);
      active.removeEventListener('message', onMessage);
      active.removeEventListener('error', onError);
      if (terminate) {
        active.terminate();
        worker = undefined;
        initialized = false;
      }
      resolve(result);
    }
    function onMessage({ data }: MessageEvent<ExactReply>) {
      if (data.id !== id) return;
      if (data.result !== undefined) initialized = true;
      finish(data.result ?? undefined);
    }
    function onError() { finish(undefined, true); }
    const timeout = setTimeout(() => finish(undefined, true), initialized ? 7000 : 11000);
    active.addEventListener('message', onMessage);
    active.addEventListener('error', onError);
    active.postMessage({ id, request } satisfies ExactMessage);
  });
}
