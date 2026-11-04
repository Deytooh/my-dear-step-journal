/** User-entered amounts: blank stays unknown; invalid or ambiguous formatting is never guessed. */
export function parseAmountInput(value: string | undefined): number | null {
  const text = value?.trim();
  if (!text) return null;
  if (!/^(?:\d+(?:\.\d+)?|\d+,\d{1,2})$/.test(text)) return NaN;
  const amount = Number(text.replace(",", "."));
  return Number.isFinite(amount) ? amount : NaN;
}
