import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { signStreamPayload } from "../../src/modules/billing/infrastructure/stream/stream-signature.js";

/**
 * A stand-in for Stream's API, on 127.0.0.1. It speaks the request and
 * response shapes of Stream's published OpenAPI document (v2) for the three
 * calls the adapter makes, and records what it was sent. Nothing leaves the
 * machine; no real Stream account is involved.
 */

export const FAKE_STREAM_API_KEY = "ZmFrZS1rZXk6ZmFrZS1zZWNyZXQ=";
export const FAKE_STREAM_WEBHOOK_SECRET = "fake-webhook-secret";

export interface RecordedRequest {
  method: string;
  path: string;
  apiKey: string | undefined;
  body: Record<string, unknown> | null;
}

interface FakePayment {
  current_status: string;
  amount_in_smallest_unit: number;
  currency: string;
  payed_at: string | null;
}

export interface FakeStream {
  baseUrl: string;
  requests: RecordedRequest[];
  /** Payment links created so far, newest last. */
  links: { id: string; url: string; body: Record<string, unknown> }[];
  /** Makes Stream's view of a payment, as GET /payments/:id will report it. */
  setPayment(id: string, payment: Partial<FakePayment> & { amount_in_smallest_unit: number }): void;
  /** The next call to a path starting with `prefix` answers with this status. */
  failNext(prefix: string, status: number, code?: string): void;
  /** Makes payment links quote this amount instead of the product's price. */
  quoteAmount(amountMinor: number | null): void;
  close(): Promise<void>;
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

export async function startFakeStream(): Promise<FakeStream> {
  const requests: RecordedRequest[] = [];
  const links: FakeStream["links"] = [];
  const productPrices = new Map<string, { amountMinor: number; currency: string }>();
  const payments = new Map<string, FakePayment>();
  const failures: { prefix: string; status: number; code: string }[] = [];
  let quotedAmount: number | null = null;

  const server: Server = createServer((request, response) => {
    void (async () => {
      const path = request.url ?? "";
      const body = await readJson(request);
      const apiKey = request.headers["x-api-key"];
      requests.push({
        method: request.method ?? "",
        path,
        apiKey: Array.isArray(apiKey) ? apiKey[0] : apiKey,
        body,
      });

      const send = (status: number, payload: unknown) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify(payload));
      };

      const failure = failures.findIndex((f) => path.startsWith(f.prefix));
      if (failure >= 0) {
        const [{ status, code } = { status: 500, code: "STREAM_ERROR" }] = failures.splice(
          failure,
          1,
        );
        return send(status, { error: { code, message: "simulated failure" } });
      }
      if (apiKey !== FAKE_STREAM_API_KEY) {
        return send(401, { error: { code: "UNAUTHORIZED", message: "bad key" } });
      }

      if (request.method === "POST" && path === "/api/v2/products") {
        const [price] = (body?.prices ?? []) as { currency: string; amount: string }[];
        const id = randomUUID();
        if (price) {
          productPrices.set(id, {
            amountMinor: Math.round(Number(price.amount) * 100),
            currency: price.currency,
          });
        }
        return send(200, { id, name: body?.name, type: body?.type });
      }

      if (request.method === "POST" && path === "/api/v2/payment_links") {
        const [item] = (body?.items ?? []) as { product_id: string }[];
        const price = productPrices.get(item?.product_id ?? "");
        if (!price) return send(422, { error: { code: "INVALID_PARAMETERS", message: "product" } });
        const id = randomUUID();
        const url = `https://pay.stream.test/${id}`;
        links.push({ id, url, body: body ?? {} });
        return send(200, {
          id,
          url,
          status: "ACTIVE",
          amount: (price.amountMinor / 100).toFixed(2),
          amount_in_smallest_unit: quotedAmount ?? price.amountMinor,
          currency: price.currency,
          custom_metadata: body?.custom_metadata ?? null,
        });
      }

      const paymentId = /^\/api\/v2\/payments\/([^/]+)$/.exec(path)?.[1];
      if (request.method === "GET" && paymentId) {
        const payment = payments.get(paymentId);
        if (!payment) return send(404, { error: { code: "NOT_FOUND", message: "payment" } });
        return send(200, { id: paymentId, ...payment });
      }

      return send(404, { error: { code: "NOT_FOUND", message: "no such route" } });
    })();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    links,
    setPayment: (id, payment) =>
      payments.set(id, {
        current_status: "SUCCEEDED",
        currency: "SAR",
        payed_at: "2026-10-04T10:00:00Z",
        ...payment,
      }),
    failNext: (prefix, status, code = "STREAM_ERROR") => failures.push({ prefix, status, code }),
    quoteAmount: (amountMinor) => {
      quotedAmount = amountMinor;
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** A webhook delivery as Stream sends it: the exact body bytes and their signature header. */
export function streamWebhook(
  event: {
    eventType: string;
    paymentId: string;
    linkId?: string | null;
    metadata?: Record<string, unknown>;
    entityType?: string;
  },
  secret = FAKE_STREAM_WEBHOOK_SECRET,
): { payload: string; headers: Record<string, string> } {
  const payload = JSON.stringify({
    event_type: event.eventType,
    entity_type: event.entityType ?? "PAYMENT",
    entity_id: event.paymentId,
    status: "SUCCEEDED",
    timestamp: "2026-10-04T10:00:01.000000",
    data: {
      invoice: { id: randomUUID(), url: "https://stream.test/invoice" },
      payment: { id: event.paymentId, url: "https://stream.test/payment" },
      ...(event.linkId
        ? { payment_link: { id: event.linkId, url: "https://stream.test/link" } }
        : {}),
      metadata: event.metadata ?? {},
    },
  });
  return {
    payload,
    headers: {
      "content-type": "application/json",
      "x-webhook-signature": signStreamPayload(secret, Buffer.from(payload), 1_759_572_001),
    },
  };
}
