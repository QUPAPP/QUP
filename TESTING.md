# Testing Strategy

## Test Layers

### Unit
- mastery evidence.
- confidence.
- state transitions.
- gap priority.
- target difficulty.
- candidate scoring.
- permission policies.
- parser normalization.

### Integration
- Drizzle repositories.
- transactions.
- unique constraints.
- outbox.
- Redis/BullMQ adapters.
- object storage.
- payment adapters.
- AI structured output adapters.

### API
- auth.
- authorization.
- validation.
- idempotency.
- stable errors.

### E2E
Critical flows:
- register → mini diagnostic.
- purchase → entitlement → continue diagnostic.
- answer → mastery update → next action.
- import → review → publish.
- reassessment → mastered.
- permission denial.

## Mastery Engine Cases

Test:
- correct easy/hard.
- wrong easy/hard.
- hint.
- timeout.
- skip.
- answer revealed.
- repeat factor.
- primary/secondary attribution.
- low evidence cannot master.
- reassessment gate/failure.

Property checks:
- mastery ∈ [0,1].
- confidence ∈ [0,1].
- positive Evidence cannot reduce alpha.
- duplicate attempt cannot create second mastery event.
- history remains readable after archive/version changes.

## Concurrency

Simulate:
- same answer submitted simultaneously twice.
- two attempts updating same skill.
- payment webhook replay.
- duplicate publish commands.
- import worker retry.

Expected: no duplicate evidence/entitlement and consistent final state.

## Security Tests

- Student A cannot read B session.
- Content Manager cannot edit billing.
- question payload does not leak answer.
- forged `isCorrect` ignored.
- malicious upload rejected.
- invalid payment signature rejected.

## Import Fixtures

Per supported format:
- valid.
- malformed.
- duplicate.
- missing correct answer.
- unknown taxonomy.
- RTL Arabic.
- embedded images where supported.
- max limit / over limit.

## CI Gates

Minimum:
- format check.
- lint.
- typecheck.
- unit.
- integration.
- build.
- selected E2E.
- migration validation.
- security/dependency scanning as configured.

## Bug Rule

Every bug fix gets a regression test unless impossible; document exceptions.
