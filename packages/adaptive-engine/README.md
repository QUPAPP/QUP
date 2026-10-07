# @qup/adaptive-engine

The Mastery Engine V1 from [ADAPTIVE_ENGINE.md](../../ADAPTIVE_ENGINE.md): deterministic,
Beta-style weighted evidence. Pure functions only — no database, clock, randomness, HTTP or LLM
(§21, §23). The API persists what it returns.

```ts
const { next, event } = applyEvidence({ prior, settings, attempt, mapping, config: MASTERY_CONFIG_V1 });
// persist `next` (with a row-version check) and `event` (unique per attempt + node) in one transaction
```

- **All numbers live in `src/config.ts`**, versioned (`mastery-config-v1.0`). Changing any value
  means a new config version; every event records `algorithmVersion` and `configVersion`.
- `event` is `null` when an attempt carries no evidence: a skip, or a correct answer after the
  answer was revealed (§8, §10).
- The engine never assigns `MASTERED` — that takes a successful reassessment — and never changes
  it (OPEN_QUESTIONS.md #12a). Coverage per node follows OPEN_QUESTIONS.md #12b.

## Tests

`pnpm --filter @qup/adaptive-engine test` — table-driven cases with values worked out by hand from
the spec (TESTING.md "Mastery Engine Cases"), plus fast-check property tests over random attempt
sequences: mastery and confidence stay in [0, 1], evidence never decreases, a correct answer never
lowers mastery, results are deterministic.
