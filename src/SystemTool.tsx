import { useState } from 'react';
import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { TextInput } from '@astryxdesign/core/TextInput';
import { ArrowUpLeft, Equal, History } from 'lucide-react';
import { MathText } from './MathField';
import { Problem, ResultBox, Select } from './controls';
import type { HistoryEntry } from './model';
import { useCalculation } from './useCalculation';

const defaultRows = [['1', '1', '5'], ['1', '-1', '1']];
const variables = ['x', 'y', 'z', 'w'];
const sizes = ['2', '3', '4'].map(value => ({ value, label: value + ' 元' }));

export function SystemTool({ history, setHistory }: {
  history: HistoryEntry[];
  setHistory: Dispatch<SetStateAction<HistoryEntry[]>>;
}) {
  const entries = history.filter(entry => entry.settings?.operation === 'system');
  const [rows, setRows] = useState(entries[0]?.settings?.systemRows ?? defaultRows);
  const [result, setResult] = useState<Pick<HistoryEntry, 'exact' | 'approximate' | 'condition'>>();
  const task = useCalculation();
  const count = rows.length;

  function updateRows(next: string[][]) {
    task.cancel();
    task.clearError();
    setRows(next);
    setResult(undefined);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(undefined);
    const out = await task.run('system', { a: rows.map(row => row.slice(0, count)), b: rows.map(row => row[count]) });
    if (!out) return;
    const relation = out.approximate ? '\\approx ' : '=';
    const exact = out.values.map((value, i) => variables[i] + relation + value).join('\\qquad ');
    const calculated = { exact, approximate: out.approximate, condition: out.condition };
    setResult(calculated);
    const entry: HistoryEntry = {
      ...calculated, id: crypto.randomUUID(), input: '', displayInput: count + '\\text{元連立方程式}',
      answer: '0', angle: 'RAD', previousAnswer: '0', settings: {
        operation: 'system', systemRows: rows, variable: '', lower: '', upper: '',
      },
    };
    setHistory(current => [entry, ...current].slice(0, 100));
  }

  function resize(size: string) {
    const next = Number(size);
    updateRows(Array.from({ length: next }, (_, i) => [
      ...Array.from({ length: next }, (_, j) => (j < count ? rows[i]?.[j] : undefined) ?? (i === j ? '1' : '0')),
      rows[i]?.[count] ?? '0',
    ]));
  }

  return <div className="system-layout">
    <Card className="tool-card" padding={0}>
      <div className="tool-heading"><span className="tool-icon"><Equal size={20} /></span><h2>連立一次方程式の係数</h2></div>
      <form className="tool-form" onSubmit={event => { void submit(event); }}>
        <div className="system-editor">
          <Select label="変数の数" value={String(count)} items={sizes} onChange={resize} />
          <div className="system-scroll"><div className="system-grid" style={{ gridTemplateColumns:
            'repeat(' + count + ', minmax(42px, 1fr)) 16px minmax(42px, 1fr)' }}>
            {variables.slice(0, count).map(variable => <span className="cell-heading" key={variable}>{variable}</span>)}
            <span /><span className="cell-heading">右辺</span>
            {rows.flatMap((row, y) => row.flatMap((value, x) => [
              ...(x === count ? [<span className="equals" key={'equals-' + y}>=</span>] : []),
              <TextInput key={y + '-' + x} label={(y + 1) + ' 行 ' + (x < count ? variables[x] + ' の係数' : '右辺')}
                isLabelHidden value={value} onChange={next => updateRows(rows.map((cells, i) =>
                  i === y ? cells.map((cell, j) => x === j ? next : cell) : cells))} />,
            ]))}
          </div></div>
        </div>
        <div className="form-actions"><Button label="解を求める" type="submit" variant="primary" size="lg" isLoading={task.busy} /></div>
        <Problem message={task.error} />
      </form>
      {result && <ResultBox approximate={result.approximate} condition={result.condition}><MathText latex={result.exact} /></ResultBox>}
    </Card>
    {entries.length > 0 && <Card className="tool-card" padding={0}>
      <div className="history-heading"><h2><History size={19} /> 連立方程式の履歴</h2></div>
      <ol className="history-list">
        {entries.map(entry => <li key={entry.id}>
          <Button label="係数を再入力" variant="ghost" className="history-item" onClick={() => {
            if (!entry.settings) return;
            updateRows(entry.settings.systemRows);
            setResult(entry);
          }}>
            <span className="history-equation">
              <MathText latex={entry.displayInput ?? entry.input} /><strong><MathText latex={entry.exact} /></strong>
            </span>
            <ArrowUpLeft size={15} aria-hidden="true" />
          </Button>
        </li>)}
      </ol>
    </Card>}
  </div>;
}
