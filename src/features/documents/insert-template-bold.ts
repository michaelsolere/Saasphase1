export function insertTemplateBoldAtSelection({
  value,
  selectionStart,
  selectionEnd,
  maxLength = 30_000,
}: {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  maxLength?: number;
}) {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  const selected = value.slice(start, end);
  const insertion = `**${selected}**`;
  const nextValue = `${value.slice(0, start)}${insertion}${value.slice(end)}`;

  if (nextValue.length > maxLength) {
    return { value, selectionStart: start, selectionEnd: end, changed: false };
  }

  const nextStart = start + 2;
  return {
    value: nextValue,
    selectionStart: nextStart,
    selectionEnd: selected ? nextStart + selected.length : nextStart,
    changed: true,
  };
}
