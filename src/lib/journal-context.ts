import { createContext } from "react";
import type { JournalContextValue } from "./journal";

// Keep this module free of provider components so Fast Refresh does not replace the context.
export const JournalCtx = createContext<JournalContextValue | null>(null);
