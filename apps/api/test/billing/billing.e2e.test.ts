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
  purgeE2eCatalog,
} from "../support/e2e-database.js";
import {
  FAKE_STREAM_API_KEY,
  FAKE_STREAM_WEBHOOK_SECRET,
  type FakeStream,
  startFakeStream,
  streamWebhook,
} from "../support/fake-stream.js";
import { TERMS_VERSION } from "../support/terms.js";
import { buildTestApp, testConfig } from "../support/test-app.js";

/**
 * Billing end to end (WORKFLOWS.md §10): plan → checkout → signed webhook →
 * payment settled and entitlement granted. Stream is a local fake speaking
 * its documented wire format; the database is real.
 */

const COOKIE = "qup_session";
const PASSWORD = "billing test passphrase";
const PRICE = 19_900;
const DAY_MS = 86_400_000;

let app: NestFastifyApplication;
let stream: FakeStream;
let admin: string;
let studentA: string;
let studentAId: string;
let studentB: string;
let studentAEmail: string;

type Method = "GET" | "POST" | "PATCH";

function call(
  token: string,
  method: Method,
  url: string,
  options: { payload?: unknown; key?: string } = {},
) {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    cookies: { [COOKIE]: token },
    headers: options.key ? { "idempotency-key": options.key } : {},
    ...(options.payload === undefined
      ? {}
      : { payload: options.payload as Record<string, unknown> }),
  });
}

const errorCode = (r: { json: () => unknown }) =>
  (r.json() as { error: { code: string } }).error.code;

async function register(label: string): Promise<{ token: string; id: string; email: string }> {
  const email = e2eEmail(label);
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email, password: PASSWORD, acceptedTermsVersion: TERMS_VERSION },
  });
  return {
    token: response.cookies.find((c) => c.name === COOKIE)?.value ?? "",
    id: response.json<{ user: { id: string } }>().user.id,
    email,
  };
}

async function exam(status: "DRAFT" | "ACTIVE" | "ARCHIVED" = "ACTIVE"): Promise<string> {
  const [row] = await e2eSql<{ id: string }[]>`
    INSERT INTO exams (code, slug, name_ar, status)
    VALUES (${e2eExamCode()}, ${`e2e-b-${randomUUID().slice(0, 8)}`}, 'اختبار', ${status}::exam_status)
    RETURNING id`;
  if (!row) throw new Error("exam insert returned no row");
  return row.id;
}

const planBody = (examIds: string | string[], overrides: Record<string, unknown> = {}) => ({
  examIds: Array.isArray(examIds) ? examIds : [examIds],
  code: `E2E-PLAN-${randomUUID().slice(0, 8).toUpperCase()}`,
  name: "باقة القدرات",
  priceMinor: PRICE,
  currency: "SAR",
  durationDays: 90,
  ...overrides,
});

async function activePlan(examIds: string[], overrides: Record<string, unknown> = {}) {
  const created = await call(admin, "POST", "/admin/plans", {
    payload: planBody(examIds, overrides),
  });
  expect(created.statusCode).toBe(201);
  const planId = created.json<{ id: string }>().id;
  expect((await call(admin, "POST", `/admin/plans/${planId}/activate`)).statusCode).toBe(200);
  return planId;
}

/** An ACTIVE plan on a new ACTIVE exam. */
async function planOnSale(
  overrides: Record<string, unknown> = {},
): Promise<{ planId: string; examId: string }> {
  const examId = await exam();
  return { planId: await activePlan([examId], overrides), examId };
}

interface PaymentBody {
  id: string;
  status: string;
  checkoutUrl: string | null;
  amount: { amountMinor: number; currency: string };
}

async function checkout(token: string, planId: string, key = randomUUID()) {
  return call(token, "POST", "/payments", { key, payload: { planId } });
}

/** A student with an open checkout; returns what Stream knows it as. */
async function openCheckout(token: string) {
  const { planId, examId } = await planOnSale();
  const response = await checkout(token, planId);
  expect(response.statusCode).toBe(201);
  const payment = response.json<PaymentBody>();
  const link = stream.links.at(-1);
  if (!link) throw new Error("no payment link was created");
  return { planId, examId, payment, linkId: link.id };
}

function deliver(event: Parameters<typeof streamWebhook>[0], secret?: string, provider = "stream") {
  const delivery = streamWebhook(event, secret);
  return app.inject({
    method: "POST",
    url: `/api/v1/payments/webhooks/${provider}`,
    headers: delivery.headers,
    payload: delivery.payload,
  });
}

/** Stream reports the payment as paid in full, and tells us so. */
async function pay(open: { payment: PaymentBody; linkId: string }, amountMinor = PRICE) {
  const providerPaymentId = randomUUID();
  stream.setPayment(providerPaymentId, { amount_in_smallest_unit: amountMinor });
  const response = await deliver({
    eventType: "PAYMENT_SUCCEEDED",
    paymentId: providerPaymentId,
    linkId: open.linkId,
    metadata: { qup_payment_id: open.payment.id },
  });
  return { response, providerPaymentId };
}

const paymentStatus = async (token: string, id: string) =>
  (await call(token, "GET", `/payments/${id}`)).json<PaymentBody>().status;

const access = async (token: string, examId: string) =>
  (await call(token, "GET", `/exams/${examId}/my-access`)).json<{
    hasAccess: boolean;
    activeUntil: string | null;
  }>();

const entitlementCount = async (examId: string) =>
  (
    await e2eSql<{ n: number }[]>`
      SELECT count(1)::int AS n FROM entitlements WHERE exam_id = ${examId}`
  )[0]?.n;

const auditActions = async (resourceId: string) =>
  (
    await e2eSql<{ action: string }[]>`
      SELECT action FROM audit_logs WHERE resource_id = ${resourceId} ORDER BY created_at`
  ).map((r) => r.action);

beforeAll(async () => {
  await purgeE2eCatalog();
  await deleteE2eUsers();
  stream = await startFakeStream();
  ({ app } = await buildTestApp({
    config: testConfig({
      DATABASE_URL: E2E_DATABASE_URL,
      AUTH_RATE_LIMIT_PER_MINUTE: "10000",
      BODY_LIMIT_BYTES: "16384",
      STREAM_API_KEY: FAKE_STREAM_API_KEY,
      STREAM_WEBHOOK_SECRET: FAKE_STREAM_WEBHOOK_SECRET,
      STREAM_API_BASE_URL: stream.baseUrl,
    }),
  }));

  const adminEmail = e2eEmail("billing-admin");
  await app.get(AdminBootstrapService).ensureAdmin({ email: adminEmail, password: PASSWORD });
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { identifier: adminEmail, password: PASSWORD },
  });
  admin = login.cookies.find((c) => c.name === COOKIE)?.value ?? "";

  const a = await register("billing-a");
  studentA = a.token;
  studentAId = a.id;
  studentAEmail = a.email;
  studentB = (await register("billing-b")).token;
});

afterAll(async () => {
  await app.close();
  await stream.close();
  await purgeE2eCatalog();
  await deleteE2eUsers();
  await e2eSql.end();
});

describe("plans", () => {
  it("lets only billing managers manage plans", async () => {
    const examId = await exam();
    for (const response of [
      await call(studentA, "GET", "/admin/plans"),
      await call(studentA, "POST", "/admin/plans", { payload: planBody(examId) }),
      await call(studentA, "POST", `/admin/plans/${randomUUID()}/activate`),
    ]) {
      expect(response.statusCode).toBe(403);
    }
  });

  it("keeps a draft plan off sale until it is activated, and audits the activation", async () => {
    const examId = await exam();
    const created = await call(admin, "POST", "/admin/plans", { payload: planBody(examId) });
    expect(created.statusCode).toBe(201);
    const plan = created.json<{ id: string; status: string }>();
    expect(plan.status).toBe("DRAFT");

    const forSale = () => call(studentA, "GET", `/exams/${examId}/plans`);
    expect((await forSale()).json()).toEqual({ items: [] });

    const activated = await call(admin, "POST", `/admin/plans/${plan.id}/activate`);
    expect(activated.json()).toMatchObject({ status: "ACTIVE" });
    expect((await forSale()).json()).toEqual({
      items: [
        {
          id: plan.id,
          name: "باقة القدرات",
          description: null,
          features: [],
          highlighted: false,
          price: { amountMinor: PRICE, currency: "SAR" },
          compareAtPrice: null,
          durationDays: 90,
          exams: [{ id: examId, nameAr: "اختبار" }],
          isBundle: false,
        },
      ],
    });
    expect(await auditActions(plan.id)).toEqual(["plan.activate"]);
  });

  it("offers no plans for an exam that is not offered", async () => {
    const { examId } = await planOnSale();
    await e2eSql`UPDATE exams SET status = 'ARCHIVED' WHERE id = ${examId}`;
    expect((await call(studentA, "GET", `/exams/${examId}/plans`)).json()).toEqual({ items: [] });
  });

  it("rejects a duplicate code, an unknown exam and a fractional price", async () => {
    const examId = await exam();
    const body = planBody(examId);
    await call(admin, "POST", "/admin/plans", { payload: body });

    const duplicate = await call(admin, "POST", "/admin/plans", { payload: body });
    expect(duplicate.statusCode).toBe(409);
    expect(errorCode(duplicate)).toBe("PLAN_CODE_TAKEN");

    const noExam = await call(admin, "POST", "/admin/plans", { payload: planBody(randomUUID()) });
    expect(errorCode(noExam)).toBe("EXAM_NOT_FOUND");

    const float = await call(admin, "POST", "/admin/plans", {
      payload: planBody(examId, { priceMinor: 199.5 }),
    });
    expect(float.statusCode).toBe(400);
  });

  it("refuses to sell below the provider's minimum or in an unsupported currency", async () => {
    const examId = await exam();
    for (const overrides of [{ priceMinor: 99 }, { currency: "KWD" }]) {
      const created = await call(admin, "POST", "/admin/plans", {
        payload: planBody(examId, overrides),
      });
      const activation = await call(
        admin,
        "POST",
        `/admin/plans/${created.json<{ id: string }>().id}/activate`,
      );
      expect(activation.statusCode).toBe(422);
      expect(errorCode(activation)).toBe("PLAN_NOT_SELLABLE");
    }
  });

  it("lets an offered plan's price and features change, audited, but not its exams", async () => {
    const { planId, examId } = await planOnSale();

    const edit = await call(admin, "PATCH", `/admin/plans/${planId}`, {
      payload: {
        priceMinor: 14_900,
        compareAtPriceMinor: PRICE,
        features: ["التشخيص الكامل", "  ", "التدريب التكيفي"],
        highlighted: true,
      },
    });
    expect(edit.statusCode).toBe(200);
    expect(edit.json()).toMatchObject({
      status: "ACTIVE",
      price: { amountMinor: 14_900 },
      compareAtPrice: { amountMinor: PRICE },
      features: ["التشخيص الكامل", "التدريب التكيفي"],
      highlighted: true,
    });
    const [audit] = await e2eSql<{ metadata_redacted: Record<string, unknown> }[]>`
      SELECT metadata_redacted FROM audit_logs
      WHERE resource_id = ${planId} AND action = 'plan.update'`;
    expect(audit?.metadata_redacted).toMatchObject({
      "priceMinor.before": PRICE,
      "priceMinor.after": 14_900,
      "highlighted.after": true,
    });

    const exams = await call(admin, "PATCH", `/admin/plans/${planId}`, {
      payload: { examIds: [await exam()] },
    });
    expect(exams.statusCode).toBe(422);
    expect(errorCode(exams)).toBe("PLAN_FIELDS_LOCKED");

    // A no-op edit changes nothing and is not audited.
    await call(admin, "PATCH", `/admin/plans/${planId}`, { payload: { priceMinor: 14_900 } });
    expect(await auditActions(planId)).toEqual(["plan.activate", "plan.update"]);
    expect((await call(studentA, "GET", `/exams/${examId}/plans`)).json()).toMatchObject({
      items: [{ price: { amountMinor: 14_900 } }],
    });
  });

  it("keeps an offered plan's price at or above what the provider can charge", async () => {
    const { planId } = await planOnSale();
    const edit = await call(admin, "PATCH", `/admin/plans/${planId}`, {
      payload: { priceMinor: 50 },
    });
    expect(edit.statusCode).toBe(422);
    expect(errorCode(edit)).toBe("PLAN_NOT_SELLABLE");
  });

  it("refuses a 'was' price that is not above the price", async () => {
    const { planId } = await planOnSale();
    const edit = await call(admin, "PATCH", `/admin/plans/${planId}`, {
      payload: { compareAtPriceMinor: PRICE },
    });
    expect(edit.statusCode).toBe(422);
    expect(errorCode(edit)).toBe("PLAN_CONTENT_INVALID");
  });

  it("retires a plan for good, and then keeps it as it was", async () => {
    const { planId, examId } = await planOnSale();
    expect((await call(admin, "POST", `/admin/plans/${planId}/retire`)).json()).toMatchObject({
      status: "RETIRED",
    });
    expect((await call(studentA, "GET", `/exams/${examId}/plans`)).json()).toEqual({ items: [] });

    const reactivate = await call(admin, "POST", `/admin/plans/${planId}/activate`);
    expect(errorCode(reactivate)).toBe("INVALID_PLAN_TRANSITION");
    const edit = await call(admin, "PATCH", `/admin/plans/${planId}`, { payload: { name: "x" } });
    expect(errorCode(edit)).toBe("PLAN_FIELDS_LOCKED");
    expect(await auditActions(planId)).toEqual(["plan.activate", "plan.retire"]);
  });

  it("lets a draft plan be edited", async () => {
    const examId = await exam();
    const created = await call(admin, "POST", "/admin/plans", { payload: planBody(examId) });
    const edited = await call(admin, "PATCH", `/admin/plans/${created.json<{ id: string }>().id}`, {
      payload: { priceMinor: 9_900, durationDays: null },
    });
    expect(edited.json()).toMatchObject({
      price: { amountMinor: 9_900 },
      durationDays: null,
      status: "DRAFT",
    });
  });
});

describe("entitlements", () => {
  it("has no access by default; an admin grant gives it and a revoke takes it away", async () => {
    const examId = await exam();
    expect(await access(studentA, examId)).toEqual({ examId, hasAccess: false, activeUntil: null });

    const granted = await call(admin, "POST", "/admin/entitlements", {
      payload: { studentId: studentAId, examId, durationDays: 30 },
    });
    expect(granted.statusCode).toBe(201);
    const entitlement = granted.json<{ id: string; startsAt: string; endsAt: string }>();
    expect(Date.parse(entitlement.endsAt) - Date.parse(entitlement.startsAt)).toBe(30 * DAY_MS);

    expect(await access(studentA, examId)).toEqual({
      examId,
      hasAccess: true,
      activeUntil: entitlement.endsAt,
    });
    // Access is per student: the other one has none.
    expect((await access(studentB, examId)).hasAccess).toBe(false);

    const mine = (await call(studentA, "GET", "/me/entitlements")).json<{
      items: { id: string }[];
    }>();
    expect(mine.items.map((e) => e.id)).toContain(entitlement.id);

    const revoked = await call(admin, "POST", `/admin/entitlements/${entitlement.id}/revoke`);
    expect(revoked.json()).toMatchObject({ status: "REVOKED" });
    expect((await access(studentA, examId)).hasAccess).toBe(false);
    // Revoking again changes nothing and is not audited twice.
    await call(admin, "POST", `/admin/entitlements/${entitlement.id}/revoke`);
    expect(await auditActions(entitlement.id)).toEqual(["entitlement.grant", "entitlement.revoke"]);
  });

  it("queues a second dated grant behind the first instead of overlapping it", async () => {
    const examId = await exam();
    const grantOnce = () =>
      call(admin, "POST", "/admin/entitlements", {
        payload: { studentId: studentAId, examId, durationDays: 30 },
      });
    const first = (await grantOnce()).json<{ endsAt: string }>();
    const second = (await grantOnce()).json<{ startsAt: string; endsAt: string }>();

    expect(second.startsAt).toBe(first.endsAt);
    expect((await access(studentA, examId)).activeUntil).toBe(second.endsAt);
  });

  it("does not let a student grant access, or grant it for an unknown student or exam", async () => {
    const examId = await exam();
    const body = { studentId: studentAId, examId, durationDays: null };

    expect(
      (await call(studentA, "POST", "/admin/entitlements", { payload: body })).statusCode,
    ).toBe(403);
    expect(
      errorCode(
        await call(admin, "POST", "/admin/entitlements", {
          payload: { ...body, studentId: randomUUID() },
        }),
      ),
    ).toBe("STUDENT_NOT_FOUND");
    expect(
      errorCode(
        await call(admin, "POST", "/admin/entitlements", {
          payload: { ...body, examId: randomUUID() },
        }),
      ),
    ).toBe("EXAM_NOT_FOUND");
  });
});

describe("student lookup", () => {
  it("finds an account by exact email, case-insensitively, with its entitlements", async () => {
    const examId = await exam();
    const granted = (
      await call(admin, "POST", "/admin/entitlements", {
        payload: { studentId: studentAId, examId, durationDays: 30 },
      })
    ).json<{ id: string }>();

    const found = await call(
      admin,
      "GET",
      `/admin/students/lookup?identifier=${encodeURIComponent(` ${studentAEmail.toUpperCase()} `)}`,
    );
    expect(found.statusCode).toBe(200);
    const body = found.json<{
      student: { id: string; email: string };
      entitlements: { id: string; examId: string }[];
    }>();
    expect(body.student).toMatchObject({ id: studentAId, email: studentAEmail });
    expect(body.entitlements.map((e) => e.id)).toContain(granted.id);
  });

  it("answers not found for an unknown or partial identifier, and only to billing managers", async () => {
    const lookup = (token: string, identifier: string) =>
      call(token, "GET", `/admin/students/lookup?identifier=${encodeURIComponent(identifier)}`);
    expect(errorCode(await lookup(admin, "nobody@qup.test"))).toBe("STUDENT_NOT_FOUND");
    expect(errorCode(await lookup(admin, studentAEmail.slice(0, 6)))).toBe("STUDENT_NOT_FOUND");
    expect((await lookup(studentA, studentAEmail)).statusCode).toBe(403);
  });
});

describe("checkout", () => {
  it("opens a payment at the plan's price and hands back the provider's page", async () => {
    const { planId } = await planOnSale();
    const response = await checkout(studentA, planId);

    expect(response.statusCode).toBe(201);
    const payment = response.json<PaymentBody>();
    const link = stream.links.at(-1);
    expect(payment).toMatchObject({
      planId,
      status: "PENDING",
      amount: { amountMinor: PRICE, currency: "SAR" },
      checkoutUrl: link?.url,
      paidAt: null,
    });
    // Stream is told which payment the link is for, and to accept one payment only.
    expect(link?.body).toMatchObject({
      custom_metadata: { qup_payment_id: payment.id },
      max_number_of_payments: 1,
    });
    // Exactly these fields: provider references and the idempotency key stay server-side.
    expect(Object.keys(payment).sort()).toEqual([
      "amount",
      "checkoutExpiresAt",
      "checkoutUrl",
      "createdAt",
      "examIds",
      "id",
      "paidAt",
      "planId",
      "planName",
      "refundableUntil",
      "status",
    ]);
  });

  it("requires an Idempotency-Key and takes nothing but the plan from the client", async () => {
    const { planId } = await planOnSale();

    const noKey = await call(studentA, "POST", "/payments", { payload: { planId } });
    expect(noKey.statusCode).toBe(400);

    const forgedPrice = await call(studentA, "POST", "/payments", {
      key: randomUUID(),
      payload: { planId, amountMinor: 1 },
    });
    expect(forgedPrice.statusCode).toBe(400);
    expect(errorCode(forgedPrice)).toBe("VALIDATION_FAILED");
  });

  it("returns the same checkout for a retry, and for a second click, without a new link", async () => {
    const { planId } = await planOnSale();
    const key = randomUUID();
    const first = await checkout(studentA, planId, key);
    const linksAfterFirst = stream.links.length;

    const retry = await checkout(studentA, planId, key);
    const secondClick = await checkout(studentA, planId);

    for (const response of [retry, secondClick]) {
      expect(response.statusCode).toBe(200);
      expect(response.json<PaymentBody>().id).toBe(first.json<PaymentBody>().id);
    }
    expect(stream.links).toHaveLength(linksAfterFirst);
  });

  it("refuses an Idempotency-Key already used for another purchase", async () => {
    const first = await planOnSale();
    const second = await planOnSale();
    const key = randomUUID();
    await checkout(studentA, first.planId, key);

    const reused = await checkout(studentA, second.planId, key);
    expect(reused.statusCode).toBe(422);
    expect(errorCode(reused)).toBe("IDEMPOTENCY_KEY_REUSED");
    // Another student cannot ride on the key either.
    expect(errorCode(await checkout(studentB, first.planId, key))).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("does not sell a plan that is not on sale", async () => {
    const examId = await exam();
    const draft = await call(admin, "POST", "/admin/plans", { payload: planBody(examId) });

    for (const planId of [draft.json<{ id: string }>().id, randomUUID()]) {
      const response = await checkout(studentA, planId);
      expect(response.statusCode).toBe(404);
      expect(errorCode(response)).toBe("PLAN_NOT_AVAILABLE");
    }
  });

  it("does not charge a student who already has access", async () => {
    const { planId, examId } = await planOnSale();
    await call(admin, "POST", "/admin/entitlements", {
      payload: { studentId: studentAId, examId, durationDays: null },
    });
    const linksBefore = stream.links.length;

    const response = await checkout(studentA, planId);
    expect(response.statusCode).toBe(409);
    expect(errorCode(response)).toBe("ALREADY_ENTITLED");
    expect(stream.links).toHaveLength(linksBefore);
  });

  it("fails the payment when the provider is down, and lets the student try again", async () => {
    const { planId } = await planOnSale();
    stream.failNext("/api/v2/payment_links", 500);
    const key = randomUUID();

    const failed = await checkout(studentA, planId, key);
    expect(failed.statusCode).toBe(503);
    expect(errorCode(failed)).toBe("PAYMENT_PROVIDER_UNAVAILABLE");
    expect(failed.payload).not.toContain(FAKE_STREAM_API_KEY);

    const [row] = await e2eSql<{ status: string }[]>`
      SELECT status FROM payments WHERE idempotency_key = ${key}`;
    expect(row?.status).toBe("FAILED");

    expect((await checkout(studentA, planId)).statusCode).toBe(201);
  });

  it("refuses a checkout the provider would charge a different amount for", async () => {
    const { planId } = await planOnSale();
    stream.quoteAmount(PRICE + 2_985); // e.g. VAT added on top by a provider setting
    const key = randomUUID();

    const response = await checkout(studentA, planId, key);
    stream.quoteAmount(null);

    expect(response.statusCode).toBe(503);
    const [row] = await e2eSql<{ status: string; checkout_url: string | null }[]>`
      SELECT status, checkout_url FROM payments WHERE idempotency_key = ${key}`;
    expect(row).toEqual({ status: "FAILED", checkout_url: null });
  });

  it("hides one student's payment from another (no IDOR)", async () => {
    const { payment } = await openCheckout(studentA);
    const response = await call(studentB, "GET", `/payments/${payment.id}`);
    expect(response.statusCode).toBe(404);
    expect(errorCode(response)).toBe("PAYMENT_NOT_FOUND");
  });
});

describe("payment webhook", () => {
  it("settles the payment and grants access when Stream confirms it", async () => {
    const open = await openCheckout(studentA);
    expect((await access(studentA, open.examId)).hasAccess).toBe(false);

    const { response } = await pay(open);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ received: true });

    const payment = (await call(studentA, "GET", `/payments/${open.payment.id}`)).json<
      PaymentBody & { paidAt: string }
    >();
    expect(payment).toMatchObject({ status: "SUCCEEDED", paidAt: "2026-10-04T10:00:00.000Z" });
    // Nothing left to pay: the checkout link is no longer handed out.
    expect(payment.checkoutUrl).toBeNull();

    // Access is there the moment the webhook is acknowledged — no waiting for clocks to agree.
    const granted = await access(studentA, open.examId);
    expect(granted.hasAccess).toBe(true);

    expect(await auditActions(open.payment.id)).toEqual(["payment.settle"]);
    const [entitlement] = await e2eSql<
      { source: string; source_reference: string; starts_at: Date; ends_at: Date }[]
    >`
      SELECT source, source_reference, starts_at, ends_at
      FROM entitlements WHERE exam_id = ${open.examId}`;
    expect(entitlement).toMatchObject({ source: "PAYMENT", source_reference: open.payment.id });
    // The plan lasts 90 days.
    expect(Number(entitlement?.ends_at) - Number(entitlement?.starts_at)).toBe(90 * DAY_MS);
    expect(granted.activeUntil).toBe(entitlement?.ends_at.toISOString());
  });

  it("grants access once, however many times the event is delivered", async () => {
    const open = await openCheckout(studentA);
    const { providerPaymentId } = await pay(open);

    const event = {
      eventType: "PAYMENT_SUCCEEDED",
      paymentId: providerPaymentId,
      linkId: open.linkId,
      metadata: { qup_payment_id: open.payment.id },
    };
    const replays = await Promise.all([deliver(event), deliver(event), deliver(event)]);

    expect(replays.map((r) => r.statusCode)).toEqual([200, 200, 200]);
    expect(await entitlementCount(open.examId)).toBe(1);
    expect(await auditActions(open.payment.id)).toEqual(["payment.settle"]);
  });

  it("queues one receipt and one refund notice, carrying ids only, however often events repeat", async () => {
    const open = await openCheckout(studentA);
    const { providerPaymentId } = await pay(open);
    await pay({ ...open }, PRICE); // a second, distinct event for the same checkout
    const owed = () =>
      e2eSql<{ payload: Record<string, unknown> }[]>`
        SELECT payload FROM outbox_events
        WHERE aggregate_type = 'payment' AND aggregate_id = ${open.payment.id} ORDER BY created_at`;
    expect((await owed()).map((e) => e.payload)).toEqual([
      { kind: "PAYMENT_RECEIPT", userId: studentAId, paymentId: open.payment.id },
    ]);

    stream.setPayment(providerPaymentId, {
      current_status: "REFUNDED",
      amount_in_smallest_unit: PRICE,
    });
    const refund = {
      eventType: "PAYMENT_REFUNDED",
      paymentId: providerPaymentId,
      linkId: open.linkId,
    };
    await deliver(refund);
    await deliver(refund);
    expect((await owed()).map((e) => e.payload.kind)).toEqual([
      "PAYMENT_RECEIPT",
      "PAYMENT_REFUNDED",
    ]);
    // Nothing in them names or addresses the student.
    expect(JSON.stringify((await owed()).map((e) => e.payload))).not.toMatch(/@|\+966/);
  });

  it("grants access once when the first deliveries race each other", async () => {
    const open = await openCheckout(studentA);
    const providerPaymentId = randomUUID();
    stream.setPayment(providerPaymentId, { amount_in_smallest_unit: PRICE });
    const event = {
      eventType: "PAYMENT_SUCCEEDED",
      paymentId: providerPaymentId,
      linkId: open.linkId,
    };

    const results = await Promise.all([deliver(event), deliver(event), deliver(event)]);

    expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200]);
    expect(await entitlementCount(open.examId)).toBe(1);
    expect(await paymentStatus(studentA, open.payment.id)).toBe("SUCCEEDED");
  });

  it("rejects an unsigned or forged delivery and changes nothing", async () => {
    const open = await openCheckout(studentA);
    const providerPaymentId = randomUUID();
    stream.setPayment(providerPaymentId, { amount_in_smallest_unit: PRICE });
    const event = {
      eventType: "PAYMENT_SUCCEEDED",
      paymentId: providerPaymentId,
      linkId: open.linkId,
    };

    const forged = await deliver(event, "not-the-secret");
    expect(forged.statusCode).toBe(401);
    expect(errorCode(forged)).toBe("WEBHOOK_SIGNATURE_INVALID");

    const unsigned = await app.inject({
      method: "POST",
      url: "/api/v1/payments/webhooks/stream",
      payload: JSON.parse(streamWebhook(event).payload) as Record<string, unknown>,
    });
    expect(unsigned.statusCode).toBe(401);

    expect(await paymentStatus(studentA, open.payment.id)).toBe("PENDING");
    expect(await entitlementCount(open.examId)).toBe(0);
  });

  it("believes Stream's API, not the event: an unpaid payment grants nothing", async () => {
    const open = await openCheckout(studentA);
    const providerPaymentId = randomUUID();
    // A correctly signed PAYMENT_SUCCEEDED, but Stream itself says the payment failed.
    stream.setPayment(providerPaymentId, {
      current_status: "FAILED",
      amount_in_smallest_unit: PRICE,
    });

    const response = await deliver({
      eventType: "PAYMENT_SUCCEEDED",
      paymentId: providerPaymentId,
      linkId: open.linkId,
    });

    expect(response.statusCode).toBe(200);
    expect(await paymentStatus(studentA, open.payment.id)).toBe("PENDING");
    expect(await entitlementCount(open.examId)).toBe(0);
  });

  it("withholds access when the amount paid is not the plan's price", async () => {
    const open = await openCheckout(studentA);
    const { response } = await pay(open, 100);

    expect(response.statusCode).toBe(200);
    expect(await paymentStatus(studentA, open.payment.id)).toBe("PENDING");
    expect(await entitlementCount(open.examId)).toBe(0);
  });

  it("does not let an event for one checkout settle another payment", async () => {
    const victim = await openCheckout(studentA);
    const attacker = await openCheckout(studentB);
    const providerPaymentId = randomUUID();
    stream.setPayment(providerPaymentId, { amount_in_smallest_unit: PRICE });

    // The attacker's own (genuinely paid) checkout, relabelled with the victim's payment id.
    await deliver({
      eventType: "PAYMENT_SUCCEEDED",
      paymentId: providerPaymentId,
      linkId: attacker.linkId,
      metadata: { qup_payment_id: victim.payment.id },
    });

    expect(await paymentStatus(studentA, victim.payment.id)).toBe("PENDING");
    expect(await paymentStatus(studentB, attacker.payment.id)).toBe("PENDING");
    expect(await entitlementCount(victim.examId)).toBe(0);
  });

  it("acknowledges events that are not about our payments", async () => {
    const unknownLink = await deliver({
      eventType: "PAYMENT_SUCCEEDED",
      paymentId: randomUUID(),
      linkId: randomUUID(),
    });
    const notAPayment = await deliver({
      eventType: "INVOICE_CREATED",
      entityType: "INVOICE",
      paymentId: randomUUID(),
    });
    expect([unknownLink.statusCode, notAPayment.statusCode]).toEqual([200, 200]);
  });

  it("asks Stream to retry when the payment cannot be confirmed right now", async () => {
    const open = await openCheckout(studentA);
    const providerPaymentId = randomUUID();
    stream.setPayment(providerPaymentId, { amount_in_smallest_unit: PRICE });
    const event = {
      eventType: "PAYMENT_SUCCEEDED",
      paymentId: providerPaymentId,
      linkId: open.linkId,
    };

    stream.failNext("/api/v2/payments/", 500);
    const first = await deliver(event);
    expect(first.statusCode).toBe(503);
    expect(await paymentStatus(studentA, open.payment.id)).toBe("PENDING");

    // Stream's retry, later.
    expect((await deliver(event)).statusCode).toBe(200);
    expect(await paymentStatus(studentA, open.payment.id)).toBe("SUCCEEDED");
  });

  it("revokes access when Stream refunds the payment in full", async () => {
    const open = await openCheckout(studentA);
    const { providerPaymentId } = await pay(open);
    expect((await access(studentA, open.examId)).hasAccess).toBe(true);

    stream.setPayment(providerPaymentId, {
      current_status: "REFUNDED",
      amount_in_smallest_unit: PRICE,
    });
    const refund = {
      eventType: "PAYMENT_REFUNDED",
      paymentId: providerPaymentId,
      linkId: open.linkId,
    };
    expect((await deliver(refund)).statusCode).toBe(200);
    await deliver(refund); // delivered twice

    expect(await paymentStatus(studentA, open.payment.id)).toBe("REFUNDED");
    expect((await access(studentA, open.examId)).hasAccess).toBe(false);
    expect(await auditActions(open.payment.id)).toEqual(["payment.settle", "payment.refund"]);
    // A late replay of the original success event must not bring access back.
    await deliver({
      eventType: "PAYMENT_SUCCEEDED",
      paymentId: providerPaymentId,
      linkId: open.linkId,
    });
    expect((await access(studentA, open.examId)).hasAccess).toBe(false);
  });

  it("keeps access on a partial refund", async () => {
    const open = await openCheckout(studentA);
    const { providerPaymentId } = await pay(open);

    stream.setPayment(providerPaymentId, {
      current_status: "PARTIALLY_REFUNDED",
      amount_in_smallest_unit: PRICE,
    });
    await deliver({
      eventType: "PAYMENT_PARTIALLY_REFUNDED",
      paymentId: providerPaymentId,
      linkId: open.linkId,
    });

    expect(await paymentStatus(studentA, open.payment.id)).toBe("SUCCEEDED");
    expect((await access(studentA, open.examId)).hasAccess).toBe(true);
  });

  it("still grants access when the money arrives after we closed the checkout", async () => {
    const open = await openCheckout(studentA);
    await e2eSql`UPDATE payments SET status = 'CANCELLED' WHERE id = ${open.payment.id}`;

    await pay(open);

    expect(await paymentStatus(studentA, open.payment.id)).toBe("SUCCEEDED");
    expect((await access(studentA, open.examId)).hasAccess).toBe(true);
  });

  it("does not answer for a provider it does not use", async () => {
    const response = await deliver(
      { eventType: "PAYMENT_SUCCEEDED", paymentId: randomUUID() },
      undefined,
      "paypal",
    );
    expect(response.statusCode).toBe(404);
  });
});

describe("bundle covering several exams", () => {
  async function bundle() {
    const examIds = [await exam(), await exam(), await exam()];
    const planId = await activePlan(examIds, { name: "الباقة الشاملة", priceMinor: 39_900 });
    return { planId, examIds };
  }

  async function payFor(token: string, planId: string, amountMinor: number) {
    const response = await checkout(token, planId);
    expect(response.statusCode).toBe(201);
    const payment = response.json<PaymentBody>();
    const link = stream.links.at(-1);
    if (!link) throw new Error("no payment link was created");
    return { payment, linkId: link.id, ...(await pay({ payment, linkId: link.id }, amountMinor)) };
  }

  it("grants every exam it covers from one payment, once, and a refund takes them all back", async () => {
    const student = await register("bundle-buyer");
    const { planId, examIds } = await bundle();

    const { payment, linkId, providerPaymentId } = await payFor(student.token, planId, 39_900);
    for (const examId of examIds) {
      expect((await access(student.token, examId)).hasAccess).toBe(true);
      expect(await entitlementCount(examId)).toBe(1);
    }
    const paid = (await call(student.token, "GET", `/payments/${payment.id}`)).json<{
      planName: string;
      examIds: string[];
    }>();
    expect(paid.planName).toBe("الباقة الشاملة");
    expect([...paid.examIds].sort()).toEqual([...examIds].sort());

    stream.setPayment(providerPaymentId, {
      current_status: "REFUNDED",
      amount_in_smallest_unit: 39_900,
    });
    await deliver({ eventType: "PAYMENT_REFUNDED", paymentId: providerPaymentId, linkId });
    for (const examId of examIds) {
      expect((await access(student.token, examId)).hasAccess).toBe(false);
    }
    const [refundAudit] = await e2eSql<{ metadata_redacted: { revokedEntitlementIds: string } }[]>`
      SELECT metadata_redacted FROM audit_logs
      WHERE resource_id = ${payment.id} AND action = 'payment.refund'`;
    expect(refundAudit?.metadata_redacted.revokedEntitlementIds.split(",")).toHaveLength(3);
  });

  it("sells on top of one exam's access, and refuses once everything is covered", async () => {
    const student = await register("bundle-partial");
    const { planId, examIds } = await bundle();
    const [first = ""] = examIds;
    await call(admin, "POST", "/admin/entitlements", {
      payload: { studentId: student.id, examId: first, durationDays: 30 },
    });

    const opened = await checkout(student.token, planId);
    expect(opened.statusCode).toBe(201);

    for (const examId of examIds.slice(1)) {
      await call(admin, "POST", "/admin/entitlements", {
        payload: { studentId: student.id, examId, durationDays: null },
      });
    }
    const again = await checkout(student.token, planId);
    expect(again.statusCode).toBe(409);
    expect(errorCode(again)).toBe("ALREADY_ENTITLED");
  });

  it("is not sold, nor listed, while any of its exams is not offered", async () => {
    const { planId, examIds } = await bundle();
    const [, second = ""] = examIds;
    await e2eSql`UPDATE exams SET status = 'DRAFT' WHERE id = ${second}`;

    const response = await checkout(studentA, planId);
    expect(errorCode(response)).toBe("PLAN_NOT_AVAILABLE");
    const catalog = (await app.inject({ method: "GET", url: "/api/v1/plans" })).json<{
      items: { id: string }[];
    }>();
    expect(catalog.items.map((p) => p.id)).not.toContain(planId);
  });

  it("is listed under each exam it covers", async () => {
    const { planId, examIds } = await bundle();
    for (const examId of examIds) {
      const offers = (await call(studentA, "GET", `/exams/${examId}/plans`)).json<{
        items: { id: string; isBundle: boolean; exams: unknown[] }[];
      }>();
      expect(offers.items).toEqual([
        expect.objectContaining({ id: planId, isBundle: true, exams: expect.any(Array) }),
      ]);
    }
  });
});

describe("price and duration changes", () => {
  it("charges the next buyer the new price and replaces a checkout opened at the old one", async () => {
    const student = await register("repriced");
    const { planId } = await planOnSale();
    const before = (await checkout(student.token, planId)).json<PaymentBody>();
    const oldLink = stream.links.at(-1);

    await call(admin, "PATCH", `/admin/plans/${planId}`, { payload: { priceMinor: 9_900 } });

    const after = await checkout(student.token, planId);
    expect(after.statusCode).toBe(201);
    expect(after.json<PaymentBody>().amount.amountMinor).toBe(9_900);
    expect(await paymentStatus(student.token, before.id)).toBe("CANCELLED");

    // Paying the old link anyway still delivers what it sold, at its own price.
    if (!oldLink) throw new Error("no payment link was created");
    await pay({ payment: before, linkId: oldLink.id }, PRICE);
    expect(await paymentStatus(student.token, before.id)).toBe("SUCCEEDED");
  });

  it("grants the duration bought, not the one the plan has when the money lands", async () => {
    const student = await register("redurationed");
    const { planId, examId } = await planOnSale();
    const opened = (await checkout(student.token, planId)).json<PaymentBody>();
    const link = stream.links.at(-1);
    await call(admin, "PATCH", `/admin/plans/${planId}`, { payload: { durationDays: 365 } });

    if (!link) throw new Error("no payment link was created");
    await pay({ payment: opened, linkId: link.id });
    const [entitlement] = await e2eSql<{ starts_at: Date; ends_at: Date }[]>`
      SELECT starts_at, ends_at FROM entitlements WHERE exam_id = ${examId}`;
    expect(Number(entitlement?.ends_at) - Number(entitlement?.starts_at)).toBe(90 * DAY_MS);
  });
});

describe("public catalog", () => {
  it("lists plans on sale to anyone, in the admin's order, with their features", async () => {
    const examId = await exam();
    const second = await activePlan([examId], { sortOrder: 2, name: "ثانية" });
    const first = await activePlan([examId], {
      sortOrder: 1,
      name: "أولى",
      description: "وصف قصير",
      features: ["ميزة أولى", "ميزة ثانية"],
      highlighted: true,
    });
    await call(admin, "POST", "/admin/plans", { payload: planBody(examId, { sortOrder: 0 }) });

    const response = await app.inject({ method: "GET", url: "/api/v1/plans" });
    expect(response.statusCode).toBe(200);
    const ours = response
      .json<{ items: { id: string; features: string[]; description: string | null }[] }>()
      .items.filter((plan) => plan.id === first || plan.id === second);
    expect(ours.map((plan) => plan.id)).toEqual([first, second]);
    expect(ours[0]).toMatchObject({
      features: ["ميزة أولى", "ميزة ثانية"],
      description: "وصف قصير",
    });
    // No internal fields reach the public page.
    expect(JSON.stringify(response.json())).not.toMatch(/"code"|"status"|"sortOrder"/);
  });
});

describe("payment history and the admin ledger", () => {
  it("shows a student only their own payments, with the refund deadline once paid", async () => {
    const buyer = await register("history-a");
    const other = await register("history-b");
    const open = await (async () => {
      const { planId } = await planOnSale({ name: "باقة السجل" });
      const payment = (await checkout(buyer.token, planId)).json<PaymentBody>();
      const link = stream.links.at(-1);
      if (!link) throw new Error("no payment link was created");
      return { payment, linkId: link.id };
    })();
    await pay(open);

    const mine = (await call(buyer.token, "GET", "/me/payments")).json<{
      items: { id: string; planName: string; paidAt: string; refundableUntil: string }[];
    }>();
    expect(mine.items).toHaveLength(1);
    const [item] = mine.items;
    expect(item).toMatchObject({ id: open.payment.id, planName: "باقة السجل" });
    expect(Date.parse(item?.refundableUntil ?? "") - Date.parse(item?.paidAt ?? "")).toBe(
      48 * 3_600_000,
    );
    expect((await call(other.token, "GET", "/me/payments")).json()).toEqual({ items: [] });
  });

  it("pages through every payment for billing managers only, newest first", async () => {
    for (let i = 0; i < 3; i += 1) await openCheckout(studentB);

    expect((await call(studentA, "GET", "/admin/payments")).statusCode).toBe(403);

    const first = (await call(admin, "GET", "/admin/payments?limit=2")).json<{
      items: { id: string; createdAt: string; student: { email: string } }[];
      next: string | null;
    }>();
    expect(first.items).toHaveLength(2);
    expect(first.next).not.toBeNull();
    const second = (await call(admin, "GET", `/admin/payments?limit=2&cursor=${first.next}`)).json<{
      items: { id: string; createdAt: string }[];
    }>();
    const ids = [...first.items, ...second.items].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Date.parse(second.items[0]?.createdAt ?? "")).toBeLessThanOrEqual(
      Date.parse(first.items[1]?.createdAt ?? ""),
    );

    const pending = (await call(admin, "GET", "/admin/payments?status=PENDING&limit=100")).json<{
      items: { status: string }[];
    }>();
    expect(pending.items.every((p) => p.status === "PENDING")).toBe(true);

    const bad = await call(admin, "GET", "/admin/payments?cursor=not-a-cursor");
    expect(bad.statusCode).toBe(400);
  });

  it("sums what came in over the window", async () => {
    const response = await call(admin, "GET", "/admin/billing/summary?days=30");
    expect(response.statusCode).toBe(200);
    const summary = response.json<{
      succeeded: { count: number; amount: { amountMinor: number; currency: string } };
      abandoned: number;
    }>();
    expect(summary.succeeded.count).toBeGreaterThan(0);
    expect(summary.succeeded.amount.currency).toBe("SAR");
    expect((await call(admin, "GET", "/admin/billing/summary?days=9")).statusCode).toBe(400);
    expect((await call(studentA, "GET", "/admin/billing/summary?days=7")).statusCode).toBe(403);
  });
});

describe("expired checkout", () => {
  it("replaces a checkout that can no longer be paid with a fresh one", async () => {
    const { planId, payment } = await openCheckout(studentA);
    await e2eSql`
      UPDATE payments SET checkout_expires_at = now() - interval '1 minute' WHERE id = ${payment.id}`;

    const fresh = await checkout(studentA, planId);

    expect(fresh.statusCode).toBe(201);
    expect(fresh.json<PaymentBody>().id).not.toBe(payment.id);
    expect(await paymentStatus(studentA, payment.id)).toBe("CANCELLED");
  });
});

describe("reconciling a payment by hand", () => {
  const reconcile = (paymentId: string, providerPaymentId: string, token = admin) =>
    call(token, "POST", `/admin/payments/${paymentId}/reconcile`, {
      payload: { providerPaymentId },
    });

  it("settles a paid checkout whose webhook never came, and audits it", async () => {
    const open = await openCheckout(studentA);
    const providerPaymentId = randomUUID();
    stream.setPayment(providerPaymentId, { amount_in_smallest_unit: PRICE });

    const response = await reconcile(open.payment.id, providerPaymentId);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      outcome: "SETTLED",
      payment: { id: open.payment.id, status: "SUCCEEDED" },
    });
    expect((await access(studentA, open.examId)).hasAccess).toBe(true);
    expect(await auditActions(open.payment.id)).toContain("payment.settle");

    // Asked again: nothing changes, nothing is granted twice.
    const again = await reconcile(open.payment.id, providerPaymentId);
    expect(again.json()).toMatchObject({ outcome: "ALREADY_SETTLED" });
    expect(await entitlementCount(open.examId)).toBe(1);
  });

  it("refuses a provider payment that already bought another payment", async () => {
    const first = await openCheckout(studentA);
    const { providerPaymentId } = await pay(first);
    const second = await openCheckout(studentB);

    const response = await reconcile(second.payment.id, providerPaymentId);
    expect(response.statusCode).toBe(409);
    expect(errorCode(response)).toBe("PROVIDER_PAYMENT_ALREADY_USED");
    expect(await paymentStatus(studentB, second.payment.id)).toBe("PENDING");
  });

  it("refuses a different amount, or a payment the provider does not call paid", async () => {
    const open = await openCheckout(studentB);
    const wrongAmount = randomUUID();
    stream.setPayment(wrongAmount, { amount_in_smallest_unit: PRICE - 100 });
    const mismatch = await reconcile(open.payment.id, wrongAmount);
    expect(mismatch.statusCode).toBe(422);
    expect(errorCode(mismatch)).toBe("PROVIDER_PAYMENT_DOES_NOT_MATCH");

    const unpaid = randomUUID();
    stream.setPayment(unpaid, { amount_in_smallest_unit: PRICE, current_status: "FAILED" });
    const notPaid = await reconcile(open.payment.id, unpaid);
    expect(notPaid.statusCode).toBe(422);
    expect(errorCode(notPaid)).toBe("PROVIDER_PAYMENT_NOT_PAID");
    expect(await paymentStatus(studentB, open.payment.id)).toBe("PENDING");
  });

  it("is for billing admins only, and rejects an id that is not one", async () => {
    const open = await openCheckout(studentB);
    expect((await reconcile(open.payment.id, randomUUID(), studentB)).statusCode).toBe(403);
    expect((await reconcile(open.payment.id, "../payments/x")).statusCode).toBe(400);
  });
});
