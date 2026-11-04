# Global journal QA

Checked on 4 November 2026 in the cloud browser. All data was fictional and local to a disposable preview. The real shared routes, forms and persistence code were exercised through an excluded local fixture. This was not a live Meta or authenticated Supabase test.

## Observed flows

- **History:** purchase, expense and weight rows appear together, with example labels. Expense opens the existing expense editor. A Feeling filter with no matches shows Clear filters; clearing restores the rows. The new Expense filter shows only the expense.
- **Calendar:** a day containing only purchases/expenses shows those rows. Month navigation preserves the selected day and clamps January 31 to February 28. Add opens a form for that selected date. Today returns to the current month/day.
- **Time accuracy:** adding on the previous day opens the shared Weight form with time Unknown, rather than assigning the current clock. Existing exact/date-only edits and today's defaults are covered separately by tests.
- **Progress:** an older weight outside the current range offers Show all dates, which reveals the chart. An empty journal offers Add · Weight, which opens the shared form. No false Manual provenance label appears.
- **Local recovery:** malformed local data shows Recover data. That action opens Settings and focuses the recovery explanation and original-file download control. Opening it does not download or overwrite data.
- **Other-tab conflict:** an actual storage event from the fixture creates the conflict warning. Keeping this version survives reload. Saving a weight edit while the conflict is open leaves Review conflict visible. Explicitly using the other version then reloading restores that version, including its fictional extra entry. No automatic merge is claimed.
- **Momo attribution:** the compact row shows Check source when an item has no linked excerpt/photo. It remains selected until the user changes it. Its details distinguish batch context photos from linked photos and display the requested model, prompt version and analysis time. The test values clearly identify themselves as fictional.

## Screenshots

- [Filtered History](10-history-no-matches.png)
- [Calendar-selected February 28 form](11-calendar-clamped-date.png), captured before the subsequent unknown-time default correction
- [Older Progress recovery action](12-progress-older-weight.png)
- [Malformed-data recovery action](13-recovery-action.png)
- [Compact source warning](14-source-check.png)
- [Expanded source attribution and fictional metadata](15-source-details.png)
- [Corrected historical-entry time default](16-calendar-unknown-time.png)
- [Compact Progress with visible recovery action](17-progress-compact.png)
- [French 360 px badge/layout check](18-progress-french-360.png), before the final empty-card spacing refinement

Screenshots 10–18 are cropped to the app's 390 × 844 CSS-pixel iframe, except the labelled French 360 × 844 capture. Parent fixture controls and their 52 px header are omitted. Later captures are described with their checks below. App content was not rearranged. The generated salad photo is a fictional QA image, not a real journal input or model-inference result.

## Verification boundaries

The 16:49 UTC integrated checkpoint passed 488 tests in 40 files, TypeScript and a production build. Further ownership/conflict and stock regressions are being integrated; their final results must be recorded before release. Later focused UI integration passed 149 tests in five files at 17:03 UTC.

Live provider success, deployed owner RLS/private-photo access, authenticated two-device sync, microphone hardware, real mobile keyboards and assistive technology remain unverified. The cloud browser's extension logs are separate from app errors. No repository push, deployment, visibility change or submission was performed.

## Subsequent visual refinement

The first Progress screenshot exposed a cramped latest-weight label and a split Example badge. The revised card removes a redundant icon/provenance line and keeps badges on one line. A shorter empty-state message puts Show all dates fully above the bottom navigation at 390 × 844. English and French narrow layouts were visually checked; the original screenshot remains as iteration evidence.

## Integrated checkpoint at 17:14 UTC

555 tests across 46 files passed after the ownership/conflict fixes. Strict TypeScript and production build passed; changed-source lint had zero errors and 11 existing Fast Refresh warnings. Independent source/test review covered conflict write ordering, missing snapshots, orphan baseline retirement, pre-render account transitions and adjustment Undo. These checks do not replace live two-account/backend tests.

## Keyboard follow-up at 17:32 UTC

The accessibility checkpoint passed 577 tests across 47 files, strict TypeScript and a production build. A subsequent time-of-day error association passed its focused 100-test UI suite. These are intermediate checkpoints while further reliability fixes continue.

Observed in the cloud browser with fictional data:

- Closing Quick Add with Escape returns focus to central Add.
- Closing an existing weight editor returns focus to that record. Saving a changed weight returns focus to its updated row.
- Back to original focuses the Momo composer; Resume review focuses its heading. Saving focuses the saved heading, and Start a new capture focuses the blank composer.
- Explicitly keeping this version in a conflict focuses Settings' truthful Saved on this device only status.

Tests also cover removed/disabled/hidden openers, rapid reopening, Home Momo handoff, failed saves and failed conflict choices. Browser screen-reader or physical-keyboard compatibility is not claimed from these source and focus checks.

## Narrow correction and Undo follow-up at 17:43 UTC

619 tests across 51 files passed. Strict TypeScript and production build passed; lint on the tracked files changed in this iteration reported zero errors and seven existing Fast Refresh warnings. Added regression files were also checked separately by their authors.

At French 320 px, the browser exposed a focused date hidden beneath the sticky confirmation bar. Correction controls now scroll into view only when obscured, and narrow date/time fields stack at full width. The corrected date remains visible above the actions; document width and scroll width both measured 305 px (320 px iframe minus its scrollbar). Narrow navigation labels no longer overlap. See [focused French date correction](19-french-320-focused-date.png).

Meal drafts now remain editable after invalid fractions, oversized values or counts. Strict save validation remains in place. In the browser, an invalid 1.5 fraction kept the editor available and showed only the pictured estimate; selecting one half repaired it. Ingredient newlines remain while typing; blank user-entered lines are removed on blur before saving.

Regression tests also verify that ordinary local-to-cloud photo reference replacement no longer defeats Undo, later user edits remain protected, partial Undo reopens only removed drafts, and failed Undo writes do not pretend to restore a review. Stale recovered IDs with changed saved content fail atomically and offer Open saved entries. These transport/Undo cases are tested with controlled fixtures, not a live authenticated upload.

## Desktop 200% zoom follow-up

Using native Chromium zoom controls (not a CSS transform), the direct app page was checked at 200%: its layout viewport measured 598 × 399 CSS px with no horizontal document overflow. The short viewport exposed another sticky-action obstruction, so the review action block now returns to normal document flow below 600 px viewport height. The focused date is visible above bottom navigation; the same action remains reachable farther down the page. Normal-height phone layouts retain the sticky action. Focus visibility also accounts for bottom navigation.

[Desktop 200% focused correction](20-desktop-200-percent-correction.png) is a native window screenshot including browser chrome, unlike the cropped phone fixtures. Zoom was reset afterward. This is a desktop browser zoom check, not a physical-phone keyboard or assistive-technology check.

## Independent release review at 18:07 UTC

765 tests across 58 files passed after the release-review corrections. TypeScript and production build passed. Cumulative changed-source lint reported zero errors and 11 existing Fast Refresh warnings. An independent reviewer re-ran the original repeated-clock regression successfully, then checked fraction recovery/evidence and demo preference isolation without finding a remaining blocker in that scope.

- Unchanged exact-clock edits now preserve the saved instant, including daylight-saving fold occurrence and seconds. New/changed clocks still reject nonexistent times. Tests cover Paris, New York and Lord Howe, journal entries, meal edits and reminders.
- Choosing Other for a meal no longer assumes 75%. In the browser, Other remained blank and invalid after app reload; Review details opened and focused that input. Entering 0.25 produced the 65–105 kcal chosen-amount estimate from the fixture’s 260–420 pictured range, and the saved value survived reload. Unknown remains an explicit valid choice. The inline correction replaces redundant broad medication wording. See [custom fraction correction](22-custom-meal-fraction.png), cropped to 390 × 844 after removing the 94 px two-line fixture header.
- A fictional meal with one known-energy item and one unknown-energy item displayed “Known items only · complete meal total unknown” in both the editor and saved Today row. See [partial total label](21-partial-meal-total.png), cropped to 390 × 844 after removing the 52 px fixture header.
- French remained selected after the actual fictional-demo reset confirmation and Clear examples. First-run/save failure/account-transition behavior, current-session sign-out, and practice-reminder isolation were tested with mocked auth; no real sign-out or authenticated backend operation was performed.
- Setup and asset/privacy documentation now name the migration that exists, disclose pending bucket provisioning, distinguish generated QA imagery from runtime/user assets, and distinguish requested models from live provider verification. Conflict copy states that whole journal versions are not merged.

The external verification boundaries above still apply. All screenshots and browser actions used local fictional data.


## Release hardening checkpoint at 20:40 UTC

823 tests across 61 files passed after the final edits in this checkpoint. Strict TypeScript and production build passed. Cumulative changed-source lint had zero errors and 11 existing Fast Refresh warnings; repository-wide lint is not represented as clean. The build retains the existing bundler warning that `inlineDynamicImports` is ignored when `codeSplitting` is specified. 671 quoted translation keys match in Korean, English and French, with no duplicates or placeholder mismatch. A targeted tracked-file privileged-key pattern scan found no matches, and the rebuilt client output contains neither privileged server-key name. These are bounded local checks, not security certification.

### Momo owner-transition recovery

An independent review reproduced unsent text loss when an account changed before the 180 ms draft-save debounce. Recovery now flushes the outgoing capture to its original account key before loading the incoming account. Four regression tests cover source text, reviewed-field corrections with deselection/reselection, immediate unmount/remount, and logout after source edits. Account B’s existing draft and guest storage remain isolated; changed source text cannot reopen stale suggestions. The focused confirmation/recovery suite passed 138 tests. No real sign-in/out or authenticated account data was used.

### Additive backups and exports

The inherited backup hardening was independently rechecked before this checkpoint. Import carries a new purchase and its exactly linked stock correction together. Existing IDs and preferences remain unchanged. Ambiguous legacy, orphaned or conflicting stock adjustments stop the entire import rather than silently altering stock. Duplicate-only imports report no new entries. Confirmation states actual added/skipped counts; invalid files and local-persistence failures have separate messages. JSON/CSV exports and damaged-snapshot downloads check the current owner and report download failures truthfully. Controlled persistence/owner tests passed; a live browser file-upload import was not repeated in this review.

### Calendar and narrow History

The old calendar advertised a grid without its required rows/cells or keyboard model. It now supplies complete rows/cells, one tabbable day, Arrow/Home/End navigation, Page Up/Down month navigation and Shift+Page Up/Down year navigation. Month/year jumps retain the day when possible and clamp to a valid date. Selected day, visible month and Add date remain aligned. Today moves focus to the current day; the month toolbar retains focus. Logged/reminder markers have textual descriptions, and today is marked as the current date. The design follows the [WAI-ARIA grid pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/) and [calendar keyboard example](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/); actual assistive-technology compatibility remains unverified.

An independent source/test reviewer found no actionable regression in this scope; 28 focused tests passed. In the actual disposable cloud browser at French 320 px, Page Down moved November 5 to December 5 and retained focus, Arrow Left selected December 4, and Tab left the calendar for Add on that selected date. Both Calendar and expanded History measured document width and scroll width of 305 px (320 px iframe minus scrollbar). History’s date inputs stack at 239 px each. No record was saved during these checks.

- [Focused French keyboard calendar](26-french-320-keyboard-calendar.jpg): 320 × 789 crop from the left side of a native browser capture. Only the surrounding grey harness area was removed; the app is scrolled and its bottom navigation remains visible.
- [French stacked History dates](27-french-320-history-dates.jpg): 320 × 780 browser capture with the fixture header still visible at the top. It shows the complete date fields. App content was not rearranged.
- Earlier narrow manual screenshots remain available: [manual menu](23-french-320-manual-menu.png), [manual date](24-french-320-manual-date.png), and [stock action](25-french-320-stock-action.png).

The console sample contained browser-extension metadata errors, not app errors. A browser screenshot attempt timed out; the successful native screenshots above were inspected after settling. No file upload or real-account action was attempted.

### Deliverable hygiene

Ignored local `public/__qa__` fixtures were still being copied by the build. They were moved outside the repository’s public directory before the production rebuild, and the output was checked to contain no `__qa__` paths. The generated fictional photo remains only in the local fixture archive and existing labelled screenshots, not as a runtime app asset. No push, deployment, visibility change or submission was performed.


## Account and photo boundary checkpoint at 20:53 UTC

873 tests across 64 files passed. TypeScript and production build passed; cumulative changed-source lint had zero errors and 11 existing Fast Refresh warnings. 673 quoted Korean, English and French keys match, with no duplicates or placeholder mismatches. Local QA fixtures remain absent from the public asset tree and rebuilt output.

- **Stale controls:** a retained journal context could previously act after an auth callback had switched its internal owner but before React replaced the visible controls. Public mutations and snapshot reads now capture the rendering session's ownership epoch. Tests cover A→B→A, sign-out, unmount, conflict choices, Momo batches, imports and Undo acquisition. Internal sync commits retain their separate ownership checks. This is local mocked-auth evidence, not deployed authorization verification.
- **Guest import:** account and guest IDs are checked across both records and purchases. New purchase corrections travel together; existing or orphaned corrections and legacy scalars are not silently applied. Known demo-lot corrections are excluded with their demo purchases. Import is planned before media copying and replanned against current state afterward. Refusals preserve both journal snapshots, and Korean/English/French messages explain stock conflicts separately from import failures.
- **Photo retry:** changing source/account resets the one-shot image retry. A failed image invalidates only its photo URL, so another image's pending URL is not discarded. Two renderings of the same photo resolve the current generation regardless of signing-response order. Auth cache invalidation is checked first, so a prior session's response remains rejected. A pending sibling may make one extra signing request; the UI retry stays bounded. Fifteen focused photo tests passed without live storage access.

No real account data, live provider request, deployment, visibility change or submission was used for these checks.


## Interrupted work and recovery checkpoint at 21:15 UTC

981 tests across 72 files passed in the integrated state. Strict TypeScript and production build passed. Cumulative changed-source lint checked 78 source/test files with zero errors and 11 existing Fast Refresh warnings. A syntax-tree audit counted all 681 keys in each of Korean, English and French, including five unquoted base labels omitted by the earlier quoted-key counts; parity, duplicates and placeholders all passed. The targeted tracked-file privileged-key pattern scan and rebuilt-client privileged-name scan had no matches. No local QA fixtures appear in public assets or build output.

### Close, remove and account boundaries

Manual memory/meal photo work now checks its owning journal and sheet session before retaining or applying asynchronous output. Remove cancels a pending replacement. A successful deletion invalidates the form before the exit animation, so an old callback cannot recreate its cleared recovery draft. Source evidence remains intact on valid edits.

Independent review reproduced a second gap hidden by immediate-unmount test doubles: the real sheet's exit animation retains its children. A per-opening validity token now invalidates on Close, Escape/outside dismissal and prop-driven close, and stays invalid after rapid reopen. Changes to timezone/recovery context also release cancelled pending controls. Twenty-nine manual photo/exit regressions cover these boundaries.

The same session predicate now protects Momo compression, extraction, photo-to-meal handoff and confirmation, together with the required journal-owner check. Dictation stops before paint on closing, rather than waiting for unmount; obsolete speech events cannot alter recovery. Accepted words, reviewed corrections and deselections remain available. Thirteen added Momo/voice boundary tests use mocked recognition and provider responses. No real microphone or live AI was used.

### Damaged sync baseline

A malformed or unreadable account baseline previously could overwrite an empty local journal or leave syncing blocked after a successful choice. It now preserves both raw keys before an explicit version choice against validated cloud data, even when the local journal is empty or equal. Recovery downloads the failed baseline with its own filename and copy rather than presenting the healthy primary as damaged.

Both writes must succeed before the baseline marker clears. The existing primary-first ordering is retained: if the second write fails, the chosen primary may already be saved, while the original baseline and recovery choices remain available. This is not an atomic two-key transaction. A damaged primary remains protected. Transient-read retries, owner changes and another-tab conflicts are tested; the other version is labelled according to its actual source. Malformed/unreadable guest import rejects locally without changing healthy-account recovery or blocking its sync.

### CSV serializer hardening

Thirty-two synthetic-import export tests cover whitespace/control-prefixed and full-width formula-like IDs, ordinary values, quotes, commas, embedded CRLF, and unchanged original JSON. The existing apostrophe prefix is now applied to those previously missed prefixes. [OWASP's CSV injection guidance](https://community.owasp.org/attacks/CSV_Injection) documents these characters and the limits of spreadsheet escaping. No real spreadsheet execution was attempted, and editing/re-saving exported CSV in Excel or another program is not certified safe. JSON remains the structured backup format.

### Remaining observation boundary

A new local browser pass could not load the restarted preview across the available tool environments. Two bounded local server starts did not establish browser reachability; no new visual result is claimed from that attempt. The earlier inspected screenshots remain the visual evidence. Actual phones, assistive technology, live Meta, authenticated storage/RLS, deployment, publication and submission remain unverified or unperformed.


## Order isolation and handoff check at 21:53 UTC

Two complete shuffled runs, seeds `20261104` and `20261105`, each passed all 981 tests across 72 files. The first run exposed one fixture dependency: a form photo mock only received its asynchronous implementation from an earlier test. The fixture now resets its async contract and relevant mock implementations before each test, and photo assertions await rendering. The original failing case also passes in isolation. No production change was needed for this correction.

Read-only GitHub verification at 21:48 UTC confirmed [main](https://github.com/Deytooh/my-dear-step-journal/tree/main) still at [`0ff786fa29a5b864a464a862cf43e16537ccc491`](https://github.com/Deytooh/my-dear-step-journal/commit/0ff786fa29a5b864a464a862cf43e16537ccc491), matching the packet's real remote baseline. The local branch has synthetic snapshot ancestry: integrate the verified changed paths onto real history, preserve unrelated remote assets, recheck head/blob preconditions, and obtain authorization before any push.


## Final local gate at 22:40 UTC

The completed source state passed all 981 tests across 72 files again. TypeScript and production build passed; cumulative changed-source lint covered 78 files with zero errors and 11 existing Fast Refresh warnings. Both complete shuffled runs recorded above also passed. All 681 translation keys match, with no duplicate or placeholder mismatch. Targeted privileged-key patterns and client server-key names had no matches; QA fixtures remain outside the public/build trees. These are bounded local checks, not a comprehensive security certificate.

GitHub was rechecked at 22:39 UTC: main remains at `0ff786fa29a5b864a464a862cf43e16537ccc491`. The portable handoff preserves real ancestry through changed-file/blob preconditions rather than pushing the synthetic local branch. No remote write, deployment, repository visibility change, real-account operation or portal submission was performed.

Remaining owner actions are recorded in [the release checklist](../RELEASE_CHECKLIST.md): authorize eventual source integration/publication/deployment, confirm asset and source licenses, configure and verify live Meta with dedicated test accounts, complete authenticated privacy/sync and real-device/accessibility checks, then approve the final video and submission. Local previews and mocks do not replace those gates.
