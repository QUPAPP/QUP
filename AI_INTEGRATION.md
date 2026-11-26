# AI Integration

## Principle

AI enhances QUP; it does not own core truth.

### AI may assist
- explanation.
- hints.
- misconception/error classification.
- question drafting.
- distractor drafting.
- taxonomy/tag suggestion.
- import structuring.
- duplicate similarity support.

### AI must not be authority for
- mastery score.
- authorization.
- payment/entitlement.
- automatic publish.
- official exam score mapping.

## AI Gateway

Business modules call internal contracts only.

Conceptual interface:
```ts
generateExplanation(input)
classifyError(input)
suggestQuestionMetadata(input)
draftQuestion(input)
structureImportedContent(input)
```

Provider adapters can support OpenAI/Anthropic/Google/local/future providers without leaking SDKs into domain.

## V1 (C3, 2026-10-21)

- **Gateway:** `packages/ai-gateway`, framework-free and vendor-free:
  - `AiProvider`, versioned `AiTask`s and `runAiTask`;
  - Zod-validated JSON with a grounding check per task;
  - bounded retries and an aborting per-attempt timeout;
  - a run record.
- **Provider:** only the deterministic `FakeAiProvider` exists. Real adapters wait for
  OPEN_QUESTIONS.md #17. `AI_PROVIDER` is `fake` outside production and `disabled` in production by
  default.
- **Tasks:** `suggest_question_metadata` (`metadata-v1`) and `draft_explanation` (`explanation-v1`),
  for authors on drafts only (`modules/ai`, API_CONTRACTS.md "AI Assistance"). Outputs are advice
  the author applies in the editor; review is unchanged. Nothing reaches students (#18).
- **Record:** `ai_runs` keeps task, prompt and schema versions, provider, model, status, attempts,
  latency, tokens and error code. Output is kept for successes only, never the prompt.
- **Not yet (see V1.1 for what has since landed):**
  - import structuring;
  - an evaluation dataset.

Assumptions: OPEN_QUESTIONS.md #19a.

## V1.1 (2026-11-02): Claude, question drafts, student explanations

- **Provider:** `AI_PROVIDER=anthropic` runs every task on Claude through the official
  `@anthropic-ai/sdk` (`modules/ai/infrastructure/anthropic-provider.ts`).
  - Settings: `ANTHROPIC_API_KEY` (required with this provider), `AI_MODEL` (default
    `claude-opus-5-5`) and `AI_EFFORT` (`low|medium|high`, default `medium`).
  - The SDK's own retries are off; the gateway still owns attempts and timeouts.
  - A refusal or a `max_tokens` stop is a provider error, never output.
  - Prompts carry only the task's system prompt and escaped data; validation and grounding are
    unchanged.
- **Other vendors (2026-11-02):** an adapter for the OpenAI Chat Completions protocol
  (`modules/ai/infrastructure/openai-compatible-provider.ts`, plain `fetch`, no SDK) runs the same
  tasks on other vendors.
  - Presets: `grok` (xAI), `openai`, `deepseek`, `groq`, `openrouter` and `gemini` (Google's
    OpenAI-compatible endpoint).
  - `openai-compatible` works with any other server at `AI_BASE_URL`, such as a local Ollama.
  - Each needs `AI_API_KEY` and `AI_MODEL`. `AI_BASE_URL` overrides a preset's address.
  - An HTTP error, an empty answer or a `length` cut-off is a provider error, never output.
  - Prompts, validation and grounding are the same as with Claude.
- **Timeouts:** with a real provider each attempt gets 45 seconds by default (15 with `fake`). The
  web proxy waits up to 120 seconds on AI routes and 30 seconds on every other route.
- **`draft_question` (`question-v1`):** an author picks a skill, a difficulty and optional notes,
  and gets one SINGLE_CHOICE **draft**. Endpoint: `POST /admin/ai/question-drafts`, web page
  `/admin/questions/generate`.
  - The draft is saved with `sourceType=AI_DRAFT` and a PRIMARY mapping to the chosen skill.
  - It passes the same content checks as a hand-written draft, and then the normal review and
    publish flow. Nothing generated reaches students unreviewed.
  - Up to 15 existing stems in the exam are sent as "avoid" examples.
  - Grounding rejects duplicate option keys and duplicate option texts.
- **`explain_mistake` (`mistake-v1`):** explains a student's wrong answer.
  - It is grounded on the approved answer and explanation, and rejected if it names another
    answer (`ANSWER_MISMATCH`).
  - It returns a typed `errorType` (Error Classification below), an explanation and a tip. The
    error type is shown as a hint only; mastery never reads it.
  - Endpoint: `POST /exams/:examId/mistakes/:questionVersionId/ai-explanation`. It is only
    available for a question the student actually answered wrongly.
  - The answer is cached per mistake (the latest successful run since that answer), and each
    student is capped at 30 runs a day.
  - **For subscribers of the exam only** (#18, decided 2026-11-17), whenever a provider is
    configured. `AI_STUDENT_EXPLANATIONS=false` hides it. `GET /me/ai-features?examId=` tells the
    web app whether to show the button or the subscribe prompt.

## V1.2 (2026-11-17): DeepSeek, knowledge library (RAG), study chat, subscribers only

- **Provider:** DeepSeek is the production provider (OPEN_QUESTIONS.md #17). `AI_PROVIDER=deepseek`
  needs only `AI_API_KEY`; `AI_MODEL` defaults to `deepseek-flash` (since 2026-11-26; DeepSeek
  retired `deepseek-chat` on 2026-07-24). The DeepSeek and OpenAI presets send
  `response_format: json_object`, so a reply is always one JSON object. DeepSeek's models think
  before answering by default; the preset sends `thinking: {"type": "disabled"}`, because these tasks
  are short structured answers and thinking adds latency and output tokens that can cut the JSON off.
  `AI_MODEL=deepseek-v4-pro` is the stronger, about four times dearer option.
- **DeepSeek through OpenRouter (2026-11-26):** `AI_PROVIDER=openrouter`,
  `AI_MODEL=deepseek/deepseek-v4.1-flash-1017` (the same model as `deepseek-flash`) and the OpenRouter
  key in `AI_API_KEY`. The preset sends `response_format: json_object` and
  `reasoning: {"effort": "none"}`. OpenRouter refuses `effort: "none"` for a model that must reason
  (its `reasoning.mandatory` is true), so choose one where it is false.
- **Knowledge Library** (`ai_knowledge_items`, `ai_knowledge_chunks`, migration 0020): admins
  (`ai.manage`) add entries per exam, optionally per skill, at `/admin/ai/knowledge`.
  - `EXAMPLE`: model questions or a whole model exam. Generation imitates their style.
  - `REFERENCE`: summaries and explanations. The study chat answers from them.
  - Each entry is cut into passages of up to 1,200 characters, keeping blank-line paragraphs
    together. Adding and archiving are audited (`ai.knowledge.add`, `ai.knowledge.archive`).
    Archived entries are never retrieved.
- **Retrieval:** each passage has a database-generated `to_tsvector('arabic', …)` with a GIN index.
  A query is the message's plain words (letters and digits only) joined with `or` in
  `websearch_to_tsquery('arabic', …)`, ranked by `ts_rank`, with a boost for the requested skill.
  This is lexical RAG: DeepSeek has no embeddings API, and Arabic stemming covers the exam
  vocabulary well. A vector index can replace it behind `KnowledgeStore.search` later.
- **`draft_question` (`question-v2`):** up to 3 `EXAMPLE` passages go into `<style_examples>`. They
  come from the skill first, then the passages closest to the skill name and the author's notes.
  When nothing matches, the exam's newest passages are used. The model is told to match their
  format and never copy them. The response reports `styleExamples`, the count used.
- **`study_chat` (`chat-v1`):** see Study Chat below.
- **Subscribers only, with a free taste:** mistake explanations check `ExamAccess.hasExamAccess`
  first and answer `403 AI_REQUIRES_SUBSCRIPTION` without one.
  - The study chat gives a student without a subscription a few free replies, once per account and
    across exams. The default is 5, set by `ai.freeTrial` on the settings page; 0 turns the trial off.
  - Only successful runs count toward the trial.
  - After the trial, sending answers `403 AI_FREE_LIMIT_REACHED`. The conversation stays readable.

## Study Chat

`GET/POST/DELETE /exams/:examId/ai-chat`, web page `/exams/:examId/assistant`. For subscribers of
the exam only.

- **Fixed rules (code, `packages/ai-gateway/src/tasks/study-chat.ts`):**
  - The assistant helps only with preparing for this exam.
  - Anything else gets a short refusal with `kind: OFF_TOPIC`.
  - Cheating, leaked questions, role changes and requests for its instructions are refused with
    `kind: REFUSED`.
  - It never claims official questions or promises a score.
  - It teaches before giving final answers, and asks for no personal data.
  - Student text and library passages are escaped data inside tags.
  - A reply that echoes the hidden instructions is rejected (`RULES_LEAKED`).
- **Platform rules (setting `ai.studyChat.rules`, admin settings page):**
  - At most 20 rules of 300 characters each.
  - The model is told these can only narrow the fixed rules.
- **Grounding:** up to 4 library passages that match the message. When nothing matches, no
  passages are sent. The response lists the titles of the entries used (`sources`).
- **Conversation:**
  - The conversation is stored per student and exam (`ai_chat_messages`). The model sees the
    last 8 turns from the database, never history sent by a client.
  - A message is at most 1,000 characters.
  - Each student can send 40 messages a day, counted from `ai_runs`, so clearing the chat does not
    reset the count.
  - `AI_STUDY_CHAT=false` turns the chat off.

## Structured Output

Every AI output:
- validated by Zod.
- versioned schema.
- bounded retries.
- tracked provider/model/prompt version.
- never executed as code/SQL.

## Prompt/Run Metadata

Track:
- task type.
- prompt version.
- provider/model.
- schema version.
- latency.
- usage/cost where available.
- status/error.

Do not store secrets.

## Student Explanation

Preferred order:
1. approved explanation from content.
2. AI may personalize/rephrase using trusted approved context.
3. if grounding insufficient, fallback to approved explanation.

AI must not invent a different correct answer.

## Question Generation

```text
AI Draft
→ Validation
→ Content Manager Review
→ Approval
→ Publish
```

No unreviewed runtime-generated questions in Adaptive Training V1.

## Error Classification

AI may return typed enum such as:
- CONCEPTUAL_ERROR
- CALCULATION_ERROR
- MISREAD_QUESTION
- PREREQUISITE_GAP
- UNKNOWN

UNKNOWN is acceptable.
Mastery update must work without AI.

## Resilience

- timeouts.
- bounded retry/backoff.
- async queue for noncritical tasks.
- provider fallback only when semantic compatibility is tested.
- student core flow not blocked by optional AI.

## Privacy

Send minimum necessary context. Avoid unnecessary contact/profile history. Provider retention/data policy must be reviewed before production.

## Prompt Injection

Student/imported text is data. It cannot:
- override system rules.
- request secrets.
- trigger tools.
- publish content.
- alter permissions.

## Evaluation

Maintain eval datasets for:
- extraction accuracy.
- metadata classification.
- explanation faithfulness.
- duplicate suggestions.

Critical prompt/model changes require regression evaluation.
