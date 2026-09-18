# Coding Standards

## TypeScript

- `strict: true`.
- avoid `any`; prefer `unknown` + validation.
- exhaustive domain switches where practical.
- no unchecked assertions at external boundaries.
- meaningful branded/value types where useful.

## SOLID Applied

### SRP
Controller لا يحسب Mastery ولا يرسل Email ولا ينفذ Payment logic.

### OCP
AI/Payment/File parsers behind adapters so new implementation does not rewrite business modules.

### LSP
Adapters must respect semantic contract, not merely TypeScript shape.

### ISP
Prefer small role-specific interfaces over giant services.

### DIP
Domain/application depend on ports, not SDKs/frameworks.

## Clean Code

Prefer:
- intention-revealing names.
- guard clauses.
- pure calculations.
- cohesive modules.
- explicit state transitions.

Avoid:
- `utils.ts` dumping grounds.
- hidden global state.
- boolean parameter soup.
- magic numbers/strings.
- framework types leaking into domain.
- clever abstractions with unclear value.

## Function Design

Bad:
```ts
submitAnswer() {
  parseCookie();
  queryDb();
  calculateMastery();
  sendEmail();
}
```

Preferred orchestration:
```ts
submitAnswerCommand.execute(input)
```
with explicit collaborators and pure domain calculations.

## Errors

Typed/domain errors such as:
- `NotAuthorized`
- `AssessmentNotActive`
- `ItemAlreadyAnswered`
- `EntitlementRequired`
- `InvalidTaxonomyMapping`
- `ReassessmentNotEligible`

Presentation maps them to stable API error codes.

## Validation

- Zod at external boundaries.
- DB constraints for integrity.
- normalize identifiers intentionally.
- no silent coercion of sensitive fields.

## Configuration

Never:
```ts
if (exam === "قدرات") { ... }
const MASTERY = 0.85;
```

Use typed/versioned config with validated defaults.

## Comments

Comments explain **why**.

Good:
```ts
// Keep published versions immutable so historical attempts remain interpretable.
```

## Naming

Use English code identifiers consistently:
- `assessmentSession`
- `questionVersion`
- `masteryState`
- `adaptiveDecision`

Arabic belongs to content/UI.

## DTO vs Domain vs DB

Do not treat them as identical by default. Map at boundaries when semantics differ.

## Date/Time

- persist UTC.
- present in user timezone.
- do not rely on server local clock for business rules.

## Money

- integer minor units.
- explicit currency.
- no float money math.

## Feature Flags

Use for controlled rollout, not to hide unfinished architecture.

## Review Principle

A straightforward, testable solution is preferred over a clever design that only its author can maintain.
