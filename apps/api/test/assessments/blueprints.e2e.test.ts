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
const PASSWORD = "blueprint test passphrase";

let app: NestFastifyApplication;
let admin: string;
let manager: string;
let student: string;
let exam: { id: string; versionId: string; verbal: string; quant: string };

type Method = "GET" | "POST" | "PATCH";
function call(token: string | null, method: Method, url: string, payload?: unknown) {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    ...(token === null ? {} : { cookies: { [COOKIE]: token } }),
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
}

const code = (response: { json: () => unknown }) =>
  (response.json() as { error: { code: string } }).error.code;

async function one<T>(rows: Promise<T[]>): Promise<T> {
  const [row] = await rows;
  if (!row) throw new Error("expected a row");
  return row;
}

async function signIn(email: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { identifier: email, password: PASSWORD },
  });
  return response.cookies.find((c) => c.name === COOKIE)?.value ?? "";
}

async function register(label: string, role?: string): Promise<string> {
  const email = e2eEmail(label);
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email, password: PASSWORD },
  });
  if (role) await grantRole(response.json<{ user: { id: string } }>().user.id, role);
  return signIn(email);
}

/** An active exam whose published version has two domains, weighted 1 and 2. */
async function seedExam() {
  const created = await one(e2eSql<{ id: string }[]>`
    INSERT INTO exams (code, slug, name_ar, status)
    VALUES (${e2eExamCode()}, ${`e2e-bp-${randomUUID().slice(0, 8)}`}, 'نماذج', 'ACTIVE')
    RETURNING id`);
  const version = await one(e2eSql<{ id: string }[]>`
    INSERT INTO taxonomy_versions (exam_id, version_code) VALUES (${created.id}, 'v1') RETURNING id`);
  const domain = (codeName: string, name: string, weight: number, order: number) =>
    one(e2eSql<{ id: string }[]>`
      INSERT INTO domains (taxonomy_version_id, code, name, weight, display_order)
      VALUES (${version.id}, ${codeName}, ${name}, ${weight}, ${order}) RETURNING id`);
  const verbal = await domain("V", "لفظي", 1, 0);
  const quant = await domain("Q", "كمي", 2, 1);
  for (const domainId of [verbal.id, quant.id]) {
    await e2eSql`INSERT INTO skills (domain_id, code, name) VALUES (${domainId}, 'S', 'مهارة')`;
  }
  await e2eSql`UPDATE taxonomy_versions SET status = 'PUBLISHED' WHERE id = ${version.id}`;
  return { id: created.id, versionId: version.id, verbal: verbal.id, quant: quant.id };
}

interface BlueprintBody {
  id: string;
  status: string;
  type: string;
  questionCount: number;
  name: string;
  taxonomyVersion: { id: string; status: string };
  domains: { id: string; name: string; taxonomyWeight: number; weight: number | null }[];
}

const create = (examId: string, body: Record<string, unknown> = {}) =>
  call(admin, "POST", `/admin/exams/${examId}/blueprints`, {
    type: "FULL_DIAGNOSTIC",
    code: `FULL-${randomUUID().slice(0, 6).toUpperCase()}`,
    name: "التشخيص الكامل",
    questionCount: 30,
    ...body,
  });

beforeAll(async () => {
  await purgeE2eCatalog();
  await deleteE2eUsers();
  ({ app } = await buildTestApp({
    config: testConfig({ DATABASE_URL: E2E_DATABASE_URL, AUTH_RATE_LIMIT_PER_MINUTE: "10000" }),
  }));
  const adminEmail = e2eEmail("blueprint-admin");
  await app.get(AdminBootstrapService).ensureAdmin({ email: adminEmail, password: PASSWORD });
  admin = await signIn(adminEmail);
  manager = await register("blueprint-manager", "CONTENT_MANAGER");
  student = await register("blueprint-student");
  exam = await seedExam();
});

afterAll(async () => {
  await app.close();
  await purgeE2eCatalog();
  await deleteE2eUsers();
  await e2eSql.end();
});

describe("blueprint management", () => {
  it("is for admins only", async () => {
    const url = `/admin/exams/${exam.id}/blueprints`;
    expect((await call(null, "GET", url)).statusCode).toBe(401);
    expect((await call(student, "GET", url)).statusCode).toBe(403);
    expect((await call(manager, "GET", url)).statusCode).toBe(403);
  });

  it("creates a draft pinned to the published taxonomy version", async () => {
    const response = await create(exam.id);
    expect(response.statusCode).toBe(201);
    const body = response.json<BlueprintBody>();
    expect(body).toMatchObject({
      status: "DRAFT",
      type: "FULL_DIAGNOSTIC",
      questionCount: 30,
      taxonomyVersion: { id: exam.versionId, status: "PUBLISHED" },
    });
    expect(body.domains).toEqual([
      { id: exam.verbal, name: "لفظي", taxonomyWeight: 1, weight: null },
      { id: exam.quant, name: "كمي", taxonomyWeight: 2, weight: null },
    ]);

    const list = await call(admin, "GET", `/admin/exams/${exam.id}/blueprints`);
    expect(list.json<{ items: { id: string }[] }>().items[0]?.id).toBe(body.id);
  });

  it("rejects a duplicate code, an unknown exam and a bad count", async () => {
    await create(exam.id, { code: "DUP" });
    const duplicate = await create(exam.id, { code: "DUP" });
    expect(duplicate.statusCode).toBe(409);
    expect(code(duplicate)).toBe("BLUEPRINT_CODE_TAKEN");

    const unknown = await create(randomUUID());
    expect(unknown.statusCode).toBe(404);
    expect(code(unknown)).toBe("EXAM_NOT_FOUND");

    expect((await create(exam.id, { questionCount: 0 })).statusCode).toBe(400);
    expect((await create(exam.id, { questionCount: 201 })).statusCode).toBe(400);
    expect((await create(exam.id, { type: "PRACTICE" })).statusCode).toBe(400);
  });

  it("edits a draft's name, count and domain weights", async () => {
    const { id } = (await create(exam.id)).json<BlueprintBody>();
    const response = await call(admin, "PATCH", `/admin/blueprints/${id}`, {
      name: "نموذج معدل",
      questionCount: 24,
      domainWeights: [{ domainId: exam.verbal, weight: 0 }],
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<BlueprintBody>();
    expect(body).toMatchObject({ name: "نموذج معدل", questionCount: 24 });
    expect(body.domains.map((d) => d.weight)).toEqual([0, null]);

    const cleared = await call(admin, "PATCH", `/admin/blueprints/${id}`, {
      domainWeights: [{ domainId: exam.verbal, weight: null }],
    });
    expect(cleared.json<BlueprintBody>().domains.map((d) => d.weight)).toEqual([null, null]);
  });

  it("refuses a weight for a domain outside the version, and all-zero weights", async () => {
    const { id } = (await create(exam.id)).json<BlueprintBody>();
    const unknown = await call(admin, "PATCH", `/admin/blueprints/${id}`, {
      domainWeights: [{ domainId: randomUUID(), weight: 1 }],
    });
    expect(unknown.statusCode).toBe(422);
    expect(code(unknown)).toBe("BLUEPRINT_DOMAIN_UNKNOWN");

    const empty = await call(admin, "PATCH", `/admin/blueprints/${id}`, {
      domainWeights: [
        { domainId: exam.verbal, weight: 0 },
        { domainId: exam.quant, weight: 0 },
      ],
    });
    expect(empty.statusCode).toBe(422);
    expect(code(empty)).toBe("BLUEPRINT_WEIGHTS_EMPTY");
  });

  it("activates a draft, archives the previous active one, and audits both", async () => {
    const first = (await create(exam.id, { type: "MINI_DIAGNOSTIC" })).json<BlueprintBody>();
    const second = (await create(exam.id, { type: "MINI_DIAGNOSTIC" })).json<BlueprintBody>();
    const activateFirst = await call(admin, "POST", `/admin/blueprints/${first.id}/activate`);
    expect(activateFirst.json<BlueprintBody>().status).toBe("ACTIVE");

    const activateSecond = await call(admin, "POST", `/admin/blueprints/${second.id}/activate`);
    expect(activateSecond.statusCode).toBe(200);
    expect(activateSecond.json<BlueprintBody>().status).toBe("ACTIVE");
    const reread = await call(admin, "GET", `/admin/blueprints/${first.id}`);
    expect(reread.json<BlueprintBody>().status).toBe("ARCHIVED");

    const audits = await e2eSql<{ action: string }[]>`
      SELECT action FROM audit_logs WHERE resource_id IN (${first.id}, ${second.id})`;
    expect(audits.map((a) => a.action).sort()).toEqual([
      "blueprint.activate",
      "blueprint.activate",
    ]);
  });

  it("leaves exactly one active blueprint when two drafts are activated at once", async () => {
    const other = await seedExam();
    const drafts = await Promise.all(
      [1, 2, 3].map(async () => (await create(other.id)).json<BlueprintBody>().id),
    );
    const responses = await Promise.all(
      drafts.map((id) => call(admin, "POST", `/admin/blueprints/${id}/activate`)),
    );
    expect(responses.map((r) => r.statusCode)).toEqual([200, 200, 200]);
    const [row] = await e2eSql<{ active: number }[]>`
      SELECT count(*)::int AS active FROM assessment_blueprints
      WHERE exam_id = ${other.id} AND status = 'ACTIVE'`;
    expect(row?.active).toBe(1);
  });

  it("keeps an active or archived blueprint read-only", async () => {
    const { id } = (await create(exam.id)).json<BlueprintBody>();
    await call(admin, "POST", `/admin/blueprints/${id}/activate`);
    const edit = await call(admin, "PATCH", `/admin/blueprints/${id}`, { name: "تغيير" });
    expect(edit.statusCode).toBe(409);
    expect(code(edit)).toBe("BLUEPRINT_NOT_EDITABLE");

    const archived = await call(admin, "POST", `/admin/blueprints/${id}/archive`);
    expect(archived.json<BlueprintBody>().status).toBe("ARCHIVED");
    const reactivate = await call(admin, "POST", `/admin/blueprints/${id}/activate`);
    expect(reactivate.statusCode).toBe(409);
    expect(code(reactivate)).toBe("BLUEPRINT_NOT_EDITABLE");
  });

  it("refuses to activate a draft whose taxonomy version is no longer published", async () => {
    const other = await seedExam();
    const { id } = (await create(other.id)).json<BlueprintBody>();
    const next = await one(e2eSql<{ id: string }[]>`
      INSERT INTO taxonomy_versions (exam_id, version_code) VALUES (${other.id}, 'v2') RETURNING id`);
    await e2eSql`UPDATE taxonomy_versions SET status = 'ARCHIVED' WHERE id = ${other.versionId}`;
    await e2eSql`UPDATE taxonomy_versions SET status = 'PUBLISHED' WHERE id = ${next.id}`;

    const response = await call(admin, "POST", `/admin/blueprints/${id}/activate`);
    expect(response.statusCode).toBe(409);
    expect(code(response)).toBe("BLUEPRINT_TAXONOMY_NOT_PUBLISHED");
  });

  it("reports an unknown blueprint as not found", async () => {
    const response = await call(admin, "GET", `/admin/blueprints/${randomUUID()}`);
    expect(response.statusCode).toBe(404);
    expect(code(response)).toBe("BLUEPRINT_NOT_FOUND");
  });
});
