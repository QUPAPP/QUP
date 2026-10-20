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
- **Not yet:**
  - error classification;
  - question generation;
  - import structuring;
  - an evaluation dataset.

Assumptions: OPEN_QUESTIONS.md #19a.

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
