import { firstRow, type Tx } from "./db.js";

/**
 * Minimal synthetic graph: one student answering one draft question inside one
 * diagnostic session. Placeholder values only — never real personal data.
 */
export interface QuestionGraph {
  studentId: string;
  examId: string;
  taxonomyVersionId: string;
  skillId: string;
  subskillId: string;
  questionId: string;
  questionVersionId: string;
  sessionId: string;
  itemId: string;
}

type IdRow = { id: string };

export async function buildQuestionGraph(tx: Tx): Promise<QuestionGraph> {
  const student = firstRow(
    await tx<IdRow[]>`INSERT INTO users (display_name) VALUES ('test-student') RETURNING id`,
  );
  const exam = firstRow(
    await tx<IdRow[]>`
      INSERT INTO exams (code, slug, name_ar) VALUES ('TEST', 'test', 'اختبار') RETURNING id`,
  );
  const taxonomyVersion = firstRow(
    await tx<IdRow[]>`
      INSERT INTO taxonomy_versions (exam_id, version_code) VALUES (${exam.id}, 'v1') RETURNING id`,
  );
  const domain = firstRow(
    await tx<IdRow[]>`
      INSERT INTO domains (taxonomy_version_id, code, name)
      VALUES (${taxonomyVersion.id}, 'D1', 'domain') RETURNING id`,
  );
  const skill = firstRow(
    await tx<IdRow[]>`
      INSERT INTO skills (domain_id, code, name) VALUES (${domain.id}, 'S1', 'skill') RETURNING id`,
  );
  const subskill = firstRow(
    await tx<IdRow[]>`
      INSERT INTO subskills (skill_id, code, name) VALUES (${skill.id}, 'SS1', 'sub') RETURNING id`,
  );
  const question = firstRow(
    await tx<IdRow[]>`INSERT INTO questions (stable_code) VALUES ('TEST-Q-1') RETURNING id`,
  );
  const questionVersion = firstRow(
    await tx<IdRow[]>`
      INSERT INTO question_versions
        (question_id, version_number, question_type, stem_content, difficulty_author_score, taxonomy_version_id)
      VALUES (${question.id}, 1, 'SINGLE_CHOICE', '{"text":"stem"}'::jsonb, 0.5, ${taxonomyVersion.id})
      RETURNING id`,
  );
  const session = firstRow(
    await tx<IdRow[]>`
      INSERT INTO assessment_sessions (student_id, type, scoring_version)
      VALUES (${student.id}, 'DIAGNOSTIC', 'scoring-test') RETURNING id`,
  );
  const item = firstRow(
    await tx<IdRow[]>`
      INSERT INTO assessment_items (session_id, question_version_id, ordinal, selected_by)
      VALUES (${session.id}, ${questionVersion.id}, 1, 'FIXED') RETURNING id`,
  );

  return {
    studentId: student.id,
    examId: exam.id,
    taxonomyVersionId: taxonomyVersion.id,
    skillId: skill.id,
    subskillId: subskill.id,
    questionId: question.id,
    questionVersionId: questionVersion.id,
    sessionId: session.id,
    itemId: item.id,
  };
}

export async function addItem(tx: Tx, graph: QuestionGraph, ordinal: number): Promise<string> {
  const item = firstRow(
    await tx<IdRow[]>`
      INSERT INTO assessment_items (session_id, question_version_id, ordinal, selected_by)
      VALUES (${graph.sessionId}, ${graph.questionVersionId}, ${ordinal}, 'FIXED') RETURNING id`,
  );
  return item.id;
}

export async function answerItem(
  tx: Tx,
  graph: QuestionGraph,
  itemId: string,
  idempotencyKey: string,
): Promise<string> {
  const attempt = firstRow(
    await tx<IdRow[]>`
      INSERT INTO question_attempts (assessment_item_id, student_id, is_correct, result_type, idempotency_key)
      VALUES (${itemId}, ${graph.studentId}, true, 'ANSWERED', ${idempotencyKey}) RETURNING id`,
  );
  return attempt.id;
}

export function insertMasteryEvent(
  tx: Tx,
  graph: QuestionGraph,
  attemptId: string,
  node: { skillId: string | null; subskillId: string | null },
) {
  return tx`
    INSERT INTO mastery_events
      (student_id, attempt_id, skill_id, subskill_id, before_mastery, after_mastery,
       before_confidence, after_confidence, reason_code, difficulty, attribution_weight,
       algorithm_version, config_version)
    VALUES (${graph.studentId}, ${attemptId}, ${node.skillId}, ${node.subskillId}, 0.5, 0.6,
            0, 0.1, 'CORRECT', 0.5, 1, 'mastery-v1.0', 'config-test')`;
}

export async function publish(tx: Tx, questionVersionId: string): Promise<void> {
  await tx`
    UPDATE question_versions SET status = 'PUBLISHED', published_at = now()
    WHERE id = ${questionVersionId}`;
}
