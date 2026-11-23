import type { MathfieldElement } from 'mathlive';

export function moveToFormulaSlot(field: MathfieldElement, backwards = false): boolean {
  const ranges = field.getPrompts()
    .flatMap(id => {
      const range = field.getPromptRange(id);
      return range ? [range] : [];
    })
    .sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const position = field.position;
  const next = backwards
    ? ranges.reverse().find(range => range[1] < position)
    : ranges.find(range => range[0] > position);
  if (!next) return false;
  field.selection = { ranges: [next], direction: 'forward' };
  return true;
}
