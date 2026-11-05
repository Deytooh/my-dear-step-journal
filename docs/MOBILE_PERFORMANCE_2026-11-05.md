# Mobile loading optimization — 5 November 2026

## Scope and measured result

Kept the existing journal, authentication, owner isolation, storage, Momo confirmation rules, visual identity and canonical mascot intact. This is a delivery/performance change, not a data migration.

The original source baseline was the local `4967939` snapshot, verified against remote `b0b7a4509ddd3670b1871e5037b1ca2e800df4b9`. It was exported into a separate directory and production-built with the same installed dependencies. The optimized build includes the question transition work from this pass.

**These are measured production artifact sizes, not measured mobile loading seconds.** Browser timing was attempted but Chromium could not launch because the environment blocked its local sockets, including the reviewed escalation. No Lighthouse, FCP/LCP, CLS, real-device speed, or visual browser-animation result is claimed.

| Initial route JavaScript | Before raw / gzip bytes | After raw / gzip bytes | Gzip reduction |
| ------------------------ | ----------------------: | ---------------------: | -------------: |
| Today                    |     1,157,746 / 349,389 |    1,061,710 / 320,949 |           8.1% |
| Calendar                 |     1,105,429 / 333,724 |      968,871 / 292,836 |          12.3% |
| Injections               |     1,107,954 / 333,576 |      972,328 / 293,270 |          12.1% |
| Progress                 |     1,485,794 / 434,050 |      977,831 / 295,184 |          32.0% |

- Mascot image: **962,940 → 32,800 bytes (96.6% smaller)**. The unchanged CDN original remains available as a fallback.
- CSS: 115,270 → 115,672 raw bytes; 22,311 → 22,384 local gzip bytes. The small increase includes the new question transition.
- Today’s known startup payload, summing local-gzipped initial JS/CSS and one mascot image: **1,334,640 → 376,133 bytes (71.8% smaller)**. This is a payload estimate, not an observed network trace. It excludes HTML, headers, external fonts, server/auth latency and user photos.
- Progress figures describe the initial route graph/empty-state case. A populated chart downloads its separate chart chunk on demand; it still works and is not removed.

## What changed

1. **Right-sized mascot delivery.** All seven placements now share `MomoImage`. The same canonical PNG is resized to 264 × 278, enough for the largest 88 CSS-pixel placement at 3× density, and losslessly encoded as WebP. No crop, redraw, color or alpha change was introduced. A failed derivative request switches once to the original. Vite emits a content-hashed asset for caching.
2. **Entry forms load when requested.** The shell no longer imports every form and Momo editor at startup. Pointer/focus intent warms the module; a cold click opens a cancellable, accessible loading sheet. Failure exposes Retry. Closing, account switching and late downloads cannot reopen stale entries. Once loaded, the existing forms retain their close animation and focus behavior.
3. **Charts and hidden tools are deferred.** Recharts loads only when Progress has a chart to draw, with the same reserved chart height. Today’s collapsed record finder and daily questions load only when opened. Existing summaries, empty states, records and the main Momo composer remain immediately available.
4. **Fonts no longer block the initial document paint.** Font links download with print-only media and become active on hydration; a noscript fallback remains. The approved Noto Serif KR 900 face is subset to every glyph in all five question strings across Korean, English and French. The body-font request is not subset, so user content retains full coverage.
5. **Navigation and rerenders.** Bottom tabs preload on intent. Recent-record sorting is memoized until records or purchases change.

## Image verification and regeneration

Canonical source: `src/assets/momo-hamster.png.asset.json`, asset ID `37137893-bc91-48bf-a208-fbb1d61a2bcc`. Source MD5/ETag: `15a8e1daed3c84cb48e460bbf8f58858`; 1,222 × 1,287 RGBA PNG, 962,940 bytes.

Derivative: `src/assets/momo-hamster-small.webp`, 264 × 278 RGBA, 32,800 bytes. It was produced with Sharp using `resize({ width: 264, withoutEnlargement: true })`, an intermediate PNG, then `webp({ lossless: true, effort: 6 })`. Decoding the derivative and comparing it to the resized reference found **zero changed visible RGB channels and zero changed alpha values**. The image was also inspected composited on the app’s cream background.

This is one delivery derivative of the existing artwork, not a second mascot design. On a rebrand, replace the canonical pointer and regenerate this derivative together. Do not independently edit individual placements. The source PNG itself is not duplicated in the repository.

## Reproduce measurements

Run the normal production build, then:

```sh
node scripts/measure-mobile-payload.mjs .
# With a separately production-built baseline checkout:
node scripts/measure-mobile-payload.mjs /path/to/baseline .
```

The script deduplicates each route’s root/route preload graph, measures actual emitted bytes and local `gzipSync` sizes, and reports CSS and the mascot. It intentionally excludes interaction-only lazy chunks from startup figures. Do not present its gzip totals as measured wire bytes or a measured time improvement.

For the remaining device check: use the same deployed revision, fresh storage/cache, 390 × 844 viewport, fixed CPU/network conditions, and five cold-load runs per version. Record median FCP/LCP, CLS, long tasks, first composer input and first Add opening. Also test warm navigation, a returning guest, fresh onboarding, a populated chart, failed chunk loading, cancellation and rapid reopen. Do not use development-server timings as production evidence.

## Verification

- Production build: passed.
- TypeScript: passed.
- Full suite: **75 files, 990 tests passed**, including question transitions, cold-download cancel/retry, focus return, account boundaries and mascot fallback.
- Changed-file lint: no errors. Existing Fast Refresh warnings remain.
- Full lint: blocked by **190 pre-existing formatting errors**, reproduced unchanged in the isolated baseline. No unrelated generated files were reformatted to conceal this.
- Actual browser/mobile timing and browser visual QA: not run successfully due to the environment limitation above.
