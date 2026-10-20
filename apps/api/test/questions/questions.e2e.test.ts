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
const PASSWORD = "question bank passphrase";

let app: NestFastifyApplication;
let admin: string;
let adminId: string;
let manager: string;
let student: string;
/** A published taxonomy with one skill and one subskill. */
let taxonomy: { versionId: string; skillId: string; subskillId: string };
/** A second, still-draft taxonomy. */
let draftTaxonomy: { versionId: string; skillId: string };

type Method = "GET" | "POST" | "PUT";
function call(token: string, method: Method, url: string, payload?: unknown) {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    cookies: { [COOKIE]: token },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
}

const errorCode = (response: { json: () => unknown }) =>
  (response.json() as { error: { code: string } }).error.code;

async function signIn(email: string): Promise<string> {
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

/** Taxonomy fixtures written directly: the catalog API has its own tests. */
async function createTaxonomy(publish: boolean) {
  const [exam] = await e2eSql<{ id: string }[]>`
    INSERT INTO exams (code, slug, name_ar)
    VALUES (${e2eExamCode()}, ${`e2e-q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}, 'بنك')
    RETURNING id`;
  const [version] = await e2eSql<{ id: string }[]>`
    INSERT INTO taxonomy_versions (exam_id, version_code) VALUES (${exam?.id ?? ""}, 'v1') RETURNING id`;
  const versionId = version?.id ?? "";
  const [domain] = await e2eSql<{ id: string }[]>`
    INSERT INTO domains (taxonomy_version_id, code, name) VALUES (${versionId}, 'D', 'd') RETURNING id`;
  const [skill] = await e2eSql<{ id: string }[]>`
    INSERT INTO skills (domain_id, code, name) VALUES (${domain?.id ?? ""}, 'S', 's') RETURNING id`;
  const [subskill] = await e2eSql<{ id: string }[]>`
    INSERT INTO subskills (skill_id, code, name) VALUES (${skill?.id ?? ""}, 'SS', 'ss') RETURNING id`;
  if (publish) {
    await e2eSql`UPDATE taxonomy_versions SET status = 'PUBLISHED' WHERE id = ${versionId}`;
  }
  return { versionId, skillId: skill?.id ?? "", subskillId: subskill?.id ?? "" };
}

const text = (value: string) => ({ blocks: [{ type: "text", text: value }] });

function completeContent(overrides: Record<string, unknown> = {}) {
  return {
    questionType: "SINGLE_CHOICE",
    stem: text("كم ناتج 2 + 2؟"),
    explanation: text("جمع بسيط."),
    difficulty: 0.25,
    taxonomyVersionId: taxonomy.versionId,
    options: [
      { key: "A", content: text("3"), isCorrect: false },
      { key: "B", content: text("4"), isCorrect: true },
    ],
    mappings: [
      { skillId: taxonomy.skillId, role: "PRIMARY" },
      { subskillId: taxonomy.subskillId, role: "SECONDARY" },
    ],
    ...overrides,
  };
}

async function createQuestion(content = completeContent()) {
  const response = await call(manager, "POST", "/admin/questions", { content });
  expect(response.statusCode).toBe(201);
  return response.json<{ id: string; questionId: string; status: string; versionNumber: number }>();
}

/** DRAFT → UNDER_REVIEW → APPROVED (by the manager) → PUBLISHED (by the admin). */
async function publishVersion(versionId: string): Promise<void> {
  expect(
    (await call(manager, "POST", `/admin/question-versions/${versionId}/submit-review`)).statusCode,
  ).toBe(204);
  expect(
    (
      await call(manager, "POST", `/admin/question-versions/${versionId}/reviews`, {
        decision: "APPROVED",
      })
    ).statusCode,
  ).toBe(204);
  expect(
    (await call(admin, "POST", `/admin/question-versions/${versionId}/publish`)).statusCode,
  ).toBe(204);
}

beforeAll(async () => {
  await purgeE2eCatalog();
  await deleteE2eUsers();
  ({ app } = await buildTestApp({
    config: testConfig({ DATABASE_URL: E2E_DATABASE_URL, AUTH_RATE_LIMIT_PER_MINUTE: "10000" }),
  }));

  const adminEmail = e2eEmail("qbank-admin");
  adminId = (
    await app.get(AdminBootstrapService).ensureAdmin({ email: adminEmail, password: PASSWORD })
  ).userId;
  admin = await signIn(adminEmail);

  const managerUser = await registerUser("qbank-manager");
  await grantRole(managerUser.id, "CONTENT_MANAGER");
  manager = await signIn(managerUser.email);
  student = await signIn((await registerUser("qbank-student")).email);

  taxonomy = await createTaxonomy(true);
  draftTaxonomy = await createTaxonomy(false);
});

afterAll(async () => {
  await app.close();
  await purgeE2eCatalog();
  await deleteE2eUsers();
  await e2eSql.end();
});

describe("access", () => {
  it("is closed to students", async () => {
    expect((await call(student, "GET", "/admin/questions")).statusCode).toBe(403);
  });
});

describe("authoring", () => {
  it("creates a question with a generated stable code and a DRAFT first version", async () => {
    const version = await createQuestion();

    expect(version).toMatchObject({ status: "DRAFT", versionNumber: 1 });
    const question = (await call(manager, "GET", `/admin/questions/${version.questionId}`)).json<{
      stableCode: string;
    }>();
    expect(question.stableCode).toMatch(/^Q-[0-9A-F]{12}$/);
  });

  it("saves an unfinished draft, but will not send it to review", async () => {
    const draft = await createQuestion(completeContent({ options: [], mappings: [] }));

    const submit = await call(
      manager,
      "POST",
      `/admin/question-versions/${draft.id}/submit-review`,
    );
    expect(submit.statusCode).toBe(422);
    expect(errorCode(submit)).toBe("QUESTION_CONTENT_INVALID");
  });

  it("rejects a mapping to a skill of another taxonomy", async () => {
    const response = await call(manager, "POST", "/admin/questions", {
      content: completeContent({
        mappings: [{ skillId: draftTaxonomy.skillId, role: "PRIMARY" }],
      }),
    });

    expect(response.statusCode).toBe(422);
    const { error } = response.json<{ error: { code: string; details: { path: string }[] } }>();
    expect(error.code).toBe("QUESTION_CONTENT_INVALID");
    expect(error.details.map((d) => d.path)).toContain("mappings.0");
  });

  it("names the broken rules when a draft is submitted", async () => {
    const draft = await createQuestion(
      completeContent({
        options: [
          { key: "A", content: text("3"), isCorrect: false },
          { key: "B", content: text("5"), isCorrect: false },
        ],
        mappings: [],
      }),
    );

    const submit = await call(
      manager,
      "POST",
      `/admin/question-versions/${draft.id}/submit-review`,
    );
    const { error } = submit.json<{ error: { details: { rule: string }[] } }>();
    expect(error.details.map((d) => d.rule)).toEqual(
      expect.arrayContaining(["CORRECT_ANSWER_COUNT", "PRIMARY_MAPPING_COUNT"]),
    );
  });

  it("names a mapping outside the question's taxonomy version", async () => {
    const response = await call(manager, "POST", "/admin/questions", {
      content: completeContent({ mappings: [{ skillId: draftTaxonomy.skillId, role: "PRIMARY" }] }),
    });
    const { error } = response.json<{ error: { details: { rule: string }[] } }>();
    expect(error.details.map((d) => d.rule)).toContain("MAPPING_OUTSIDE_VERSION");
  });

  it("rejects a duplicate stable code", async () => {
    const stableCode = `E2E-${Date.now()}`;
    await call(manager, "POST", "/admin/questions", { stableCode, content: completeContent() });
    const duplicate = await call(manager, "POST", "/admin/questions", {
      stableCode,
      content: completeContent(),
    });
    expect(duplicate.statusCode).toBe(409);
    expect(errorCode(duplicate)).toBe("QUESTION_CODE_TAKEN");
  });
});

describe("review", () => {
  it("freezes content once submitted — nothing unreviewed is published", async () => {
    const version = await createQuestion();
    await call(manager, "POST", `/admin/question-versions/${version.id}/submit-review`);

    const edit = await call(
      manager,
      "PUT",
      `/admin/question-versions/${version.id}`,
      completeContent(),
    );
    expect(edit.statusCode).toBe(422);
    expect(errorCode(edit)).toBe("INVALID_QUESTION_TRANSITION");
  });

  it("requires notes to send a version back, which reopens it for editing", async () => {
    const version = await createQuestion();
    await call(manager, "POST", `/admin/question-versions/${version.id}/submit-review`);

    const noNotes = await call(manager, "POST", `/admin/question-versions/${version.id}/reviews`, {
      decision: "CHANGES_REQUESTED",
    });
    expect(noNotes.statusCode).toBe(400);

    await call(manager, "POST", `/admin/question-versions/${version.id}/reviews`, {
      decision: "CHANGES_REQUESTED",
      notes: "الخيار ب يحتاج توضيح.",
    });
    const detail = (await call(manager, "GET", `/admin/question-versions/${version.id}`)).json<{
      status: string;
      reviews: { decision: string }[];
    }>();
    expect(detail.status).toBe("DRAFT");
    expect(detail.reviews.map((r) => r.decision)).toEqual(["CHANGES_REQUESTED"]);

    const edit = await call(
      manager,
      "PUT",
      `/admin/question-versions/${version.id}`,
      completeContent(),
    );
    expect(edit.statusCode).toBe(200);
  });
});

// OPEN_QUESTIONS.md #14 (decided): only ADMIN publishes.
describe("publishing", () => {
  it("is refused to a content manager and allowed to an admin, with an audit entry", async () => {
    const version = await createQuestion();
    await call(manager, "POST", `/admin/question-versions/${version.id}/submit-review`);
    await call(manager, "POST", `/admin/question-versions/${version.id}/reviews`, {
      decision: "APPROVED",
    });

    const byManager = await call(manager, "POST", `/admin/question-versions/${version.id}/publish`);
    expect(byManager.statusCode).toBe(403);

    const byAdmin = await call(admin, "POST", `/admin/question-versions/${version.id}/publish`);
    expect(byAdmin.statusCode).toBe(204);

    const [audit] = await e2eSql<{ actor_id: string }[]>`
      SELECT actor_id FROM audit_logs WHERE action = 'question.publish' AND resource_id = ${version.id}`;
    expect(audit?.actor_id).toBe(adminId);
  });

  it("refuses a question whose taxonomy is not published", async () => {
    const version = await createQuestion(
      completeContent({
        taxonomyVersionId: draftTaxonomy.versionId,
        mappings: [{ skillId: draftTaxonomy.skillId, role: "PRIMARY" }],
      }),
    );
    await call(manager, "POST", `/admin/question-versions/${version.id}/submit-review`);
    await call(manager, "POST", `/admin/question-versions/${version.id}/reviews`, {
      decision: "APPROVED",
    });

    const response = await call(admin, "POST", `/admin/question-versions/${version.id}/publish`);
    expect(response.statusCode).toBe(422);
    expect(errorCode(response)).toBe("TAXONOMY_NOT_PUBLISHED");
  });
});

describe("versions", () => {
  it("edits a published question through a new version, archiving the old one on publish", async () => {
    const v1 = await createQuestion();
    await publishVersion(v1.id);

    const v2 = (await call(manager, "POST", `/admin/questions/${v1.questionId}/versions`)).json<{
      id: string;
      versionNumber: number;
      status: string;
    }>();
    expect(v2).toMatchObject({ versionNumber: 2, status: "DRAFT" });

    const second = await call(manager, "POST", `/admin/questions/${v1.questionId}/versions`);
    expect(second.statusCode).toBe(409);
    expect(errorCode(second)).toBe("QUESTION_VERSION_IN_PROGRESS");

    await publishVersion(v2.id);
    const question = (await call(manager, "GET", `/admin/questions/${v1.questionId}`)).json<{
      versions: { versionNumber: number; status: string }[];
    }>();
    expect(question.versions).toEqual([
      expect.objectContaining({ versionNumber: 2, status: "PUBLISHED" }),
      expect.objectContaining({ versionNumber: 1, status: "ARCHIVED" }),
    ]);
  });

  it("archives a whole question, which then accepts no new version", async () => {
    const version = await createQuestion();
    await publishVersion(version.id);

    expect(
      (await call(manager, "POST", `/admin/questions/${version.questionId}/archive`)).statusCode,
    ).toBe(403);
    expect(
      (await call(admin, "POST", `/admin/questions/${version.questionId}/archive`)).statusCode,
    ).toBe(204);

    const next = await call(manager, "POST", `/admin/questions/${version.questionId}/versions`);
    expect(errorCode(next)).toBe("QUESTION_ARCHIVED");
  });
});

describe("listing", () => {
  it("shows a preview of each question's stem", async () => {
    const version = await createQuestion(
      completeContent({ stem: text("سؤال للمعاينة في القائمة") }),
    );
    const list = (await call(manager, "GET", "/admin/questions?limit=100")).json<{
      items: { id: string; latestVersion: { stemPreview: string } }[];
    }>();
    const item = list.items.find((entry) => entry.id === version.questionId);
    expect(item?.latestVersion.stemPreview).toBe("سؤال للمعاينة في القائمة");
  });

  it("filters by the newest version's status and paginates", async () => {
    const response = await call(
      manager,
      "GET",
      `/admin/questions?status=PUBLISHED&taxonomyVersionId=${taxonomy.versionId}&limit=1`,
    );

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      items: { latestVersion: { status: string } }[];
      page: { limit: number; total: number };
    }>();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.latestVersion.status).toBe("PUBLISHED");
    expect(body.page.total).toBeGreaterThanOrEqual(1);
  });
});
