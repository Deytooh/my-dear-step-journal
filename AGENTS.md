<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Project rules
- App shell (header, 4-tab bottom nav, central Quick Add sheet) lives in `src/components/app/AppShell.tsx`, mounted once in `__root.tsx`; pages open forms via `useQuickAdd()` so every entry point shares one form implementation.
- Journal data goes through `src/lib/journal.tsx` (currently localStorage, Phase 1); swap its internals for Lovable Cloud in Phase 3 without changing page code.
- Instants are stored as ISO UTC plus `localDate` and `precision`; all date math/formatting goes through `src/lib/dates.ts` with the user's timezone, never `new Date().getDate()`.
- UI strings go through `t()` in `src/lib/i18n.ts`; Korean is the complete source dictionary.
- Demo records carry `demo: true` and are labelled in UI; inventory is derived from purchases minus stock-using injections plus a manual adjustment.
- Spec source documents are the user's uploaded master prompt / tokens; root `roadmap.md` tracks phases.
- Journal data syncs via src/lib/cloud-sync.ts: journal.tsx keeps local state and diffs it to Lovable Cloud when signed in, so page code stays storage-agnostic.

- App feel is presentation-only: shared CSS motion profiles and AppFeel own transient input/save effects; use AnimatedValue for truthful numeric reveals and honor reduced motion, so feedback never changes journal rules or invents medical progress.
- Momo output is validated server-side (src/lib/momo-schema.ts) and turned into editable drafts (src/lib/momo-drafts.ts); only user-confirmed drafts become records, because the provider has no guaranteed JSON mode.
- Today's question cards are picked by the pure, deterministic `pickPrompts` (src/lib/prompts.ts) with answered/skipped state in journal settings, so they stay fast and predictable without AI.
