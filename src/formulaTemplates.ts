import type { HistoryEntry } from './model';

export function normalizeFormulaLatex(input: string) {
  const trimmed = input.trim();
  const wrapped = /^\$\$([\s\S]*)\$\$$/.exec(trimmed) ?? /^\\\[([\s\S]*)\\\]$/.exec(trimmed);
  return (wrapped ? wrapped[1].trim() : input).replace(/\\\\,/g, '\\,');
}

export function derivative(variable: string, expression: string) {
  return '\\frac{\\mathrm{d}}{\\mathrm{d}' + variable + '}\\left(' + expression + '\\right)';
}

export function integral(variable: string, expression: string, bounds?: [string, string]) {
  const limits = bounds ? '_{' + bounds[0] + '}^{' + bounds[1] + '}' : '';
  return '\\int' + limits + '\\left(' + expression + '\\right)\\,\\mathrm{d}' + variable;
}

export function namedFormula(name: string, ...expressions: string[]) {
  return '\\operatorname{' + name + '}\\left(' + expressions.join(',') + '\\right)';
}

export function historyFormula({ input, settings }: HistoryEntry) {
  const operation = settings?.operation;
  if (!settings || operation === 'calculate' || operation === 'system') return input;
  const { variable, lower, upper } = settings;
  if (operation === 'differentiate') return derivative(variable, input);
  if (operation === 'integrate') return integral(variable, input);
  if (operation === 'definite') return integral(variable, input, [lower, upper]);
  if (operation === 'simplify' || operation === 'expand' || operation === 'factor') return namedFormula(operation, input);
  const equation = input.includes('=') ? input : input + '=0';
  return operation === 'interval' ? namedFormula('solve', equation, lower, upper) : equation;
}
