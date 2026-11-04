/** Empty selects Unknown; Other keeps an unfinished custom choice distinct from Unknown. */
export const CUSTOM_MEAL_FRACTION = "other";

/** Invalid/custom-blank input remains invalid at commit, never a guessed amount. */
export function parseMealFractionInput(value: string): number | null {
  if (value === "") return null;
  if (!value.trim()) return NaN;
  const fraction = Number(value);
  return Number.isFinite(fraction) && fraction >= 0 && fraction <= 1 ? fraction : NaN;
}
