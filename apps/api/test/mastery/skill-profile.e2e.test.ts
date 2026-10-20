import { randomUUID } from "node:crypto";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SKILL_STANDING_READER,
  type SkillStandingReader,
} from "../../src/modules/mastery/mastery.contract.js";
import {
  deleteE2eUsers,
  E2E_DATABASE_URL,
  e2eEmail,
  e2eExamCode,
  e2eSql,
  purgeE2eCatalog,
} from "../support/e2e-database.js";
import { buildTestApp, testConfig } from "../support/test-app.js";

const COOKIE = "qup_session";
const PASSWORD = "skill profile passphrase";

let app: NestFastifyApplication;
let studentA: { token: string; id: string };
let studentB: { token: string; id: string };
let examId: string;
let otherExamId: string;
const ids = {} as Record<"s1" | "ss1" | "ss2" | "s2" | "s3" | "otherSkill", string>;

async function one<T>(rows: Promise<T[]>): Promise<T> {
  const [row] = await rows;
  if (!row) throw new Error("expected a row");
  return row;
}

async function register(label: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email: e2eEmail(label), password: PASSWORD },
  });
  return {
    token: response.cookies.find((c) => c.name === COOKIE)?.value ?? "",
    id: response.json<{ user: { id: string } }>().user.id,
  };
}

const profile = (token: string, exam = examId) =>
  app.inject({
    method: "GET",
    url: `/api/v1/exams/${exam}/skill-profile`,
    cookies: { [COOKIE]: token },
  });

async function exam(status: "ACTIVE" | "DRAFT"): Promise<{ examId: string; versionId: string }> {
  const created = await one(e2eSql<{ id: string }[]>`
    INSERT INTO exams (code, slug, name_ar, status)
    VALUES (${e2eExamCode()}, ${`e2e-p-${randomUUID().slice(0, 8)}`}, 'ملف', ${status})
    RETURNING id`);
  const version = await one(e2eSql<{ id: string }[]>`
    INSERT INTO taxonomy_versions (exam_id, version_code) VALUES (${created.id}, 'v1') RETURNING id`);
  return { examId: created.id, versionId: version.id };
}

async function state(
  studentId: string,
  exam: string,
  node: { skillId?: string; subskillId?: string },
  values: {
    mastery: number;
    confidence: number;
    coverage: number;
    evidence: number;
    state: string;
  },
) {
  await e2eSql`
    INSERT INTO student_mastery_states (student_id, exam_id, skill_id, subskill_id, mastery_score,
      confidence_score, coverage_score, evidence_count, distinct_question_count, state,
      algorithm_version, config_version)
    VALUES (${studentId}, ${exam}, ${node.skillId ?? null}, ${node.subskillId ?? null},
      ${values.mastery}, ${values.confidence}, ${values.coverage}, ${values.evidence},
      ${values.evidence}, ${values.state}, 'mastery-v1.0', 'mastery-config-v1.0')`;
}

beforeAll(async () => {
  await purgeE2eCatalog();
  await deleteE2eUsers();
  ({ app } = await buildTestApp({
    config: testConfig({ DATABASE_URL: E2E_DATABASE_URL, AUTH_RATE_LIMIT_PER_MINUTE: "10000" }),
  }));
  studentA = await register("profile-a");
  studentB = await register("profile-b");

  const live = await exam("ACTIVE");
  examId = live.examId;
  const domain = await one(e2eSql<{ id: string }[]>`
    INSERT INTO domains (taxonomy_version_id, code, name) VALUES (${live.versionId}, 'D', 'لفظي') RETURNING id`);
  const skill = (code: string, name: string, order: number) =>
    one(e2eSql<{ id: string }[]>`
      INSERT INTO skills (domain_id, code, name, display_order)
      VALUES (${domain.id}, ${code}, ${name}, ${order}) RETURNING id`);
  ids.s1 = (await skill("S1", "التناظر", 0)).id;
  ids.s2 = (await skill("S2", "إكمال الجمل", 1)).id;
  ids.s3 = (await skill("S3", "استيعاب المقروء", 2)).id;
  const subskill = (code: string, name: string, weight: number) =>
    one(e2eSql<{ id: string }[]>`
      INSERT INTO subskills (skill_id, code, name, weight) VALUES (${ids.s1}, ${code}, ${name}, ${weight}) RETURNING id`);
  ids.ss1 = (await subskill("SS1", "مترادفات", 2)).id;
  ids.ss2 = (await subskill("SS2", "أضداد", 1)).id;
  await e2eSql`
    INSERT INTO skill_prerequisites (skill_id, prerequisite_skill_id) VALUES (${ids.s2}, ${ids.s1})`;
  await e2eSql`UPDATE taxonomy_versions SET status = 'PUBLISHED' WHERE id = ${live.versionId}`;

  const other = await exam("ACTIVE");
  otherExamId = other.examId;
  const otherDomain = await one(e2eSql<{ id: string }[]>`
    INSERT INTO domains (taxonomy_version_id, code, name) VALUES (${other.versionId}, 'D', 'd') RETURNING id`);
  ids.otherSkill = (
    await one(e2eSql<{ id: string }[]>`
      INSERT INTO skills (domain_id, code, name) VALUES (${otherDomain.id}, 'X', 'x') RETURNING id`)
  ).id;
  await e2eSql`UPDATE taxonomy_versions SET status = 'PUBLISHED' WHERE id = ${other.versionId}`;

  // Student A: one subskill measured, S2 a clear gap, S3 never measured.
  await state(
    studentA.id,
    examId,
    { subskillId: ids.ss1 },
    {
      mastery: 0.8,
      confidence: 0.7,
      coverage: 1,
      evidence: 5,
      state: "DEVELOPING",
    },
  );
  await state(
    studentA.id,
    examId,
    { skillId: ids.s2 },
    {
      mastery: 0.4,
      confidence: 0.6,
      coverage: 0.6,
      evidence: 3,
      state: "GAP",
    },
  );
  await state(
    studentA.id,
    otherExamId,
    { skillId: ids.otherSkill },
    {
      mastery: 0.1,
      confidence: 0.9,
      coverage: 1,
      evidence: 9,
      state: "GAP",
    },
  );
  // Student B's evidence must never show in A's profile.
  await state(
    studentB.id,
    examId,
    { skillId: ids.s3 },
    {
      mastery: 0.2,
      confidence: 0.9,
      coverage: 1,
      evidence: 9,
      state: "GAP",
    },
  );

  await e2eSql`
    INSERT INTO entitlements (student_id, exam_id, source, starts_at)
    VALUES (${studentA.id}, ${examId}, 'ADMIN', now() - interval '1 day')`;
});

afterAll(async () => {
  await app.close();
  await purgeE2eCatalog();
  await deleteE2eUsers();
  await e2eSql.end();
});

describe("skill profile", () => {
  it("requires a session", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/exams/${examId}/skill-profile`,
    });
    expect(response.statusCode).toBe(401);
  });

  it("is part of the paid exam (PRD §7)", async () => {
    const response = await profile(studentB.token);
    expect(response.statusCode).toBe(403);
    expect(response.json<{ error: { code: string } }>().error.code).toBe(
      "SKILL_PROFILE_REQUIRES_ACCESS",
    );
  });

  it("is unavailable for an exam that is not active", async () => {
    const draft = await exam("DRAFT");
    const response = await profile(studentA.token, draft.examId);
    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: { code: string } }>().error.code).toBe("EXAM_NOT_AVAILABLE");
  });

  it("reports every skill, aggregates subskills and ranks gaps", async () => {
    const response = await profile(studentA.token);
    expect(response.statusCode).toBe(200);
    const body = response.json<{
      summary: Record<string, number>;
      domains: {
        skills: {
          id: string;
          state: string;
          mastery: number | null;
          coverage: number;
          gapSeverity: number | null;
          subskills: { id: string; state: string; mastery: number | null }[];
        }[];
      }[];
      gaps: { skillId: string; severity: number }[];
    }>();

    const skills = body.domains[0]?.skills ?? [];
    expect(skills.map((skill) => skill.id)).toEqual([ids.s1, ids.s2, ids.s3]);

    const [s1, s2, s3] = skills;
    // S1 from its subskills: mastery 0.8 (only SS1 measured), coverage (1×2 + 0×1)/3.
    expect(s1?.state).toBe("DEVELOPING");
    expect(s1?.mastery).toBeCloseTo(0.8, 5);
    expect(s1?.coverage).toBeCloseTo(0.66667, 4);
    expect(s1?.subskills.map((sub) => [sub.id, sub.state, sub.mastery])).toEqual([
      [ids.ss1, "DEVELOPING", 0.8],
      [ids.ss2, "UNASSESSED", null],
    ]);
    expect(s2).toMatchObject({ state: "GAP", mastery: 0.4 });
    // Never measured: no mastery figure, and B's evidence on S3 is not A's.
    expect(s3).toMatchObject({ state: "UNASSESSED", mastery: null, gapSeverity: null });

    // (0.85 − 0.4) / 0.85 and (0.85 − 0.8) / 0.85, largest first.
    expect(body.gaps.map((gap) => gap.skillId)).toEqual([ids.s2, ids.s1]);
    expect(body.gaps[0]?.severity).toBeCloseTo(0.52941, 4);
    expect(body.summary).toEqual({
      skills: 3,
      assessed: 2,
      gaps: 2,
      readyForReassessment: 0,
      mastered: 0,
    });
    expect(response.payload).not.toContain(ids.otherSkill);
  });

  it("exposes the same standing to other modules, with what selection needs", async () => {
    const reader = app.get<SkillStandingReader>(SKILL_STANDING_READER);
    const standing = await reader.standing(studentA.id, examId);
    const skills = standing?.domains[0]?.skills ?? [];
    const s2 = skills.find((skill) => skill.id === ids.s2);
    expect(s2?.prerequisiteSkillIds).toEqual([ids.s1]);
    expect(s2?.confidence).toBeCloseTo(0.6, 5);
    expect(s2?.gapSeverity).toBeCloseTo(0.52941, 4);
    expect(skills.find((skill) => skill.id === ids.s1)?.subskills[0]?.gapSeverity).toBeCloseTo(
      0.05882,
      4,
    );
    expect(standing?.domains[0]?.weight).toBe(1);
  });
});
