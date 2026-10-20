import { randomUUID } from "node:crypto";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AdminBootstrapService } from "../../src/modules/auth/application/admin-bootstrap.service.js";
import {
  deleteE2eUsers,
  E2E_DATABASE_URL,
  e2eEmail,
  e2eExamCode,
  e2eSql,
  grantRole,
  purgeE2eCatalog,
} from "../support/e2e-database.js";
import { buildTestApp, testConfig } from "../support/test-app.js";

const COOKIE = "qup_session";
const PASSWORD = "catalog test passphrase";

let app: NestFastifyApplication;
let admin: string;
let adminUserId: string;
let manager: string;
let student: string;

async function sessionFor(email: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { identifier: email, password: PASSWORD },
  });
  return response.cookies.find((c) => c.name === COOKIE)?.value ?? "";
}

async function registerUser(label: string): Promise<{ email: string; id: string }> {
  const email = e2eEmail(label);
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email, password: PASSWORD },
  });
  return { email, id: response.json<{ user: { id: string } }>().user.id };
}

type Method = "GET" | "POST" | "PATCH";
function call(token: string, method: Method, url: string, payload?: unknown) {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    cookies: { [COOKIE]: token },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
}

const code = (response: { json: () => unknown }) =>
  (response.json() as { error: { code: string } }).error.code;

beforeAll(async () => {
  await purgeE2eCatalog();
  await deleteE2eUsers();
  ({ app } = await buildTestApp({
    config: testConfig({ DATABASE_URL: E2E_DATABASE_URL, AUTH_RATE_LIMIT_PER_MINUTE: "10000" }),
  }));

  const adminEmail = e2eEmail("catalog-admin");
  adminUserId = (
    await app.get(AdminBootstrapService).ensureAdmin({ email: adminEmail, password: PASSWORD })
  ).userId;
  admin = await sessionFor(adminEmail);

  const managerUser = await registerUser("catalog-manager");
  await grantRole(managerUser.id, "CONTENT_MANAGER");
  manager = await sessionFor(managerUser.email);

  student = await sessionFor((await registerUser("catalog-student")).email);
});

afterAll(async () => {
  await app.close();
  await purgeE2eCatalog();
  await deleteE2eUsers();
  await e2eSql.end();
});

/** A draft exam with one version holding one domain and one skill. */
async function draftExamWithSkill() {
  const exam = (
    await call(admin, "POST", "/admin/exams", {
      code: e2eExamCode(),
      slug: `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      nameAr: "اختبار تجريبي",
    })
  ).json<{ id: string }>();
  const version = (
    await call(admin, "POST", `/admin/exams/${exam.id}/taxonomy-versions`, {
      versionCode: "v1",
    })
  ).json<{ id: string }>();
  const domain = (
    await call(admin, "POST", "/admin/domains", {
      taxonomyVersionId: version.id,
      code: "VERBAL",
      name: "لفظي",
    })
  ).json<{ id: string }>();
  const skill = (
    await call(admin, "POST", "/admin/skills", {
      domainId: domain.id,
      code: "ANALOGY",
      name: "التناظر",
      weight: 1.5,
      masteryThreshold: 0.85,
    })
  ).json<{ id: string }>();
  return { examId: exam.id, versionId: version.id, domainId: domain.id, skillId: skill.id };
}

describe("access control", () => {
  it("requires authentication, then taxonomy.manage", async () => {
    expect((await app.inject({ method: "GET", url: "/api/v1/admin/exams" })).statusCode).toBe(401);
    expect((await call(student, "GET", "/admin/exams")).statusCode).toBe(403);
  });

  it("keeps taxonomy admin-only for now (OPEN_QUESTIONS.md #16a)", async () => {
    expect((await call(manager, "GET", "/admin/exams")).statusCode).toBe(403);
    expect((await call(admin, "GET", "/admin/exams")).statusCode).toBe(200);
  });
});

describe("exams", () => {
  it("creates exams as DRAFT, hidden from students", async () => {
    const created = await call(admin, "POST", "/admin/exams", {
      code: e2eExamCode(),
      slug: `e2e-hidden-${Date.now()}`,
      nameAr: "مسودة",
    });
    expect(created.statusCode).toBe(201);
    const exam = created.json<{ id: string; status: string }>();
    expect(exam.status).toBe("DRAFT");

    const list = (await call(student, "GET", "/exams")).json<{ items: { id: string }[] }>();
    expect(list.items.map((e) => e.id)).not.toContain(exam.id);
    expect((await call(student, "GET", `/exams/${exam.id}`)).statusCode).toBe(404);
  });

  it("rejects a duplicate exam code", async () => {
    const examCode = e2eExamCode();
    await call(admin, "POST", "/admin/exams", {
      code: examCode,
      slug: `e2e-a-${Date.now()}`,
      nameAr: "أ",
    });
    const duplicate = await call(admin, "POST", "/admin/exams", {
      code: examCode,
      slug: `e2e-b-${Date.now()}`,
      nameAr: "ب",
    });
    expect(duplicate.statusCode).toBe(409);
    expect(code(duplicate)).toBe("EXAM_IDENTIFIER_TAKEN");
  });

  it("cannot be activated before its taxonomy is published", async () => {
    const { examId } = await draftExamWithSkill();

    const response = await call(admin, "PATCH", `/admin/exams/${examId}`, { status: "ACTIVE" });
    expect(response.statusCode).toBe(422);
    expect(code(response)).toBe("EXAM_HAS_NO_PUBLISHED_TAXONOMY");
  });
});

describe("taxonomy authoring", () => {
  it("builds a tree with typed numbers", async () => {
    const { versionId, skillId } = await draftExamWithSkill();
    await call(admin, "POST", "/admin/subskills", {
      skillId,
      code: "WORD_RELATIONS",
      name: "علاقات الكلمات",
    });

    const tree = await call(admin, "GET", `/admin/taxonomy-versions/${versionId}/tree`);
    expect(tree.statusCode).toBe(200);
    expect(tree.json()).toMatchObject({
      version: { status: "DRAFT", versionCode: "v1" },
      domains: [
        {
          code: "VERBAL",
          weight: 1,
          skills: [
            {
              code: "ANALOGY",
              weight: 1.5,
              masteryThreshold: 0.85,
              subskills: [{ code: "WORD_RELATIONS" }],
            },
          ],
        },
      ],
    });
  });

  it("rejects numbers the database would silently round", async () => {
    const { domainId } = await draftExamWithSkill();
    const response = await call(admin, "POST", "/admin/skills", {
      domainId,
      code: "PRECISE",
      name: "x",
      weight: 1.23456,
    });
    expect(response.statusCode).toBe(400);
    expect(code(response)).toBe("VALIDATION_FAILED");
  });

  it("rejects a duplicate code under the same parent", async () => {
    const { domainId } = await draftExamWithSkill();
    const response = await call(admin, "POST", "/admin/skills", {
      domainId,
      code: "ANALOGY",
      name: "again",
    });
    expect(response.statusCode).toBe(409);
    expect(code(response)).toBe("TAXONOMY_CODE_TAKEN");
  });
});

describe("prerequisites", () => {
  it("accepts a prerequisite and rejects the cycle it would close", async () => {
    const { domainId, skillId: analogy } = await draftExamWithSkill();
    const completion = (
      await call(admin, "POST", "/admin/skills", {
        domainId,
        code: "COMPLETION",
        name: "إكمال الجمل",
      })
    ).json<{ id: string }>().id;

    const forward = await call(admin, "POST", `/admin/skills/${completion}/prerequisites`, {
      prerequisiteSkillId: analogy,
    });
    expect(forward.statusCode).toBe(204);

    const backward = await call(admin, "POST", `/admin/skills/${analogy}/prerequisites`, {
      prerequisiteSkillId: completion,
    });
    expect(backward.statusCode).toBe(422);
    expect(code(backward)).toBe("PREREQUISITE_CYCLE");

    const self = await call(admin, "POST", `/admin/skills/${analogy}/prerequisites`, {
      prerequisiteSkillId: analogy,
    });
    expect(code(self)).toBe("PREREQUISITE_CYCLE");
  });

  it("rejects a prerequisite from another taxonomy version", async () => {
    const first = await draftExamWithSkill();
    const second = await draftExamWithSkill();

    const response = await call(admin, "POST", `/admin/skills/${first.skillId}/prerequisites`, {
      prerequisiteSkillId: second.skillId,
    });
    expect(response.statusCode).toBe(422);
    expect(code(response)).toBe("PREREQUISITE_OUTSIDE_VERSION");
  });
});

describe("publishing", () => {
  it("refuses an empty taxonomy", async () => {
    const exam = (
      await call(admin, "POST", "/admin/exams", {
        code: e2eExamCode(),
        slug: `e2e-empty-${Date.now()}`,
        nameAr: "فارغ",
      })
    ).json<{ id: string }>();
    const version = (
      await call(admin, "POST", `/admin/exams/${exam.id}/taxonomy-versions`, {
        versionCode: "v1",
      })
    ).json<{ id: string }>();

    const response = await call(admin, "POST", `/admin/taxonomy-versions/${version.id}/publish`);
    expect(response.statusCode).toBe(422);
    expect(code(response)).toBe("TAXONOMY_INCOMPLETE");
  });

  it("publishes, audits, freezes the version, and lets the exam go live", async () => {
    const { examId, versionId, domainId, skillId } = await draftExamWithSkill();

    const published = await call(admin, "POST", `/admin/taxonomy-versions/${versionId}/publish`);
    expect(published.statusCode).toBe(200);
    expect(published.json()).toMatchObject({ status: "PUBLISHED" });

    const [audit] = await e2eSql<{ actor_id: string; request_id: string }[]>`
      SELECT actor_id, request_id FROM audit_logs
      WHERE action = 'taxonomy.publish' AND resource_id = ${versionId}`;
    expect(audit?.actor_id).toBe(adminUserId);
    expect(audit?.request_id).toBe(published.headers["x-request-id"]);

    for (const attempt of [
      call(admin, "POST", "/admin/domains", {
        taxonomyVersionId: versionId,
        code: "NEW",
        name: "n",
      }),
      call(admin, "PATCH", `/admin/skills/${skillId}`, { weight: 2 }),
      call(admin, "POST", `/admin/nodes/domain/${domainId}/archive`),
    ]) {
      const response = await attempt;
      expect(response.statusCode).toBe(422);
      expect(code(response)).toBe("TAXONOMY_VERSION_NOT_DRAFT");
    }

    const activated = await call(admin, "PATCH", `/admin/exams/${examId}`, { status: "ACTIVE" });
    expect(activated.json()).toMatchObject({ status: "ACTIVE" });
    const visible = (await call(student, "GET", "/exams")).json<{ items: { id: string }[] }>();
    expect(visible.items.map((e) => e.id)).toContain(examId);

    const regress = await call(admin, "PATCH", `/admin/exams/${examId}`, { status: "DRAFT" });
    expect(code(regress)).toBe("INVALID_EXAM_TRANSITION");
  });

  it("archives the previously published version when a new one is published", async () => {
    const { examId, versionId: v1 } = await draftExamWithSkill();
    await call(admin, "POST", `/admin/taxonomy-versions/${v1}/publish`);

    const v2 = (
      await call(admin, "POST", `/admin/exams/${examId}/taxonomy-versions`, {
        versionCode: "v2",
      })
    ).json<{ id: string }>().id;
    const domain = (
      await call(admin, "POST", "/admin/domains", {
        taxonomyVersionId: v2,
        code: "QUANT",
        name: "كمي",
      })
    ).json<{ id: string }>().id;
    await call(admin, "POST", "/admin/skills", { domainId: domain, code: "ALGEBRA", name: "جبر" });

    expect((await call(admin, "POST", `/admin/taxonomy-versions/${v2}/publish`)).statusCode).toBe(
      200,
    );

    const v1Tree = await call(admin, "GET", `/admin/taxonomy-versions/${v1}/tree`);
    expect(v1Tree.json()).toMatchObject({ version: { status: "ARCHIVED" } });
  });
});

describe("taxonomy versions list", () => {
  it("lists an exam's versions newest first", async () => {
    const exam = (
      await call(admin, "POST", "/admin/exams", {
        code: e2eExamCode(),
        slug: `e2e-versions-${Date.now()}`,
        nameAr: "نسخ",
      })
    ).json<{ id: string }>();
    for (const versionCode of ["v1", "v2"]) {
      await call(admin, "POST", `/admin/exams/${exam.id}/taxonomy-versions`, { versionCode });
    }

    const response = await call(admin, "GET", `/admin/exams/${exam.id}/taxonomy-versions`);
    expect(response.statusCode).toBe(200);
    const { items } = response.json<{
      items: { versionCode: string; status: string; examId: string }[];
    }>();
    expect(items.map((version) => version.versionCode)).toEqual(["v2", "v1"]);
    for (const version of items) {
      expect(version).toMatchObject({ status: "DRAFT", examId: exam.id });
    }
  });

  it("returns 404 for an unknown exam", async () => {
    const response = await call(admin, "GET", `/admin/exams/${randomUUID()}/taxonomy-versions`);
    expect(response.statusCode).toBe(404);
    expect(code(response)).toBe("EXAM_NOT_FOUND");
  });

  it("refuses content managers and students", async () => {
    const { examId } = await draftExamWithSkill();
    for (const token of [manager, student]) {
      const response = await call(token, "GET", `/admin/exams/${examId}/taxonomy-versions`);
      expect(response.statusCode).toBe(403);
      expect(code(response)).toBe("FORBIDDEN");
    }
  });
});

describe("editing domains and subskills", () => {
  let draft: Awaited<ReturnType<typeof draftExamWithSkill>>;
  let subskillId: string;

  const tree = async (versionId: string) =>
    (await call(admin, "GET", `/admin/taxonomy-versions/${versionId}/tree`)).json<{
      domains: {
        name: string;
        weight: number;
        skills: { subskills: { masteryThreshold: number | null }[] }[];
      }[];
    }>();

  beforeAll(async () => {
    draft = await draftExamWithSkill();
    subskillId = (
      await call(admin, "POST", "/admin/subskills", {
        skillId: draft.skillId,
        code: "WORD_RELATIONS",
        name: "علاقات الكلمات",
      })
    ).json<{ id: string }>().id;
  });

  it("renames a domain and changes its weight", async () => {
    const response = await call(admin, "PATCH", `/admin/domains/${draft.domainId}`, {
      name: "مجال معدل",
      weight: 2.5,
    });
    expect(response.statusCode).toBe(204);
    expect((await tree(draft.versionId)).domains[0]).toMatchObject({
      name: "مجال معدل",
      weight: 2.5,
    });
  });

  it("sets and clears a subskill threshold", async () => {
    const subskill = async () =>
      (await tree(draft.versionId)).domains[0]?.skills[0]?.subskills[0]?.masteryThreshold;

    const set = await call(admin, "PATCH", `/admin/subskills/${subskillId}`, {
      masteryThreshold: 0.9,
    });
    expect(set.statusCode).toBe(204);
    expect(await subskill()).toBe(0.9);

    await call(admin, "PATCH", `/admin/subskills/${subskillId}`, { masteryThreshold: null });
    expect(await subskill()).toBeNull();
  });

  it("rejects an empty body and an attempt to change code", async () => {
    for (const payload of [{}, { code: "X" }]) {
      for (const url of [`/admin/domains/${draft.domainId}`, `/admin/subskills/${subskillId}`]) {
        const response = await call(admin, "PATCH", url, payload);
        expect(response.statusCode).toBe(400);
        expect(code(response)).toBe("VALIDATION_FAILED");
      }
    }
  });

  it("returns 404 for an unknown node", async () => {
    for (const url of [`/admin/domains/${randomUUID()}`, `/admin/subskills/${randomUUID()}`]) {
      const response = await call(admin, "PATCH", url, { name: "x" });
      expect(response.statusCode).toBe(404);
      expect(code(response)).toBe("TAXONOMY_NODE_NOT_FOUND");
    }
  });

  it("refuses edits once the version is published", async () => {
    const published = await draftExamWithSkill();
    await call(admin, "POST", `/admin/taxonomy-versions/${published.versionId}/publish`);

    const response = await call(admin, "PATCH", `/admin/domains/${published.domainId}`, {
      name: "متأخر",
    });
    expect(response.statusCode).toBe(422);
    expect(code(response)).toBe("TAXONOMY_VERSION_NOT_DRAFT");
  });

  it("refuses content managers", async () => {
    const response = await call(manager, "PATCH", `/admin/domains/${draft.domainId}`, {
      name: "x",
    });
    expect(response.statusCode).toBe(403);
    expect(code(response)).toBe("FORBIDDEN");
  });
});
