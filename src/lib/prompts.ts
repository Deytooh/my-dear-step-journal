import type { JournalRecord, PromptId, PromptSettings } from "./journal";

export const PROMPT_ORDER: PromptId[] = ["feel", "water", "memory", "weight"];
export const MAX_PROMPTS = 3;

/**
 * Deterministic daily question picker. A question is hidden when it was answered or skipped
 * today, turned off by the user, or (weight / memory) already recorded today.
 */
export function pickPrompts(records: JournalRecord[], settings: PromptSettings | undefined, today: string): PromptId[] {
  if (settings?.hidden) return [];
  const off = new Set(settings?.off ?? []);
  const done = settings?.done ?? {};
  const todays = records.filter((r) => r.localDate === today);
  return PROMPT_ORDER.filter((id) => {
    if (off.has(id) || done[id] === today) return false;
    if (id === "weight" && todays.some((r) => r.type === "weight")) return false;
    if (id === "memory" && todays.some((r) => r.type === "memory")) return false;
    return true;
  }).slice(0, MAX_PROMPTS);
}
