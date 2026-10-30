# my dear step

A Korean-first personal GLP-1 journal with optional Momo capture: supplied text/voice transcription/photos → editable drafts → explicit confirmation → inspectable sources and searchable history. Meal photos can propose editable food/portion/energy estimates. It does not recommend treatment or nutrition targets.

The existing TanStack Start application continues the Lovable-connected project. Do not re-scaffold it or rewrite published history. Four root tabs share one Quick Add sheet and journal store. The approved forest-green/ivory mobile design is preserved.

## Run locally

Use Node 22+ and the existing Bun lockfile:

```sh
bun install --frozen-lockfile
bun run dev
bun run test
bun run build
bun run lint
```

The local default Vite port is 8080. Open `/today`. If dependencies are already installed, `npm run dev` and the same npm scripts also work. Do not generate a competing lockfile. See [setup and environment](docs/SETUP_AND_ENV.md) before configuring the existing backend or AI.

Manual logging works as a guest. AI requires sign-in, explicit consent, server configuration and the quota migration. A missing AI configuration never substitutes fabricated results. New users start empty. Settings can start a clearly labeled, guest-only fictional demo.

## Submission package

- [Status and exact verification](docs/SUBMISSION_STATUS.md)
- [Demo recording script](docs/DEMO_SCRIPT.md)
- [Submission copy](docs/SUBMISSION_COPY.md)
- [Contributions](docs/HACKATHON_CONTRIBUTIONS.md)
- [Setup and environment](docs/SETUP_AND_ENV.md)
- [Release checklist](docs/RELEASE_CHECKLIST.md)
- [Asset and privacy notes](docs/ASSETS_AND_PRIVACY.md)

JSON/CSV exports retain structured entries and source references. They are not standalone media archives. Guest/account photos are cached in browser IndexedDB; authenticated sync uploads retained photos into the private owner-folder bucket. Clearing browser data can destroy unsynced work: export and separately retain original photos first.

The former creation specification is archived in [historical master specification](docs/HISTORICAL_MASTER_SPEC.md). Its instruction to create a new project is obsolete. `AGENTS.md` and current code govern continued development.
