import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { FakeAiProvider } from "@qup/ai-gateway";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AI_PROVIDER } from "../../src/modules/ai/ai.contract.js";
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

/** C3: AI_INTEGRATION.md — advisory AI for question authors through the gateway. */

const COOKIE = "qup_session";
const PASSWORD = "ai assistance passphrase";

let app: NestFastifyApplication;
let admin: string;
let manager: { token: string; id: string; email: string };
let student: string;
let taxonomy: { versionId: string; analogyId: string; synonymsId: string; verbsId: string };
let draftId: string;

function call(
  target: NestFastifyApplication,
  token: string | null,
  method: "GET" | "POST",
  url: string,
  payload?: object,
) {
  return target.inject({
    method,
    url: `/api/v1${url}`,
    ...(token === null ? {} : { cookies: { [COOKIE]: token } }),
    ...(payload ? { payload: payload as Record<string, unknown> } : {}),
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

async function register(label: string) {
  const email = e2eEmail(label);
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email, password: PASSWORD },
  });
  return {
    email,
    token: response.cookies.find((c) => c.name === COOKIE)?.value ?? "",
    id: response.json<{ user: { id: string } }>().user.id,
  };
}

/** A published taxonomy: «التناظر اللفظي», and «المرادفات» with the subskill «مرادفات الأفعال». */
async function createTaxonomy() {
  const [exam] = await e2eSql<{ id: string }[]>`
    INSERT INTO exams (code, slug, name_ar)
    VALUES (${e2eExamCode()}, ${`e2e-ai-${Date.now()}`}, 'ذكاء')
    RETURNING id`;
  const [version] = await e2eSql<{ id: string }[]>`
    INSERT INTO taxonomy_versions (exam_id, version_code) VALUES (${exam?.id ?? ""}, 'v1') RETURNING id`;
  const versionId = version?.id ?? "";
  const [domain] = await e2eSql<{ id: string }[]>`
    INSERT INTO domains (taxonomy_version_id, code, name) VALUES (${versionId}, 'V', 'لفظي') RETURNING id`;
  const [analogy] = await e2eSql<{ id: string }[]>`
    INSERT INTO skills (domain_id, code, name)
    VALUES (${domain?.id ?? ""}, 'ANALOGY', 'التناظر اللفظي') RETURNING id`;
  const [synonyms] = await e2eSql<{ id: string }[]>`
    INSERT INTO skills (domain_id, code, name)
    VALUES (${domain?.id ?? ""}, 'SYNONYMS', 'المرادفات') RETURNING id`;
  const [verbs] = await e2eSql<{ id: string }[]>`
    INSERT INTO subskills (skill_id, code, name)
    VALUES (${synonyms?.id ?? ""}, 'VERBS', 'مرادفات الأفعال') RETURNING id`;
  await e2eSql`UPDATE taxonomy_versions SET status = 'PUBLISHED' WHERE id = ${versionId}`;
  return {
    versionId,
    analogyId: analogy?.id ?? "",
    synonymsId: synonyms?.id ?? "",
    verbsId: verbs?.id ?? "",
  };
}

const text = (value: string) => ({ blocks: [{ type: "text", text: value }] });

async function createDraft(stem: string): Promise<string> {
  const response = await call(app, manager.token, "POST", "/admin/questions", {
    content: {
      questionType: "SINGLE_CHOICE",
      stem: text(stem),
      difficulty: 0.5,
      taxonomyVersionId: taxonomy.versionId,
      options: [
        { key: "A", content: text("بطيء"), isCorrect: false },
        { key: "B", content: text("عاجل"), isCorrect: true },
      ],
      mappings: [{ skillId: taxonomy.analogyId, role: "PRIMARY" }],
    },
  });
  expect(response.statusCode, response.payload).toBe(201);
  return response.json<{ id: string }>().id;
}

async function runsOf(versionId: string) {
  return e2eSql<
    {
      task: string;
      status: string;
      prompt_version: string;
      error_code: string | null;
      requested_by: string | null;
      output: unknown;
    }[]
  >`
    SELECT task, status, prompt_version, error_code, requested_by, output
    FROM ai_runs WHERE subject_type = 'question_version' AND subject_id = ${versionId}
    ORDER BY created_at`;
}

const testOptions = { DATABASE_URL: E2E_DATABASE_URL, AUTH_RATE_LIMIT_PER_MINUTE: "10000" };

beforeAll(async () => {
  await purgeE2eCatalog();
  await deleteE2eUsers();
  ({ app } = await buildTestApp({ config: testConfig(testOptions) }));
  const adminEmail = e2eEmail("ai-admin");
  await app.get(AdminBootstrapService).ensureAdmin({ email: adminEmail, password: PASSWORD });
  admin = await signIn(adminEmail);
  manager = await register("ai-manager");
  await grantRole(manager.id, "CONTENT_MANAGER");
  manager.token = await signIn(manager.email);
  student = (await register("ai-student")).token;
  taxonomy = await createTaxonomy();
  draftId = await createDraft("سؤال في المرادفات: ما مرادف سريع؟");
});

afterAll(async () => {
  await app.close();
  await purgeE2eCatalog();
  await deleteE2eUsers();
  await e2eSql.end();
});

describe("AI assistance for authors", () => {
  it("is for question authors; the run log is for admins", async () => {
    const suggest = `/admin/question-versions/${draftId}/ai/metadata-suggestion`;
    expect((await call(app, null, "GET", "/admin/ai/status")).statusCode).toBe(401);
    expect((await call(app, student, "GET", "/admin/ai/status")).statusCode).toBe(403);
    expect((await call(app, student, "POST", suggest)).statusCode).toBe(403);
    expect((await call(app, manager.token, "GET", "/admin/ai/runs")).statusCode).toBe(403);

    const status = await call(app, manager.token, "GET", "/admin/ai/status");
    expect(status.statusCode).toBe(200);
    expect(status.json()).toEqual({
      enabled: true,
      provider: "fake",
      tasks: ["suggest_question_metadata", "draft_explanation"],
    });
  });

  it("suggests a skill of the question's taxonomy and a difficulty", async () => {
    const response = await call(
      app,
      manager.token,
      "POST",
      `/admin/question-versions/${draftId}/ai/metadata-suggestion`,
    );
    expect(response.statusCode).toBe(200);
    const { suggestion } = response.json<{
      suggestion: {
        skillId: string | null;
        subskillId: string | null;
        nodeName: string;
        difficulty: number;
        rationale: string;
      };
    }>();
    expect(suggestion).toMatchObject({
      skillId: taxonomy.synonymsId,
      subskillId: null,
      nodeName: "المرادفات",
      difficulty: 0.25,
    });
    expect(suggestion.rationale.length).toBeGreaterThan(0);

    const [run] = await runsOf(draftId);
    expect(run).toMatchObject({
      task: "suggest_question_metadata",
      status: "SUCCEEDED",
      prompt_version: "metadata-v1",
      error_code: null,
      requested_by: manager.id,
    });
    expect(run?.output).toMatchObject({ nodeId: taxonomy.synonymsId, difficulty: "EASY" });
  });

  it("can suggest a subskill", async () => {
    const versionId = await createDraft("سؤال عن مرادفات الأفعال: ما مرادف أسرع؟");
    const response = await call(
      app,
      manager.token,
      "POST",
      `/admin/question-versions/${versionId}/ai/metadata-suggestion`,
    );
    expect(response.json()).toMatchObject({
      suggestion: {
        skillId: null,
        subskillId: taxonomy.verbsId,
        nodeName: "المرادفات › مرادفات الأفعال",
      },
    });
  });

  it("drafts an explanation of the saved answer", async () => {
    const response = await call(
      app,
      manager.token,
      "POST",
      `/admin/question-versions/${draftId}/ai/explanation-draft`,
    );
    expect(response.statusCode).toBe(200);
    const { draft } = response.json<{ draft: { explanation: string } }>();
    expect(draft.explanation).toContain("(B) «عاجل»");
    const runs = await runsOf(draftId);
    expect(runs.map((r) => [r.task, r.status])).toContainEqual(["draft_explanation", "SUCCEEDED"]);
  });

  it("refuses versions that are missing or no longer drafts", async () => {
    const missing = await call(
      app,
      manager.token,
      "POST",
      "/admin/question-versions/00000000-0000-4000-8000-000000000000/ai/explanation-draft",
    );
    expect(missing.statusCode).toBe(404);
    expect(errorCode(missing)).toBe("QUESTION_VERSION_NOT_FOUND");

    const versionId = await createDraft("سؤال أُرسل للمراجعة");
    expect(
      (
        await call(
          app,
          manager.token,
          "POST",
          `/admin/question-versions/${versionId}/submit-review`,
        )
      ).statusCode,
    ).toBe(204);
    const submitted = await call(
      app,
      manager.token,
      "POST",
      `/admin/question-versions/${versionId}/ai/explanation-draft`,
    );
    expect(submitted.statusCode).toBe(409);
    expect(errorCode(submitted)).toBe("AI_REQUIRES_DRAFT");
    expect(await runsOf(versionId)).toEqual([]);
  });

  it("lists recent runs for admins without their output", async () => {
    const response = await call(app, admin, "GET", "/admin/ai/runs?limit=50");
    expect(response.statusCode).toBe(200);
    const body = response.json<{
      items: {
        task: string;
        status: string;
        subjectId: string;
        requestedBy: { id: string; email: string | null } | null;
        attempts: number;
        latencyMs: number;
      }[];
      last24h: Record<string, number>;
      page: { limit: number; offset: number; hasMore: boolean };
    }>();
    const ours = body.items.filter((run) => run.subjectId === draftId);
    expect(ours.length).toBeGreaterThanOrEqual(2);
    expect(ours[0]?.requestedBy).toMatchObject({
      id: manager.id,
      email: manager.email,
    });
    expect(body.last24h.SUCCEEDED).toBeGreaterThanOrEqual(3);
    expect(Object.keys(body.last24h).sort()).toEqual([
      "FAILED",
      "INVALID_OUTPUT",
      "SUCCEEDED",
      "TIMED_OUT",
    ]);
    expect(response.payload).not.toContain('"output"');
  });
});

describe("when the provider misbehaves", () => {
  let flaky: NestFastifyApplication;

  beforeAll(async () => {
    ({ app: flaky } = await buildTestApp({
      config: testConfig({ ...testOptions, AI_TIMEOUT_MS: "100", AI_RATE_LIMIT_PER_MINUTE: "3" }),
      overrides: [
        {
          provide: AI_PROVIDER,
          useValue: new FakeAiProvider({ failures: ["wrong-answer", "wrong-answer", "timeout"] }),
        },
      ],
    }));
  });

  afterAll(async () => {
    await flaky.close();
  });

  it("answers with stable codes, records each run, and limits the rate", async () => {
    const versionId = await createDraft("سؤال لاختبار الأعطال");
    const url = (task: string) => `/admin/question-versions/${versionId}/ai/${task}`;

    const invalid = await call(flaky, manager.token, "POST", url("explanation-draft"));
    expect(invalid.statusCode).toBe(503);
    expect(errorCode(invalid)).toBe("AI_OUTPUT_INVALID");

    const timedOut = await call(flaky, manager.token, "POST", url("metadata-suggestion"));
    expect(timedOut.statusCode).toBe(503);
    expect(errorCode(timedOut)).toBe("AI_TIMEOUT");

    expect((await call(flaky, manager.token, "POST", url("metadata-suggestion"))).statusCode).toBe(
      200,
    );
    const limited = await call(flaky, manager.token, "POST", url("metadata-suggestion"));
    expect(limited.statusCode).toBe(429);

    const runs = await runsOf(versionId);
    expect(runs.map((r) => [r.status, r.error_code, r.output === null])).toEqual([
      ["INVALID_OUTPUT", "ANSWER_MISMATCH", true],
      ["TIMED_OUT", "TIMEOUT", true],
      ["SUCCEEDED", null, false],
    ]);
  });
});

describe("when AI is turned off", () => {
  let off: NestFastifyApplication;

  beforeAll(async () => {
    ({ app: off } = await buildTestApp({
      config: testConfig({ ...testOptions, AI_PROVIDER: "disabled" }),
    }));
  });

  afterAll(async () => {
    await off.close();
  });

  it("says so, refuses with AI_UNAVAILABLE and records nothing", async () => {
    expect((await call(off, manager.token, "GET", "/admin/ai/status")).json()).toEqual({
      enabled: false,
      provider: null,
      tasks: [],
    });
    const versionId = await createDraft("سؤال والذكاء الاصطناعي متوقف");
    const response = await call(
      off,
      manager.token,
      "POST",
      `/admin/question-versions/${versionId}/ai/metadata-suggestion`,
    );
    expect(response.statusCode).toBe(503);
    expect(errorCode(response)).toBe("AI_UNAVAILABLE");
    expect(await runsOf(versionId)).toEqual([]);
  });
});
