# Submission status

**Publication update, 5 November 2026:** the repository is public and `main` includes the published implementation. The README now presents the Meta AI Developer Hackathon project, with an [in-repo presentation](HACKATHON_PRESENTATION.md) and owner-approved [MIT license](../LICENSE) for project code. Third-party asset rights remain separate. Live Meta, deployed privacy, hosted-build and video/portal verification remain pending in this record.

The dated results below describe the 4 November local UX pass and are retained as historical evidence. Later local performance/build results appear in [MOBILE_PERFORMANCE_2026-11-05](MOBILE_PERFORMANCE_2026-11-05.md). Neither snapshot certifies every subsequent commit.

The [official rules](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/waiver), checked on 4 November, specify **impact 30%, Meta tooling 25%, execution 20%, demo 25%**, an open-source repository and a three-minute video. **Deadline: 5 November 2026, 11:00 KST / 02:00 UTC.** These requirements do not establish eligibility, a completed portal form or a guaranteed score.

## Current local evidence

- **4 November, 22:40 UTC final local gate:** 981 tests across 72 files passed. Strict TypeScript and production build passed; cumulative changed-source lint had zero errors and 11 existing Fast Refresh warnings. Independent data-integrity and product-claims rechecks found no remaining blocker in their reviewed scope. This is not deployment certification. Historical checkpoints: 981/72 at 21:15, 873/64 at 20:53, 823/61 at 20:40, 806/60 at 20:32, 765/58 at 18:07, 619/51 at 17:43 (`4965e30`), 555/46 at 17:14, and 488/40 at 16:49.
- **Order-isolation check at 21:53 UTC:** complete shuffled runs with seeds `20261104` and `20261105` each passed all 981 tests across 72 files. A test-only photo mock dependency found by the first shuffled run was corrected; production code did not change.
- **Momo review:** compact checkbox rows, selected-entry count, inline missing-field/source warnings, details and source shown on demand, and one count-specific save action. Saved evidence retains original input and user corrections.
- **Recovery and backup:** account changes flush Momo’s most recent unsent source/review edits to their original account namespace, including changes made inside the 180 ms debounce. Additive backup import preserves existing IDs and preferences, carries verified new-lot stock corrections, rejects ambiguous legacy corrections without adding records, and distinguishes invalid files from failed local writes. JSON/CSV exports reject stale owner controls.
- **Interrupted forms:** closing a sheet invalidates pending work before its exit animation completes. Removed/replaced photos and deleted meal drafts cannot return from late callbacks; timezone changes release cancelled controls. Momo closes stop dictation before paint and preserve accepted text, corrections and deselections. These are controlled browser-API mocks, not a real microphone test.
- **Damaged sync metadata:** a corrupt baseline now preserves the local journal and requires an explicit version choice, even for an empty or equal journal. Recovery downloads the actual failed source. Retry and intervening tab conflicts remain actionable; malformed guest imports do not block a healthy account.
- **CSV export:** whitespace/control-prefixed and full-width formula-like IDs receive the existing text prefix, while original JSON remains unchanged. This is serializer hardening, not a guarantee of safety after editing or re-saving in every spreadsheet.
- **Keyboard navigation:** Calendar has complete grid rows/cells, one day in the tab sequence, day/week/month/year keyboard movement, focused Today recovery and exposed logged/reminder descriptions. History date filters stack at narrow widths. Physical-device and screen-reader testing remain pending.
- **Ownership and guest import:** stale journal controls and snapshot reads now reject an earlier account session, including A→B→A and unmount. Guest import uses the backup planner’s global-ID and stock rules, rechecks after photo copying, and reports stock conflicts without changing the original device journal. These are controlled local/auth-mock checks, not live backend security evidence.
- **Photo recovery:** each account/source receives its own bounded retry. A failed photo invalidates only that image, preserving unrelated pending photos; simultaneous views of the same image resolve the refreshed generation. Global auth cache invalidation remains intact.
- **Photo attribution:** original photos remain context. Only explicitly linked photos become meal/memory primary photos. An unclear source remains visibly uncertain rather than receiving a fabricated match.
- **Provenance:** Source shows requested model, prompt version and app-recorded analysis time in the journal's timezone. The requested-model value is not a provider-confirmed identity or proof that a live request succeeded.
- **App-wide UX:** purchases/expenses in Calendar and History, coherent selected Calendar dates, Progress filter recovery, actionable sync/local-recovery states, keyboard return/focus, 320 px corrections and native desktop 200% zoom. Existing exact-clock edits retain their fold occurrence and seconds. Demo reset preserves language/preferences; sign-out uses current-session scope with truthful failure handling.
- **Meal clarity:** custom eaten amounts start blank rather than guessed, recover without becoming Unknown, and focus a specific correction. Saved partial calorie totals explicitly say the complete meal total is unknown.
- **Provider resilience:** one 45-second deadline covers quota reservation, requests, response-body reads and one JSON repair. This is local implementation/test evidence, not production latency evidence.
- **Tooling:** Bun 1.4.4 installed with the frozen `bun.lock`; no dependency manifest or lockfile changes. The existing framework and backend project were retained.

Design/QA evidence lives in `docs/momo-review/` and `design-qa.md`. Current screenshots include a generated fictional salad/toast photo, not a user photo or live inference result. Local QA fixtures were moved out of the public asset directory before the 20:40 build; no `__qa__` paths remain in its production output. Mockups, UI fixtures, automated tests and browser emulation do not establish live provider behavior, real-device behavior or deployed security.

Historical remote check on **4 November, 22:39 UTC**: [main](https://github.com/Deytooh/my-dear-step-journal/tree/main) then pointed to [`0ff786fa29a5b864a464a862cf43e16537ccc491`](https://github.com/Deytooh/my-dear-step-journal/commit/0ff786fa29a5b864a464a862cf43e16537ccc491), matching the portable packet baseline; no remote writes were made. The 17:14 checkpoint includes durable cross-tab conflict choices, account-safe imports, safe handling of missing local snapshots/orphan baselines, note clearing and explicit stock-alias selection. Independent source/test review found no remaining unsafe scenario in that reviewed scope. Live cloud behavior remains unverified.

## Submission blockers

| Required evidence/action                | Current state                                                               | Next step                                                                                                                     |
| --------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Live Meta text and owned-photo requests | Not run: provider credential and dedicated test account unavailable         | Configure server key, quota and account-supported model; complete [SETUP_AND_ENV](SETUP_AND_ENV.md) smoke test                |
| Model identity                          | Default `meta-models/muse-spark-open-1026` is not verified for this account | Use the account-supported slug; distinguish requested configuration from independently verified provider identity             |
| Authenticated Supabase privacy/sync     | Two-account checks, deployed RLS and private storage not verified           | Test direct record/photo denial, reload, retry, signed access and sign-out with two dedicated accounts                        |
| Final build/device evidence             | 22:40 UTC final local gate; external gates remain                           | Final integrated gate, intended hosted build and actual-phone keyboard/large-text check                                       |
| Public source and licensing             | Public; project code is now MIT-licensed                                    | Confirm inherited asset rights, preserve third-party notices and recheck final files                                          |
| Video and portal                        | No final recording or submission confirmation                               | Record the coherent three-minute flow, verify judge access and portal fields, obtain submission approval, retain confirmation |

Use [RELEASE_CHECKLIST](RELEASE_CHECKLIST.md) for the short preflight and [DEMO_SCRIPT](DEMO_SCRIPT.md) for capture → review → correct → confirm → reopen. Manual fallback remains useful but does not substitute for live Meta evidence.

## Live verification record

**Pending.** Add only completed observations: UTC time; build/commit; fictional text or owned-photo input category; requested model; separately verified provider identity if available; outcome; save/reload/source result; and two-account privacy result. Never include credentials, account identifiers, personal health input or private photos here. “Requested model” alone does not fill the identity field.

## Historical evidence retained

These are earlier snapshots, not claims about the current uncommitted tree:

- **30 October baseline:** documented `main` at `75d286e`, clean at the start of that pass; 38 tests and build passed. Lint had 9,472 formatting errors and 22 React-refresh warnings.
- **30 October completion:** 70 tests across 11 files, strict TypeScript and build passed; lint had zero errors and 22 existing warnings after formatting normalization. No dependency upgrade or backend replacement was reported.
- **Local meal/browser rehearsal:** a generated plain-color PNG and fictional dish with a user-entered 500–700 kcal estimate, explicitly halved, saved and reopened after reload at 250–350 kcal. This was manual fixture evidence, not a food image or AI result. Local IndexedDB image persistence and keyword retrieval were observed.
- **Earlier mobile checks:** browser-sized 360/390/430 layouts had no page/dialog horizontal overflow. A 48 px Save remained in view, including a 360×460 keyboard-sized viewport. The meal appeared in Calendar/History and its original opened from search. Physical keyboard, camera, microphone and enlarged-text behavior were not established.
- **Earlier regression coverage:** tracker/inventory create/edit/transfer/delete/Undo; meal ranges, unknown totals, fraction applied once and backup/CSV round trips; mocked provider/repair/quota failures, owner-bound retrieval, account switching, late responses, uploads, source-link expiry and sync retry. Mocked coverage does not certify deployed owner isolation.
- **20:41 UTC publication preflight:** 671 quoted translation keys match across Korean, English and French, with no duplicate keys or mismatched placeholders. A bounded tracked-file privileged-key pattern scan found no matches; the rebuilt client output contains no `BASETEN_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` names. This is a targeted check, not a comprehensive security certification.
- **Earlier secret scan:** tracked `.env` classified as public/publishable configuration only; no provider/service-role key was present. Client bundle scan found zero `BASETEN_API_KEY`/`SUPABASE_SERVICE_ROLE_KEY` matches, and the privileged-credential pattern scan had no findings. Repeat against the final publication candidate.
- **Follow-on snapshots:** [UX_AUDIT](UX_AUDIT.md) recorded 75 tests, TypeScript/build pass and lint zero errors/22 warnings. [CONTEXT_QUESTIONS](CONTEXT_QUESTIONS.md) recorded 96 local tests, with connected Meta and real SQL reservation still awaiting configuration.

The isolated UX checkout preserves a source snapshot; use the original repository's history to verify contribution dates. See [HACKATHON_CONTRIBUTIONS](HACKATHON_CONTRIBUTIONS.md).

## Deliberate boundaries

No medical efficacy, medication/nutrition advice, measured photo calories, native audio-to-Meta, background push delivery, bank/pharmacy feed or daily calorie budget is claimed. Runtime AI is optional and authenticated; manual logging works without it. Quota configuration fails closed if absent.

Cloud operations may partially succeed; stable-ID retry is not a cross-table transaction. Snapshot conflict handling is not real-time multi-device merging. Local snapshot and sync-baseline writes are separate operations; a failed second write keeps recovery actionable but does not roll back the already-selected local version. Back up before choosing a version. Structured backups contain media references, not a standalone photo archive. Source-blob cleanup/account deletion remain administrative backend operations. Damaged local snapshots are write-protected and recoverable through a downloaded copy; do not overwrite the original while testing recovery.
