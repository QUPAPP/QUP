import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AdminBootstrapService } from "../../src/modules/auth/application/admin-bootstrap.service.js";
import {
  deleteE2eUsers,
  E2E_DATABASE_URL,
  e2eEmail,
  e2eSql,
  grantRole,
  purgeE2eCatalog,
} from "../support/e2e-database.js";
import { type LiveExam, liveExam } from "../support/live-exam.js";
import { buildTestApp, testConfig } from "../support/test-app.js";

/** A3: QUESTION_BANK_IMPORT.md "Structured Import", "Import Report", "Duplicate Detection". */

const COOKIE = "qup_session";
const PASSWORD = "import test passphrase";
const STORAGE = join(tmpdir(), `qup-import-e2e-${process.pid}`);

let app: NestFastifyApplication;
let manager: { token: string; id: string };
let student: string;
let exam: LiveExam;

/** Six rows: one ready, three invalid, one duplicate of the bank, one of an earlier row. */
const CSV = [
  "السؤال,الخيار أ,الخيار ب,الخيار ج,الإجابة الصحيحة,المهارة,الصعوبة,المصدر",
  "كم يساوي ٢+٢؟,ثلاثة,أربعة,خمسة,ب,VERBAL-S1,سهل,كتاب التدريب ص ٣",
  "سؤال 0,أ1,ب1,,أ,QUANT-S1,,",
  "سؤال جديد,نعم,لا,,د,VERBAL-S1,,",
  ",س,ص,,أ,QUANT-S1,,",
  "كم يساوي ٢ + ٢,واحد,اثنان,,أ,VERBAL-S1,,",
  "سؤال آخر,أ,ب,,ب,مهارة غائبة,,",
].join("\n");

const MAPPING = {
  stem: "السؤال",
  options: ["الخيار أ", "الخيار ب", "الخيار ج"],
  correctAnswer: "الإجابة الصحيحة",
  skill: "المهارة",
  difficulty: "الصعوبة",
  source: "المصدر",
};

interface Batch {
  id: string;
  status: string;
  headers: string[];
  suggestedMapping: Record<string, unknown>;
  totals: {
    detected: number;
    valid: number;
    invalid: number;
    duplicate: number;
    imported: number;
    skipped: number;
    errors: Record<string, number>;
  };
}

interface Item {
  id: string;
  sourceLocator: string;
  status: string;
  errors: string[];
  duplicateOfQuestionId: string | null;
  resultingQuestionVersionId: string | null;
}

function call(token: string | null, method: "GET" | "POST", url: string, payload?: object) {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    ...(token === null ? {} : { cookies: { [COOKIE]: token } }),
    ...(payload ? { payload: payload as Record<string, unknown> } : {}),
  });
}

const errorOf = (r: { json: () => unknown }) =>
  (r.json() as { error: { code: string; details?: Record<string, unknown> } }).error;

const upload = (token: string, filename: string, content: string | Uint8Array) =>
  call(token, "POST", "/admin/imports/upload", {
    filename,
    contentBase64: Buffer.from(content).toString("base64"),
  });

async function items(batchId: string, status?: string): Promise<Item[]> {
  const query = status ? `?status=${status}` : "";
  return (await call(manager.token, "GET", `/admin/imports/${batchId}/items${query}`)).json<{
    items: Item[];
  }>().items;
}

async function signIn(email: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { identifier: email, password: PASSWORD },
  });
  return response.cookies.find((c) => c.name === COOKIE)?.value ?? "";
}

beforeAll(async () => {
  await purgeE2eCatalog();
  await deleteE2eUsers();
  ({ app } = await buildTestApp({
    config: testConfig({
      DATABASE_URL: E2E_DATABASE_URL,
      AUTH_RATE_LIMIT_PER_MINUTE: "10000",
      IMPORT_STORAGE_DIR: STORAGE,
    }),
  }));
  const managerEmail = e2eEmail("import-manager");
  const registered = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email: managerEmail, password: PASSWORD },
  });
  const managerId = registered.json<{ user: { id: string } }>().user.id;
  await grantRole(managerId, "CONTENT_MANAGER");
  manager = { token: await signIn(managerEmail), id: managerId };
  const studentEmail = e2eEmail("import-student");
  await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email: studentEmail, password: PASSWORD },
  });
  student = await signIn(studentEmail);
  await app.get(AdminBootstrapService).ensureAdmin({
    email: e2eEmail("import-admin"),
    password: PASSWORD,
  });
  // Two skills (VERBAL-S1, QUANT-S1); the bank already holds "سؤال 0".
  exam = await liveExam(1);
});

afterAll(async () => {
  await app.close();
  await purgeE2eCatalog();
  await deleteE2eUsers();
  await e2eSql.end();
  await rm(STORAGE, { recursive: true, force: true });
});

describe("structured import", () => {
  it("is for those who write questions", async () => {
    expect((await call(null, "GET", "/admin/imports")).statusCode).toBe(401);
    expect((await call(student, "GET", "/admin/imports")).statusCode).toBe(403);
    expect((await call(manager.token, "GET", "/admin/imports")).statusCode).toBe(200);
  });

  it("refuses files it cannot read safely", async () => {
    const unsupported = await upload(manager.token, "bank.docx", "x");
    expect(unsupported.statusCode).toBe(422);
    expect(errorOf(unsupported).code).toBe("IMPORT_FILE_TYPE_UNSUPPORTED");

    const malformed = await upload(manager.token, "bank.json", "{not json");
    expect(errorOf(malformed)).toMatchObject({
      code: "IMPORT_FILE_INVALID",
      details: { reason: "MALFORMED" },
    });

    const large = await upload(manager.token, "big.csv", `h\n${"x".repeat(2_100_000)}`);
    expect(large.statusCode).toBe(422);
    expect(errorOf(large).code).toBe("IMPORT_FILE_TOO_LARGE");
  });

  it("uploads, maps, reports, resolves and creates drafts with provenance, once", async () => {
    const uploaded = await upload(manager.token, "بنك القدرات.csv", CSV);
    expect(uploaded.statusCode).toBe(201);
    const batch = uploaded.json<Batch>();
    expect(batch.status).toBe("UPLOADED");
    expect(batch.headers).toHaveLength(8);
    expect(batch.suggestedMapping).toEqual({ ...MAPPING });
    expect(batch.totals.detected).toBe(6);

    const badMapping = await call(manager.token, "POST", `/admin/imports/${batch.id}/process`, {
      taxonomyVersionId: exam.versionId,
      mapping: { ...MAPPING, stem: "عمود غير موجود" },
    });
    expect(badMapping.statusCode).toBe(422);
    expect(errorOf(badMapping)).toMatchObject({
      code: "IMPORT_MAPPING_INVALID",
      details: { fields: ["stem"] },
    });

    const processed = await call(manager.token, "POST", `/admin/imports/${batch.id}/process`, {
      taxonomyVersionId: exam.versionId,
      mapping: MAPPING,
    });
    expect(processed.statusCode).toBe(200);
    expect(processed.json<Batch>()).toMatchObject({
      status: "READY_FOR_REVIEW",
      totals: {
        detected: 6,
        valid: 1,
        invalid: 3,
        duplicate: 2,
        imported: 0,
        skipped: 0,
        errors: {
          CORRECT_ANSWER_UNKNOWN: 1,
          STEM_MISSING: 1,
          SKILL_UNKNOWN: 1,
          DUPLICATE_IN_BANK: 1,
          DUPLICATE_IN_FILE: 1,
        },
      },
    });

    const duplicates = await items(batch.id, "DUPLICATE");
    const inBank = duplicates.find((item) => item.errors.includes("DUPLICATE_IN_BANK"));
    const inFile = duplicates.find((item) => item.errors.includes("DUPLICATE_IN_FILE"));
    expect(inBank?.duplicateOfQuestionId).toEqual(expect.any(String));
    expect(inFile?.sourceLocator).toBe("row 6");

    const included = await call(
      manager.token,
      "POST",
      `/admin/import-items/${inFile?.id}/resolve`,
      {
        action: "INCLUDE",
      },
    );
    expect(included.json<Item>().status).toBe("VALID");
    const [invalid] = await items(batch.id, "INVALID");
    const refused = await call(
      manager.token,
      "POST",
      `/admin/import-items/${invalid?.id}/resolve`,
      {
        action: "INCLUDE",
      },
    );
    expect(refused.statusCode).toBe(409);
    expect(errorOf(refused).code).toBe("IMPORT_ITEM_NOT_RESOLVABLE");
    const skipped = await call(
      manager.token,
      "POST",
      `/admin/import-items/${invalid?.id}/resolve`,
      {
        action: "SKIP",
      },
    );
    expect(skipped.json<Item>().status).toBe("SKIPPED");

    const [first, second] = await Promise.all([
      call(manager.token, "POST", `/admin/imports/${batch.id}/create-drafts`),
      call(manager.token, "POST", `/admin/imports/${batch.id}/create-drafts`),
    ]);
    expect([first.statusCode, second.statusCode]).toEqual([200, 200]);
    const done = (await call(manager.token, "GET", `/admin/imports/${batch.id}`)).json<Batch>();
    expect(done).toMatchObject({ status: "COMPLETED", totals: { imported: 2, skipped: 1 } });

    const imported = await items(batch.id, "IMPORTED");
    const versionIds = imported.map((item) => item.resultingQuestionVersionId ?? "");
    const versions = await e2eSql<
      {
        status: string;
        source_type: string;
        source_reference: string;
        difficulty_author_score: string;
        created_by: string;
      }[]
    >`
      SELECT qv.status, qv.source_type, qv.source_reference, qv.difficulty_author_score, q.created_by
      FROM question_versions qv JOIN questions q ON q.id = qv.question_id
      WHERE qv.id IN ${e2eSql(versionIds)}
      ORDER BY qv.source_reference`;
    expect(versions).toHaveLength(2);
    expect(versions.every((v) => v.status === "DRAFT" && v.source_type === "IMPORT")).toBe(true);
    expect(versions.every((v) => v.created_by === manager.id)).toBe(true);
    expect(versions.map((v) => v.source_reference).sort()).toEqual(
      ["بنك القدرات.csv · row 6", "كتاب التدريب ص ٣"].sort(),
    );
    expect(versions.map((v) => Number(v.difficulty_author_score)).sort()).toEqual([0.25, 0.5]);

    const again = await call(manager.token, "POST", `/admin/imports/${batch.id}/process`, {
      taxonomyVersionId: exam.versionId,
      mapping: MAPPING,
    });
    expect(again.statusCode).toBe(409);
    expect(errorOf(again).code).toBe("IMPORT_ALREADY_IMPORTED");
  });

  it("reads a JSON array through the same mapping flow", async () => {
    const json = JSON.stringify([
      { question: "سؤال بصيغة JSON", a: "صح", b: "خطأ", answer: "a", skill: "QUANT-S1" },
    ]);
    const batch = (await upload(manager.token, "bank.json", json)).json<Batch>();
    expect(batch.suggestedMapping).toMatchObject({ stem: "question", options: ["a", "b"] });
    const processed = await call(manager.token, "POST", `/admin/imports/${batch.id}/process`, {
      taxonomyVersionId: exam.versionId,
      mapping: { stem: "question", options: ["a", "b"], correctAnswer: "answer", skill: "skill" },
    });
    expect(processed.json<Batch>().totals).toMatchObject({ valid: 1, invalid: 0 });
  });
});
