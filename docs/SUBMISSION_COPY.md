# Submission copy

## Title

my dear step — records with a source, memories you can revisit

## One-line pitch

A Korean-first personal journal that turns supplied words and photos into editable records, retains their evidence, and helps you find your own history.

## Short description

My Dear Step combines fast manual tracking with Momo, an optional Meta Muse Spark Open companion. Users review and correct proposed weight, injection, condition, moment, purchase and meal records before saving. Source text and private photo references remain inspectable. Meal estimates distinguish pictured food from the amount the user explicitly reports eating; personal memory opens existing dated records.

## Problem

People can lose context when small health-related notes, receipts and photos are scattered across a phone. Typing the same details into structured fields is tedious, while opaque AI answers can turn uncertain inputs into apparently certain records.

## Solution / longer description

My Dear Step keeps a useful manual journal at the center. Four mobile tabs organize Today, Calendar, Injections and Progress; one shared logging sheet supports corrections and source review. Momo reduces typing by proposing structured drafts from text, browser-transcribed speech and supported photos. Missing medication, dose, date, site and exact time stay missing until the user supplies them where required.

The meal journal is a supporting capture workflow: likely food names, possible ingredients, pictured portions and approximate energy ranges are editable. Application code sums included items, marks partial totals and applies an explicitly selected eaten fraction once. It offers no meal scores, calorie targets or treatment/nutrition coaching.

The second half is retrieval. Authenticated memory ranking receives a bounded set of owner-authorized journal facts, and every returned ID must belong to that set. Results open the original dated entry and source. Deterministic keyword search is an honest fallback. No vector platform or internet search over private history is needed.

## Actual Meta integration

The server uses the Baseten Chat Completions adapter for explicit-fact extraction, meal-image estimation, bounded memory ranking, and optional contextual questions. Contextual questions select among authorized opportunities and constrained translated variants; they do not provide free-form health advice. The configured target is Meta Muse Spark Open; MUSE_MODEL permits an account-supported alias that must be verified in a live smoke test. JSON output is validated, with at most one bounded repair. Journal entries are saved only after user confirmation. API credentials stay on the server; AI requires authentication, consent and a database-backed daily quota.

**Verification note:** implementation and mocked provider tests are complete; a live call was blocked locally by the absent BASETEN_API_KEY. Replace this sentence with the actual verified model/timestamp only after the documented smoke test succeeds. Do not claim live inference from the screenshots alone.

## Technical highlights

TanStack Start/React/TypeScript, existing Supabase/Lovable Cloud JSONB/RLS, private owner-folder media, IndexedDB local media references, stable record IDs and durable local batch writes, product/unit-specific inventory, targeted Undo, timezone/precision preservation, and Korean/English/French controls. Cloud operations retry idempotently; they are not a single multi-table transaction.

## Links to confirm

- Source: https://github.com/Deytooh/my-dear-step-journal (public as checked on 5 November 2026; project code is MIT-licensed, with third-party rights retained)
- Hosted app supplied by owner: https://my-dear-step-journal.lovable.app/ (verify latest connected build and judge access)
- Demo video: [OWNER: insert actual shareable URL]
- Team and event-window contribution fields: [OWNER: confirm actual participants and dates]

## Boundaries and limitations

No medical decision-making, medication/dose recommendations, meal grades, daily nutrition targets, push delivery, bank/pharmacy feeds, native app or raw-audio Meta claims. Estimates are uncertain and editable. Media references in structured exports are not standalone photo backups. Browser-local data is not encrypted at rest. Deployed two-account RLS/storage checks and physical-phone behavior require owner verification.

## Organizer-scope note for the owner

The supplied rules exclude AI nutrition coaches and generic simple image analyzers. This project is a multimodal journal and evidence-linked memory workflow; meal estimation is a supporting editable log with no coaching or targets. This framing is **not organizer approval**. Confirm eligibility in the official portal/with the organizer before submitting; do not present an inferred interpretation as authorization.
