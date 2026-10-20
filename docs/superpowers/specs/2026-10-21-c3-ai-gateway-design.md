# C3 — AI gateway (test provider) and author assistance

Date: 2026-10-21. Branch: `ahmeddev`. Executed on the user's request ("كمّل بالشريحة C3"). Assumed
rules are recorded in `OPEN_QUESTIONS.md` #19a.

## Why

`AI_INTEGRATION.md` asks for the following:

- **Gateway:** an AI gateway behind internal contracts, with provider adapters that keep SDKs out
  of the domain.
- **Output:** Zod-validated, versioned structured output with bounded retries.
- **Tracking:** provider, model and prompt version are tracked for every run.
- **Untrusted input:** imported or student text is data, never instructions.

`AGENTS.md` adds that the LLM never decides mastery, and that the product must work when AI is
unavailable. PRD §5 includes "AI-assisted content/explanation تحت review rules".

Two decisions are still open:

- which providers are allowed in production (#17);
- whether students ever see AI text (#18).

So C3 builds the gateway and ships only a **deterministic test provider**. AI is used for **authors
only**, and its output always lands in a DRAFT that a person reviews.

## What gets built

### `packages/ai-gateway` (framework-free)

- `AiProvider`: `complete({ task, system, prompt, input, maxOutputTokens }, signal)` →
  `{ text, model, usage? }`. Real adapters (Anthropic, OpenAI, local) plug in later behind config.
- `FakeAiProvider`: deterministic answers per task, computed from the structured `input`. It can be
  set to fail in tests (`invalid-json`, `wrong-answer`, `timeout`, `error`).
- `AiTask<I, O>` holds:
  - `name`, `promptVersion`, `schemaVersion`;
  - a Zod `schema`;
  - `buildPrompt(input) → { system, prompt }`;
  - `verify(output, input) → problem | null`, a grounding check;
  - `maxOutputTokens`.
- `runAiTask(provider, task, input, options)` → `{ ok: true, output, run } | { ok: false, run }`:
  - a timeout per attempt (AbortSignal);
  - at most `maxAttempts` attempts on invalid JSON, a schema failure or a failed verify;
  - one `run` record: `{ task, promptVersion, schemaVersion, provider, model, status (SUCCEEDED |
    INVALID_OUTPUT | TIMED_OUT | FAILED), attempts, latencyMs, usage?, errorCode? }`.
- Prompts treat content as data (AI_INTEGRATION.md "Prompt Injection"):
  - untrusted text sits between `<content>` tags, and any closing tag inside it is escaped;
  - the system prompt forbids following instructions found in the content;
  - output is JSON only, and no tools exist.

**Tasks (v1):**

| Task | Input | Output (schema `1`) | Verify |
| --- | --- | --- | --- |
| `suggest_question_metadata` (prompt `metadata-v1`) | stem, options with correct flags, the version's skills `{ id, name }` (subskills as `skill › sub`) | `{ nodeId, difficulty: EASY \| MEDIUM \| HARD, rationale ≤ 500 }` | `nodeId` is one of the given nodes |
| `draft_explanation` (prompt `explanation-v1`) | stem, options, correct keys | `{ correctOptionKeys, explanation ≤ 1500 }` | the keys equal the real correct keys, so it can never explain a different answer |

### API module `ai`

- Config:
  - `AI_PROVIDER` is `fake` or `disabled`. The default is `fake` outside production and `disabled`
    in production; a real provider needs #17.
  - `AI_TIMEOUT_MS` defaults to 15000, `AI_MAX_ATTEMPTS` to 2.
- `AiAssistantService` loads the question version through the questions contract (`forDelivery`)
  and its taxonomy outline through the catalog contract, runs the task, and records an `ai_runs`
  row with:
  - `task`, `prompt_version`, `schema_version`;
  - `provider`, `model`, `status`, `attempts`, `latency_ms`;
  - `input_tokens`, `output_tokens`, `error_code`;
  - `requested_by`, `subject_type`, `subject_id`;
  - `output` (validated output only, never the prompt);
  - `created_at`.
- Routes:
  - `GET /admin/ai/status` (`questions.create`) → `{ enabled, provider, tasks }`.
  - `POST /admin/question-versions/:id/ai/metadata-suggestion` (`questions.create`) →
    `{ suggestion: { skillId | null, subskillId | null, nodeName, difficulty (0.25 | 0.5 | 0.75),
    rationale } }`.
  - `POST /admin/question-versions/:id/ai/explanation-draft` (`questions.create`) →
    `{ draft: { explanation } }`.
  - `GET /admin/ai/runs?limit&offset` (`ai.manage`) → recent runs and 24-hour counts by status.
- Errors:
  - `503 AI_UNAVAILABLE` when disabled or the provider failed;
  - `503 AI_OUTPUT_INVALID` after the attempts are spent;
  - `503 AI_TIMEOUT`;
  - `404 QUESTION_VERSION_NOT_FOUND`, `409 AI_REQUIRES_DRAFT`, `422 AI_NO_SKILLS`.

  The domain has no gateway-error kind, so all three AI failures share the UNAVAILABLE kind and
  differ by code (a ruling made during implementation). Each run that reached the provider is
  recorded, whatever its outcome.
- Rate limit: 20 AI calls per minute per IP, one budget shared by both routes, for cost control.
- Nothing is applied by the server. A suggestion is advice; the author applies it in the editor and
  saves, then the version goes through review as before.

### Web

- Question editor (DRAFT only, when `status.enabled`): a "مساعدة الذكاء الاصطناعي" panel with two
  buttons:
  - "اقترح المهارة والصعوبة" shows the suggestion and its rationale, with "تطبيق" to set the
    mapping and difficulty in the form;
  - "اقترح شرحًا" shows a draft with "تطبيق" to put it in the explanation field.

  The panel states that suggestions are based on the last saved version, and that applied text
  still needs the author's review.
- `/admin/ai` (`ai.manage`): the provider status and the recent runs (task, status, latency,
  attempts, prompt version, time), with 24-hour counts.

## Out of scope

- real provider adapters and keys (#17);
- AI text shown to students (#18);
- error classification;
- import structuring of documents and images;
- an evaluation dataset.

## Testing

- Package unit:
  - prompt escaping of `</content>`;
  - success;
  - invalid JSON, then success on retry;
  - schema failure → `INVALID_OUTPUT` after the attempts;
  - grounding: a wrong answer key → `INVALID_OUTPUT`;
  - timeout → `TIMED_OUT`;
  - provider error → `FAILED`;
  - the run record carries the versions and attempts;
  - the fake provider is deterministic.
- API e2e:
  - permissions (a student 403; a content manager may use the assistance, but not the runs page);
  - a suggestion for a draft names a node of its version, and the difficulty maps;
  - the explanation draft;
  - `ai_runs` rows are written, the output stored on success only;
  - `disabled` → 503, recorded nowhere (no call);
  - an unknown version → 404.
- Web unit: client paths, difficulty mapping, suggestion application to form values.
- Browser: an author asks for both on a draft, applies them, and saves.
