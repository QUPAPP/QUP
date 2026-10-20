# B4 — Skill reassessment and MASTERED

Date: 2026-10-21. Branch: `ahmeddev`. Written under the standing instruction to continue the roadmap
without per-step approval. Rules the documents leave open are recorded in `OPEN_QUESTIONS.md` #12e.

## Why

`PRD.md` §13 says "MASTERED requires successful reassessment", and `ADAPTIVE_ENGINE.md` §12–§13 and
`WORKFLOWS.md` §5 define how it works:

- 5 fresh questions, no hints;
- a pass needs at least 4/5 plus the final conditions;
- a failure turns READY_FOR_REASSESSMENT into DEVELOPING;
- 5 new eligible attempts are needed before a retry.

Today a skill can reach READY_FOR_REASSESSMENT (B1) but nothing can make it MASTERED, so the loop
"Adaptive Training → Reassessment → Mastered or Continue → Next Gap" (PRD §6) never closes.

## What a student gets

1. On the skill profile, each READY_FOR_REASSESSMENT skill has a button, "أعد قياس المهارة".
2. The route `/exams/:examId/skills/:skillId/reassessment` starts or resumes a 5-question
   reassessment. Questions are planned up front from the skill and its subskills, unseen ones
   first.
3. The answers are graded like a diagnostic: right or wrong only, with no review. Each answer still
   adds evidence.
4. When the student finishes, `/assessments/:id/reassessment` shows the outcome:
   - **Passed:** "أتقنت المهارة". The skill is MASTERED and training no longer targets it.
   - **Not passed:** the score, and that 5 more answers on this skill unlock a retry. A link to
     training follows. Until then the profile shows the skill as DEVELOPING, with how many answers
     are left.

## Rules (`@qup/adaptive-engine` `reassessment.ts`, `REASSESSMENT_CONFIG_V1`, `reassessment-config-v1.0`)

| Rule | Value | Source |
| --- | --- | --- |
| Eligible | the skill's standing is READY_FOR_REASSESSMENT (mastery ≥ threshold, confidence ≥ 0.75, coverage satisfied, not held) | §12 |
| Size | 5 questions | §13 |
| Choice | primary mapping to the skill or one of its subskills, published, from the published version; unseen first, ranked by the engine's candidate score around a target difficulty of `clamp(mastery, 0.2, 0.9)`; if fewer than 5 are unseen, seen ones fill the rest; fewer than 5 in the bank → refused | §13 "fresh when possible"; difficulty assumed |
| Pass | `correct ≥ ceil(0.8 × 5) = 4` **and**, after the reassessment's evidence, the skill still meets readiness (threshold, confidence, coverage) | §13 "plus final conditions" |
| On pass | the skill's own state row (no subskills) or every subskill row is set to MASTERED. MASTERED never changes again through evidence (#12a) | §12 |
| On failure | held: the standing reports DEVELOPING instead of READY until 5 attempts with evidence (answered, not skipped) on the skill's nodes come after the reassessment | §13, WORKFLOWS §5 |
| Skips | count as not correct | assumed |

## Records

A new table, `skill_reassessments` (migration 0014), is owned by mastery. Each row holds:

- `student_id`, `exam_id`, `skill_id`;
- `session_id` (unique, so recording the outcome is idempotent);
- `passed`, `correct`, `total`, `required_correct`;
- `mastery_after`, `config_version`, `created_at`.

Sessions gain `target_skill_id`, which is set for `SKILL_REASSESSMENT`. The session runs its last
answer's transaction as usual. The outcome is recorded right after the session completes. Reading
the result records it if it is still missing, which recovers from a crash in between.

## API

```text
POST /exams/:examId/skills/:skillId/reassessment     201 new · 200 resumed
GET  /assessments/:sessionId/reassessment-result
```

Errors when starting:

- `403 REASSESSMENT_REQUIRES_ACCESS`;
- `404 EXAM_NOT_AVAILABLE`;
- `404 SKILL_NOT_FOUND` when the skill is not in the published taxonomy;
- `409 SKILL_NOT_READY_FOR_REASSESSMENT`, which comes with
  `details: { state, remainingAttempts | null }`;
- `422 REASSESSMENT_NOT_ENOUGH_QUESTIONS`.

The session is `type: "SKILL_REASSESSMENT"` and the existing session routes apply. Only one
reassessment can be open per exam.

The result is:

```text
{ skill: { id, name }, passed, correct, total, requiredCorrect, remainingAttempts | null }
```

It returns `422 ASSESSMENT_NOT_COMPLETED` before the session ends. `remainingAttempts` is how many
answers are needed before a retry, and is null once passed.

The skill profile's skills gain `reassessment: { remainingAttempts } | null`, which is non-null
while a failed reassessment holds the skill.

## Architecture

- Engine `reassessment.ts`:
  - `requiredCorrect(total, config)`;
  - `reassessmentPassed({ correct, total, readyAfter }, config)`;
  - `holdRemaining({ failed, attemptsSince }, config)`.
- Mastery:
  - `standing()` applies the hold (READY → DEVELOPING, with `reassessment.remainingAttempts`), from
    the latest outcome per skill and the evidence events since;
  - a new `REASSESSMENT_RECORDER` contract (`record(input)`, `outcomeOf(sessionId)`) marks MASTERED
    and writes the outcome in one transaction.
- Adaptive: `planReassessment({ studentId, examId, skillId, askedQuestionIds, size })` returns the
  chosen version ids, ranked by the engine.
- Assessments:
  - `startReassessment`;
  - completion hook in `submit`;
  - `reassessmentResult`;
  - items are planned with `selected_by = FIXED`.
- Web:
  - the profile button and hold note;
  - `/exams/:examId/skills/:skillId/reassessment`;
  - the runner, for which the completion target is the result page;
  - `/assessments/:id/reassessment`;
  - history.

## Out of scope

The full re-diagnostic (PRD §8: 7-day cooldown, 30 attempts) and `FULL_REASSESSMENT` come in a
later slice. So does a reassessment of single subskills.

## Testing

- Engine: required correct, pass and fail tables, hold countdown.
- API e2e:
  - guards: 401, 403, 404, 409 (with details), 422;
  - start, then resume;
  - 5 items from the skill, unseen first;
  - 5/5 correct → passed, MASTERED rows, training no longer targets the skill;
  - 3/5 → failed, the standing shows DEVELOPING with `remainingAttempts` 5;
  - after 5 answered attempts on the skill (training), READY again;
  - the result is recorded once, even when read twice;
  - another student cannot read the result.
- Web unit:
  - client paths;
  - completion target;
  - result wording helpers.
- Browser:
  - the local student passes a reassessment;
  - the profile shows MASTERED.
