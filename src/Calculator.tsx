import { useEffect, useRef, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { MathfieldElement } from 'mathlive';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Drawer } from '@astryxdesign/core/Drawer';
import { IconButton } from '@astryxdesign/core/IconButton';
import { ArrowUpLeft, Check, Clipboard, Clock3, Delete, History, Keyboard, Trash2, X } from 'lucide-react';
import { derivative, historyFormula, integral, namedFormula } from './formulaTemplates';
import { MathField, MathText } from './MathField';
import { Problem, Segments } from './controls';
import type { Angle, Calculation, CalculatorOperation, DisplayFormat, HistoryEntry } from './model';
import { useSaved } from './persistence';
import { useCalculation } from './useCalculation';

const angles = (['DEG', 'RAD', 'GRAD'] as const).map(value => ({ label: value, value }));
const formats = [
  { value: 'exact', label: '厳密値' }, { value: 'decimal', label: '小数' },
  { value: 'mixed', label: '帯分数' }, { value: 'polar', label: '極形式' },
] as const;
const examples = [
  { label: '分数の加算', latex: '\\frac{1}{3}+\\frac{1}{6}' },
  { label: '三角関数', latex: '\\sin\\left(30^{\\circ}\\right)' },
  { label: '累乗', latex: '2^{100}' },
  { label: '微分', latex: derivative('x', 'x^2') },
  { label: '一元方程式', latex: 'x^2-4=0' },
];
const operationLabels: Record<CalculatorOperation | 'equation', string> = {
  calculate: '結果', simplify: '簡約', expand: '展開', factor: '因数分解', differentiate: '微分',
  integrate: '不定積分', definite: '定積分', polynomial: '一元方程式', interval: '一元方程式',
  system: '連立方程式', equation: '一元方程式',
};

interface Key {
  label: string;
  value?: string;
  visible?: ReactNode;
  kind?: 'number' | 'operator' | 'clear' | 'primary' | 'shift' | 'utility';
  icon?: ReactNode;
  action?: () => void;
}

const functionKey = (label: string, name = label): Key => ({ label, visible: label, value: '\\' + name + '\\left(#?\\right)' });
const named = (label: string, fn: string): Key => ({ label, value: '\\operatorname{' + fn + '}\\left(#?,#?\\right)' });
const symbol = (label: string, value: string, visible?: ReactNode): Key => ({ label, value, visible });
const operand = '\\blacksquare';
const mathKey = (label: string, value: string, latex: string): Key =>
  symbol(label, value, <MathText latex={latex} className="key-math" />);
const power = (label: string, exponent: string, visibleExponent = exponent): Key =>
  mathKey(label, '^{' + exponent + '}', operand + '^{' + visibleExponent + '}');
const placeholder = '#?';
const bounds: [string, string] = [placeholder, placeholder];
const previewBounds: [string, string] = [operand, operand];
const equationKey = symbol('式の等号を入力', '=', <>＝ <small>式</small></>);
const variableKey = symbol('変数 x を入力', 'x', 'x');
const formulaKeys = [
  variableKey, equationKey,
  mathKey('微分', derivative(placeholder, placeholder), derivative(operand, operand)),
  mathKey('不定積分', integral(placeholder, placeholder), integral(operand, operand)),
  mathKey('定積分', integral(placeholder, placeholder, bounds), integral(operand, operand, previewBounds)),
  symbol('簡約', namedFormula('simplify', placeholder)),
];
const alternateFormulaKeys = [
  variableKey, equationKey, symbol('解く文字', namedFormula('solve', placeholder, placeholder)),
  symbol('展開', namedFormula('expand', placeholder)), symbol('因数分解', namedFormula('factor', placeholder)),
  symbol('区間指定', namedFormula('solve', placeholder, ...bounds)),
];

export function Calculator({ active, history, setHistory }: {
  active: boolean;
  history: HistoryEntry[];
  setHistory: Dispatch<SetStateAction<HistoryEntry[]>>;
}) {
  const [angle, setAngle] = useSaved<Angle>('angle', 'DEG');
  const [format, setFormat] = useSaved<DisplayFormat>('format', 'exact');
  const [answer, setAnswer] = useSaved('answer', '0');
  const [input, setInput] = useState('');
  const [result, setResult] = useState<Calculation>();
  const [recallAnswer, setRecallAnswer] = useState<string>();
  const [shift, setShift] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [clearConfirmation, setClearConfirmation] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const field = useRef<MathfieldElement>(null);
  const latestInput = useRef('');
  const task = useCalculation();
  const entries = history.filter(entry => entry.settings?.operation !== 'system');
  const resultLatex = result?.[format] ?? result?.exact ?? '0';
  const resultLabel = result?.operation && result.operation !== 'calculate'
    ? operationLabels[result.operation] + (result.approximate ? '（近似値）' : '')
    : result?.approximate ? '近似値' : '結果';

  async function submit(source = field.current?.value ?? input, selectedAngle = angle, priorAnswer = recallAnswer ?? answer) {
    if (!source.trim()) { task.clearError(); return; }
    latestInput.current = source;
    setInput(source);
    const out = await task.run('calculate', { input: source, angle: selectedAngle, ans: priorAnswer });
    if (!out) return;
    setResult(out);
    if (out.operation !== 'equation') setAnswer(out.answer);
    setRecallAnswer(undefined);
    setHistory(existing => [{
      ...out, id: crypto.randomUUID(), input: source, angle: selectedAngle, previousAnswer: priorAnswer,
    }, ...existing].slice(0, 100));
  }

  function updateInput(value: string) {
    if (latestInput.current === value) return;
    latestInput.current = value;
    task.cancel();
    task.clearError();
    setCopyStatus('idle');
    setInput(value);
  }

  function clear() {
    task.cancel();
    task.clearError();
    updateInput('');
    setResult(undefined);
    setRecallAnswer(undefined);
    field.current?.focus();
  }

  useEffect(() => {
    if (!active) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !drawer && !event.defaultPrevented &&
          (document.activeElement === field.current || document.activeElement === document.body)) clear();
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  });

  useEffect(() => {
    if (active) return () => window.mathVirtualKeyboard.hide();
  }, [active]);

  function insert(key: Key) {
    if (key.action) return key.action();
    const element = field.current;
    if (!element || key.value === undefined) return;
    element.focus();
    element.insert(key.value, { format: 'latex', selectionMode: 'placeholder' });
    updateInput(element.value);
  }

  function recall(entry: HistoryEntry) {
    task.cancel();
    task.clearError();
    updateInput(historyFormula(entry));
    setAngle(entry.settings?.operation === 'interval' ? 'RAD' : entry.angle);
    setRecallAnswer(entry.previousAnswer);
    setResult(entry);
    setDrawer(false);
    requestAnimationFrame(() => field.current?.focus());
  }

  function example(source: string) {
    updateInput(source);
    setRecallAnswer(undefined);
    setDrawer(false);
    requestAnimationFrame(() => field.current?.focus());
    void submit(source, angle, answer);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(resultLatex);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  }

  const standard: Key[] = [
    functionKey('sin'), functionKey('cos'), functionKey('tan'),
    functionKey('log'), functionKey('ln'), mathKey('平方根', '\\sqrt{#?}', '\\sqrt{' + operand + '}'),
    power('二乗', '2'), power('べき乗', '#?', operand), mathKey('分数', '\\frac{#?}{#?}', '\\frac{' + operand + '}{' + operand + '}'),
    symbol('π', '\\pi'), symbol('e', '\\mathrm{e}'), symbol('虚数 i', '\\mathrm{i}', 'i'),
    symbol('(', '('), symbol(')', ')'), symbol('Ans', '\\mathrm{Ans}'),
  ];
  const alternate: Key[] = [
    functionKey('sin⁻¹', 'arcsin'), functionKey('cos⁻¹', 'arccos'), functionKey('tan⁻¹', 'arctan'),
    mathKey('10 のべき乗', '10^{#?}', '10^{' + operand + '}'),
    mathKey('e のべき乗', '\\exp\\left(#?\\right)', 'e^{' + operand + '}'),
    mathKey('立方根', '\\sqrt[3]{#?}', '\\sqrt[3]{' + operand + '}'),
    power('三乗', '3'), power('逆数', '-1'), mathKey('絶対値', '\\left|#?\\right|', '\\left|' + operand + '\\right|'),
    named('nCr', 'nCr'), named('nPr', 'nPr'), mathKey('階乗', '!', operand + '!'),
    named('GCD', 'gcd'), named('LCM', 'lcm'), symbol('素因数分解', '\\operatorname{factor}\\left(#?\\right)', '因数分解'),
  ];
  const operator = (label: string, value: string): Key => ({ label, value, kind: 'operator' });
  const keypad: Key[] = [
    { label: 'クリア', visible: 'AC', kind: 'clear', action: clear },
    { label: '一文字削除', icon: <Delete size={20} />, kind: 'utility', action: () => {
      field.current?.focus();
      field.current?.executeCommand('deleteBackward');
      if (field.current) updateInput(field.current.value);
    } },
    { ...operator('パーセント', '\\%'), visible: '%' }, { ...operator('割り算', '\\div'), visible: '÷' },
    ...row(['7', '8', '9'], { ...operator('掛け算', '\\times'), visible: '×' }),
    ...row(['4', '5', '6'], { ...operator('引き算', '-'), visible: '−' }),
    ...row(['1', '2', '3'], { ...operator('足し算', '+'), visible: '+' }),
    { label: '負の符号', value: '-', visible: '(-)', kind: 'utility' }, { label: '0', value: '0', kind: 'number' },
    { label: '小数点', value: '.', visible: '.', kind: 'number' },
    { label: '決定', visible: <span className="commit-label">＝<small>決定</small></span>, kind: 'primary',
      action: () => { void submit(); } },
  ];

  function historyContent(inDrawer: boolean) {
    return <>
      <div className="history-heading">
        <h2><History size={19} /> 計算履歴</h2>
        <div className="history-actions">
          {entries.length > 0 && <IconButton label="履歴を消去" tooltip="履歴を消去" variant="ghost" icon={<Trash2 size={17} />}
            onClick={() => setClearConfirmation(true)} />}
          {inDrawer && <IconButton label="履歴を閉じる" variant="ghost" icon={<X size={19} />} onClick={() => setDrawer(false)} />}
        </div>
      </div>
      {clearConfirmation && <div className="history-confirm">
        <span>計算履歴をすべて消去しますか？</span>
        <div><Button label="キャンセル" size="sm" variant="secondary" onClick={() => setClearConfirmation(false)} />
          <Button label="消去" size="sm" variant="destructive" onClick={() => {
            setHistory(current => current.filter(entry => entry.settings?.operation === 'system'));
            setClearConfirmation(false);
          }} /></div>
      </div>}
      {entries.length ? <ol className="history-list">
        {entries.map(entry => {
          const operation = entry.operation ?? entry.settings?.operation;
          return <li key={entry.id}>
            <Button label="数式を再入力" tooltip="数式を再入力" variant="ghost" className="history-item" onClick={() => recall(entry)}>
              <span className="history-equation">
                {operation && operation !== 'calculate' && <small>{operationLabels[operation]}</small>}
                <MathText latex={historyFormula(entry)} /><strong><MathText latex={entry.exact} /></strong>
              </span>
              <ArrowUpLeft size={15} aria-hidden="true" />
            </Button>
          </li>;
        })}
      </ol> : <>
        <div className="history-empty">
          <span className="empty-icon"><Clock3 size={25} strokeWidth={1.7} /></span>
          <strong>計算履歴はまだありません</strong>
          <span>計算すると、式と結果がここに表示されます。</span>
        </div>
        <div className="examples">
          <h3>例題を試す</h3>
          {examples.map(item => <Button key={item.label} label={item.label} variant="ghost" className="example"
            onClick={() => example(item.latex)} endContent={<MathText latex={item.latex} />} />)}
        </div>
      </>}
    </>;
  }

  return <>
    <div className="calculator-layout">
      <Card className="calculator-card" padding={0}>
        <div className="calculator-toolbar">
          <Segments label="角度単位" value={angle} items={angles} onChange={next => { setAngle(next); task.clearError(); }} />
          <Button className="mobile-history" label="履歴" icon={<History size={17} />} variant="ghost"
            onClick={() => setDrawer(true)} />
          <span className="toolbar-divider" />
          <IconButton label="文字キーボード" tooltip="文字や記号を入力" size="sm" variant="ghost" icon={<Keyboard size={18} />}
            onClick={() => {
              field.current?.focus();
              field.current?.executeCommand('toggleVirtualKeyboard');
            }} />
          <Button label="2nd" tooltip="関数キーの切替" aria-pressed={shift} variant={shift ? 'primary' : 'secondary'}
            size="sm" className="shift-key" onClick={() => setShift(!shift)} />
        </div>
        <div className="calculator-display">
          <div className="display-input">
            <span className="display-label">入力式</span>
            <MathField label="入力式" value={input} onChange={updateInput} fieldRef={field}
              onSubmit={() => { void submit(); }} placeholder="数式を入力" virtualKeyboard={false} />
          </div>
          <div className="display-output">
            <span className="display-label">{resultLabel}</span>
            <div className="main-result" data-testid="calculator-result" aria-live="polite" aria-busy={task.busy}>
              <MathText latex={resultLatex} />
            </div>
            <IconButton label={copyStatus === 'copied' ? 'コピー済み' : '結果をコピー'} tooltip="結果をコピー"
              variant="ghost" className="copy-button" icon={copyStatus === 'copied' ? <Check size={18} /> : <Clipboard size={17} />}
              isDisabled={!result} onClick={() => { void copy(); }} />
          </div>
        </div>
        <div className="calculator-status">
          <Segments label="結果の表示形式" value={format} items={formats} onChange={setFormat} />
          {result?.condition ? <span className="format-note">条件 <MathText latex={result.condition} /></span> :
            result?.note ? <span className="format-note">{result.note}</span> :
            result && format !== 'exact' && !result[format] && <span className="format-note">この結果では選択した形式を使用できません</span>}
        </div>
        {copyStatus === 'failed' && <span role="status" className="format-note">コピーできませんでした</span>}
        <Problem message={task.error} />
        <div className="key-section formula-key-section">
          <div className="formula-key-heading">
            <h2>式の入力 <span>微積分はラジアン</span></h2>
            <Button label="次の空欄" variant="ghost" size="sm" isDisabled={!input.includes('\\placeholder')}
              onMouseDown={event => event.preventDefault()} onClick={() => {
                field.current?.focus();
                field.current?.executeCommand('moveToNextPlaceholder');
              }} />
          </div>
          <div className="keys formula-keys">
            {(shift ? alternateFormulaKeys : formulaKeys).map(key => keyButton(key, insert, true))}
          </div>
        </div>
        <div className="keypad">
          <div className="key-section">
            <h2>関数キー</h2>
            <div className="keys function-keys">
              {(shift ? alternate : standard).map(key => keyButton(key, insert, true))}
            </div>
          </div>
          <div className="key-section">
            <h2>基本キー</h2>
            <div className="keys number-keys">
              {keypad.map(key => keyButton(key, insert, false, task.busy))}
            </div>
          </div>
        </div>
      </Card>
      <Card className="history-card" padding={0}>{historyContent(false)}</Card>
    </div>
    <div className="calculator-footer">
      <span><Keyboard size={17} /> キーボード操作</span><span><kbd>=</kbd> 等号の入力</span>
      <span><kbd>Enter</kbd> 決定</span><span><kbd>Esc</kbd> クリア</span>
    </div>
    {drawer && <Drawer isOpen onOpenChange={setDrawer} label="計算履歴" side="end" width={360} padding={0}>
      {historyContent(true)}
    </Drawer>}
  </>;
}

function row(numbers: string[], operator: Key): Key[] {
  return [...numbers.map(value => ({ label: value, value, kind: 'number' as const })), operator];
}

function keyButton(key: Key, insert: (key: Key) => void, isFunction: boolean, busy = false) {
  const className = 'key ' + (isFunction ? 'key-function' : 'key-' + key.kind);
  if (key.icon) return <IconButton key={key.label} label={key.label} icon={key.icon} className={className}
    onMouseDown={event => event.preventDefault()} variant="secondary" onClick={() => insert(key)} />;
  return <Button key={key.label} label={key.label} className={className}
    onMouseDown={event => event.preventDefault()} variant={key.kind === 'primary' ? 'primary' : 'secondary'}
    isLoading={key.kind === 'primary' && busy} onClick={() => insert(key)}>
    <span aria-hidden="true">{key.visible ?? key.label}</span>
  </Button>;
}
