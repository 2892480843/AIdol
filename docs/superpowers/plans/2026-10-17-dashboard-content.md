# Dashboard Content Enrichment Implementation Plan

**Goal:** Make the current wardrobe homepage useful at a glance with real garments, looks, counts and actions; reduce oversized empty cards while retaining the established Mantine theme and all routes.

**Design:** Compact welcome strip; four clear metrics; a two-column workspace with large pending AI look previews and garment galleries on the left, weather/care/daily setup on the right; rediscover less-worn garments, ready-item color palette and four useful navigation shortcuts below. Show real images only. Mobile keeps summary metrics in two columns and garment grids in two columns, with stacked content and clear headings.

**Data and boundaries:** Reuse existing React Query hooks, bounded server queries and existing account-scoped cache. Parallel queries for six recent active items, four least-worn active items and a one-row washing-count response. Use response.total for counts. Pending AI looks use pending + scheduled/on_demand + not lookbook + unworn. Analytics acceptance is all-time, looks_this_week is rolling seven-day creations, and ready-color distribution is labelled accordingly. Do not fabricate history, counts, AI recommendations or charts; do not start AI calls on homepage load. No backend or dependency changes.

- [x] Root: compose dashboard page and focused widgets, compact layout CSS, preserve schedule/notification/family functionality, add correct loading/error/empty states and working deep links.
- [x] UI agent: implement recent/rediscover presentation components with genuine garment pictures, responsive grids, status/fallback and meaningful tests.
- [x] Localization agent: add overview copy in all eight dashboard locales, preserve previous keys and validate placeholders/parity.
- [x] Verify: tests for accurate zero/null/error counts, pending selection and actions, garment links and bounds; full frontend regression, type/i18n/build; independent review.
- [x] Runtime: build a distinct frontend image, update only frontend, check desktop/tablet/mobile/light/dark and the existing garment/recommendation deep links; save screenshots and evidence.

**Ownership:** Root owns app/dashboard/page.tsx, components/dashboard/dashboard-widgets.tsx, dashboard-home.module.css and root tests/docs/compose; UI agent owns wardrobe-panels.tsx, wardrobe-panels.module.css and its test; localization agent owns only messages/*/dashboard.json. Existing uncommitted architecture and complete-UI changes are preserved.

**Verification:** `npm test -- --maxWorkers=2`, `npx tsc --noEmit`, `npm run i18n:check`, `./local.sh build frontend`, then `./local.sh up -d --no-deps frontend`. Browser evidence lives in verification/dashboard-content/; previous UI evidence remains historical and is not overwritten.
