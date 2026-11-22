// The embedded 7-point Gauss and 15-point Kronrod rules share seven samples.
const nodes = [
  0.9914553711208126, 0.9491079123427585, 0.8648644233597691, 0.7415311855993945,
  0.5860872354676911, 0.4058451513773972, 0.2077849550078985,
];
const kronrodWeights = [
  0.02293532201052922, 0.06309209262997855, 0.1047900103222502, 0.1406532597155259,
  0.1690047266392679, 0.1903505780647854, 0.2044329400752989,
];
const gaussWeights = [0.1294849661688697, 0.2797053914892766, 0.3818300505051189];

interface Estimate { a: number; b: number; value: number; error: number }

export function integrateNumerically(f: (x: number) => number, a: number, b: number): number {
  if (a === b) return 0;
  if (b < a) return -integrateNumerically(f, b, a);
  if (!Number.isFinite(b - a)) throw new Error('積分区間が広すぎます。');
  const checked = (x: number) => {
    const value = f(x);
    if (!Number.isFinite(value)) throw new Error('積分区間に関数が定義されない点があります。');
    return value;
  };
  const parts: Estimate[] = [];
  const count = 8;
  for (let i = 0; i < count; i++) {
    const lo = a + (b - a) * (i / count);
    const hi = i + 1 === count ? b : a + (b - a) * ((i + 1) / count);
    checked(lo);
    parts.push(estimate(checked, lo, hi));
  }
  checked(b);
  let value = parts.reduce((sum, part) => sum + part.value, 0);
  let error = parts.reduce((sum, part) => sum + part.error, 0);
  while (parts.length < 2048 && Number.isFinite(value) && Number.isFinite(error)) {
    if (error <= 1e-12 * Math.max(1, Math.abs(value))) return value;
    const index = parts.reduce((largest, part, i) => part.error > parts[largest].error ? i : largest, 0);
    const part = parts[index];
    const mid = part.a + (part.b - part.a) / 2;
    if (mid === part.a || mid === part.b) break;
    const left = estimate(checked, part.a, mid);
    const right = estimate(checked, mid, part.b);
    value += left.value + right.value - part.value;
    error = Math.max(0, error + left.error + right.error - part.error);
    parts[index] = left;
    parts.push(right);
  }
  throw new Error('定積分の数値計算が収束しませんでした。積分区間と定義域を確認してください。');
}

function estimate(f: (x: number) => number, a: number, b: number): Estimate {
  const half = (b - a) / 2;
  const mid = a + half;
  const center = f(mid);
  let kronrod = 0.2094821410847278 * center;
  let gauss = 0.4179591836734694 * center;
  for (let i = 0; i < nodes.length; i++) {
    const offset = half * nodes[i];
    const pair = f(mid - offset) + f(mid + offset);
    kronrod += kronrodWeights[i] * pair;
    if (i % 2 === 1) gauss += gaussWeights[(i - 1) / 2] * pair;
  }
  return { a, b, value: kronrod * half, error: Math.abs(kronrod - gauss) * half };
}
