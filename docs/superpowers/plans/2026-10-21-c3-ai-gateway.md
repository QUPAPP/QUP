# C3 AI Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A provider-agnostic AI gateway with a deterministic test provider. Authors use it for two advisory tasks (skill and difficulty suggestion, explanation draft). Every run is validated, grounded and recorded.

**Architecture:**
- `packages/ai-gateway` is framework-free (tasks, prompts, schemas, retry, timeout).
- The API `ai` module runs tasks on question versions read through contracts, and records `ai_runs`
  (migration 0016).
- Web panels in the editor, plus an admin page.

**Tech Stack:** TypeScript, Zod 4, Vitest, NestJS, Drizzle, Next.js, TanStack Query.

**Spec:** `docs/superpowers/specs/2026-10-21-c3-ai-gateway-design.md`

## Global Constraints

- No real provider SDK, no keys, no network calls.
- `AI_PROVIDER`: `fake` or `disabled` (production default `disabled`).
- The LLM never decides mastery, publishes, or grades. Outputs are advice.
- Prompts contain question content only: no student data, no secrets.
- Stable codes: `AI_UNAVAILABLE` (503), `AI_OUTPUT_INVALID` (502), `AI_TIMEOUT` (504).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No push.

## Review Focus

1. Content that contains `</content>` or "ignore previous instructions" stays inside the data block.
2. A model that names a different correct answer is rejected, never shown.
3. With AI disabled, the editor works exactly as before, and the panel is hidden.
4. A timed-out attempt is aborted, not left running.
5. `ai_runs` never stores prompts or keys.

---

### Task 1: `packages/ai-gateway`

**Files:**
- `package.json`, `tsconfig*.json`;
- `src/{index,provider,fake-provider,run,tasks/question-metadata,tasks/explanation,prompt}.ts`;
- `test/*.test.ts`.
- Add `@qup/ai-gateway` to `apps/api`.

- [ ] Unit tests from the spec. FAIL → implement → PASS → build.
- [ ] Commit `Add the AI gateway package with a test provider`.

### Task 2: API `ai` module

**Files:**
- migration `0016_ai_runs.sql` and schema `ai.ts`;
- config `AI_PROVIDER`, `AI_TIMEOUT_MS`, `AI_MAX_ATTEMPTS`;
- `modules/ai/`: module, `ai-assistant.service.ts`, `drizzle-ai-run-store.ts`, `admin-ai.controller.ts`
  and errors;
- test cleanup (`ai_runs` by subject or user);
- test: `apps/api/test/ai/ai.e2e.test.ts`.

- [ ] E2E from the spec. FAIL → implement → PASS + suite.
- [ ] Update API_CONTRACTS.
- [ ] Commit `Add AI assistance for question authors`.

### Task 3: Web

**Files:**
- `lib/ai-api.ts`;
- `components/admin/question-editor/ai-assist-panel.tsx` (wired into the question version page);
- `app/admin/ai/page.tsx`;
- permissions nav (`aiManage`);
- test: `apps/web/test/ai.test.ts`.

- [ ] Tests:
  - client paths;
  - `applySuggestion(form, suggestion)`;
  - `difficultyLabel`.
- [ ] Implement → tests, typecheck, Biome → commit `Add the AI assistance panel and AI runs page`.

### Task 4: Docs, gates, browser

- [ ] Docs:
  - OPEN_QUESTIONS #19a;
  - IMPLEMENTATION_STATUS;
  - README;
  - AI_INTEGRATION "V1";
  - DEPLOYMENT env.
- [ ] Gates. Browser pass.
- [ ] Commit, then self-review.
