# B3 — Adaptive training and auditable decisions

Date: 2026-10-21. Branch: `ahmeddev`. Written under the standing instruction to continue the roadmap
without per-step approval. Every rule `ADAPTIVE_ENGINE.md` leaves open is recorded in
`OPEN_QUESTIONS.md` #12d and is never buried in code.

## Why

PRD §6 places "Ranked Gaps → Adaptive Training" after the skill profile. The engine already
measures (evidence, mastery, gaps from B1), but no part of the product yet chooses what a student
should practise next. `ADAPTIVE_ENGINE.md` §15–§20 and `WORKFLOWS.md` §4 define that loop:

```text
Current mastery → highest-priority gap → target node → target difficulty
→ candidate filter → candidate score → choose question → answer → evidence → re-evaluate
```

`AGENTS.md` §6 adds that every adaptive decision is explainable and auditable.

## What a student gets

1. A paid student taps "ابدأ التدريب" on the skill profile. The route `/exams/:examId/training`
   starts or resumes a training session of 10 questions.
2. Each question is chosen when it is needed, never planned ahead:
   - the target is the skill that most needs work;
   - the difficulty is near the student's current level;
   - the question has not been seen before.
3. The screen names the skill being trained ("تدريب على: …").
4. After answering or skipping, the student sees whether the answer was right, the correct option
   and the explanation. That is the remediation step of §20; diagnostics still show neither.
5. The student can stop at any time with "إنهاء التدريب". The session also ends after 10 questions,
   or earlier when nothing is left to ask. Either way the student lands on the skill profile,
   which every answer has already updated.

## Selection rules (pure, `@qup/adaptive-engine` `selection.ts`, `SELECTION_CONFIG_V1`)

| Step | Rule | Source |
| --- | --- | --- |
| Gap priority | `severity × examWeightFactor × priorityWeight × prerequisiteBoost` | §16 |
| examWeightFactor | the skill's share of the exam, `(domainWeight / Σ domains) × (skillWeight / Σ skills in its domain)`, times the number of skills, so the average is 1 | §16 "normalize"; assumed |
| priorityWeight | the taxonomy's `skills.priority_weight` (default 1) | §16 |
| prerequisiteBoost | `min(1 + 0.2 × n, 1.6)`, where n = gap skills that list this skill as a prerequisite | assumed |
| Target choice | (1) stay on the session's current target while it is still trainable; (2) else the gap with the highest priority; (3) else the skill most in need of measurement (UNASSESSED or UNCERTAIN), by examWeightFactor; skills with no question left are skipped; none → nothing to train | §15, WORKFLOWS §4; assumed |
| Trainable | a gap, or UNASSESSED/UNCERTAIN — never READY_FOR_REASSESSMENT or MASTERED (B4) | §12–§13 |
| Repeated wrong | after 3 wrong answers in a row on the current target, if one of its prerequisites is trainable and has questions, switch to it (`PREREQUISITE_CHECK`) | §20 |
| Target difficulty | `clamp(mastery + adj, 0.20, 0.90)`. adj is +0.05 after 2 correct and −0.10 after 2 wrong (the target's last two answers in this session), else 0. An unmeasured skill uses mastery 0.5 | §17 |
| Candidate filter | published version of the exam's published taxonomy, primary mapping to the target skill or one of its subskills, not given to this student before in this exam; within ±0.15 of the target difficulty, widened to all remaining candidates of the target when none fits (`DIFFICULTY_BAND_WIDENED`) | §18 |
| Candidate score | 0.40 difficulty fit (`1 − |d − target| / 0.7`), 0.25 learning need (severity of the node the question measures, 1 when unmeasured), 0.15 novelty (1: never seen), 0.10 content quality (1: published and reviewed), 0.10 coverage need (`1 − coverage` of the node) | §19 |
| Choice | weighted random among the top 3 scores; the random source is injected, so tests seed it | §19 |

Engine version `adaptive-v1.0`, config version `selection-config-v1.0`. Both are stored on every
decision.

## Audit

Each chosen question writes one `adaptive_decisions` row in the same transaction as its
`assessment_items` row (`selected_by = ADAPTIVE`, `adaptive_decision_id`). The row holds:

- the target node;
- mastery and confidence snapshots;
- the target difficulty;
- the scored top candidates (at most 10);
- the selected version;
- reason codes, from `TOP_GAP | CONTINUE_TARGET | NEEDS_MEASUREMENT | PREREQUISITE_CHECK |
  RECENT_CORRECT_UP | RECENT_WRONG_DOWN | DIFFICULTY_BAND_WIDENED`;
- the engine and config versions.

An admin viewer for decisions belongs to C2 (audit views).

## API

```text
POST /exams/:examId/assessments/training     201 new · 200 resumed
```

- `403 TRAINING_REQUIRES_ACCESS` without access.
- `422 NOTHING_TO_TRAIN` when no skill is trainable with questions left.
- `404 EXAM_NOT_AVAILABLE` when the exam is not available.

A training session is an assessment session of type `ADAPTIVE_TRAINING` with
`planned_item_count = 10` (migration 0013). Existing session routes serve it:

- `current-item` returns the pending item, or chooses the next one. Its `item.target` is
  `{ skillName }`.
- `answer` and `skip` work as in a diagnostic and add
  `review: { correctOptionKeys, explanation | null }`, for training sessions only.
- The session completes when 10 items are finalized, or when `current-item` finds nothing left.
- `complete` ends it early; a presented but unanswered item stays without an attempt and gives no
  evidence.
- Progress reports `total = planned_item_count` for training.

Many training sessions per exam are allowed over time, but only one can be open at once (the
existing unique index).

## Architecture

- `packages/adaptive-engine/src/selection.ts`: pure rules and config, table-driven and
  property tests.
- New module `apps/api/src/modules/adaptive`:
  - `AdaptiveSelector` loads the student's skill standing (mastery contract), the training
    taxonomy (catalog contract) and the candidates (question contract), then calls the engine;
  - `adaptive.contract.ts` exports `ADAPTIVE_SELECTOR` (`decide(input)`) and
    `recordDecision(tx, decision)`.
  - It depends on catalog, questions and mastery, never on assessments.
- Mastery:
  - `SkillProfileService` splits into `standing(studentId, examId)` (no access check), and
    `profile` uses it;
  - `standing` is exported as `SKILL_STANDING_READER` (`mastery.contract.ts`).
- Catalog: `ProfileTaxonomy` gains the domain `weight`, the skill `priorityWeight` and
  `prerequisiteSkillIds`.
- Questions: `DeliverableQuestion.explanation` (already stored as `explanation_content`).
- Assessments:
  - `startTraining`;
  - training branches in `currentItem`, `submit` (review) and `complete`;
  - the store gains `appendAdaptiveItem(sessionId, decision)` (session row lock, re-check, decision
    and item inserted together) and `planned_item_count`.
- Web:
  - `/exams/:examId/training`;
  - the session page and runner handle training: target line, review panel, "إنهاء التدريب";
  - profile and history links.

## Testing

- Engine:
  - priority product and normalisation;
  - boost cap;
  - target choice in every branch (stay, top gap, needs-measurement fallback, prerequisite
    switch, none);
  - difficulty adjustments and clamps;
  - band filter with the widening fallback;
  - score weights;
  - seeded top-3 choice;
  - properties: the target difficulty stays in [0.2, 0.9], and the chosen candidate is always
    one of the top 3.
- API e2e:
  - 401/403/404/422;
  - start, then resume;
  - `current-item` chooses a gap-skill question and writes one decision linked to the item;
  - concurrent `current-item` calls make one item;
  - the answer returns the review only in training;
  - after 3 wrong answers on a skill with a trainable prerequisite, the target switches;
  - completion at 10, and early completion;
  - no question repeats;
  - decisions carry their versions and reason codes;
  - another student cannot read the session.
- Web unit: client paths, review rendering helpers, completion target.
- Browser: a paid student trains, sees the review, ends the session and the profile updates.
