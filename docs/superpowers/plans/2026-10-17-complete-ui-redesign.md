# Complete UI Redesign Implementation Plan

**Goal:** Replace the existing shadcn/Radix presentation with Mantine and redesign every user-facing route while preserving verified wardrobe behavior.

**Architecture:** Keep Next.js 14, React 18, existing backend contracts, account isolation, upload ownership and durable recommendation hooks. Replace all 21 UI primitives through compatibility adapters implemented with official Mantine components, then redesign the shell and each feature surface. Mantine core/hooks are pinned to 8.3.18; current Mantine 9 requires React 19.2 and is intentionally excluded.

**Design:** A fashion wardrobe product with a white/sage background, deep forest accent, strong clothing photography and clean sans-serif type. One theme across light/dark mode. Card radius 20px, controls 10px, small status badges rounded pills. Existing translated product copy and real server data only. Desktop navigation 248px, main content up to 1440px; mobile drawer and bottom navigation with safe-area spacing. Support keyboard/focus, reduced motion, loading, empty and error states. No overflow masking to conceal layout defects.

## Source evidence
- https://v8.mantine.dev/guides/next/
- https://v8.mantine.dev/styles/mantine-styles/
- https://v8.mantine.dev/theming/theme-object/
- https://registry.npmjs.org/@mantine/core/8.3.18
- https://github.com/mantinedev/mantine/blob/8.3.18/LICENSE

Mantine's official repository currently shows about 31.8k stars and uses MIT. Ant Design 6.6.6 supports React 18 but favors a denser enterprise default. Current HeroUI 3.2.6 requires React 19 and Tailwind 4. Popularity is a research snapshot, not a guarantee of support or suitability.

## Ownership and sequence
- [x] Root foundation: install exact core/hooks versions, provide theme via `components/design-provider.tsx` and `lib/design-system.ts`, integrate app layout/providers and CSS, add shared page header, build desktop/mobile shell, login/onboarding/invite/error routes and dashboard.
- [x] UI agent: replace `components/ui/*` using Mantine equivalents; preserve exports, refs, controlled/uncontrolled callbacks, asChild links, focus/escape behavior and accessibility. Remove Radix runtime imports when migrated. Provide real Mantine test wrapper and regression tests for interactions.
- [x] Core feature agent: redesign wardrobe, recommend, outfits/new/detail/list and pairings, including all feature dialogs/cards/studio/shared components. Preserve all functions and ownership fences. Fix discovered inconsistent item query keys and history links with regression evidence.
- [x] Secondary feature agent: redesign history, analytics, learning, family/feed, settings, notifications and their dedicated cards/dialogs/calendar/chart. Preserve all data, filters, confirmations and server actions. Create a local wardrobe editorial image for auth/entry visual using imagegen; no external hotlinks or fake dashboard art.
- [x] Root integration: inspect every route and remaining native/legacy controls, finish coverage gaps, remove unused Radix dependencies and stale shadcn registry config after source scan.
- [x] Verification: full frontend tests, typecheck, eight-language parity and production build; targeted backend regression if API behavior changes (none intended). Build own frontend image, deploy locally, inspect desktop/mobile/light/dark, test upload/edit/recognition/filtering, recommendations/reload/cancel/retry, studio, feedback and secondary page actions. Use synthetic data only.
- [x] Independent review, final runtime/image audit, screenshots and report under `verification/ui-redesign/`.

## Shared component contracts
`components/page-header.tsx` exports `PageHeader({title, description?, actions?, icon?, className?})`, each ReactNode except className. Feature pages may use the existing translated title/description and actions. Common CSS utilities: `page-container`, `page-header`, `page-title`, `page-description`, `surface-panel`, `metric-card`, `wardrobe-gallery`. They complement Mantine and do not replace its interaction implementation.

UI adapters retain current `@/components/ui/*` imports to avoid coupling visual migration to business changes. They must implement actual Mantine controls; changing only colors or importing unused packages does not satisfy this plan. Pure semantic wrappers may use Mantine `Box`, `Paper`, `Text` and `Title` as appropriate. Do not skip failing tests, bypass build gates, weaken account isolation, or replace real API content with demonstration content.

## Verification commands
```sh
cd frontend
npm test -- --maxWorkers=2
npx tsc --noEmit
npm run i18n:check
npm run build
cd ..
./local.sh build frontend
./local.sh up -d --no-deps frontend
```

Before declaring completion, record route coverage for all 18 page files plus global/dashboard error and not-found views, build/test counts and browser evidence. Any inaccessible external service is reported separately from local checks. The existing public-deployment boundary remains documented in LOCAL-DEPLOYMENT.md.

## Verified outcome

Completed 2026-10-17. Final full suite: 80 files, 771 tests passed, none skipped. Final Linux frontend image built and deployed; runtime identity, health and source manifest are recorded in `verification/ui-redesign/SUMMARY.json`. Browser covered all 18 page routes, 404, real synthetic upload/AI recognition, recommendation/reload/result/feedback, Studio/save/wear, pairing generation, settings/family and mobile/dark/locale views. Destructive actions were tested through cancellation and isolated automated tests; recommendation cancel/retry and offline paths were covered by automated tests in this iteration. Error boundaries received source review without intentionally breaking the running service. See `verification/ui-redesign/REPORT.md` for exact scope and remaining dependency warnings.

## Final functional issue found by independent persistence review

- [x] Preserve Studio's intentional manual/pending state; add an optional `worn` server filter using feedback.worn_at, shared by list/count/calendar and bulk selection, with no database migration. Switch the frontend worn chip from acceptance status to the new factual filter. Cover real manual wear, templates, accepted-only unworn entries and ownership through tests.
- [x] Repeat complete backend/frontend regression, build/redeploy the API and frontend images, verify both manual and AI worn looks appear in the browser, refresh report and runtime manifest.

The final worn-filter fix passed 2155 backend tests and 771 frontend tests with no failures or skips. Real browser list and calendar both show manual and AI worn looks; 26/26 read-only API/database checks pass. API and frontend images are matched to the final runtime in SUMMARY.json.
