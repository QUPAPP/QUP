# QUP Adaptive & Mastery Engine V1

## 1. Purpose

V1 هو محرك deterministic وقابل للتدقيق إلى أن تتوفر بيانات Production كافية لمعايرة BKT/IRT.

هذا النموذج **Beta-style weighted evidence** وليس ادعاءً بأن `mastery_score` Probability إحصائية calibrated.

Version: `mastery-v1.0`

## 2. State

Per student + measurable learning node:

```text
alpha
beta
mastery_score
confidence_score
evidence_count
distinct_question_count
coverage_score
state
algorithm_version
config_version
```

Initial prior:
```text
alpha = 2
beta  = 2
mastery_score = 0.50
```

لا تعرض 50% للطالب كمستوى حقيقي قبل وجود Evidence.

## 3. Core Formula

```text
mastery_score = alpha / (alpha + beta)
```

Effective evidence:
```text
E = (alpha + beta) - 4
```

Confidence heuristic:
```text
confidence_score = 1 - exp(-E / 8)
```

الثابت 8 ضمن Config Version وليس magic number في الكود.

## 4. Difficulty

Normalized `0..1`.

Authoring defaults:
```text
EASY      0.25
MEDIUM    0.50
HARD      0.75
ADVANCED  0.90
```

لاحقًا احتفظ بـauthor difficulty وmeasured/calibrated difficulty منفصلين.

## 5. Correct Answer Evidence

```text
basePositive = 0.75 + (0.75 * difficulty)
```

```text
positiveEvidence =
basePositive
* attributionWeight
* repeatFactor
* hintFactor
```

ثم:
`alpha += positiveEvidence`

## 6. Incorrect Answer Evidence

```text
baseNegative = 1.50 - (0.75 * difficulty)
```

```text
negativeEvidence =
baseNegative
* attributionWeight
* repeatFactor
* timeoutFactor
```

ثم:
`beta += negativeEvidence`

Interpretation:
- Correct on hard = stronger positive Evidence.
- Wrong on easy = stronger negative Evidence.

## 7. Attribution

Default:
- PRIMARY = 1.00
- SECONDARY = 0.35

Question قد تقيس أكثر من node لكن لا تطبق Full Evidence على الجميع.

## 8. Hints

- no hint → positive × 1.00
- hint used → positive × 0.60
- answer revealed → positive × 0

## 9. Repeat Factor

Baseline configurable:
- fresh = 1.00
- repeated within 7 days = 0.35
- repeated 8–30 days = 0.70
- old enough = 1.00

## 10. Timeout / Skip

- Timeout → negative × 0.50 default.
- Skip → Evidence 0 in V1.

Both remain analytics events.

## 11. Response Time

سجل `response_time_ms` لكن لا تدخله في V1 scoring.

## 12. Mastery States

### UNASSESSED
No meaningful Evidence.

### UNCERTAIN
`confidence < 0.55`

### GAP
`confidence >= 0.55` and `mastery < 0.70`

### DEVELOPING
mastery >= 0.70 but not ready, or reassessment failed.

### READY_FOR_REASSESSMENT
- mastery >= node threshold (default 0.85)
- confidence >= 0.75
- coverage satisfied

### MASTERED
successful reassessment + threshold + coverage.

كل القيم configurable/versioned.

## 13. Reassessment

Default:
- 5 questions.
- fresh when possible.
- no hints.
- required coverage.
- pass at least 4/5 plus final conditions.

Failure:
```text
READY_FOR_REASSESSMENT
→ DEVELOPING
```

Default require 5 new eligible attempts before retry.

## 14. Parent Mastery

إذا توجد SubSkills:

```text
SkillMastery = weightedAverage(SubSkillMastery)
```

لكن Coverage منفصلة. مثال:
```text
mastery = 0.90
coverage = 0.25
```
لا يعني MASTERED.

## 15. Gap Detection

Eligible Gap:
```text
confidence >= minimumGapConfidence
AND
mastery < masteryThreshold
```

Severity:
```text
severity = (masteryThreshold - mastery) / masteryThreshold
```

## 16. Gap Priority

```text
priority =
severity
* examWeightFactor
* skillPriorityWeight
* prerequisiteBoost
```

Normalize config and use safe defaults.

## 17. Target Difficulty

```text
targetDifficulty = clamp(mastery + recentPerformanceAdjustment, 0.20, 0.90)
```

Baseline:
- last 2 correct → +0.05
- last 2 incorrect → -0.10
- otherwise 0

## 18. Candidate Filter

Candidate must:
- be PUBLISHED.
- match exam/taxonomy.
- measure target node.
- fit difficulty band.
- not archived/invalid.
- pass repeat/exposure policy.
- satisfy blueprint/session rules.

## 19. Candidate Score

Baseline weights:
```text
40% Difficulty Fit
25% Learning Need
15% Novelty
10% Content Quality
10% Coverage Need
```

اختر من Top-N عبر weighted randomness لتقليل حفظ المسار. Randomness يجب أن يكون seedable في tests.

## 20. Wrong Answer Strategy

لا تجعل كل خطأ = سؤال أسهل.

```text
1 wrong
→ nearby level question

2 wrong same node
→ modest difficulty reduction

repeated wrong
→ prerequisite check
→ remediation/explanation
→ continue
```

## 21. LLM Boundary

LLM **لا** يحدد Mastery.
يمكنه:
- classify misconception.
- explanation.
- hint.
- content/tag suggestion.

Engine يجب أن يعمل حتى لو AI unavailable.

## 22. Idempotency & Concurrency

Critical invariant:
`same attempt + learning node = one mastery event only`.

Conceptual transaction:
```ts
transaction(() => {
  finalizeAttemptOnce();
  const state = loadMasteryForUpdate();
  const result = applyEvidencePure(state, attempt, config);
  updateStateWithVersionCheck(result.next);
  insertMasteryEventUnique(result.event);
});
```

## 23. Pure Function Contract

```ts
type ApplyEvidenceInput = {
  prior: MasteryState;
  attempt: EligibleAttempt;
  mapping: LearningNodeMapping;
  config: MasteryConfig;
};

applyEvidence(input): {
  next: MasteryState;
  event: MasteryEventDraft;
};
```

No DB/HTTP/LLM inside calculation.

## 23a. V1 Implementation

- Mastery: `@qup/adaptive-engine` — `ALGORITHM_VERSION = "mastery-v1.0"`, `MASTERY_CONFIG_V1`
  (`mastery-config-v1.0`).
- Selection (§15–§20): `selection.ts` — `ADAPTIVE_ENGINE_VERSION = "adaptive-v1.0"`,
  `SELECTION_CONFIG_V1` (`selection-config-v1.0`). Defaults the spec leaves open: OPEN_QUESTIONS.md
  #12d. Every training question is stored as an `adaptive_decisions` row with both versions.

## 24. Future Algorithms

Future candidates:
- calibrated item difficulty.
- Rasch/IRT.
- BKT.
- Expected Information Gain.
- forgetting/retention models.

أي upgrade يحتاج:
- new algorithm version.
- offline replay/evaluation.
- migration strategy.
- controlled rollout.
