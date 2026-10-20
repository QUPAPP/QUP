# C4 Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the forged-address and dependency findings, add a CSP and a cross-site write check, and give operators a backup check, a performance check and a runbook.

**Architecture:** API config and a Fastify request hook decide the client address. The web proxy's pure helpers (`lib/api-proxy.ts`) decide headers and cross-site refusal. `src/proxy.ts` sets the CSP. Shell and perf scripts sit beside the code they check.

**Tech Stack:** NestJS/Fastify, @nestjs/throttler, Next.js 16 proxy, Vitest, pg_dump/pg_restore.

**Spec:** `docs/superpowers/specs/2026-10-21-c4-hardening-design.md`

## Global Constraints

- No deploy, no push, no production change. Production environment changes are written in
  DEPLOYMENT.md and RUNBOOK.md for an explicit later step.
- Headers: `x-qup-proxy-secret` and `x-qup-client-ip`. Secret env: `PROXY_SHARED_SECRET` (≥ 32 chars).
- Error code `CROSS_SITE_REQUEST` (403).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A client that sends `X-Forwarded-For` through the web app cannot choose its rate-limit address.
2. A direct API caller with a forged `x-qup-client-ip` but no secret gets no new budget.
3. Production pages load with no CSP violation (scripts carry the nonce).
4. Same-origin writes from the app still work, including on CranL behind its proxy (host from
   `x-forwarded-host`).
5. The backup check never touches the source database except to read it.

---

### Task 1: Dependencies

- [ ] Upgrade drizzle-orm (^0.45.2, api + db), drizzle-kit (matching), fflate (^0.8.3); add the
  `source-map-js` override in `pnpm-workspace.yaml`.
- [ ] `pnpm audit --prod` → no findings. Rebuild db. db + api + web suites pass.
- [ ] Commit `Upgrade drizzle-orm and fflate, override source-map-js`.

### Task 2: Trusted client address

**Files:**
- `apps/api/src/config/app-config.ts`;
- `apps/api/src/bootstrap/client-address.ts` (hook + `clientAddress(request)`);
- `create-app.ts`;
- `rate-limit.module.ts` (`getTracker`);
- `apps/web/src/lib/api-proxy.ts`, `apps/web/src/app/api/v1/[...path]/route.ts`.

**Tests:**
- `apps/api/test/config.test.ts`;
- `apps/api/test/auth/client-address.e2e.test.ts`;
- `apps/web/test/api-proxy.test.ts`.

- [ ] Tests from the spec. FAIL → implement → PASS → commit `Attribute requests to a trusted client address`.

### Task 3: Cross-site write refusal

- [ ] Write the tests first: a `crossSiteWrite(method, headers)` decision table in `api-proxy.test.ts`.
- [ ] Implement it, and have the route answer `403 CROSS_SITE_REQUEST`.
- [ ] Commit `Refuse cross-site writes through the API proxy`.

### Task 4: Content Security Policy

- [ ] `apps/web/src/lib/csp.ts` `buildContentSecurityPolicy({ nonce, development })` + `test/csp.test.ts`.
- [ ] `apps/web/src/proxy.ts` with the matcher. Root layout `await connection()`.
- [ ] Verify the build output shows dynamic routes. Production start and browser check: no CSP
  violations.
- [ ] Commit `Add a nonce-based Content Security Policy`.

### Task 5: Operations

- [ ] `scripts/backup-restore-check.sh`. Run it on the local DB and keep the output.
- [ ] `apps/api/test/perf/answer-path.perf.ts`, `vitest.perf.config.ts`, script `perf`. Run it and
  keep the numbers.
- [ ] `RUNBOOK.md`.
- [ ] Commit `Add a backup restore check, an answer-path performance check and a runbook`.

### Task 6: QA, docs, gates

- [ ] Browser QA pass (375 px and desktop). Fix what it finds.
- [ ] Docs:
  - SECURITY (audit + new controls);
  - OBSERVABILITY (alerts);
  - DEPLOYMENT (env);
  - `.env.example`;
  - OPEN_QUESTIONS #21b and #22a;
  - IMPLEMENTATION_STATUS;
  - TESTING.
- [ ] Gates. Security self-review against SECURITY.md "Feature Security Checklist". Commit.
