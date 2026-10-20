import { randomUUID } from "node:crypto";

import { e2eExamCode, e2eSql } from "./e2e-database.js";

async function one<T>(rows: Promise<T[]>): Promise<T> {
  const [row] = await rows;
  if (!row) throw new Error("expected a row");
  return row;
}

export interface LiveExam {
  examId: string;
  versionId: string;
  /** VERBAL (weight 1), then QUANT (weight 2). */
  domainIds: string[];
  skillIds: string[];
}

export interface LiveExamOptions {
  skillsPerDomain?: number;
  /** Map each question to a subskill of its skill instead of the skill itself. */
  viaSubskills?: boolean;
}

/**
 * An ACTIVE exam with a published taxonomy — two domains weighted 1 and 2,
 * one skill each unless told otherwise — and published single-choice
 * questions whose answer is "B". Skills are named after their code.
 * Written directly: the catalog and question-bank APIs have their own tests.
 */
export async function liveExam(
  questionsPerSkill: number,
  { skillsPerDomain = 1, viaSubskills = false }: LiveExamOptions = {},
): Promise<LiveExam> {
  const exam = await one(e2eSql<{ id: string }[]>`
    INSERT INTO exams (code, slug, name_ar, status)
    VALUES (${e2eExamCode()}, ${`e2e-a-${randomUUID().slice(0, 8)}`}, 'تشخيص', 'ACTIVE')
    RETURNING id`);
  const version = await one(e2eSql<{ id: string }[]>`
    INSERT INTO taxonomy_versions (exam_id, version_code) VALUES (${exam.id}, 'v1') RETURNING id`);

  const domainIds: string[] = [];
  const skillIds: string[] = [];
  const subskillOf = new Map<string, string>();
  for (const [code, weight] of [
    ["VERBAL", 1],
    ["QUANT", 2],
  ] as const) {
    const domain = await one(e2eSql<{ id: string }[]>`
      INSERT INTO domains (taxonomy_version_id, code, name, weight)
      VALUES (${version.id}, ${code}, ${code}, ${weight}) RETURNING id`);
    domainIds.push(domain.id);
    for (let n = 1; n <= skillsPerDomain; n++) {
      const skillCode = `${code}-S${n}`;
      const skill = await one(e2eSql<{ id: string }[]>`
        INSERT INTO skills (domain_id, code, name, min_coverage, display_order)
        VALUES (${domain.id}, ${skillCode}, ${skillCode}, 3, ${n}) RETURNING id`);
      skillIds.push(skill.id);
      if (viaSubskills) {
        const subskill = await one(e2eSql<{ id: string }[]>`
          INSERT INTO subskills (skill_id, code, name)
          VALUES (${skill.id}, ${`${skillCode}-SUB`}, ${`${skillCode}-SUB`}) RETURNING id`);
        subskillOf.set(skill.id, subskill.id);
      }
    }
  }
  await e2eSql`UPDATE taxonomy_versions SET status = 'PUBLISHED' WHERE id = ${version.id}`;

  for (const skillId of skillIds) {
    for (let i = 0; i < questionsPerSkill; i++) {
      const question = await one(e2eSql<{ id: string }[]>`
        INSERT INTO questions (stable_code) VALUES (${`E2E-${randomUUID()}`}) RETURNING id`);
      const qv = await one(e2eSql<{ id: string }[]>`
        INSERT INTO question_versions
          (question_id, version_number, question_type, stem_content, difficulty_author_score, taxonomy_version_id)
        VALUES (${question.id}, 1, 'SINGLE_CHOICE',
                ${e2eSql.json({ blocks: [{ type: "text", text: `سؤال ${i}` }] })}, 0.5, ${version.id})
        RETURNING id`);
      await e2eSql`
        INSERT INTO question_options (question_version_id, key, content, is_correct, display_order) VALUES
          (${qv.id}, 'A', ${e2eSql.json({ blocks: [{ type: "text", text: "3" }] })}, false, 0),
          (${qv.id}, 'B', ${e2eSql.json({ blocks: [{ type: "text", text: "4" }] })}, true, 1)`;
      const subskillId = subskillOf.get(skillId) ?? null;
      await e2eSql`
        INSERT INTO question_skill_mappings
          (question_version_id, skill_id, subskill_id, role, attribution_weight)
        VALUES (${qv.id}, ${subskillId ? null : skillId}, ${subskillId}, 'PRIMARY', 1)`;
      for (const status of ["UNDER_REVIEW", "APPROVED"]) {
        await e2eSql`UPDATE question_versions SET status = ${status}::question_version_status WHERE id = ${qv.id}`;
      }
      await e2eSql`UPDATE question_versions SET status = 'PUBLISHED', published_at = now() WHERE id = ${qv.id}`;
    }
  }
  return { examId: exam.id, versionId: version.id, domainIds, skillIds };
}
