import { Inject, Injectable } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { z } from "zod";

import { APP_CONFIG, type AppConfig } from "../../../config/app-config.js";
import { OutboxEventType } from "../../../infrastructure/outbox/outbox.js";
import type { OutboxHandler, OutboxRecord } from "../../../infrastructure/outbox/outbox-relay.js";
import { USER_DIRECTORY, type UserDirectory } from "../../auth/auth.contract.js";
import {
  PAYMENT_RECEIPTS,
  type PaymentReceipts,
  SUBSCRIPTION_NOTICES,
  type SubscriptionNotices,
} from "../../billing/billing.contract.js";
import {
  type EmailTemplate,
  TRANSACTIONAL_EMAIL,
  type TransactionalEmail,
} from "../../email/email.contract.js";

/**
 * Event payloads carry ids only (outbox.ts): the person's address and the
 * payment's details are read here, when the email is written, so they are
 * never copied into a table that is not meant to hold them.
 */
const payload = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("PAYMENT_RECEIPT"), userId: z.uuid(), paymentId: z.uuid() }),
  z.object({ kind: z.literal("PAYMENT_REFUNDED"), userId: z.uuid(), paymentId: z.uuid() }),
  z.object({ kind: z.literal("PASSWORD_CHANGED"), userId: z.uuid() }),
  z.object({
    kind: z.literal("SUBSCRIPTION_ENDING"),
    userId: z.uuid(),
    entitlementId: z.uuid(),
  }),
]);
type EmailRequest = z.infer<typeof payload>;

/**
 * Turns "an email is owed" events into sent emails. Retried by the outbox
 * relay with backoff when the provider is down (EmailSendFailed bubbles up);
 * a message the provider rejects for good is logged and dropped, not retried
 * forever. Safe to run twice for one event: the delivery's idempotency key is
 * derived from what the email is about, so the provider sends it once.
 */
@Injectable()
export class EmailNotificationHandler implements OutboxHandler {
  readonly handles = [OutboxEventType.EmailRequested] as const;

  constructor(
    @Inject(TRANSACTIONAL_EMAIL) private readonly email: TransactionalEmail,
    @Inject(USER_DIRECTORY) private readonly directory: UserDirectory,
    @Inject(PAYMENT_RECEIPTS) private readonly receipts: PaymentReceipts,
    @Inject(SUBSCRIPTION_NOTICES) private readonly subscriptions: SubscriptionNotices,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @InjectPinoLogger(EmailNotificationHandler.name) private readonly logger: PinoLogger,
  ) {}

  async handle(event: OutboxRecord): Promise<void> {
    const parsed = payload.safeParse(event.payload);
    if (!parsed.success) {
      // A malformed event never becomes valid by waiting: drop it, loudly.
      this.logger.error({ eventId: event.id }, "Email request has an unreadable payload");
      return;
    }
    if (!this.email.enabled) {
      this.logger.warn(
        { eventId: event.id, kind: parsed.data.kind },
        "Email is not configured; notification skipped",
      );
      return;
    }

    const request = parsed.data;
    const recipient = (await this.directory.describe([request.userId])).get(request.userId);
    // A phone-only account has no mailbox: nothing to send, and not an error.
    if (!recipient?.email) return;

    const composed = await this.compose(request, event);
    if (!composed) return;
    const outcome = await this.email.deliver({
      userId: request.userId,
      to: recipient.email,
      template: composed.template,
      idempotencyKey: composed.idempotencyKey,
    });
    this.logger.info({ eventId: event.id, kind: request.kind, outcome }, "Notification handled");
  }

  private async compose(
    request: EmailRequest,
    event: OutboxRecord,
  ): Promise<{ template: EmailTemplate; idempotencyKey: string } | null> {
    const appUrl = this.config.email.appUrl;
    switch (request.kind) {
      case "PAYMENT_RECEIPT": {
        const receipt = await this.receipts.receiptFor(request.paymentId);
        // Someone else's payment, or one refunded since: no receipt for it.
        if (receipt?.studentId !== request.userId || receipt.status !== "SUCCEEDED") return null;
        if (!receipt.paidAt || !receipt.refundableUntil) return null;
        return {
          idempotencyKey: `receipt:${request.paymentId}`,
          template: {
            kind: "PAYMENT_RECEIPT",
            planName: receipt.planName,
            amountMinor: receipt.amountMinor,
            currency: receipt.currency,
            paidAt: receipt.paidAt,
            refundableUntil: receipt.refundableUntil,
            appUrl,
          },
        };
      }
      case "PAYMENT_REFUNDED": {
        const receipt = await this.receipts.receiptFor(request.paymentId);
        if (receipt?.studentId !== request.userId || receipt.status !== "REFUNDED") return null;
        return {
          idempotencyKey: `refund:${request.paymentId}`,
          template: {
            kind: "PAYMENT_REFUNDED",
            planName: receipt.planName,
            amountMinor: receipt.amountMinor,
            currency: receipt.currency,
          },
        };
      }
      case "PASSWORD_CHANGED":
        return {
          // One notice per change: the event id is the change.
          idempotencyKey: `password-changed:${event.id}`,
          template: { kind: "PASSWORD_CHANGED", changedAt: event.createdAt, appUrl },
        };
      case "SUBSCRIPTION_ENDING": {
        const notice = await this.subscriptions.endingNoticeFor(request.entitlementId);
        // Renewed, revoked or already over by the time the worker got here: nothing to say.
        if (notice?.studentId !== request.userId || !notice.stillEnding || !notice.endsAt) {
          return null;
        }
        return {
          idempotencyKey: `subscription-ending:${request.entitlementId}`,
          template: {
            kind: "SUBSCRIPTION_ENDING",
            examName: notice.examName,
            endsAt: notice.endsAt,
            appUrl,
          },
        };
      }
    }
  }
}
