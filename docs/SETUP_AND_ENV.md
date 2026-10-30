# Setup and environment

Use the existing project; never create/reset a database as a setup shortcut.

## Local tools and commands

Node 22+; Bun with the checked-in `bun.lock` preferred. `bun install --frozen-lockfile`, then `bun run dev` (normally port 8080), `bun run test`, `bun run build`, `bun run lint`. `npx tsc --noEmit` adds a strict type check. This completion run used the already installed npm dependencies because Bun was unavailable. No dependency manifest or lockfile was changed.

Existing `.env` contains public project URLs, IDs and publishable keys only, as classified during this pass. Keep the existing project values. `.env.example` lists names/placeholders, never privileged secrets. Put local server secrets in ignored `.env.local` or the host secret manager.

| Name | Scope/purpose |
| --- | --- |
| VITE_SUPABASE_URL | Browser URL of the existing project |
| VITE_SUPABASE_PUBLISHABLE_KEY | Browser-safe publishable key |
| VITE_SUPABASE_PROJECT_ID | Existing project ID |
| SUPABASE_URL | Server URL for the same backend |
| SUPABASE_PUBLISHABLE_KEY | Server publishable key; not a service-role key |
| BASETEN_API_KEY | Server-only Baseten credential |
| MUSE_MODEL | Optional server model override; installed default is meta-models/muse-spark-open-1026 |

No service-role key is required by the application AI path. Never put a provider/privileged key in a VITE_ variable. Restart the server after changing runtime configuration.

## Existing backend and additive SQL

`0000_migration.sql` defines existing tables and owner RLS. Inspect deployed tables/policies before applying anything; do not rerun table creation against existing tables. Meals use the existing JSONB payload and type column, with no table replacement.

Apply the prepared **0001_momo_quota.sql** in the existing project's authorized SQL/migration workflow. It adds an owner-derived security-definer quota function: at most 20 AI tasks per authenticated user per UTC database day, atomically reserved. If the RPC is missing, AI fails closed with a configuration message. Failed/repair tasks can still consume one reservation; requests are not refunded automatically. One repair shares the 45-second task timeout.

Apply **0002_private_photos_bucket.sql** if the photos bucket is absent. It provisions a private bucket with a 2 MiB upload limit and JPEG/PNG/WebP types. It intentionally does not change an existing bucket; verify that `photos.public` is false. Existing owner-folder select/insert/delete policies in 0000 must be deployed. The new source uploads use content-derived paths and do not require public access or upsert permissions. Deleting a record does not delete a blob still potentially referenced elsewhere; media retention cleanup/account deletion is an administrative operation in this release.

## Real provider verification (owner action)

No BASETEN_API_KEY was available locally during completion, and no live inference was claimed. Baseten's [official launch example](https://www.baseten.co/resources/changelog/muse-spark-open-and-nemotron-35-super-vl-available-on-baseten/) and [Meta's hosted-provider example](https://github.com/meta-models/meta-oss-cookbook/blob/main/muse-spark/hosted/baseten.md) document `meta-models/muse-spark-open` at `https://inference.baseten.co/v1/chat/completions`. The installed dated alias has not been verified for this account. Set MUSE_MODEL only to the slug available to your account after a real smoke test; never silently substitute a non-Meta model.

1. Configure the server key, quota migration and supported model; sign into a dedicated test account.
2. With fictional text, consent and extract: `오늘 체중은 78.4kg, 기분은 편안해요. 지난 금요일 저녁에 주사를 맞았고 용량과 부위는 모르겠어요.`
3. Confirm dates; verify dose/site/time remain unknown. Correct one value, confirm once and reopen source after reload.
4. Use your own meal photo with a fictional caption. Confirm likely foods, ranges and assumptions. Select half explicitly; verify deterministic halving once. Record timestamp, actual model ID and success privately in SUBMISSION_STATUS (no secrets or personal input).
5. Test a non-food image and denied microphone permission. Both must retain a manual path.

Browser voice uses SpeechRecognition/webkitSpeechRecognition transcription where supported, not raw-audio Meta inference.

## Privacy and failure checks before release

Use two dedicated test accounts. Create distinct records/photos in A, then B. Attempt direct record IDs and storage paths using B: A's entries and photos must be inaccessible. Check expired signed URLs renew and sign-out removes source access. These are deployed-RLS checks, not replaced by mocked tests.

Local data is namespaced (`mds.journal.v1` guest, `.user.<id>` accounts) and not encrypted at rest. The legacy global key is treated only as guest data; do not import it into an account without reviewing ownership. New accounts do not import it automatically. Explicit guest import excludes examples and copies guest media into the chosen owner namespace.

Unsynced account data stays in its local namespace on sign-out. Conflicting local/cloud or other-tab snapshots prompt a choice; export before choosing a version. This is snapshot conflict handling, not real-time collaborative merging. Cloud diffs are independent idempotent upserts/deletes, not an atomic multi-table transaction. Retry retains stable IDs and can complete partial sync.

Invalid local snapshots are protected against overwrite and have a recovery download in Settings. Repair a copy and import it in a fresh browser profile through the validated importer; retain the original profile/file until recovery is confirmed. The damaged namespace remains write-protected. JSON imports validate all rows and add entries without overwriting existing IDs. JSON/CSV contain references, not the private media bytes. Localphoto references require the same browser profile; storage references require the same authorized account.

## Fictional demo

Guest Settings → start/reset fictional demo, then confirm replacement only in a disposable guest profile. Demo anchor is the current Asia/Seoul date **at reset**; all offsets are relative to that visible date. The production clock is never fixed. Reset replaces guest state after an explicit warning; it is unavailable in signed-in accounts. Keep real records in a separate browser profile/account and export before any reset.

For live AI recording, use a separate dedicated test account with fictional text and an owned meal image. Do not import guest example flags into a real account. A manual fixture/illustration is not evidence of live inference.

The public event details retrieval on 30 October showed a loading shell, so it did not verify logged-in portal fields or the official video limit. Use the participant portal for those checks.
