# My Dear Step Journal

# MY DEAR STEP - MASTER BUILD PROMPT FOR LOVABLE

You are the product designer, interaction designer and senior full-stack engineer implementing My Dear Step. This is a concrete build request. Work through the implementation, not just a plan. Read this entire specification and the attached visual references before changing the project.

## 1. Mission and new project

Build My Dear Step as a NEW Lovable project from a clean scaffold. The user explicitly chose a fresh project. The earlier prototype at `https://my-dear-step.lovable.app/` is historical context only: do not modify, clone, import its code or reconnect its database automatically. Use the attached approved mockups, assets and this specification as the implementation source. Inspect the new project's scaffold and dependencies, then establish the routes, data model and integrations deliberately. Connect a backend intended for this new project when configured; do not assume old credentials or user data should be reused. Keep the product name My Dear Step. Once the new schema exists, evolve it with additive migrations and preserve records created during this build.

Build a Korean-first, mobile-first personal GLP-1 journal that makes daily tracking genuinely easy. It combines reliable manual tracking, a warm optional companion named Momo, and a source-linked memory system powered by Meta Muse Spark Open through Baseten. People should understand what they recorded, what is planned, what remains in their inventory, what they spent, and how to retrieve their own history.

The product promise is: **a useful tracker that remembers your story, with less typing and evidence you can inspect**. This is not a generic chatbot wearing a medical interface. The basic manual app must remain fully usable when AI is unavailable or disabled.

Deliver a real application experience, not a marketing landing page, a set of disconnected screens, or a beautiful mock with dead controls. Never describe unconnected services as live. Distinguish demo data from real records throughout.

## 2. Non-negotiable decisions

1. Brand: `my dear step`. Companion: Momo, a small plush-looking cream/brown otter, peach scarf, forest-green journal. Keep the approved identity.
2. Warm ivory, forest green, sage and peach. No blue hospital dashboard, purple AI gradients, glassmorphism, fake neumorphism or giant mascot hero.
3. Korean interface first. English and French translation infrastructure; finish every Korean string. Do not mix untranslated English controls into the main experience. Localize numbers, dates and units.
4. Default timezone Asia/Seoul, user configurable. Store instants correctly, preserve timezone and date precision.
5. Four root destinations: Today, Calendar, Injections, Progress. The middle plus is an action, not a destination. Personal Journey lives inside Progress.
6. Concrete tracking first: quick add, injection records, user-configured reminders, inventory, purchases, expenses, weight, condition notes, photos, history and exports.
7. AI transforms user input into editable drafts. A user explicitly confirms before records are committed. No automatic medication changes, new dose recommendations or inferred missing doses.
8. Every AI-derived factual field has a source reference. Unknown values stay unknown. Calculations use deterministic code.
9. Momo is optional. Users can reduce or hide decorative art without losing any functionality.
10. Follow current Meta/Baseten provider contracts. Do not assume Meta's closed-model API features are available on the Baseten Open endpoint.

## 3. Priority and completion strategy

Build in clear phases:
Phase 1: Structure and fidelity (Ivory/forest design system, AppShell, 4 root tabs + central Quick Add modal, Today, Calendar, Injections, Progress).
Phase 2: Useful tracking & consistent data (manual journal workflows, inventory, expenses, charts, edit/undo, date precision).
Phase 3: Real Supabase persistence & isolation (tables, RLS, storage, owner-based rules).
Phase 4: Baseten Muse Spark Open integration & human review (audio/image/text transcription & extraction, candidate review, explicit confirmation, grounded retrieval).
Phase 5: Motion, accessibility & export/import.
Phase 6: Complete demo verification.

Begin by inspecting the new project's scaffold and implementing Phase 1 from this specification and the attached V2 mockups.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://my-dear-step-journal.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/0e8ecf7b-bcc5-435d-a927-f51d157f4667).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
