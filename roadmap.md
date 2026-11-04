# My Dear Step roadmap
- [x] Optional onboarding: three skippable localized steps, existing journal preferences/shared forms, Settings replay, sequential dismissible hints; real guest weight save/reload, answer preservation, no-answer skip, existing-record preservation and unsaved reminder flow visually checked at 360/390/430/1280px with reduced motion. No tests written or suites run; signed-in cloud sync not reverified.
- [x] Comprehensive interaction polish: cancellable touch compression, caramel focus/validation, sliding selectors, smooth sheets/disclosures, photo reveals, immediate numeric highlights, truthful Momo activity/draft reveals and save/Undo feedback. Local save/Undo, questions, site selection, photos, tab scroll restoration and 360/430/1280px layouts visually inspected; reduced motion respected, no tests written or run. Live signed-in AI/cloud and physical-phone keyboard not reverified in this presentation pass.
- [x] Honey/caramel rebrand: shared tokens, supplied transparent Momo hamster, compact home; phone-sized pages, Quick Add and injection silhouette visually inspected with no overflow/runtime errors (no tests written or run).
- [x] Medication picker: source-linked GLP-1 list shared by purchases, injections and editable Momo drafts; brand/ingredient search, unknown/custom entry and preserved existing names. Local purchase flow and rule tests checked; not an exhaustive worldwide brand registry.
- [x] App-feel pass: tactile controls, smooth reveals, animated values/charts, save feedback and reduced motion; local save/validation/undo, tabs, desktop/mobile checks passed (sound, device haptics and signed-in sync not part of this pass)
- [x] Phase 1: design system, app shell, Today / Calendar / Injections / Progress, Quick Add with working manual forms (local storage)
- [x] Phase 2: undo everywhere, measurements, history view, journey detail
- [x] Phase 3: Lovable Cloud persistence, accounts (email, Google, Lovable), owner-only rules, private photo storage (signed-in save not yet verified with a real account)
- [x] Phase 4: Momo text/voice intake + review-before-save (Baseten muse-spark-open-1026)
- [x] Phase 5: en/fr translations, language switch, JSON backup export/import, page fade motion, aria labels
- [x] Phase 6: end-to-end demo verification (Momo live call untested until key)
- [x] Pass 7 (user brief): Today question cards, richer Momo drafts + photos, purchases/stock rules, chart injection band, memory search, polish & checks


## Submission completion — 30 October 2026
- [x] Additive meal record and shared capture/review/manual edit flow, deterministic pictured/eaten estimates, unknown/partial totals, history/calendar and structured export.
- [x] Shared authenticated Meta adapter, consent, bounded JSON repair/timeout, prepared persistent quota migration, distinct recovery errors.
- [x] Owner-scoped memory candidates and validated returned IDs; keyword fallback is labeled.
- [x] Account-local namespaces, explicit guest import excluding demos, private source-media uploads, expiring source access, targeted Undo and conflict prompts.
- [x] Submission copy, setup, contributions, demo script, asset/privacy notes and release checklist in docs/.
- [ ] Owner: deploy additive quota/bucket setup and verify live configured Meta text/photo calls.
- [ ] Owner: verify deployed RLS/private storage with two real test accounts and test physical-phone keyboard/large text.
- [ ] Owner: asset rights, public repository decision, hosted judge access, actual video and official portal requirements/submission.

Earlier phase checks describe implemented code and historical local tests; they are not proof of live provider, deployed access control, background notifications or final submission. See docs/SUBMISSION_STATUS.md for this pass's measured checks.

## Questions contextuelles — 30 octobre 2026
- [x] Occasions pures, sélection Meta encadrée avec consentement, carte unique et secours déterministe.
- [x] Cache compte/langue/jour, réservation SQL additive, invalidation et actions/Undo existants.
- [x] Tests ciblés et vérifications mobiles isolées ; voir docs/CONTEXT_QUESTIONS.md.
- [ ] Appliquer 0001 + 0003, configurer la clé Meta et vérifier le parcours connecté sur deux comptes.

## Accueil Momo — 2 novembre 2026
- [x] Surface de capture partagée dans /today, repas dans le lot existant, corrections/sources, confirmation unique, garde de propriétaire et recherche séparée ; suivi et saisie manuelle conservés.
- [x] Inspection locale des vues 360/390/430 px, sources conservées après navigation/rechargement, recherche locale et éditeur repas partagé. Aucun test écrit/lancé. Voir docs/MOMO_HOME.md pour les limites précises.
- [ ] Vérifier le parcours Meta complet avec une session authentifiée, une clé configurée et un vrai clavier mobile ; aucune validation IA/cloud réelle n’est revendiquée pour cette passe.


### Composer accompagné et dictée — 2 novembre 2026
- [x] Invitations locales journée/repas/injection, exemples en placeholders uniquement, retour aux choix sans effacer la saisie ; ko/en/fr.
- [x] SpeechRecognition partagé : hypothèses provisoires remplaçables, corrections prioritaires, reprises bornées (2/minute), interruption explicite, Terminer/Annuler, arrêt des ressources et récupération du brouillon par compte. Aucun envoi automatique.
- [x] TypeScript, build et lint ciblé ; aucun test écrit ou lancé. Contrôles navigateur à 390 px : champ vide après suggestions, aide réduite à la saisie, brouillon conservé au changement de choix.
- [ ] Microphone réel et pauses sur appareils : non exercés ici. Capture visuelle indisponible (timeout du navigateur) ; aucune validation par screenshot revendiquée.

La gestion des résultats suit la [spécification Web Speech](https://webaudio.github.io/web-speech-api/) : les hypothèses intermédiaires remplacent leurs emplacements, les résultats finaux restent stables. Les reprises dépendent du navigateur ; en cas d’échec, le texte reste présent et la reprise est explicite. La limite existante de 4 000 caractères est annoncée ; un dépassement vocal conserve tout le texte et demande de le raccourcir avant analyse.


### Guided Momo home — 3 November 2026
- [x] Selected third mockup implemented in the shared Momo composer: open editorial heading, canonical mascot, localized topic prompts and modest voice/photo controls.
- [x] Draft-preserving topic changes and manual return, explicit consent, existing capture/review/save integration retained.
- [x] Visual comparison and responsive ko/en/fr checks documented in `design-qa.md`; TypeScript/build/focused lint, no tests or deployment.
- [ ] Live microphone/native keyboard and authenticated model/cloud path remain outside this guest visual pass.


## UX and AI reliability - 4 November 2026 (local verification)

- [x] First-screen English/French/Korean choice, retained language when skipping, and a shared-composer Momo action at the end of onboarding. Page titles follow the chosen language.
- [x] Direct Momo sign-in/manual actions; explicit guest-draft resumption bound to the first returning account, fresh AI consent, and a storage-failure path that retains the in-memory draft before offering sign-in without it.
- [x] Review points to invalid fields without inventing missing facts; optional shortcuts stay collapsed. The small-screen first-use hint no longer overlays capture actions.
- [x] Collapsed review cards expose weight units, injection dose/site, measurements, receipt amounts/currencies/quantities, notes and known times before confirmation. An explicit bulk Today action fills only selected undated drafts while preserving original proposals.
- [x] First sign-in retains only an explicit interface-language choice when no account language exists; guest data, inventory, interests and AI consent stay separate. Account switches reset the Momo save lock, finished voice handoffs do not restore obsolete sessions, and older Undo notices leave a newer capture open.
- [x] AI memory retrieval receives a validated timezone and a server-derived local day for relative-date questions; ambiguous dates return no invented match.
- [x] Local search matches accents, original source quotes and formatted amounts. All matches can be reached via pagination; mixed results are date ordered, accessible names distinguish same-day entries, and example receipts remain labeled.
- [x] AI search waits for synced owner records, limits queries to the server's 300-character bound, clears query/consent across accounts, and ignores revoked or superseded requests. Consent copy describes each action's actual data scope.
- [x] Photo/account races, stale meal preparation, revoked-consent results and voice-session state are guarded. The shared Meta parser accepts complete whitespace/fenced JSON while rejecting partial or malformed output. Translation hot reload retains the current language.
- [x] Source photos open in a labeled, enlarged view with a 44 px close target. Source history now shows eaten fractions, excluded foods, ingredients and notes; meal date/time and manual water-answer corrections preserve original proposals. Shared editors close and clear on account changes.
- [x] Authentication catches rejected requests, retains credentials for retry, announces errors and prevents concurrent email/social attempts. Local auth-page presentation checked at 360 px; no real account was created.
- [x] Momo journal-v5 supports the existing water check-in record from exact user quotations, with editable unknown answers and no inferred volume or photo-only water claims. This path is tested with simulated provider responses, not live inference.
- [x] Memory candidates retain mixed date periods, older explicit dates and future-day queries within the 60-entry cap. French accents/word boundaries and composed Korean date phrases are tested; comparative/excluded-date queries keep broader candidates.
- [x] Receipt edits preserve decimal amounts and currency, accept decimal commas, reject ambiguous thousands separators and keep original source values. Expense receipts are labeled correctly, optional inventory controls stay collapsed, and date-only purchases no longer display an unsaved clock time. A 360 px fictional EUR receipt was saved unchanged, corrected to USD with a decimal comma, reopened with both original/corrected values, then deleted through Undo-capable app controls.
- [x] Unknown purchase prices/currencies remain unknown in summaries, search, spending totals and AI retrieval; legacy values and explicit zero stay distinct. Missing stock units remain unresolved until edited, with exact quote checks and no assumed pen/dose conversion. A fictional unknown-price/unit purchase was checked in the browser: no available stock, explicit correction to two pens, original quote plus Unknown → pens retained, and reversible deletion verified.
- [x] Keep editing dismisses pending analysis locally. New voice/photo input and IME composition invalidate older Momo results immediately; meal photo preparation is stopped before inference when dismissed. Requests already sent are not claimed to be canceled at the provider.
- [x] Duplicate suggestions compare purchase identity, currency and quantity, measurement values, injection details, known times, feeling notes and meal contents; equal-price separate receipts stay selected through a simulated confirmed batch. Generated meal-item IDs and analysis timestamps do not decide duplicate identity.
- [x] Local keyword retrieval includes confirmed doses (2.5mg / 2,5mg), translated injection sites, meal ingredients/portion/consumption notes and purchase units. Shared site names preserve existing saved IDs. Browser check: a disposable manual shot with 2,5 mg and left arm was found by both queries, reopened correctly and deleted with Undo available; the guest profile is empty again.
- [x] A real local-journal integration test confirms corrected multi-entry batches survive remount, retain proposed/confirmed evidence, stay searchable and preserve unknown purchase money/unit fields. Stable-ID retry is idempotent; failed local persistence leaves no successful batch. Cloud/provider calls remain mocked.
- [x] Shared photo rendering now checks source reference as well as owner before displaying a resolved image; the regression test first reproduced a previous-photo frame and now passes. Search copy distinguishes keyword search from optional Momo retrieval; 360 px visual check has no horizontal overflow. The existing demo script now follows language choice, central capture, review/correction, confirmation and source retrieval.
- [x] Failed-save review regression retains corrected values, reports no false success and retries the same stable IDs. Saved receipt links identify expenses or medications correctly. Purchase history labels expenses separately and shows product/store rather than a misleading zero stock count; a disposable EUR expense was checked at 360 px, reopened and deleted with Undo available. French search/sign-in copy also visually fits at 360 px and updates document language.
- [x] Approximate time-of-day suggestions can be changed or cleared in review and in shared manual/meal edits. Exact clock time takes precedence; old draft hints remain until explicitly edited. Source history and meal recovery retain the original/corrected period. At 360 px, a fictional evening entry was saved as morning, then unknown, reopened with both source comparisons and deleted through Undo-capable controls.
- [x] Keyword search now includes saved time-of-day labels and exact clock times in the journal timezone; date-only entries receive no invented clock time. Results display the same saved time. A corrected morning fixture was found by its current period, opened from the result with the original evening/corrected morning source intact, visually checked at 360 px and deleted reversibly.
- [x] Typed notes show a character count near the 4,000-character analysis bound; longer input remains editable/recoverable instead of stopping at that bound. Analysis stays blocked until shortened. A fictional 4,122-character browser note, including its final word, survived reload; clearing it removed the warning and persisted an empty draft. The explicit sign-in handoff envelope accommodates bounded text plus three photos while retaining per-field, owner and consent limits.
- [x] Standalone error/missing-page recovery has Korean, English and French copy, an explicit page-language choice and retry/home actions without a journal-provider dependency. The missing-page card fits inside the existing shell with one main landmark. Browser check at 360 px: French recovery copy fits, its home link returns to the existing English journal, and the temporary test tab was closed. Retry callbacks are covered with simulated component tests; a live backend failure was not forced.
- [x] Final diff review retained medication names for expense-only receipts with no product label and kept existing medications visible in their shared editor. An unchanged fictional EUR medicine expense preserved its name and expense-only stock choice in the browser, then was deleted. Translation coverage: 588 keys in each Korean/English/French dictionary, no missing or duplicate keys.
- [x] Automated checkpoint (15:46 Seoul): 260 tests passed across 30 files; TypeScript, production build and focused lint passed. Full-repository lint retains unrelated formatting errors in untouched files; earlier full-lint success notes are historical.
- [x] Local browser: 360/390 px inspection, first-launch language/skip/replay, composer focus without microphone activation, sign-in navigation/draft recovery, and a fictional cafe entry saved, loaded in a fresh tab, found without its accent and reopened correctly. Current 360 px search view has no horizontal overflow and stays in English across hot updates.
- [ ] Live local Meta inference remains unverified: BASETEN_API_KEY is absent from the current process and checked local environment files. No real microphone/physical-phone keyboard or authenticated cloud/RLS/private-storage certification is claimed. Provider and dictation tests use simulated responses/events.
- Publication follow-up: after local verification, the owner separately authorized a normal commit and push to existing main. The pre-commit fetch matched local/remote main at 16ddd01. Deployment and repository visibility changes remain outside this follow-up.
- [x] Temporary fictional guest-browser fixtures removed through the reversible Delete/Undo path; no cloud records were created.
- [x] The 169-file source/configuration snapshot from the passing checks was rechecked at 16:32 Seoul with no changes; local/remote main still matched 16ddd01. The temporary verification tab and its local development server were closed after browser cleanup.
