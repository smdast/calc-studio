import { createElement, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { convertLatexToMarkup, MathfieldElement } from 'mathlive';
import 'mathlive/fonts.css';
import 'mathlive/static.css';
import { normalizeFormulaLatex } from './formulaTemplates';

MathfieldElement.fontsDirectory = null;
MathfieldElement.soundsDirectory = null;

export function MathField({ label, value, onChange, onSubmit, fieldRef, placeholder, virtualKeyboard = true }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  fieldRef?: RefObject<MathfieldElement | null>;
  placeholder?: string;
  virtualKeyboard?: boolean;
}) {
  const localRef = useRef<MathfieldElement>(null);
  const ref = fieldRef ?? localRef;
  const callbacks = useRef({ onChange, onSubmit });
  const lastReported = useRef(value);
  callbacks.current = { onChange, onSubmit };
  useEffect(() => {
    const field = ref.current;
    if (!field) return;
    field.mathVirtualKeyboardPolicy = virtualKeyboard ? 'auto' : 'manual';
    field.smartFence = false;
    field.menuItems = [];
    const onInput = () => {
      if (lastReported.current !== field.value) {
        lastReported.current = field.value;
        callbacks.current.onChange(field.value);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      const actions = callbacks.current;
      if (actions.onSubmit && !event.isComposing && event.key === 'Enter') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onInput();
        actions.onSubmit();
      }
    };
    const onPaste = (event: ClipboardEvent) => {
      const input = event.clipboardData?.getData('text/plain');
      if (!input) return;
      const normalized = normalizeFormulaLatex(input);
      if (input === normalized) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      field.insert(normalized, { format: 'latex' });
      onInput();
    };
    field.addEventListener('input', onInput);
    field.addEventListener('keydown', onKey, true);
    field.addEventListener('paste', onPaste, true);
    return () => {
      field.removeEventListener('input', onInput);
      field.removeEventListener('keydown', onKey, true);
      field.removeEventListener('paste', onPaste, true);
    };
  }, [ref, virtualKeyboard]);
  useEffect(() => {
    const field = ref.current;
    lastReported.current = value;
    if (field && field.value !== value) field.setValue(value, { silenceNotifications: true });
  }, [ref, value]);
  return createElement('math-field', { ref, 'aria-label': label, placeholder,
    className: virtualKeyboard ? 'math-field' : 'math-field math-field-custom-keypad' });
}

export function MathText({ latex, className }: { latex: string; className?: string }) {
  return <span className={className} role="math" aria-label={latex}>
    <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: convertLatexToMarkup(latex) }} />
  </span>;
}
