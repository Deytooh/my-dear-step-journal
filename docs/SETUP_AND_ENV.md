# Setup and environment

Use the existing project; never create/reset a database as a setup shortcut.

## Local tools and commands

Node 22+; use Bun with the checked-in `bun.lock`. Run `bun install --frozen-lockfile`, then `bun run dev` (normally port 8080). Before release run `bun run test`, `bunx tsc --noEmit`, `bun run build` and `bun run lint` after the final edit. The 4 November UX environment installed Bun 1.4.4 with the frozen lockfile; no manifest or lockfile changed. The earlier 30 October pass used existing npm dependencies because Bun was then unavailable.

Existing `.env` was classified in the earlier pass as public project URLs, IDs and publishable keys only. Recheck the final tracked files and client build before publication. Keep the existing project values. `.env.example` lists names/placeholders, never privileged secrets. Put local server secrets in ignored `.env.local` or the host secret manager.

| Name                          | Scope/purpose                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| VITE_SUPABASE_URL             | Browser URL of the existing project                                                   |
| VITE_SUPABASE_PUBLISHABLE_KEY | Browser-safe publishable key                                                          |
| VITE_SUPABASE_PROJECT_ID      | Existing project ID                                                                   |
| SUPABASE_URL                  | Server URL for the same backend                                                       |
| SUPABASE_PUBLISHABLE_KEY      | Server publishable key; not a service-role key                                        |
| BASETEN_API_KEY               | Server-only Baseten credential                                                        |
| MUSE_MODEL                    | Optional server model override; installed default is meta-models/muse-spark-open-1026 |

No service-role key is required by the application AI path. Never put a provider/privileged key in a VITE_ variable. Restart the server after changing runtime configuration.

## Existing backend and additive SQL

`0000_migration.sql` defines existing tables and owner RLS. Inspect deployed tables/policies before applying anything; do not rerun table creation against existing tables. Meals use the existing JSONB payload and type column, with no table replacement.

Review and apply the prepared **drizzle/migrations/0001_momo_quota_and_questions.sql** in the existing project's authorized SQL/migration workflow. It adds an owner-derived security-definer quota function: at most 20 AI tasks per authenticated user per database calendar day, atomically reserved. Verify the database/session timezone is UTC for the intended day boundary. The same file adds the daily contextual-question reservation and cache. If the RPC is missing, AI fails closed with a configuration message. Failed/repair tasks can still consume one reservation; requests are not refunded automatically. One shared **45-second deadline** bounds quota reservation, provider requests, response-body reads and the single permitted repair. A timed-out operation does not start a later paid request or repair; it is not a quota refund guarantee.

**Private photo bucket provisioning is a separate pending owner step.** No `0002_private_photos_bucket.sql` is present in this repository. Inspect the existing `photos` bucket through the authorized backend workflow. If absent, provision it as private with a 2 MiB upload limit and JPEG/PNG/WebP types; if present, verify those settings rather than overwriting them. Existing owner-folder select/insert/delete policies in `drizzle/migrations/0000_migration.sql` must be deployed. That file defines policies but does not create the bucket. The source uploads use content-derived paths and do not require public access or upsert permissions. Deleting a record does not delete a blob still potentially referenced elsewhere; media retention cleanup/account deletion is an administrative operation in this release.

## Real provider verification (owner action)

As of 4 November, no provider credential or dedicated authenticated test account was supplied for this pass. No live inference or deployed Supabase check is claimed. [Meta's official Baseten cookbook](https://github.com/meta-models/meta-oss-cookbook/blob/main/muse-spark/hosted/baseten.md), checked on 4 November, documents `meta-models/muse-spark-open` and Baseten's compatible API at `https://inference.baseten.co/v1`. The app uses `/chat/completions`. The installed default `meta-models/muse-spark-open-1026` is an unverified account alias. Configure an account-supported slug and verify it with a real smoke test; never silently substitute a non-Meta model.

1. Configure the server key, quota migration and supported model; sign into a dedicated test account.
2. With fictional text, consent and extract: `오늘 체중은 78.4kg, 기분은 편안해요. 지난 금요일 저녁에 주사를 맞았고 용량과 부위는 모르겠어요.`
3. Inspect the checkbox review rows, dates and missing/source warnings. Verify unknown dose/site/precise time are not invented. Correct one value, confirm the selected count once and reopen Source after reload.
4. Use your own meal photo with a fictional caption. Check likely foods, ranges and assumptions. Select half explicitly and verify deterministic halving once. Confirm that original photos remain available as context and that only explicitly linked photos become the meal/memory primary image.
5. Test a non-food image and denied microphone permission. Both must retain a manual path.

Record the UTC test time, requested model, input category, outcome and any independently verified provider identity in [SUBMISSION_STATUS](SUBMISSION_STATUS.md), with no secrets or personal input. Source displays the **requested model**, prompt version and app-recorded analysis time in the journal's timezone. The current adapter returns its requested configuration; that value is not the provider's confirmed model identity.

Browser voice uses SpeechRecognition/webkitSpeechRecognition transcription where supported, not raw-audio Meta inference.

## Privacy and failure checks before release

Use two dedicated test accounts. Create distinct records/photos in A, then B. Attempt direct record IDs and storage paths using B: A's entries and photos must be inaccessible. Check expired signed URLs renew and sign-out removes source access. These are deployed-RLS checks, not replaced by mocked tests.

Local data is namespaced (`mds.journal.v1` guest, `.user.<id>` accounts) and not encrypted at rest. The legacy global key is treated only as guest data; do not import it into an account without reviewing ownership. New accounts do not import it automatically. Explicit guest import excludes examples and copies guest media into the chosen owner namespace.

Unsynced account data stays in its local namespace on sign-out. Conflicting local/cloud or other-tab snapshots prompt a choice; export before choosing a version. This is snapshot conflict handling, not real-time collaborative merging. Cloud diffs are independent idempotent upserts/deletes, not an atomic multi-table transaction. Retry retains stable IDs and can complete partial sync.

Invalid local snapshots are protected against overwrite and have a recovery download in Settings, with a recovery action surfaced in the app shell. Repair a copy and import it in a fresh browser profile through the validated importer; retain the original profile/file until recovery is confirmed. The damaged namespace remains write-protected. JSON imports validate all rows and add entries without overwriting existing IDs. JSON/CSV contain references, not the private media bytes. Localphoto references require the same browser profile; storage references require the same authorized account. The Progress text summary is narrower still: no photos or original AI source evidence, so it is not a journal backup.

## Fictional demo

Guest Settings → start/reset fictional demo, then confirm replacement only in a disposable guest profile. Demo anchor is the current date in the journal’s selected timezone **at reset**; all offsets are relative to that visible date. The production clock is never fixed. Reset replaces guest state after an explicit warning; it is unavailable in signed-in accounts. Keep real records in a separate browser profile/account and export before any reset.

For live AI recording, use a separate dedicated test account with fictional text and an owned meal image. Do not import guest example flags into a real account. A manual fixture/illustration is not evidence of live inference.

The 30 October event-page retrieval only showed a loading shell. The [official rules](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/waiver) were subsequently checked on 4 November: open-source repository, three-minute demo video and deadline **5 November 2026, 11:00 KST / 02:00 UTC**. Signed-in portal fields, publication and submission remain separate pending checks/actions. See [RELEASE_CHECKLIST](RELEASE_CHECKLIST.md).
