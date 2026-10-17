# Community Style Product Implementation Plan

**Goal:** Deliver a colorful inspiration community UI rewrite and a source-backed inspiration-to-own-wardrobe-to-studio flow.
**Architecture:** Retain Next14/React18/Mantine8 and existing backend. Isolate public method catalog, pure matching, account-local bookmarks and bounded inventory querying. Studio seed is an explicit validated frontend input, existing save APIs remain authoritative.
**Tech Stack:** Existing TypeScript/CSS modules/React Query/next-intl; no new dependencies.

- [x] Research: 4–6 public creators, exact first-party evidence, primary article + identity verification, separate source claims from our derived formulas. Owner ai_gateway, docs/research/2026-10-17-style-creators.md.
- [x] Foundation: rewrite tokens/theme, shell/nav/header, base Card and shared core/secondary surfaces. Owner frontend_refactor; no dashboard component ownership overlap. Add inspiration navigation.
- [x] Plumbing: pure matching, ready wardrobe pagination, per-account local bookmarks, validated studio seed + exact owned item retrieval and meaningful regression tests. Owner storage_layer; no styles/messages overlap.
- [x] Product: original hero image, catalog and eight-language copy, inspiration UI with honest matches/swaps/filter/bookmark/working studio action. Root owns catalog/messages/components/inspiration and route.
- [x] Homepage: rewrite composition and dashboard styles, place inspiration editorial entry first, compact real metrics and service data, preserve existing widgets/actions and zero/error behavior. Root owns dashboard.
- [x] Review: independent correctness/a11y/data-source review, focused and full frontend tests, type/lint/i18n, no disabled tests or fake data.
- [x] Runtime: new frontend image community-20261017, update only frontend service, verify actual inspiration->studio->save with the demo account, viewport/theme screenshots, source/image/runtime evidence, deployment documentation.

Detailed design: ../specs/2026-10-17-editorial-style-design.md. Current main working tree contains prior architecture and UI work; preserve it and do not reset or commit unrelated changes. User requested implementation; proceed to concrete reviewable result without a separate approval stop.

**User steering:** User selected lively, colorful inspiration community. Foundation, homepage and discovery boards switched to berry/coral primary + lavender/mint/lemon/blush, sans typography, image-led recipe boards and clear save actions. Added reviewed regressions for delayed URL updates clearing manual swaps and sequential cross-tab bookmark overwrites.
