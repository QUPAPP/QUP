import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  WebhookPayloadInvalid,
  WebhookSignatureInvalid,
} from "../../src/modules/billing/domain/billing.errors.js";
import { ProviderRequestFailed } from "../../src/modules/billing/domain/ports.js";
import { StreamPaymentProvider } from "../../src/modules/billing/infrastructure/stream/stream-payment-provider.js";
import {
  FAKE_STREAM_API_KEY,
  FAKE_STREAM_WEBHOOK_SECRET,
  type FakeStream,
  startFakeStream,
  streamWebhook,
} from "../support/fake-stream.js";

/** The adapter against a local server speaking Stream's documented wire format. */

let stream: FakeStream;
let provider: StreamPaymentProvider;

const checkout = (overrides: { amountMinor?: number } = {}) => ({
  paymentId: randomUUID(),
  title: "باقة القدرات",
  amountMinor: overrides.amountMinor ?? 19_900,
  currency: "SAR",
  expiresAt: new Date("2026-10-04T11:00:00.000Z"),
});

async function failure(action: () => Promise<unknown>): Promise<ProviderRequestFailed> {
  try {
    await action();
  } catch (error) {
    if (error instanceof ProviderRequestFailed) return error;
    throw error;
  }
  throw new Error("expected the provider call to fail");
}

beforeAll(async () => {
  stream = await startFakeStream();
  provider = new StreamPaymentProvider({
    apiKey: FAKE_STREAM_API_KEY,
    webhookSecret: FAKE_STREAM_WEBHOOK_SECRET,
    baseUrl: stream.baseUrl,
    successUrl: "https://app.qup.test/pay/ok",
    failureUrl: null,
  });
});

afterAll(() => stream.close());

describe("creating a checkout", () => {
  it("creates a one-time product at the plan's price, then a single-use link for it", async () => {
    const request = checkout();
    const session = await provider.createCheckout(request);

    const [product, link] = stream.requests.slice(-2);
    expect(product).toMatchObject({
      method: "POST",
      path: "/api/v2/products",
      apiKey: FAKE_STREAM_API_KEY,
      body: {
        name: "باقة القدرات",
        type: "ONE_OFF",
        is_one_time: true,
        prices: [{ currency: "SAR", amount: "199.00" }],
      },
    });
    expect(link).toMatchObject({
      method: "POST",
      path: "/api/v2/payment_links",
      apiKey: FAKE_STREAM_API_KEY,
      body: {
        currency: "SAR",
        max_number_of_payments: 1,
        valid_until: "2026-10-04T11:00:00.000Z",
        custom_metadata: { qup_payment_id: request.paymentId },
        success_redirect_url: `https://app.qup.test/pay/ok?payment=${request.paymentId}`,
      },
    });
    expect(link?.body?.items).toHaveLength(1);
    expect(link?.body).not.toHaveProperty("failure_redirect_url");

    const created = stream.links.at(-1);
    expect(session).toEqual({
      reference: created?.id,
      checkoutUrl: created?.url,
      amountMinor: 19_900,
      currency: "SAR",
    });
  });

  it("reports what the provider will charge, so the caller can compare", async () => {
    stream.quoteAmount(22_885);
    const session = await provider.createCheckout(checkout());
    stream.quoteAmount(null);
    expect(session.amountMinor).toBe(22_885);
  });

  it("refuses a currency it cannot convert exactly", async () => {
    await expect(provider.createCheckout({ ...checkout(), currency: "KWD" })).rejects.toThrow(
      /not supported/,
    );
  });

  it("turns a provider error into a typed failure carrying the provider's code", async () => {
    stream.failNext("/api/v2/products", 422, "INVALID_PARAMETERS");
    const error = await failure(() => provider.createCheckout(checkout()));
    expect(error).toMatchObject({
      operation: "create product",
      status: 422,
      providerCode: "INVALID_PARAMETERS",
    });
  });

  it("does not create a link when the product could not be created", async () => {
    const linksBefore = stream.links.length;
    stream.failNext("/api/v2/products", 500);
    await failure(() => provider.createCheckout(checkout()));
    expect(stream.links).toHaveLength(linksBefore);
  });

  it("never puts the API key in an error", async () => {
    stream.failNext("/api/v2/payment_links", 500);
    const error = await failure(() => provider.createCheckout(checkout()));
    expect(JSON.stringify({ ...error, message: error.message })).not.toContain(FAKE_STREAM_API_KEY);
  });

  it("fails cleanly when the provider cannot be reached", async () => {
    const unreachable = new StreamPaymentProvider({
      apiKey: FAKE_STREAM_API_KEY,
      webhookSecret: FAKE_STREAM_WEBHOOK_SECRET,
      baseUrl: "http://127.0.0.1:1",
      successUrl: null,
      failureUrl: null,
    });
    const error = await failure(() => unreachable.createCheckout(checkout()));
    expect(error).toMatchObject({ operation: "create product", status: null });
    expect(error.message).not.toContain(FAKE_STREAM_API_KEY);
  });

  it("rejects a wrong API key", async () => {
    const wrongKey = new StreamPaymentProvider({
      apiKey: "wrong",
      webhookSecret: FAKE_STREAM_WEBHOOK_SECRET,
      baseUrl: stream.baseUrl,
      successUrl: null,
      failureUrl: null,
    });
    expect(await failure(() => wrongKey.createCheckout(checkout()))).toMatchObject({ status: 401 });
  });
});

describe("fetching a payment", () => {
  it.each([
    ["SUCCEEDED", "PAID"],
    ["SETTLED", "PAID"],
    ["REFUNDED", "REFUNDED"],
    ["PARTIALLY_REFUNDED", "PARTIALLY_REFUNDED"],
    ["PENDING", "OTHER"],
    ["FAILED", "OTHER"],
    ["CANCELED", "OTHER"],
    ["A_STATUS_ADDED_LATER", "OTHER"],
  ])("reads Stream's %s as %s", async (current_status, status) => {
    const id = randomUUID();
    stream.setPayment(id, { current_status, amount_in_smallest_unit: 19_900 });
    expect(await provider.fetchPayment(id)).toEqual({
      id,
      status,
      amountMinor: 19_900,
      currency: "SAR",
      paidAt: new Date("2026-10-04T10:00:00Z"),
    });
  });

  it("fails for a payment Stream does not know", async () => {
    expect(await failure(() => provider.fetchPayment(randomUUID()))).toMatchObject({ status: 404 });
  });

  it("refuses a response that does not carry an amount", async () => {
    const id = randomUUID();
    stream.setPayment(id, { amount_in_smallest_unit: Number.NaN });
    expect(await failure(() => provider.fetchPayment(id))).toMatchObject({
      providerCode: "UNEXPECTED_RESPONSE",
    });
  });
});

describe("verifying a webhook", () => {
  const verify = (delivery: { payload: string; headers: Record<string, string> }) =>
    provider.verifyWebhook(Buffer.from(delivery.payload), delivery.headers);

  it("reads the payment, its checkout and our payment id from a signed event", () => {
    const paymentId = randomUUID();
    const linkId = randomUUID();
    const ours = randomUUID();
    const event = verify(
      streamWebhook({
        eventType: "PAYMENT_SUCCEEDED",
        paymentId,
        linkId,
        metadata: { qup_payment_id: ours },
      }),
    );
    expect(event).toEqual({
      type: "PAYMENT_SUCCEEDED",
      providerPaymentId: paymentId,
      checkoutReference: linkId,
      paymentId: ours,
    });
  });

  it("tolerates an event without a payment link or metadata", () => {
    const event = verify(streamWebhook({ eventType: "PAYMENT_REFUNDED", paymentId: "p-1" }));
    expect(event).toMatchObject({ checkoutReference: null, paymentId: null });
  });

  it("ignores authentic events about something other than a payment", () => {
    const delivery = streamWebhook({
      eventType: "INVOICE_CREATED",
      entityType: "INVOICE",
      paymentId: "x",
    });
    expect(verify(delivery)).toBeNull();
  });

  it("rejects an event signed with another secret", () => {
    const forged = streamWebhook({ eventType: "PAYMENT_SUCCEEDED", paymentId: "p" }, "guess");
    expect(() => verify(forged)).toThrow(WebhookSignatureInvalid);
  });

  it("rejects a body changed after signing", () => {
    const delivery = streamWebhook({ eventType: "PAYMENT_FAILED", paymentId: "p" });
    const tampered = delivery.payload.replace("PAYMENT_FAILED", "PAYMENT_SUCCEEDED");
    expect(() => verify({ ...delivery, payload: tampered })).toThrow(WebhookSignatureInvalid);
  });

  it("checks the signature before trying to understand the body", () => {
    expect(() => verify({ payload: "not json", headers: {} })).toThrow(WebhookSignatureInvalid);
  });

  it("rejects a signed body that is not an event", () => {
    const delivery = streamWebhook({ eventType: "PAYMENT_SUCCEEDED", paymentId: "p" });
    const signedGarbage = streamWebhook({ eventType: "", paymentId: "p" });
    expect(() => verify(signedGarbage)).toThrow(WebhookPayloadInvalid);
    expect(verify(delivery)).not.toBeNull();
  });
});
