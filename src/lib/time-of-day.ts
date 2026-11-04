import type { PartOfDay } from "./journal";
export const TIMES_OF_DAY = ["morning", "afternoon", "evening", "night"] as const;
export const isPartOfDay = (value: unknown): value is PartOfDay =>
  typeof value === "string" && (TIMES_OF_DAY as readonly string[]).includes(value);
