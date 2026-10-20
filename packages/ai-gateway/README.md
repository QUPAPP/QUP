# @qup/ai-gateway

The AI gateway from [AI_INTEGRATION.md](../../AI_INTEGRATION.md). Vendor-free and framework-free:
tasks, prompts, schemas, retries and timeouts live here. Providers plug in behind `AiProvider`.

```ts
const result = await runAiTask(provider, suggestQuestionMetadata, { question, nodes }, {
  timeoutMs: 15_000,
  maxAttempts: 2,
});
// result.ok → result.output (validated); always → result.run (status, versions, attempts, latency, tokens)
```

- **Tasks** are versioned. Each has `promptVersion`, `schemaVersion`, a Zod schema and a `verify`
  grounding check. Changing a prompt or schema means a new version.
  - `suggest_question_metadata` (`metadata-v1`): a skill from the list given, plus EASY/MEDIUM/HARD.
  - `draft_explanation` (`explanation-v1`): the model must restate the saved answer key, so a
    draft that argues for another answer is rejected.
- **Untrusted content** goes in XML-escaped tags, and the system prompt says never to follow
  instructions found there.
- **Retries:** output that is not JSON, breaks the schema or fails `verify` is retried up to
  `maxAttempts`. Timeouts and provider errors are not retried.
- **`FakeAiProvider`** is the only provider in V1 (OPEN_QUESTIONS.md #17, #19a). It is
  deterministic, computed from the task input, and can be told to fail for tests.

## Tests

`pnpm --filter @qup/ai-gateway test` covers prompt escaping, JSON parsing, every run status and
retry path, the grounding checks, and the fake provider's determinism.
