# Full re-diagnostic (PRD §8)

Date: 2026-10-21. Branch: `ahmeddev`. Executed on the user's request ("كمّل بشريحة إعادة التشخيص
الشامل"). Assumed rules are recorded in `OPEN_QUESTIONS.md` #12g.

## Why

- **The journey:** PRD §6 ends with "Full Re-Diagnostic when eligible".
- **The gate:** PRD §8 and WORKFLOWS.md §6 set a configurable one, "7-day cooldown, 30 new eligible
  training attempts minimum. Not hard-coded".
- **The session type** `FULL_REASSESSMENT` exists in the schema, but nothing creates it.
- **Today:** a student who finished the full diagnostic can never measure the whole exam again
  (OPEN_QUESTIONS.md #9a: "one full diagnostic per exam until Re-Diagnostic").

## Rules (assumed, #12g)

- **The gate** is a versioned admin setting, `assessment.fullReassessment.gate` =
  `{ cooldownDays: 7, minTrainingAttempts: 30 }` (bounds 0–365 and 0–1000). Both conditions must
  hold.
- **A full measurement** is a completed `FULL_DIAGNOSTIC` or `FULL_REASSESSMENT`. The cooldown runs
  from the latest one's completion time.
- **Training attempts** are answered (not skipped) attempts in `ADAPTIVE_TRAINING` sessions of the
  same exam, recorded after that time.
- **Prerequisites:**
  - paid access (an open session can still be finished, as with the full diagnostic);
  - an active exam;
  - a completed full diagnostic.
- **The form:**
  - Recipe: the exam's FULL_DIAGNOSTIC recipe, meaning its active blueprint's size and domain
    weights (default 40 questions), at target difficulty 0.5. Results stay comparable with the
    first diagnosis.
  - It is a new measurement, so it does not count earlier answers towards its size.
  - Questions the student has not seen come first. When a skill lacks enough of them, questions seen
    before fill its share, so coverage is kept. The Mastery Engine already weighs repeated
    questions less (ADAPTIVE_ENGINE.md §9).
- **Answers** add evidence like any session: right/wrong only, no review. MASTERED is never undone
  (OPEN_QUESTIONS.md #12e).
- **Result:**
  - Correct answers out of all items, overall and per skill, compared with the previous full
    measurement. A subskill's question counts toward its skill.
  - When the previous measurement was the full diagnostic, its baseline also includes the mini
    diagnostic's answers, because the full diagnostic continued it.
  - Skips count as not correct.
  - The skill profile stays the authority on mastery.
- **The dashboard's next step** offers the re-diagnostic when eligible: after a ready skill
  reassessment, before training. It also replaces "all mastered".

## API

```text
GET  /exams/:examId/full-reassessment                  status
POST /exams/:examId/assessments/full-reassessment      201 new · 200 resumed
GET  /assessments/:sessionId/full-reassessment-result
```

- **Status:** `{ state, openSessionId, lastMeasuredAt, availableAt, trainingAttempts: { done,
  required }, cooldownDays }`.
  - `state` is one of `OPEN`, `REQUIRES_ACCESS`, `FULL_DIAGNOSTIC_REQUIRED`, `WAITING`, `ELIGIBLE`,
    checked in that order. `WAITING` means the cooldown or the attempts are not met.
  - `availableAt` is the cooldown's end, or null without a full measurement.
- **Start:**
  - `403 FULL_REASSESSMENT_REQUIRES_ACCESS`;
  - `409 FULL_REASSESSMENT_NOT_ELIGIBLE`, `details: { reason: "FULL_DIAGNOSTIC_REQUIRED" | "WAITING",
    availableAt, attemptsRemaining }`;
  - `404 EXAM_NOT_AVAILABLE`, `422 NO_QUESTIONS_AVAILABLE`.

  The usual session routes run it.
- **Result** (`404` for another type or another student; `422 ASSESSMENT_NOT_COMPLETED` before the
  end):

  ```json
  { "score": { "correct": 31, "total": 40 },
    "previous": { "type": "FULL_DIAGNOSTIC", "completedAt": "…", "correct": 24, "total": 40 },
    "skills": [{ "skillId": "…", "name": "…", "correct": 8, "total": 10,
                 "previousCorrect": 5, "previousTotal": 10 }] }
  ```

  A skill measured only now has `previousCorrect`/`previousTotal` null.
- **Dashboard:** `nextStep` gains `{ type: "START_FULL_REASSESSMENT" }`.

## Code

- **Domain:**
  - `assessments/domain/full-reassessment.ts`: `fullReassessmentStatus(input)` and
    `compareMeasurements(current, previous)`, both pure.
  - `planDiagnostic` candidates may carry `seen: true`, ranked after unseen ones.
- **Application:**
  - `application/diagnostic-sessions.service.ts` holds the planning moved out of
    `AssessmentsService` (open or plan a diagnostic of a kind). Mini and full use it unchanged.
  - `application/full-reassessment.service.ts` has `status`, `start` and `result`.
  - Store: `answeredAttemptsSince(studentId, examId, type, since)`.
- **Settings:** a new definition with its Zod schema.
- **Web:**
  - the start page `/exams/[examId]/full-reassessment`, which explains a WAITING state;
  - the result page `/assessments/[sessionId]/full-reassessment`;
  - the runner titles and completion link;
  - the next-step link;
  - a status card on the skill profile;
  - an admin settings form for the gate.

## Out of scope

- A separate FULL_REASSESSMENT blueprint type in the admin.
- Adaptive (per-skill) difficulty in the re-diagnostic.
- Comparing mastery snapshots instead of accuracy.

## Testing

- **Unit:**
  - the status decision table (each state, boundaries at exactly the cooldown and exactly the
    attempts);
  - the comparison (skills present in one side only, the subskill-to-skill roll-up done by the
    caller);
  - the planner (unseen first, seen fill);
  - the next-step order;
  - the setting's schema.
- **API e2e:**
  - access and prerequisite states;
  - WAITING with `availableAt` and attempts;
  - the admin gate change, then eligible after training answers and a backdated completion;
  - start, then resume;
  - unseen questions all used before seen ones;
  - completing returns to WAITING;
  - the result numbers against the answers given, with the baseline including the mini diagnostic;
  - result errors;
  - the dashboard next step;
  - evidence recorded.
- **Web unit:** client paths, status texts, the completion link and label, the next-step link, the
  gate form conversion.
- **Browser:** a student sees the WAITING explanation; an admin lowers the gate; the student takes
  the re-diagnostic and reads the comparison. Also checked at 375 px.
