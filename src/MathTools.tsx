import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Brackets } from 'lucide-react';
import { MathField, MathText } from './MathField';
import { Problem, ResultBox, Segments, Select } from './controls';
import type { MatrixOperation, Responses } from './model';
import { useCalculation } from './useCalculation';

const matrixOps = [
  { value: 'add', label: '加算 A + B' }, { value: 'subtract', label: '減算 A − B' }, { value: 'multiply', label: '積 A × B' },
  { value: 'transpose', label: '転置 Aᵀ' }, { value: 'det', label: '行列式 det(A)' }, { value: 'inv', label: '逆行列 A⁻¹' },
] as const;
const vectorOps = [
  { value: 'norm', label: 'ノルム ‖A‖' }, { value: 'dot', label: '内積 A · B' }, { value: 'cross', label: '外積 A × B' },
] as const;
const mathKinds = [{ value: 'matrix', label: '行列' }, { value: 'vector', label: 'ベクトル' }] as const;
const dimensions = ['1', '2', '3', '4'].map(value => ({ value, label: value }));
const initialMatrixA = [['2', '1'], ['1', '1']];
const initialMatrixB = [['1', '0'], ['0', '1']];

export function LinearAlgebraTool() {
  const [kind, setKind] = useState<'matrix' | 'vector'>('matrix');
  const [matrixOp, setMatrixOp] = useState<MatrixOperation>('inv');
  const [vectorOp, setVectorOp] = useState<MatrixOperation>('cross');
  const [a, setA] = useState(initialMatrixA);
  const [b, setB] = useState(initialMatrixB);
  const [vectorA, setVectorA] = useState([['1', '0', '0']]);
  const [vectorB, setVectorB] = useState([['0', '1', '0']]);
  const [result, setResult] = useState<Responses['matrix']>();
  const task = useCalculation();
  const isMatrix = kind === 'matrix';
  const operation = isMatrix ? matrixOp : vectorOp;
  const hasB = ['add', 'subtract', 'multiply', 'dot', 'cross'].includes(operation);
  const clear = () => { task.cancel(); task.clearError(); setResult(undefined); };
  async function submit() {
    setResult(undefined);
    setResult(await task.run('matrix', { operation, a: isMatrix ? a : vectorA, b: isMatrix ? b : vectorB }));
  }
  function vectorDimension(value: string) {
    setVectorA(current => resize(current, 1, Number(value)));
    setVectorB(current => resize(current, 1, Number(value)));
    clear();
  }
  return <ToolCard label="線形代数の設定" icon={<Brackets size={20} />} onSubmit={submit} busy={task.busy} error={task.error}
    result={result && <ResultBox condition={result.condition} note={result.note}><MathText latex={result.latex} /></ResultBox>}>
    <Segments label="入力の種類" value={kind} items={mathKinds} onChange={value => { setKind(value); clear(); }} />
    <div className="form-grid two">
      <Select label="演算" value={operation} items={isMatrix ? matrixOps : vectorOps} onChange={value => {
        if (isMatrix) setMatrixOp(value);
        else { setVectorOp(value); if (value === 'cross') vectorDimension('3'); }
        clear();
      }} />
      {!isMatrix && operation !== 'cross' && <Select label="成分数" value={String(vectorA[0].length)}
        items={dimensions} onChange={vectorDimension} />}
    </div>
    <div className={'matrix-editors ' + (hasB ? 'two' : '')}>
      <MatrixEditor label="A" values={isMatrix ? a : vectorA} dimensionsEnabled={isMatrix}
        onChange={values => { (isMatrix ? setA : setVectorA)(values); clear(); }} />
      {hasB && <MatrixEditor label="B" values={isMatrix ? b : vectorB} dimensionsEnabled={isMatrix}
        onChange={values => { (isMatrix ? setB : setVectorB)(values); clear(); }} />}
    </div>
  </ToolCard>;
}

function resize(values: string[][], rows: number, columns: number) {
  return Array.from({ length: rows }, (_, i) => Array.from({ length: columns }, (_, j) => values[i]?.[j] ?? '0'));
}

function MatrixEditor({ label, values, dimensionsEnabled, onChange }: {
  label: string; values: string[][]; dimensionsEnabled: boolean; onChange: (values: string[][]) => void;
}) {
  return <fieldset className="matrix-editor">
    <legend>{dimensionsEnabled ? '行列 ' : 'ベクトル '}{label}</legend>
    {dimensionsEnabled && <div className="form-grid two">
      <Select label={label + ' の行数'} value={String(values.length)} items={dimensions}
        onChange={value => onChange(resize(values, Number(value), values[0].length))} />
      <Select label={label + ' の列数'} value={String(values[0].length)} items={dimensions}
        onChange={value => onChange(resize(values, values.length, Number(value)))} />
    </div>}
    <div className="matrix-bracket"><div className="matrix-grid" style={{ gridTemplateColumns: 'repeat(' + values[0].length + ', minmax(42px, 1fr))' }}>
      {values.flatMap((row, i) => row.map((value, j) => <TextInput key={i + '-' + j}
        label={label + ' ' + (i + 1) + ' 行 ' + (j + 1) + ' 列'} isLabelHidden value={value}
        onChange={next => onChange(values.map((r, y) => y === i ? r.map((cell, x) => x === j ? next : cell) : r))} />))}
    </div></div>
  </fieldset>;
}

export function Formula({ label, value, onChange, onSubmit }: {
  label: string; value: string; onChange: (value: string) => void; onSubmit?: () => void;
}) {
  return <div className="formula-field">
    <span className="form-label">{label}</span>
    <MathField label={label} value={value} onChange={onChange} onSubmit={onSubmit} />
  </div>;
}

function ToolCard({ label, icon, children, onSubmit, submitLabel = '計算する', busy, error, result }: {
  label: string; icon: ReactNode; children: ReactNode; onSubmit: () => Promise<void>; submitLabel?: string;
  busy: boolean; error: string; result?: ReactNode;
}) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void onSubmit(); }
  return <Card className="tool-card" padding={0}>
    <div className="tool-heading"><span className="tool-icon">{icon}</span><h2>{label}</h2></div>
    <form onSubmit={submit} className="tool-form">
      {children}
      <div className="form-actions"><Button label={submitLabel} variant="primary" type="submit" size="lg" isLoading={busy} />
      </div>
      <Problem message={error} />
    </form>
    {result}
  </Card>;
}
