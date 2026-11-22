import { numericFunction, parse, splitEquation } from './expressions';
import type { Contour, GraphData, Range, Requests, Series } from './model';
import { assertRange, searchRoots } from './solvers';

export function graph({ type, first, second, x, y, parameter, probe }: Requests['graph']): GraphData {
  assertRange(x);
  assertRange(y);
  if (type === 'implicit') {
    const [left, right] = splitEquation(parse(first));
    const f = numericFunction(['Subtract', left, right], ['x', 'y']);
    return { contour: grid((px, py) => f({ x: px, y: py }), x, y) };
  }
  if (type === 'parametric') {
    assertRange(parameter);
    const a = numericFunction(parse(first), ['t']);
    const b = numericFunction(parse(second), ['t']);
    return { series: sample(t => [a({ t }), b({ t })], parameter, x, y) };
  }
  if (type === 'polar') {
    assertRange(parameter);
    const evaluate = numericFunction(parse(first), ['theta', 't']);
    return { series: sample(t => {
      const r = evaluate({ theta: t, t });
      return [r * Math.cos(t), r * Math.sin(t)];
    }, parameter, x, y) };
  }

  const evaluate = numericFunction(parse(first), ['x']);
  const f = (value: number) => evaluate({ x: value });
  const series = sample(value => [value, f(value)], x, x, y);
  const data: GraphData = { series };
  const dx = (x[1] - x[0]) * 1e-5;
  const derivative = (a: number) => (f(a + dx) - f(a - dx)) / (2 * dx);
  const roots = searchRoots(f, x);
  data.roots = roots.validCount && series.y.every(v => v === 0 || v === null) ? [] : roots.values;
  data.extrema = searchRoots(derivative, x, 500).values.flatMap<NonNullable<GraphData['extrema']>[number]>(value => {
    if (value <= x[0] + dx || value >= x[1] - dx) return [];
    const center = f(value);
    const left = f(value - 4 * dx);
    const right = f(value + 4 * dx);
    if (center < left && center < right) return [{ x: value, y: center, kind: 'min' as const }];
    if (center > left && center > right) return [{ x: value, y: center, kind: 'max' as const }];
    return [];
  });
  if (probe !== undefined) {
    const point = f(probe);
    const slope = derivative(probe);
    const near = (f(probe + dx / 4) - f(probe - dx / 4)) / (dx / 2);
    const fromLeft = (point - f(probe - dx / 4)) / (dx / 4);
    const fromRight = (f(probe + dx / 4) - point) / (dx / 4);
    if (Number.isFinite(point)) data.point = [probe, point];
    if ([point, slope, near, fromLeft, fromRight].every(Number.isFinite) &&
        Math.abs(slope - near) < 1e-3 * Math.max(1, Math.abs(near)) &&
        Math.abs(fromLeft - fromRight) < 1e-3 * Math.max(1, Math.abs(near))) {
      data.slope = near;
      data.tangent = { x, y: x.map(value => point + near * (value - probe)) };
    }
  }
  return data;
}

function sample(f: (t: number) => [number, number], parameter: Range, x: Range, y: Range): Series {
  const series: Series = { x: [], y: [] };
  const count = 900;
  const step = (parameter[1] - parameter[0]) / count;
  const spans = [x[1] - x[0], y[1] - y[0]];
  const push = (point: [number, number] | null) => {
    series.x.push(point?.[0] ?? null);
    series.y.push(point?.[1] ?? null);
  };
  let previous: [number, number] | undefined;
  for (let i = 0; i <= count; i++) {
    const t = i === count ? parameter[1] : parameter[0] + i * step;
    const point = f(t);
    if (!point.every(Number.isFinite)) {
      push(null);
      previous = undefined;
      continue;
    }
    if (previous) {
      const mid = f(t - step / 2);
      const start = previous;
      if (!mid.every(Number.isFinite) || point.some((v, axis) => {
        const change = Math.abs(v - start[axis]);
        const deviation = Math.abs(mid[axis] - (v + start[axis]) / 2);
        return change > spans[axis] * 0.08 && deviation > Math.max(spans[axis] * 0.025, change * 0.16);
      })) push(null);
    }
    push(point);
    previous = point;
  }
  if (!series.y.some(value => value !== null)) throw new Error('この範囲では実数の曲線を描画できません。');
  return series;
}

function grid(f: (x: number, y: number) => number, xRange: Range, yRange: Range): Contour {
  const count = 141;
  const steps = ([a, b]: Range) => Array.from({ length: count }, (_, i) => a + (b - a) * i / (count - 1));
  const x = steps(xRange);
  const y = steps(yRange);
  const raw = y.map(py => x.map(px => f(px, py)));
  if (!raw.some(row => row.some(Number.isFinite))) throw new Error('この範囲では式を実数で評価できません。');
  const z = raw.map(row => row.map(value => Number.isFinite(value) ? value : null));
  const check = (a: number, b: number, r: number, c: number, nextR: number, nextC: number) => {
    if (!Number.isFinite(a) || !Number.isFinite(b) || a * b >= 0) return;
    const middle = f((x[c] + x[nextC]) / 2, (y[r] + y[nextR]) / 2);
    if (!Number.isFinite(middle) || Math.abs(middle) > 8 * Math.max(Math.abs(a), Math.abs(b))) {
      z[r][c] = null;
      z[nextR][nextC] = null;
    }
  };
  raw.forEach((row, r) => row.forEach((value, c) => {
    if (c + 1 < count) check(value, raw[r][c + 1], r, c, r, c + 1);
    if (r + 1 < count) check(value, raw[r + 1][c], r, c, r + 1, c);
  }));
  return { x, y, z };
}
