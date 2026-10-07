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
    payload: { email, password: PASSWORD },
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

const planBody = (examId: string, overrides: Record<string, unknown> = {}) => ({
  examId,
  code: `E2E-PLAN-${randomUUID().slice(0, 8).toUpperCase()}`,
  name: "باقة القدرات",
  priceMinor: PRICE,
  currency: "SAR",
  durationDays: 90,
  ...overrides,
});

/** An ACTIVE plan on a new ACTIVE exam. */
async function planOnSale(
  overrides: Record<string, unknown> = {},
): Promise<{ planId: string; examId: string }> {
  const examId = await exam();
  const created = await call(admin, "POST", "/admin/plans", {
    payload: planBody(examId, overrides),
  });
  expect(created.statusCode).toBe(201);
  const planId = created.json<{ id: string }>().id;
  expect((await call(admin, "POST", `/admin/plans/${planId}/activate`)).statusCode).toBe(200);
  return { planId, examId };
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
          examId,
          name: "باقة القدرات",
          price: { amountMinor: PRICE, currency: "SAR" },
          durationDays: 90,
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

  it("freezes an offered plan's price, and retires it for good", async () => {
    const { planId, examId } = await planOnSale();

    const edit = await call(admin, "PATCH", `/admin/plans/${planId}`, {
      payload: { priceMinor: 100 },
    });
    expect(edit.statusCode).toBe(422);
    expect(errorCode(edit)).toBe("PLAN_NOT_DRAFT");

    expect((await call(admin, "POST", `/admin/plans/${planId}/retire`)).json()).toMatchObject({
      status: "RETIRED",
    });
    expect((await call(studentA, "GET", `/exams/${examId}/plans`)).json()).toEqual({ items: [] });

    const reactivate = await call(admin, "POST", `/admin/plans/${planId}/activate`);
    expect(errorCode(reactivate)).toBe("INVALID_PLAN_TRANSITION");
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
      "id",
      "paidAt",
      "planId",
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
