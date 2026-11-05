import type { QuickAddSheet } from "./QuickAddSheet";

type Sheet = typeof QuickAddSheet;
let loaded: Sheet | undefined;
let pending: Promise<Sheet | undefined> | undefined;

export const getQuickAdd = () => loaded;

/** Only code is shared. Form state and owner-specific values stay in each mounted sheet. */
export function preloadQuickAdd() {
  pending ??= import("./QuickAddSheet")
    .then((module) => (loaded = module.QuickAddSheet))
    .catch(() => {
      pending = undefined;
      return undefined;
    });
  return pending;
}
