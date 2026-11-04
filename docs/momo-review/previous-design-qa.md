# Guided Momo home — design QA

Date: 2026-11-03 (Asia/Seoul).

## Visual truth and evidence

- Selected option: the third displayed result in the latest variation set, `exec-0343714b-a647-4245-8bb6-43347e62be5e.png`. Exact copy: [selected-reference.png](docs/momo-guided/selected-reference.png).
- Local implementation: `http://127.0.0.1:8081/today`, existing app and shared MomoSheet.
- Source: 1002 × 1570 px, normalized with Lanczos to 390 × 611 solely for comparison. Original retained.
- Browser: in-app browser, 390 × 844 CSS viewport; comparison screenshot clipped to the top 390 × 611 CSS px to match the source's upper-home crop. The screenshot PNG is 390 × 611 (effective capture density 1). Native bottom navigation remains below that crop.
- State: Korean, empty composer, Feeling selected, guest, no recording, no consent granted.
- Full comparison: [source and implementation in one image](docs/momo-guided/comparison-390.png).
- Focused typography/asset comparison: [heading comparison](docs/momo-guided/comparison-heading.png).
- Final full app: [390 px Korean](docs/momo-guided/12-home-ko-390.png), [360 px Korean](docs/momo-guided/07-ko-360-final.png), [360 px French](docs/momo-guided/09-fr-360-final.png), [360 px English](docs/momo-guided/11-en-360-final.png), [430 px English](docs/momo-guided/10-en-430.png).

## Comparison history and resolved findings

1. **[P2, fixed] Capture was boxed and the hero sat too low.** The first settled capture [02](docs/momo-guided/02-ko-390-full.png) showed the shared form's white background/radius and excess masthead spacing. Scoped editorial textarea rules now remove these; only the home masthead spacing changes. Post-fix [03](docs/momo-guided/03-ko-390-comparison.png) and final [05](docs/momo-guided/05-final-ko-390.png) show the open writing surface and corrected rhythm. A transient failed screenshot before layout settled was rejected and discarded.
2. **[P2, fixed] Display weight and topic proportions drifted.** Refined the heading to loaded Noto Serif KR 900, tuned type/spacing and shortened the Korean tab row. Final [comparison](docs/momo-guided/comparison-390.png) now preserves the selected hierarchy and regional proportions.
3. **[P2, fixed] Korean heading wrapped to three lines at 360 px.** Earlier [06](docs/momo-guided/06-ko-360-full.png) showed the wrap. Smaller mascot/grid tracks at narrow widths restore two readable lines in [07](docs/momo-guided/07-ko-360-final.png).
4. **[P2, fixed] French topic labels broke mid-word.** Earlier [08](docs/momo-guided/08-fr-360.png) showed broken labels. Non-Korean tabs use available width; final [09](docs/momo-guided/09-fr-360-final.png) shows intact labels. The English heading was shortened to a natural localized equivalent, with two measured single-line spans at 360 px in [11](docs/momo-guided/11-en-360-final.png).

## Required fidelity surfaces

- **Fonts/typography:** serif display heading, sans body/controls, two-line hierarchy, and readable 16–17 px input/control sizes. Browser confirmed the Noto Serif KR 900 face loaded. Existing Fraunces wordmark retained. Generated glyph shapes are approximated with a real selectable typeface rather than rasterized UI text.
- **Spacing/layout:** same open hero, modest mascot on the right, topic row, one question, open editor, small capture toolbar, normal-sized primary action, quiet privacy. Fixed the actionable spacing/wrapping issues above. Controls inspected at 360 px retain 44 px height; no horizontal page overflow at 360/390/430.
- **Colors/tokens:** existing cream/caramel/honey/espresso semantic tokens reused. No palette rewrite. The mock's subtle image-generation texture/gradient is intentionally replaced by clean existing app surfaces.
- **Images/icons:** one canonical CDN hamster pointer reused, with no duplicated/new mascot file. Its actual approved illustration differs slightly from ImageGen's reinterpretation; preserving the canonical asset is intentional. Existing outline icons match the target language. No rasterized UI text or screenshot-as-interface.
- **Copy/content:** Korean headline, subtitle, topics, default question, placeholder and primary label match the selected design. English/French stay localized through t(). Topic changes are local guidance, never statements attributed to the user or generated replies.

## Primary interactions actually inspected

- Empty primary action focuses the actual empty textarea and sends nothing.
- All three topics update the prompt/pressed state. Typed QA text survives topic changes.
- Expanded privacy exposes the existing unchecked consent, provider explanation and guest sign-in explanation. No provider request was made.
- Central + opens existing manual forms; selecting Momo returns to the same focused textarea with its text retained.
- Guest with source text shows the real sign-in-required disabled action.
- Browser console had no errors in the inspected session. Existing synthetic QA journal entries were left intact; no new journal records were saved.

## Verification and accepted limits

TypeScript, production build and focused ESLint passed (one existing React Refresh warning in AppShell). No tests written or run. No backend, evidence, inventory, voice engine or saved-record migration changes.

Real microphone, native mobile keyboard, authenticated Meta analysis, cloud synchronization, and end-to-end review/save/Undo of a new model response were not exercised in this guest visual pass. These are not claimed as validated. Browser resizing is not presented as a real keyboard test.

Accepted differences: live approved mascot artwork; native resize affordance and browser scrollbar; existing bottom navigation outside the reference crop; normal focus/disabled/guest/consent states that the static mock did not specify. The idle organize action focuses the field rather than sending an empty request. Manual logging remains available via the central +.

## Implementation checklist

- [x] Exact selected option resolved and retained.
- [x] Existing shared composer/provider/journal reused.
- [x] Five fidelity surfaces compared using source plus rendered evidence.
- [x] Actionable P0/P1/P2 differences fixed and recaptured.
- [x] Primary local interactions and console inspected.
- [x] Korean, English and French responsive layouts checked.
- [x] No tests or deployment.

## Follow-up polish

[P3] Browser-native textarea resize affordance and real font rasterization vary slightly from the generated mock. No further visual changes are required for this pass.

Historical result (2026-11-03): passed.
# Refined Momo composer review

- Source visual truth: the user-approved refined third mockup in this conversation, image-generation item exec-0e728e6e-2aba-4f6f-9d56-147c37ccc89c. The platform returned savedPath: null; an exact local source bitmap was not available.
- Implementation screenshot: C:/Users/deyto/Documents/Codex/2026-11-04/task/momo-refined-implementation-en.jpg (425 x 510 px, composer-only capture).
- Viewport: 440 x 900 CSS px; document client width 425 px after the desktop scrollbar. Capture aligned to the Momo component by scrolling 99 px. The mockup was displayed at 1150 x 1370 px and intended a 425 x 505 logical-pixel surface; exact paired density normalization remains incomplete.
- State: English guest, empty composer, How was your day?, suggestions manually paused for capture, privacy collapsed. Existing app shell remains outside the composer scope.

## Findings and evidence

- Fonts/typography: retained the existing serif/sans system, with a 24 px question (22 px at the narrow breakpoint) and 15-16 px controls. Exact font fidelity against the source bitmap is unverified.
- Spacing/layout: centred smaller Momo, one question and one softly bordered writing surface; duplicated hero/subtitle/help paragraphs removed from the empty view. Rendered composer captured; no completed paired full-view comparison is claimed.
- Colors/tokens: reused existing cream, espresso, caramel and biscuit tokens. No new brand palette or gradient was introduced.
- Image quality: reused the actual shared Momo asset pointer; no replacement drawing, generated mascot or new asset was introduced.
- Copy/content: short English/Korean/French questions and placeholders; direct sign-in, manual input and privacy/consent routes retained. A labelled pause/play control intentionally supplements the mockup because automatic rotation was requested afterward.
- Interactions: automatic question changes, manual pause/refresh and typing lock were observed in the actual browser. Exact five-second timing and voice/photo/IME/hidden-tab/reduced-motion guards are covered by component tests. Pending-only loading text rotates every 3.5 seconds without fake percentages or completed-stage claims; success/error/cancel cleanup is tested.
- Focused region comparison: incomplete. Computer Use was stopped from the user's keyboard before the remaining visual review; no further Computer Use was attempted after that stop.

## Verification

338 tests across 33 files, TypeScript, production build and focused changed-file lint passed. All 631 Korean/English/French translation keys match, without duplicate/missing keys or mismatched placeholders. Live Meta, a real microphone/device and authenticated cloud behavior were not certified by this pass.

## Remaining work

Resume a paired source/implementation visual review, including narrow screens and all three languages, when computer control is available. Do not interpret the automated checks or this push as a passed pixel-fidelity review. The user separately requested publication of the current update with this limitation retained.

final result: blocked
