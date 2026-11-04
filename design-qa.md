# Compact Momo review ledger — design QA

Date: 2026-11-04 UTC. Scope: the post-analysis review and its local edit/confirm flow. Earlier composer reports are preserved in [previous-design-qa.md](docs/momo-review/previous-design-qa.md); their historical limitations are not retroactively removed.

## Visual truth and evidence

- Selected design: compact review ledger, exact image `/workspace/scratch/ae47a6763fd3/momo-design/mockups/01-selected-review-ledger.png` (852 × 1846 pixels). The generated image contains fictional records and is a design target, not a model-response capture.
- [Normalized reference](docs/momo-review/source-normalized-390.png): resampled to 390 × 844 for comparison.
- Actual cloud-browser app: existing shared MomoSheet, guest, Korean, three fictional proposals, photo source, all three selected, one missing date, details collapsed. The real review recovery/edit/save implementation is used by a local-only fixture, not a production QA route or live model request.
- [Implemented 390 × 844 review](docs/momo-review/03-ko-390.png). Browser iframe viewport 390 × 844 CSS pixels, effective screenshot density 1. The desktop browser's 15 px scrollbar leaves 375 px of content; source has no scrollbar. Parent harness/chrome was cropped away, with no app content rearranged.
- [Full paired comparison](docs/momo-review/comparison-390.png), [focused row comparison](docs/momo-review/comparison-review-rows.png). Both images were opened together and compared, not judged from paths alone.
- Additional browser evidence: [Korean 360](docs/momo-review/04-ko-360.png), [French 360](docs/momo-review/05-fr-360.png), [English 390](docs/momo-review/06-en-390.png), [French 430](docs/momo-review/08-fr-430.png), [desktop 1024](docs/momo-review/09-desktop.png), [end of an eight-entry review](docs/momo-review/07-long-review.png).

## Findings and iteration history

1. **[P2, fixed] The first source row inherited a surrounding disclosure card and circular thumbnail.** Replaced those with an unboxed source row, a 56 px photograph and 12 px corner radius. Final paired image preserves the reference's flat list hierarchy.
2. **[P2, fixed] Initial inclusion targets were 32–36 px wide.** Made each target 44 × 44 px at every tested width while retaining a 21 px visual checkbox. Browser measurements verify the larger target.
3. **[P2, fixed] The first expanded heading/source treatment let the sticky action obscure the last row's missing-date cue at the initial scroll position.** [Earlier capture](docs/momo-review/iteration-one.png) shows the problem. Reduced redundant source/section gaps and row padding. The post-fix 390, 360 and French captures show all three summaries and the warning above the action. The eight-entry test shows the final row and explicit batch-date control accessible above the footer after scrolling.
4. **[P1, fixed] Canonical mascot failed in the cloud development preview.** Kept the approved asset identity, fixed the dev-only asset proxy's pre-forward header handling, and verified the real image loaded at 1222 × 1287 natural pixels. Final captures show the canonical mascot, not a placeholder.

No actionable P0/P1/P2 visual findings remain for this review scope.

## Required fidelity surfaces

- **Fonts/typography:** existing IBM Plex Sans KR body and Fraunces wordmark retained. Review heading is 26 px; titles 17–18 px with wrapping, statuses 12–14 px, controls 14–16 px. The source's larger generated heading is intentionally reduced to retain the real app shell and bottom navigation without hiding records. Long French titles wrap without clipping.
- **Spacing/layout:** one compact heading/count, one source row, divider-separated records, inline required-field cue and one sticky primary action. Editing/source details expand in place. Real navigation and the current-day shell label remain; the mock's back arrow was not added as a second navigation system. Required correction uses the row's Check action and primary correction action rather than duplicating another date button.
- **Colors/tokens:** existing cream, espresso, caramel and biscuit semantic tokens. No palette rewrite. Warning text plus an icon preserves meaning beyond color. Excluded entries remain fully readable. The generated paper texture/gradient is not copied into the production surface.
- **Images/icons:** canonical approved mascot, generated fictional salad photo only in local QA data, existing outline icon family. No rasterized interface, invented mascot or custom-drawn replacement asset. The actual canonical mascot differs from the image generator's interpretation, intentionally.
- **Copy/content:** current supported record types and known/unknown time semantics retained, rather than adopting mock labels as new data types. Selection is explicitly not saved. Meal estimates stay labelled estimates. Exact source text/photos, original proposals and confirmed edits remain in per-entry details.

## Actual interaction checks

- Primary correction opens the first invalid record and focuses its date field. Entering a valid date changes the action to count-specific confirmation.
- Explicit confirmation saved exactly three fictional records locally; the success view separately states device-only sync status. This was not an authenticated cloud-sync test.
- Unchecking the undated entry changed the count to two and allowed saving only the two selected valid entries. The excluded row stayed readable.
- Meal detail expansion exposed editable food/energy fields, the optional portion question, a real Unknown option, and the source disclosure. Choosing Unknown removed the optional prompt without inventing a quantity.
- Per-record source disclosure displayed the retained note, exact quote and photo control.
- The final row of an eight-entry batch remained accessible; expand/collapse worked and the sticky action remained above bottom navigation.
- Korean, English and French at 360/390/430 CSS widths measured zero horizontal document overflow. Every inclusion label measured 44 × 44 px. French desktop 1024 layout preserved the app's calm max-width column.
- Console reviewed after final reload: no app errors during final interactions after 16:26 UTC. Earlier in-progress HMR import errors were corrected and reloaded. The cloud browser extension continued logging its own metadata-delivery errors; these are not claimed as app errors or silently omitted.

## Automated checks and scope limits

At the 22:40 UTC final local gate, 981 tests across 72 files passed. TypeScript and production build passed. Changed-source lint passed with zero errors and 11 existing Fast Refresh warnings; repository-wide lint still reports unrelated pre-existing formatting errors/warnings and was not represented as clean.

New tests cover batch duplicate detection after edits, malformed recovery payloads, invalid calendar dates, source-change Resume guards across reload, safe raw-source salvage, DST clock validation, and timeline/calendar consistency. No inference was converted into a medical fact or unrequested inventory change.

Not exercised: live Meta inference, authenticated Supabase sync, actual microphone/hardware keyboard/mobile soft keyboard, assistive technology, and production deployment. No real personal health data was used. The fictional local fixtures and temporary proxy preload are excluded from the repository deliverable.

## Implementation checklist

- [x] Selected visual target resolved and paired with actual rendered evidence.
- [x] Existing shared capture, review, editable data and explicit confirmation retained.
- [x] Five fidelity surfaces compared; actionable layout issues fixed and recaptured.
- [x] Primary correction, selection, source inspection and local save tested in browser.
- [x] Narrow multilingual layouts and long batch checked.
- [x] Tests, type checking and build passed; limitations disclosed.
- [x] No push, deployment, repository visibility change or submission.

## Follow-up polish

[P3] Native checkbox/scrollbar styling and browser font rasterization differ from the generated mock. Natural English/French singular/plural photo labels and keyboard focus after optional portion answers were subsequently refined and regression-tested. Further global UX and persistence checks are recorded in [GLOBAL_QA.md](docs/momo-review/GLOBAL_QA.md).

final result: passed
