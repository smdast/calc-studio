export function numberLatex(value: number): string {
  const rounded = Number(value.toPrecision(12));
  const [mantissa, exponent] = String(rounded).split('e');
  return exponent ? mantissa + '\\times 10^{' + Number(exponent) + '}' : mantissa;
}
