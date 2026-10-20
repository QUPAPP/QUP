# B1 — Student skill profile (design)

Status: written 2026-10-21 under the user's standing instruction to proceed without per-step
approval. Roadmap slice B1 (after A1, A2, C1). PRD §6 "Skill Profile → Ranked Gaps".

## Goal

A student with access to an exam sees their skill profile: every skill of the exam's published
taxonomy with its mastery state, how much of it has been measured, and their gaps ranked by
severity. Students without access get the existing paywall (PRD §7: the full skill map is paid).

## Rules (engine, pure — `@qup/adaptive-engine`)

- **Gap** (ADAPTIVE_ENGINE.md §15): a node is a gap when it has evidence, its confidence is at least
  `states.minConfidence`, its mastery is below its threshold (node threshold or the config default),
  and it is not MASTERED. `severity = (threshold − mastery) / threshold`.
- **Ranking** (B1): gaps by severity, highest first; ties by display order. Exam weight, priority
  weight and prerequisites (§16) belong to adaptive selection (B3).
- **Skill with subskills** (§14 + assumptions recorded as OPEN_QUESTIONS.md #12c):
  - mastery = `parentMastery` of its subskills (weighted by subskill weight, assessed ones only);
  - confidence = weighted average of the assessed subskills' confidence;
  - coverage = weighted average of all its active subskills' coverage (unmeasured count as 0);
  - evidence count = sum over subskills;
  - state = `deriveState` of those numbers with the skill's own settings, except MASTERED only when
    every subskill is MASTERED, and UNASSESSED when none has evidence;
  - evidence recorded directly on the skill node is not mixed in (the subskills define it, §14).
- **Display:** mastery is reported only for assessed nodes (`null` otherwise) — the prior 0.5 is
  never shown as a level (§2).

## API

```text
GET /exams/:examId/skill-profile
```

Signed-in student, own data only. Exam must be available (`404 EXAM_NOT_AVAILABLE` otherwise, as
other student routes) with a published taxonomy. Without access to the exam:
`403 SKILL_PROFILE_REQUIRES_ACCESS`.

```json
{
  "exam": { "id": "…", "nameAr": "…" },
  "summary": { "skills": 8, "assessed": 5, "gaps": 2, "readyForReassessment": 1, "mastered": 0 },
  "domains": [{ "id": "…", "name": "…", "skills": [{
    "id": "…", "name": "…", "state": "GAP", "mastery": 0.42, "coverage": 0.5, "evidenceCount": 6,
    "gapSeverity": 0.5, "subskills": [{ "id": "…", "name": "…", "state": "…", "mastery": null,
    "coverage": 0, "evidenceCount": 0 }] }] }],
  "gaps": [{ "skillId": "…", "skillName": "…", "domainName": "…", "state": "GAP", "severity": 0.5 }]
}
```

Lives in the `mastery` module (a read model over `student_mastery_states`); reads the taxonomy
through a new catalog contract method `profileTaxonomy(examId)` (published version, active nodes,
names, weights, thresholds, minimum coverage, display order) and access through `EXAM_ACCESS`.
States of nodes outside the published version are ignored (taxonomy updates: #16d).

## Web

`/exams/[examId]/profile` in the student workspace: summary, ranked gaps, then domains with each
skill's state label, a measured bar (only when assessed), coverage in words and its subskills. No
access → the paywall state linking to `/subscriptions`. Linked from each exam card.

## Tests

Engine: table-driven gap and aggregation tests (+ a property: severity in (0, 1], ranking sorted).
API e2e: no access 403; access → profile after a diagnostic, subskill aggregation, ranked gaps,
another student's states never included, inactive exam 404. Web: client, state labels, page states.
Browser: paid student and unpaid student.
