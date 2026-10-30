import { createContext, useContext } from "react";
import type { JournalRecord, Purchase } from "@/lib/journal";
import type { EntryKind } from "./QuickAddSheet";

export type Opener = (
  kind?: EntryKind,
  editing?: JournalRecord | Purchase,
  initialDate?: string,
) => void;
export const QuickAddCtx = createContext<Opener>(() => {});
export const useQuickAdd = () => useContext(QuickAddCtx);
