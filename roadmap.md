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
