import { z } from "zod";

import { WebhookPayloadInvalid, WebhookSignatureInvalid } from "../../domain/billing.errors.js";
import { isSupportedCurrency, toDecimalString } from "../../domain/money.js";
import {
  type CheckoutRequest,
  type CheckoutSession,
  type PaymentProvider,
  type ProviderEvent,
  type ProviderPayment,
  type ProviderPaymentStatus,
  ProviderRequestFailed,
} from "../../domain/ports.js";
import { isValidStreamSignature } from "./stream-signature.js";

/**
 * Stream (streampay.sa) adapter. Written against Stream's published OpenAPI
 * document (v2); every response is validated here, so a contract change fails
 * loudly at this boundary instead of corrupting a payment.
 *
 * Checkout = a one-time product priced at our plan's price + a payment link
 * for it that accepts exactly one payment (OPEN_QUESTIONS.md #5a). QUP stays
 * the source of truth for the price; nothing has to be kept in sync by hand.
 */

export interface StreamConfig {
  /** The `x-api-key` value: base64 of "api-key:api-secret". */
  apiKey: string;
  webhookSecret: string;
  baseUrl: string;
  /** Where Stream sends the payer afterwards. Never proof of payment. */
  successUrl: string | null;
  failureUrl: string | null;
}

const REQUEST_TIMEOUT_MS = 10_000;
const SIGNATURE_HEADER = "x-webhook-signature";
/** Our payment id, echoed back by Stream in `data.metadata` of its events. */
const METADATA_PAYMENT_ID = "qup_payment_id";
const MAX_NAME_LENGTH = 512;

const productResponse = z.object({ id: z.string().min(1) });

const paymentLinkResponse = z.object({
  id: z.string().min(1),
  url: z.url(),
  amount_in_smallest_unit: z.number().int().nonnegative(),
  currency: z.string().min(1),
});

const paymentResponse = z.object({
  id: z.string().min(1),
  current_status: z.string().min(1),
  amount_in_smallest_unit: z.number().int().nonnegative(),
  currency: z.string().min(1),
  payed_at: z.string().nullish(),
});

const errorResponse = z.object({ error: z.object({ code: z.string() }) });

const reference = z.object({ id: z.string().min(1) });

const webhookEvent = z.object({
  event_type: z.string().min(1),
  entity_type: z.string().min(1),
  entity_id: z.string().min(1),
  data: z
    .object({
      payment: reference.nullish(),
      payment_link: reference.nullish(),
      metadata: z.record(z.string(), z.unknown()).nullish(),
    })
    .nullish(),
});

/** OpenAPI `PaymentStatusEnum`. SETTLED is a paid payment whose funds reached the merchant. */
const STATUS: Record<string, ProviderPaymentStatus> = {
  SUCCEEDED: "PAID",
  SETTLED: "PAID",
  REFUNDED: "REFUNDED",
  PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
};

export class StreamPaymentProvider implements PaymentProvider {
  readonly name = "stream";

  constructor(private readonly config: StreamConfig) {}

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    if (!isSupportedCurrency(request.currency)) {
      throw new Error(`Currency ${request.currency} is not supported.`);
    }
    const name = request.title.slice(0, MAX_NAME_LENGTH);

    const product = await this.call("create product", "POST", "/api/v2/products", productResponse, {
      name,
      type: "ONE_OFF",
      is_one_time: true,
      prices: [
        {
          currency: request.currency,
          amount: toDecimalString(request.amountMinor, request.currency),
        },
      ],
    });

    const link = await this.call(
      "create payment link",
      "POST",
      "/api/v2/payment_links",
      paymentLinkResponse,
      {
        name,
        currency: request.currency,
        items: [{ product_id: product.id, quantity: 1 }],
        max_number_of_payments: 1,
        valid_until: request.expiresAt.toISOString(),
        custom_metadata: { [METADATA_PAYMENT_ID]: request.paymentId },
        ...(this.config.successUrl
          ? { success_redirect_url: withPayment(this.config.successUrl, request.paymentId) }
          : {}),
        ...(this.config.failureUrl
          ? { failure_redirect_url: withPayment(this.config.failureUrl, request.paymentId) }
          : {}),
      },
    );

    return {
      reference: link.id,
      checkoutUrl: link.url,
      amountMinor: link.amount_in_smallest_unit,
      currency: link.currency,
    };
  }

  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
  ): ProviderEvent | null {
    if (!isValidStreamSignature(this.config.webhookSecret, rawBody, headers[SIGNATURE_HEADER])) {
      throw new WebhookSignatureInvalid();
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new WebhookPayloadInvalid();
    }
    const parsed = webhookEvent.safeParse(json);
    if (!parsed.success) throw new WebhookPayloadInvalid();
    const event = parsed.data;
    if (event.entity_type !== "PAYMENT") return null;

    const paymentId = event.data?.metadata?.[METADATA_PAYMENT_ID];
    return {
      type: event.event_type,
      providerPaymentId: event.data?.payment?.id ?? event.entity_id,
      checkoutReference: event.data?.payment_link?.id ?? null,
      paymentId: typeof paymentId === "string" ? paymentId : null,
    };
  }

  async fetchPayment(providerPaymentId: string): Promise<ProviderPayment> {
    const payment = await this.call(
      "get payment",
      "GET",
      `/api/v2/payments/${encodeURIComponent(providerPaymentId)}`,
      paymentResponse,
    );
    return {
      id: payment.id,
      status: STATUS[payment.current_status] ?? "OTHER",
      amountMinor: payment.amount_in_smallest_unit,
      currency: payment.currency,
      paidAt: payment.payed_at ? new Date(payment.payed_at) : null,
    };
  }

  private async call<T>(
    operation: string,
    method: "GET" | "POST",
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(new URL(path, this.config.baseUrl), {
        method,
        headers: {
          "x-api-key": this.config.apiKey,
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        // The API never redirects; following one could send the key elsewhere.
        redirect: "error",
      });
    } catch {
      // Network failure or timeout. The cause is dropped: it can echo the URL and headers.
      throw new ProviderRequestFailed(operation, null, null);
    }

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = errorResponse.safeParse(payload);
      throw new ProviderRequestFailed(
        operation,
        response.status,
        error.success ? error.data.error.code : null,
      );
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) throw new ProviderRequestFailed(operation, null, "UNEXPECTED_RESPONSE");
    return parsed.data;
  }
}

function withPayment(url: string, paymentId: string): string {
  const target = new URL(url);
  target.searchParams.set("payment", paymentId);
  return target.toString();
}
