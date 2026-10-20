import { randomUUID } from "node:crypto";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
const PASSWORD = "question authoring passphrase";

let app: NestFastifyApplication;
let manager: string;
let student: string;
let liveExamId: string;
let goneExamId: string;
let publishedVersionId: string;

function get(token: string, url: string) {
  return app.inject({ method: "GET", url: `/api/v1${url}`, cookies: { [COOKIE]: token } });
}

const errorCode = (response: { json: () => unknown }) =>
  (response.json() as { error: { code: string } }).error.code;

async function register(label: string): Promise<{ email: string; id: string }> {
  const email = e2eEmail(label);
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email, password: PASSWORD },
  });
  return { email, id: response.json<{ user: { id: string } }>().user.id };
}

async function signIn(email: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { identifier: email, password: PASSWORD },
  });
  return response.cookies.find((c) => c.name === COOKIE)?.value ?? "";
}

async function insertExam(status: "DRAFT" | "ARCHIVED"): Promise<string> {
  const [exam] = await e2eSql<{ id: string }[]>`
    INSERT INTO exams (code, slug, name_ar)
    VALUES (${e2eExamCode()}, ${`e2e-qa-${randomUUID().slice(0, 8)}`}, 'تأليف')
    RETURNING id`;
  const id = exam?.id ?? "";
  if (status === "ARCHIVED") await e2eSql`UPDATE exams SET status = 'ARCHIVED' WHERE id = ${id}`;
  return id;
}

async function insertVersion(examId: string, versionCode: string): Promise<string> {
  const [version] = await e2eSql<{ id: string }[]>`
    INSERT INTO taxonomy_versions (exam_id, version_code)
    VALUES (${examId}, ${versionCode}) RETURNING id`;
  return version?.id ?? "";
}

beforeAll(async () => {
  await purgeE2eCatalog();
  await deleteE2eUsers();
  ({ app } = await buildTestApp({
    config: testConfig({ DATABASE_URL: E2E_DATABASE_URL, AUTH_RATE_LIMIT_PER_MINUTE: "10000" }),
  }));

  const managerUser = await register("qa-manager");
  await grantRole(managerUser.id, "CONTENT_MANAGER");
  manager = await signIn(managerUser.email);
  student = await signIn((await register("qa-student")).email);

  liveExamId = await insertExam("DRAFT");
  const oldVersion = await insertVersion(liveExamId, "v-old");
  await e2eSql`UPDATE taxonomy_versions SET status = 'ARCHIVED' WHERE id = ${oldVersion}`;

  publishedVersionId = await insertVersion(liveExamId, "v-pub");
  const [domain] = await e2eSql<{ id: string }[]>`
    INSERT INTO domains (taxonomy_version_id, code, name)
    VALUES (${publishedVersionId}, 'D', 'مجال') RETURNING id`;
  const [skill] = await e2eSql<{ id: string }[]>`
    INSERT INTO skills (domain_id, code, name, display_order)
    VALUES (${domain?.id ?? ""}, 'S', 'مهارة', 1) RETURNING id`;
  await e2eSql`
    INSERT INTO skills (domain_id, code, name, display_order, status)
    VALUES (${domain?.id ?? ""}, 'S_OLD', 'قديمة', 2, 'ARCHIVED')`;
  await e2eSql`
    INSERT INTO subskills (skill_id, code, name) VALUES (${skill?.id ?? ""}, 'SS', 'فرعية')`;
  await e2eSql`UPDATE taxonomy_versions SET status = 'PUBLISHED' WHERE id = ${publishedVersionId}`;

  await insertVersion(liveExamId, "v-draft");

  goneExamId = await insertExam("ARCHIVED");
  await insertVersion(goneExamId, "v1");
});

afterAll(async () => {
  await app.close();
  await purgeE2eCatalog();
  await deleteE2eUsers();
  await e2eSql.end();
});

describe("authoring taxonomies", () => {
  it("lists exams in use with their versions, newest first, for a content manager", async () => {
    const response = await get(manager, "/admin/question-authoring/taxonomies");
    expect(response.statusCode).toBe(200);
    const { items } = response.json<{
      items: { exam: { id: string }; versions: { versionCode: string; status: string }[] }[];
    }>();

    const live = items.find((item) => item.exam.id === liveExamId);
    expect(live?.versions.map((version) => version.versionCode)).toEqual(["v-draft", "v-pub"]);
    expect(items.map((item) => item.exam.id)).not.toContain(goneExamId);
  });

  it("is closed to students", async () => {
    const response = await get(student, "/admin/question-authoring/taxonomies");
    expect(response.statusCode).toBe(403);
    expect(errorCode(response)).toBe("FORBIDDEN");
  });
});

describe("taxonomy outline", () => {
  it("lists the active skills and subskills authors can map to", async () => {
    const response = await get(
      manager,
      `/admin/question-authoring/taxonomy-versions/${publishedVersionId}/outline`,
    );
    expect(response.statusCode).toBe(200);
    const outline = response.json<{
      version: { id: string; examId: string; status: string };
      domains: { code: string; skills: { code: string; subskills: { code: string }[] }[] }[];
    }>();
    expect(outline.version).toMatchObject({
      id: publishedVersionId,
      examId: liveExamId,
      status: "PUBLISHED",
    });
    expect(outline.domains.map((d) => d.code)).toEqual(["D"]);
    expect(outline.domains[0]?.skills.map((s) => s.code)).toEqual(["S"]);
    expect(outline.domains[0]?.skills[0]?.subskills.map((s) => s.code)).toEqual(["SS"]);
  });

  it("returns 404 for an unknown version", async () => {
    const response = await get(
      manager,
      `/admin/question-authoring/taxonomy-versions/${randomUUID()}/outline`,
    );
    expect(response.statusCode).toBe(404);
    expect(errorCode(response)).toBe("TAXONOMY_VERSION_NOT_FOUND");
  });

  it("is closed to students", async () => {
    const response = await get(
      student,
      `/admin/question-authoring/taxonomy-versions/${publishedVersionId}/outline`,
    );
    expect(response.statusCode).toBe(403);
  });
});
