# B5 — Student dashboard

Date: 2026-10-21. Branch: `ahmeddev`. Written under the standing instruction to continue the roadmap
without per-step approval. Assumed rules are logged in `OPEN_QUESTIONS.md` #12f.

## Why

`UI_BRAND.md` "Student Dashboard Principle" requires the dashboard to answer:

- أين أنا الآن؟ (where am I now?)
- ما نقاط قوتي؟ (what are my strengths?)
- أين الفواقد؟ (where are my gaps?)
- ماذا أفعل الآن؟ (what should I do now?)

The primary CTA is the next recommended learning action. `IMPLEMENTATION_PLAN.md` Phase 9 adds
current level, strengths and gaps, next recommendation, and improvement history.

Today `/dashboard` lists sessions only, so the student has to work out the next step alone.

## What a student gets

At the top of `/dashboard`, before the session history, there is one card per exam the student has
started or paid for. Each card shows:

- **Next step:** one primary button chosen by the server (see the rules below).
- **Where I am** (paid exams): skills assessed of all, gaps, ready for reassessment, mastered.
- **Strengths** (paid): up to 2 skills, mastered ones first, then by mastery.
- **Gaps** (paid): up to 3 skills, by severity (the profile's order).
- **This week** (paid): up to 3 skills or subskills whose mastery rose most in the last 7 days.
  Each shows its gain in percentage points; it is hidden when there are none.
- A link to the full skill profile (paid).

An unpaid exam shows only the next step: start or resume the mini diagnostic, or subscribe. The
skill map stays paid (PRD §7).

A student with no activity at all sees an empty state that links to `/exams`.

## Next-step rules (`assessments/domain/next-step.ts`, pure, first match wins)

1. An open session (created or in progress) of any type → `RESUME_SESSION { sessionId, sessionType }`.
2. No access:
   - no completed mini diagnostic → `START_MINI_DIAGNOSTIC`;
   - otherwise `SUBSCRIBE`.
3. No completed full diagnostic → `START_FULL_DIAGNOSTIC`.
4. A READY_FOR_REASSESSMENT skill (the first in display order) → `REASSESS { skillId, skillName }`.
5. A trainable skill (a gap, or UNASSESSED / UNCERTAIN / DEVELOPING) → `TRAIN { skillName | null }`,
   naming the top gap when there is one.
6. Otherwise → `ALL_MASTERED`.

## API

```text
GET /me/dashboard
```

```json
{
  "exams": [{
    "exam": { "id": "…", "nameAr": "القدرات العامة" },
    "hasAccess": true,
    "nextStep": { "type": "REASSESS", "skillId": "…", "skillName": "…" },
    "standing": {
      "summary": { "skills": 6, "assessed": 4, "gaps": 2, "readyForReassessment": 1, "mastered": 1 },
      "strengths": [{ "skillName": "…", "state": "MASTERED", "mastery": 0.91 }],
      "gaps": [{ "skillName": "…", "severity": 0.35 }],
      "improvements": [{ "nodeName": "…", "before": 0.42, "after": 0.58 }]
    }
  }]
}
```

- `standing` is `null` without access.
- The exams listed are the ACTIVE exams the student has a session in or access to, by code.
- The student is identified by the session cookie only, so there is no IDOR surface.

## Architecture

- Catalog: `activeExams()` (id, code, nameAr) on the contract.
- Mastery: `recentChanges(studentId, nodeIds, since)` on the standing reader. It returns, per node,
  the first `before_mastery` and last `after_mastery` of its evidence since the given date. Names
  come from the standing.
- Assessments:
  - `nextStep()` (pure);
  - the store gains `openSessions(studentId)` and `completedTypes(studentId)`;
  - a `StudentDashboardService`;
  - a `MeController` serving `GET /me/dashboard`;
  - config `DASHBOARD_DEFAULTS`: improvementWindowDays 7, strengths 2, gaps 3, improvements 3.
- Web:
  - `lib/next-step.ts` maps each step to its label and link;
  - `components/exam-progress-card.tsx`;
  - `/dashboard` puts the cards first.

## Testing

- Unit:
  - `nextStep` covers every branch and the precedence between them;
  - web `nextStepLink` covers every type.
- E2E:
  - 401 when signed out;
  - no activity → `[]`;
  - unpaid after the mini diagnostic → `SUBSCRIBE` with a null standing;
  - an open training session → resume;
  - paid, full diagnostic completed, a READY skill → `REASSESS`;
  - gaps and strengths are ordered;
  - training answers produce an improvement;
  - another student's data never appears.
- Browser: the local student's dashboard shows the cards and the primary step works.
