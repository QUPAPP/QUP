# QUP interface improvement — 2026-10-17

The user asked for a much more professional existing product and approved continuing with QUP identity. Implement directly in the current Next.js/React/Tailwind stack. This is an expansion of the established brand, not a rebrand. No new dependencies, DB schema changes or production deployment.

## Scope and acceptance
- Marketing: composed split landing page, genuine product journey, working calls to register/login, concise FAQ, footer and brand icon.
- Student: persistent desktop navigation, compact mobile navigation, active route state, broad readable workspace; keep focused assessment content narrower.
- Dashboard: welcome, useful next step, readable history rows, filter and pagination; show only server data, no invented aggregates.
- Exams: real API catalog in a responsive layout, meaningful empty state and clear diagnostic entry.
- Authentication: split editorial/form composition, show/hide password and unchanged validated submission.
- Assessment/results: clear question position and controls, strong result hierarchy, separated strengths/needs and server-provided plans.
- Complete missing subscription and account surfaces with existing authorized API contracts.
- Provide intentional loading/error/empty/not-found states, keyboard navigation, mobile reflow and reduced motion.

## First viewport and visual rules
On marketing, white/navy contrast and generous spacing lead to an oversized Arabic heading on the right and a structured educational journey on the left. Gold guides the one primary call to action. On student pages, a white sidebar anchors the right edge and a quiet pale canvas contains the task. Content has real hierarchy rather than repeated identical cards. Use Kufi for major headings and Sans Arabic for reading and controls. Icons are a small consistent authored stroke set. No stock photos, fake charts, fake metrics or unsupported promises.

## Verification
Run web tests, typecheck, Biome and production build. Test real rendered desktop/mobile pages with API fixtures for UI states; API behavior remains separately integration-tested. Inspect both viewport classes together and correct material defects in one bounded pass. Review security for account/session changes and keep checkout authority on the backend.
