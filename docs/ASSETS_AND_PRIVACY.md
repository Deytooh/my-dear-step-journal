# Assets and privacy notes

## License scope

Project source code is licensed under the [MIT License](../LICENSE), added with the owner's approval on 5 November 2026. Third-party dependencies, fonts, marks and inherited artwork remain subject to their own rights and licenses. The project license does not grant rights the project does not own or resolve the provenance checks below.

| Asset/data                                                         | Provenance and action                                                                                                                                                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| src/assets/momo-hamster.png.asset.json pointer and momo-banner.jpg | Inherited from the existing Lovable project; owner-approved visual. No original license record found in this pass. Owner must confirm rights before public release.                                     |
| Lovable build-integration mark and inherited favicon               | The mark is supplied by the build integration, not a newly authored tracked SVG. Preserve applicable platform/asset terms.                                                                              |
| IBM Plex Sans KR and Fraunces                                      | Existing font imports. Retain their upstream license notices and verify distribution terms for any bundled copies.                                                                                      |
| Lucide icons and package dependencies                              | Reused upstream packages; preserve package licenses/notices.                                                                                                                                            |
| Meal/moment runtime photos                                         | No standalone meal or moment photo was added to runtime assets in this pass. Use an image you own or have permission to use for a live demo.                                                            |
| Generated salad/toast QA image                                     | Fictional AI-generated imagery appears inside the committed `docs/momo-review/` screenshots. The standalone QA asset and fixture route are excluded. It is not a user record or model-inference result. |
| Browser upload fixture                                             | Algorithmically generated plain-color PNG used only for local upload/save/reload testing. It is not a food photograph, model result, or private record.                                                 |

No clinical datasets, private exports, personal health photos or new generated human-body images are included. The site selector remains a neutral SVG pictogram. No license is invented or granted here for inherited third-party assets.

Client variables are public project/publishable configuration. BASETEN_API_KEY remains server-only. AI requires sign-in and explicit task consent; Provider inputs are selected photos/text, up to 60 authorized memory candidates (bounded facts per entry), or limited relevant facts for separately opted-in contextual questions. Sources/model outputs are data, not tool instructions. No hidden provider reasoning is stored.

On device: guest/account snapshots in separate localStorage keys, media in owner-scoped IndexedDB keys, and unfinished Momo/meal drafts in account-scoped sessionStorage. These stores are not encrypted at rest. They require a trusted browser profile. Sign-out clears in-memory media access/caches, while retaining unsynced account data for that account's return. Clear browser data only after retaining needed backups/photos.

Cloud: existing owner RLS and private user-folder media are required. Signed URL caches expire early and are invalidated on account changes. New uploads are content-deduplicated per owner. Removing an entry does not automatically garbage-collect shared source blobs; backend retention/account-deletion cleanup requires the owner. Deployed security was not proven without two real test accounts.

JSON/CSV preserve record data, precision, estimates, provenance and canonical media references. They exclude environment secrets and expiring signed URLs. They do not include all private media bytes; retain original files separately. Clearing IndexedDB makes localphoto-only references unavailable. Cross-account storage paths remain inaccessible unless deliberately re-uploaded with authorization.
