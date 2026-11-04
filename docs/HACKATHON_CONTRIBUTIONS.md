# Hackathon contributions

This document describes repository changes, not unverified development hours or outcomes. Historical references below are retained from earlier passes; match them against the original Git history, the official event window and the final team before submission. The current isolated checkout contains a snapshot rather than that complete history.

| Evidence                                                            | Observable contribution                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pre-existing Lovable project through 40c82bc                        | TanStack Start shell, tracker forms/routes, Supabase configuration/migration, Momo prototype, mascot asset and historical specification                                                                                                                                                                                                                                                                                                           |
| 32dc80c, 29 October 2026                                            | Latest-record selection and separate purchase-lot inventory, identity-linked deductions and tracking regression coverage                                                                                                                                                                                                                                                                                                                          |
| 7d27393, 29 October 2026                                            | Durable Momo evidence/review/confirmation, stable batch IDs, local/cloud distinction and source view                                                                                                                                                                                                                                                                                                                                              |
| 75d286e, 29 October 2026                                            | Mobile daily questions, immediate logging, sheet disclosure and site-label localization                                                                                                                                                                                                                                                                                                                                                           |
| Completion pass, 30 October 2026 (see git log for its final commit) | Meal domain/form/Meta task and deterministic estimates; bounded grounded memory; account namespaces, private source uploads, targeted Undo; stricter validation/export and submission materials                                                                                                                                                                                                                                                   |
| Local UX pass, 4 November 2026 (in progress; not pushed/deployed)   | Compact selectable Momo review rows, inline missing-field/source warnings, progressive editing and one count-specific save; retained context photos distinguished from explicitly linked entry photos; requested-model/prompt/time disclosure; purchase/expense timeline visibility, coherent Calendar selection, Progress filter recovery and sync/recovery actions; shared 45-second provider deadline covering quota, response body and repair |

Do not claim the original app or dependencies were all created in this pass. Git timestamps alone do not establish eligibility. Lovable and Codex were development tools. The application's configured runtime AI path targets Meta Muse Spark Open through Baseten; it has no silent OpenAI-model fallback. This describes the implementation, not a verified live invocation.

## Rubric and demonstrable evidence

The [official rules](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/waiver), checked on 4 November 2026, weight **impact 30%, Meta tooling 25%, execution 20% and demo 25%**. They require an open-source repository and a three-minute demo video. No score is guaranteed.

- **Impact:** show how a fictional note/photo becomes a readable journal entry. Do not claim measured time savings, medical efficacy or uncollected user outcomes.
- **Meta tooling:** show an actual consented Meta request and editable output only after the provider smoke test succeeds. Code and mocked tests alone do not prove runtime use.
- **Execution:** demonstrate missing facts, source attribution, correction, explicit confirmation and persistence after reload. Preserve manual and recovery paths.
- **Demo:** use one capture → review → correct → confirm → reopen journey. The main recording is not a feature inventory.

The repository remains private; open-source publication and portal submission are pending owner authorization. See [RELEASE_CHECKLIST](RELEASE_CHECKLIST.md).

## Runtime Meta evidence anchors

- `src/lib/meta-provider.server.ts`: shared server-only endpoint, requested-model override and one 45-second deadline across quota, requests, response-body reads and bounded JSON repair.
- `src/lib/momo.functions.ts`: explicit-fact extraction into validated editable drafts.
- `src/lib/momo-tasks.functions.ts`: meal estimate task and owner-authorized candidate ranking.
- `src/lib/meals.ts`: item-range validation and application-computed totals, separate pictured/eaten semantics.
- `src/components/app/MomoSheet.tsx`, `MealForm.tsx`, `SourceEvidence.tsx`: consent, compact review, corrections, confirmation and retained evidence; linked versus context photos; requested model, prompt version and app-recorded analysis time.
- `src/components/app/RecordFinder.tsx`: original dated entries from validated candidate IDs; honest keyword fallback.

Actual live Meta inference is not established by mocked tests or source metadata. The 4 November 20:40 UTC integrated snapshot passed **823 tests across 61 files**, TypeScript and production build, with zero errors in cumulative changed-source lint and 11 existing Fast Refresh warnings. Re-run the gate after later edits. Record requested model, UTC time, outcome and any independently verified provider identity after the owner smoke test; see [SETUP_AND_ENV](SETUP_AND_ENV.md).

## Reuse and rights

React, TanStack Start/Router, Vite, Tailwind, Radix, Vaul, Lucide, Recharts, Supabase, Zod and Vitest are reused dependencies. Preserve their respective license notices; package manifests contain their license metadata. No framework/backend replacement was introduced.

Momo art and the Lovable mark predate this pass; their original provenance/license must be confirmed by the owner. IBM Plex Sans KR/Fraunces font imports predate this pass. Earlier meal verification used a generated plain-color PNG fixture. Current screenshots include a generated fictional salad/toast photo used for QA, not an actual meal observation, user photo or live inference result. The standalone QA route/asset is excluded from the deliverable; screenshots may show the fixture. Review every final demo asset for rights and private information before publication. See [ASSETS_AND_PRIVACY](ASSETS_AND_PRIVACY.md).
