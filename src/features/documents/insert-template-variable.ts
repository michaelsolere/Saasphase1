export function insertTemplateVariableAtSelection({
  value,
  variable,
  selectionStart,
  selectionEnd,
}: {
  value: string;
  variable: string;
  selectionStart: number;
  selectionEnd: number;
}) {
  const token = `[[${variable}]]`;
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  return {
    value: `${value.slice(0, start)}${token}${value.slice(end)}`,
    cursor: start + token.length,
  };
}
