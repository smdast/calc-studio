import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { ChevronDown, CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { MathText } from './MathField';

export function Segments<T extends string>({ label, value, items, onChange }: {
  label: string; value: T; items: ReadonlyArray<{ value: T; label: string }>; onChange: (value: T) => void;
}) {
  return <SegmentedControl label={label} value={value} onChange={next => onChange(next as T)} size="sm">
    {items.map(item => <SegmentedControlItem key={item.value} value={item.value} label={item.label} />)}
  </SegmentedControl>;
}

export function Select<T extends string>({ label, value, items, onChange }: {
  label: string; value: T; items: ReadonlyArray<{ value: T; label: string }>; onChange: (value: T) => void;
}) {
  return <label className="select-field">
    <span>{label}</span>
    <span className="select-wrap">
      <select value={value} onChange={event => onChange(event.currentTarget.value as T)}>
        {items.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
      <ChevronDown size={16} aria-hidden="true" />
    </span>
  </label>;
}

export function Problem({ message }: { message: string }) {
  return message && <div className="problem" role="alert"><CircleAlert size={18} aria-hidden="true" /><span>{message}</span></div>;
}

export function ResultBox({ children, approximate = false, condition, note }: {
  children: ReactNode; approximate?: boolean; condition?: string; note?: string;
}) {
  return <section className="tool-result" aria-live="polite">
    <h3>{approximate ? '近似結果' : '計算結果'}</h3>
    <div className="tool-result-content">{children}</div>
    {condition && <p className="tool-result-note">条件 <MathText latex={condition} /></p>}
    {note && <p className="tool-result-note">{note}</p>}
  </section>;
}
