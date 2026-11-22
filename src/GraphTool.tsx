import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Data, Layout, PlotRelayoutEvent, PlotMouseEvent } from 'plotly.js';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { IconButton } from '@astryxdesign/core/IconButton';
import { ChartNoAxesCombined, Focus, Minus, Plus } from 'lucide-react';
import { MathText } from './MathField';
import { Formula } from './MathTools';
import { Problem, Select } from './controls';
import type { GraphData, GraphType, Range } from './model';
import { useCalculation } from './useCalculation';
import { numberLatex } from './numberFormat';

const graphKinds = [
  { value: 'cartesian', label: '直交座標 y = f(x)' }, { value: 'polar', label: '極座標 r = f(θ)' },
  { value: 'parametric', label: '媒介変数 x(t), y(t)' }, { value: 'implicit', label: '陰関数 F(x, y) = 0' },
] as const;
const defaults = {
  cartesian: { first: 'x^2-1', second: '' },
  polar: { first: '2\\cos(3\\theta)', second: '' },
  parametric: { first: '3\\cos(t)', second: '2\\sin(t)' },
  implicit: { first: 'x^2+y^2=9', second: '' },
};
const defaultAxes: View = { x: [-6, 6], y: [-4, 4] };
const defaultParameter: Range = [0, 2 * Math.PI];

interface View { x: Range; y: Range }
interface Draft { type: GraphType; first: string; second: string; parameter: Range }
const initialDraft: Draft = { type: 'cartesian', ...defaults.cartesian, parameter: defaultParameter };

export function GraphTool({ dark, active }: { dark: boolean; active: boolean }) {
  const [draft, setDraft] = useState(initialDraft);
  const [parameterFields, setParameterFields] = useState(['0', String(2 * Math.PI)]);
  const [probeField, setProbeField] = useState('0');
  const [axes, setAxes] = useState(defaultAxes);
  const [rendered, setRendered] = useState<{ data: GraphData; type: GraphType }>();
  const [formError, setFormError] = useState('');
  const lastDrawn = useRef(initialDraft);
  const requestedProbe = useRef<number>(undefined);
  const deferred = useRef<number>(undefined);
  const plotForm = useRef<HTMLFormElement>(null);
  const task = useCalculation();
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    void drawRef.current(initialDraft, defaultAxes);
    return () => window.clearTimeout(deferred.current);
  }, []);

  async function draw(source: Draft, view: View, probe?: number) {
    window.clearTimeout(deferred.current);
    const data = await task.run('graph', { ...source, ...view, probe });
    if (data) {
      lastDrawn.current = source;
      requestedProbe.current = probe;
      setRendered({ data, type: source.type });
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const needsParameter = draft.type === 'polar' || draft.type === 'parametric';
    const parameter = parameterFields.map(value => value.trim() ? Number(value) : NaN) as Range;
    if (needsParameter && (parameter.some(value => !Number.isFinite(value)) || parameter[0] >= parameter[1])) {
      setFormError('パラメータは開始値より大きい終了値を指定してください。');
      return;
    }
    setFormError('');
    void draw({ ...draft, parameter: needsParameter ? parameter : defaultParameter }, axes);
  }

  function changeType(type: GraphType) {
    if (type === draft.type) return;
    const next = { type, ...defaults[type], parameter: defaultParameter };
    setDraft(next);
    setParameterFields(['0', String(2 * Math.PI)]);
    setFormError('');
    setAxes(defaultAxes);
    void draw(next, defaultAxes);
  }

  function move(view: View) {
    if (sameView(axes, view)) return;
    setAxes(view);
    window.clearTimeout(deferred.current);
    deferred.current = window.setTimeout(() => { void draw(lastDrawn.current, view, requestedProbe.current); }, 160);
  }

  function zoom(factor: number) {
    const scale = ([lo, hi]: Range): Range => {
      const center = lo + (hi - lo) / 2;
      const half = (hi - lo) / 2 * factor;
      return [center - half, center + half];
    };
    move({ x: scale(axes.x), y: scale(axes.y) });
  }

  function setProbe(value: number) {
    setProbeField(String(Number(value.toPrecision(10))));
    setFormError('');
    void draw(lastDrawn.current, axes, value);
  }

  const type = rendered?.type;
  const data = rendered?.data;
  const firstLabel = { cartesian: 'y =', polar: 'r =', parametric: 'x(t) =', implicit: '陰関数の式' }[draft.type];
  return <div className="graph-layout">
    <Card className="tool-card graph-settings" padding={0}>
      <div className="tool-heading"><span className="tool-icon"><ChartNoAxesCombined size={20} /></span><h2>グラフの設定</h2></div>
      <form className="tool-form" ref={plotForm} onSubmit={submit}>
        <Select label="グラフの種類" value={draft.type} items={graphKinds} onChange={changeType} />
        <Formula label={firstLabel} value={draft.first} onChange={first => setDraft(current => ({ ...current, first }))}
          onSubmit={() => plotForm.current?.requestSubmit()} />
        {draft.type === 'parametric' && <Formula label="y(t) =" value={draft.second} onChange={second => setDraft(current => ({ ...current, second }))}
          onSubmit={() => plotForm.current?.requestSubmit()} />}
        {(draft.type === 'parametric' || draft.type === 'polar') && <div className="form-grid two">
          <label className="select-field"><span>開始値</span><input type="number" step="any" value={parameterFields[0]}
            onChange={event => setParameterFields([event.currentTarget.value, parameterFields[1]])} /></label>
          <label className="select-field"><span>終了値</span><input type="number" step="any" value={parameterFields[1]}
            onChange={event => setParameterFields([parameterFields[0], event.currentTarget.value])} /></label>
        </div>}
        <div className="form-actions"><Button label="描画する" variant="primary" type="submit" size="lg" isLoading={task.busy} /></div>
        <Problem message={formError || task.error} />
      </form>
      {type === 'cartesian' && data && <div className="graph-analysis">
        <h3>グラフを調べる</h3>
        <dl>
          <div><dt>零点</dt><dd>{data.roots?.length ? data.roots.map(x => short(x)).join('、') : '—'}</dd></div>
          <div><dt>極値</dt><dd>{data.extrema?.length ? data.extrema.map(p =>
            (p.kind === 'min' ? '極小' : '極大') + ' (' + short(p.x) + ', ' + short(p.y) + ')').join('、') : '—'}</dd></div>
        </dl>
        <form className="tangent-controls" onSubmit={event => {
          event.preventDefault();
          if (probeField.trim() && Number.isFinite(Number(probeField))) setProbe(Number(probeField));
        }}>
          <label className="select-field"><span>接線の x 座標</span><input type="number" step="any" required value={probeField}
            onChange={event => setProbeField(event.currentTarget.value)} /></label>
          <Button label="接線を表示" type="submit" variant="secondary" size="lg" />
        </form>
        {requestedProbe.current !== undefined && <div className="slope" aria-live="polite">{data.slope !== undefined
          ? <>傾き <MathText latex={'\\approx ' + numberLatex(data.slope)} /></> : 'この点の接線は求められませんでした。'}</div>}
      </div>}
    </Card>
    <Card className="graph-card" padding={0}>
      <div className="graph-header">
        <h2>グラフ</h2>
        <div className="plot-actions">
          <IconButton label="拡大" tooltip="拡大" variant="secondary" icon={<Plus size={17} />} onClick={() => zoom(0.75)} />
          <IconButton label="縮小" tooltip="縮小" variant="secondary" icon={<Minus size={17} />} onClick={() => zoom(4 / 3)} />
          <IconButton label="表示範囲を戻す" tooltip="表示範囲を戻す" variant="secondary" icon={<Focus size={17} />} onClick={() => move(defaultAxes)} />
        </div>
      </div>
      {data ? <Plot data={data} axes={axes} dark={dark} active={active} onView={move} onProbe={type === 'cartesian' ? setProbe : undefined} /> :
        <div className="plot-placeholder" role="status">描画を準備しています…</div>}
      <p className="graph-tip">ドラッグで移動、スクロールで拡大・縮小。{type === 'cartesian' && '曲線を選ぶと接線を表示します。'}</p>
    </Card>
  </div>;
}

function short(n: number) {
  return String(Number(n.toPrecision(9)));
}

function sameView(a: View, b: View) {
  return a.x.every((v, i) => v === b.x[i]) && a.y.every((v, i) => v === b.y[i]);
}

function Plot({ data, axes, dark, active, onView, onProbe }: {
  data: GraphData; axes: View; dark: boolean; active: boolean; onView: (view: View) => void; onProbe?: (x: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onView, onProbe, axes });
  callbacks.current = { onView, onProbe, axes };
  const library = useRef<typeof import('plotly.js')>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [error, setError] = useState(false);

  useEffect(() => {
    const node = host.current;
    if (!node || !active) return;
    let cancelled = false;
    function relayout(event: PlotRelayoutEvent) {
      const { axes, onView } = callbacks.current;
      const x = plotRange(event['xaxis.range'] ?? [event['xaxis.range[0]'], event['xaxis.range[1]']], axes.x);
      const y = plotRange(event['yaxis.range'] ?? [event['yaxis.range[0]'], event['yaxis.range[1]']], axes.y);
      onView({ x, y });
    }
    function click(event: PlotMouseEvent) {
      const point = event.points[0];
      if (point?.curveNumber === 0 && typeof point.x === 'number') callbacks.current.onProbe?.(point.x);
    }
    queue.current = queue.current.catch(() => {}).then(async () => {
      if (cancelled) return;
      try {
        const Plotly = library.current ??= (await import('plotly.js-dist-min')).default;
        if (cancelled) return;
        const color = dark ? '#aaa8ff' : '#4d45d0';
        const edge = dark ? '#383b4d' : '#e7e8f1';
        const baseline = dark ? '#74788f' : '#a2a6bb';
        const lines: Data[] = [];
        if (data.series) lines.push({ ...data.series, type: 'scatter', mode: 'lines', name: '曲線', connectgaps: false,
          line: { color, width: 3 }, hovertemplate: 'x = %{x:.5g}<br>y = %{y:.5g}<extra></extra>' });
        if (data.contour) lines.push({ ...data.contour, type: 'contour', connectgaps: false, autocontour: false,
          contours: { start: 0, end: 0, size: 1, coloring: 'none' }, line: { color, width: 3 }, showscale: false,
          hovertemplate: 'x = %{x:.5g}<br>y = %{y:.5g}<extra></extra>' });
        if (data.tangent) lines.push({ ...data.tangent, type: 'scatter', mode: 'lines', hoverinfo: 'skip',
          line: { color: dark ? '#f9b588' : '#b65d2c', dash: 'dash', width: 2 } });
        if (data.point) lines.push({ x: [data.point[0]], y: [data.point[1]], type: 'scatter', mode: 'markers', hoverinfo: 'skip',
          marker: { color, size: 8 } });
        const axis = { showgrid: true, gridcolor: edge, zeroline: true, zerolinecolor: baseline, fixedrange: false };
        const layout: Partial<Layout> = {
          margin: { l: 46, r: 22, t: 14, b: 38 }, paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
          showlegend: false, dragmode: 'pan', hovermode: 'closest',
          font: { family: 'Figtree Variable, system-ui, sans-serif', size: 12, color: dark ? '#cfcede' : '#575b70' },
          xaxis: { ...axis, range: axes.x, autorange: false },
          yaxis: { ...axis, range: axes.y, autorange: false },
        };
        const plot = await Plotly.react(node, lines, layout, { displayModeBar: false, responsive: true, scrollZoom: true,
          doubleClick: false, displaylogo: false });
        if (cancelled) return;
        plot.removeAllListeners('plotly_relayout');
        plot.removeAllListeners('plotly_click');
        plot.on('plotly_relayout', relayout);
        plot.on('plotly_click', click);
        setError(false);
      } catch {
        if (!cancelled) setError(true);
      }
    });
    return () => { cancelled = true; };
  }, [active, axes, dark, data]);

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const resize = new ResizeObserver(() => {
      if (node.clientWidth > 0 && 'data' in node && library.current) {
        void Promise.resolve(library.current.Plots.resize(node)).catch(() => {});
      }
    });
    resize.observe(node);
    return () => { resize.disconnect(); library.current?.purge(node); };
  }, []);

  return <div className="plot-region">
    <div className="plot-host" ref={host} role="img" aria-label="座標平面に描画したグラフ" />
    <Problem message={error ? 'グラフの描画を開始できませんでした。' : ''} />
  </div>;
}

function plotRange([a, b]: [unknown, unknown], previous: Range): Range {
  const left = typeof a === 'number' && Number.isFinite(a) ? a : previous[0];
  const right = typeof b === 'number' && Number.isFinite(b) ? b : previous[1];
  return left < right ? [left, right] : previous;
}
