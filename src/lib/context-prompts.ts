import type { JournalRecord, PromptId, PromptSettings } from "./journal";
import { pickPrompts } from "./prompts";
import { addDays } from "./dates";
import { t, tFor, type Locale, type Key } from "./i18n";
import { z } from "zod";

export type Opportunity = {
  id: string;
  kind: "meal_amount" | PromptId;
  recordIds: string[];
  version: string;
  facts: { date: string; consumedAmount?: "unknown" };
  actions: ("edit_meal" | "log_memory" | "log_weight" | "answer_feel" | "answer_water")[];
};
// The revision stays local / on our server. No record, quote or photo is sent to Meta.
export function recordVersion(record: JournalRecord): string {
  const canonical = (x: unknown): unknown =>
    Array.isArray(x)
      ? x.map(canonical)
      : x && typeof x === "object"
        ? Object.fromEntries(
            Object.entries(x)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, canonical(v)]),
          )
        : x;
  const text = JSON.stringify(canonical(record));
  let a = 2166136261,
    b = 5381;
  for (const ch of text) {
    a = Math.imul(a ^ ch.charCodeAt(0), 16777619);
    b = Math.imul(b, 33) ^ ch.charCodeAt(0);
  }
  return `${a >>> 0}-${b >>> 0}-${text.length}`;
}
/** Only confirmed, non-demo records and already-supported actions are eligible. */
export function opportunities(
  records: JournalRecord[],
  settings: PromptSettings | undefined,
  day: string,
): Opportunity[] {
  if (settings?.hidden || settings?.context?.day === day) return [];
  const real = records.filter((r) => !r.demo);
  const meals: Opportunity[] = real
    .filter(
      (r) =>
        r.type === "meal" &&
        r.meal.consumedFraction === null &&
        r.localDate >= addDays(day, -7) &&
        r.localDate <= day,
    )
    .sort((a, b) => b.localDate.localeCompare(a.localDate) || a.id.localeCompare(b.id))
    .slice(0, 2)
    .map((r) => ({
      id: `meal:${r.id}`,
      kind: "meal_amount",
      recordIds: [r.id],
      version: recordVersion(r),
      facts: { date: r.localDate, consumedAmount: "unknown" },
      actions: ["edit_meal"],
    }));
  const daily: Opportunity[] = pickPrompts(real, settings, day).map((kind) => ({
    id: `daily:${kind}:${day}`,
    kind,
    recordIds: [],
    version: day,
    facts: { date: day },
    actions: [
      (
        {
          feel: "answer_feel",
          water: "answer_water",
          memory: "log_memory",
          weight: "log_weight",
        } as const
      )[kind],
    ],
  }));
  return [...meals, ...daily]
    .filter((o) => !(settings?.context?.day === day && settings.context.id === o.id))
    .slice(0, 5);
}
export type Proposal = { opportunityId: string; question: string; version: string };
export type DailyState = "proposed" | "answered" | "skipped" | "obsolete" | "disabled";
export function proposalState(
  proposal: Proposal,
  current: Opportunity[],
  settings: PromptSettings | undefined,
  day: string,
  records: JournalRecord[] = [],
): DailyState {
  if (settings?.hidden || !settings?.aiConsent) return "disabled";
  if (settings.context?.day === day && settings.context.id === proposal.opportunityId)
    return settings.context.status;
  const meal = records.find(
    (r) => `meal:${r.id}` === proposal.opportunityId && r.type === "meal" && !r.demo,
  );
  if (meal?.type === "meal" && meal.meal.consumedFraction !== null) return "answered";
  const kind = proposal.opportunityId.split(":")[1];
  if (
    proposal.opportunityId.startsWith("daily:") &&
    records.some(
      (r) =>
        !r.demo &&
        r.localDate === day &&
        r.type ===
          (
            { feel: "condition", water: "water", weight: "weight", memory: "memory" } as Record<
              string,
              string
            >
          )[kind!],
    )
  )
    return "answered";
  return current.some((o) => o.id === proposal.opportunityId && o.version === proposal.version)
    ? "proposed"
    : "obsolete";
}
export function questionOptions(o: Opportunity, locale: Locale): string[] {
  // An unrestricted paraphrase cannot be verified for factuality. All display copy is localized.
  return ["a", "b"].map((v) => tFor(locale, `ctx.q.${o.kind}.${v}` as Key, { date: o.facts.date }));
}
export function deterministicQuestion(o: Opportunity): string {
  if (o.kind === "meal_amount") return t("ctx.meal", { date: o.facts.date });
  return t(
    ({ feel: "pr.feelQ", water: "pr.waterQ", memory: "pr.memoryQ", weight: "pr.weightQ" } as const)[
      o.kind
    ] as Key,
  );
}
export function validateProposal(raw: unknown, allowed: Opportunity[], locale: Locale): Proposal {
  const value = z
    .object({ opportunityId: z.string().max(180), question: z.string().trim().min(1).max(150) })
    .strict()
    .parse(raw);
  const opportunity = allowed.find((o) => o.id === value.opportunityId);
  if (!opportunity) throw new Error("unknown_opportunity");
  // Unsupported prose falls back to a factual code-owned label, never speculative advice.
  return {
    ...value,
    question: questionOptions(opportunity, locale).includes(value.question)
      ? value.question
      : questionOptions(opportunity, locale)[0]!,
    version: opportunity.version,
  };
}
export const cacheKey = (owner: string, locale: Locale, day: string) =>
  `mds.context.v1.${owner}.${locale}.${day}`;
export const attemptKey = (owner: string, day: string) => `mds.context.attempt.v1.${owner}.${day}`;
export function claimDaily(storage: Storage, owner: string, day: string): boolean {
  if (storage.getItem(attemptKey(owner, day))) return false;
  storage.setItem(attemptKey(owner, day), "1");
  return true;
}
