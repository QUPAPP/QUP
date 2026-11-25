import { Inject, Injectable } from "@nestjs/common";

import { CATALOG_LOOKUP, type CatalogLookup } from "../../catalog/catalog.contract.js";
import type { EndingSubscriptionNotice, SubscriptionNotices } from "../billing.contract.js";
import { BILLING_STORE, type BillingStore } from "../domain/ports.js";
import { reminderHorizon } from "../domain/reminder-policy.js";

/** Reminders queued per sweep; a backlog drains over the next sweeps. */
const REMINDER_BATCH = 200;

/** "Your subscription ends soon" (reminder-policy.ts): queued by the worker, written by notifications. */
@Injectable()
export class SubscriptionRemindersService implements SubscriptionNotices {
  constructor(
    @Inject(BILLING_STORE) private readonly store: BillingStore,
    @Inject(CATALOG_LOOKUP) private readonly catalog: CatalogLookup,
  ) {}

  async queueEndingReminders(now: Date): Promise<number> {
    let total = 0;
    // Each batch marks what it claims, so the next one sees only rows not yet handled.
    for (;;) {
      const { claimed, queued } = await this.store.queueEndingReminders({
        endingBefore: reminderHorizon(now),
        limit: REMINDER_BATCH,
      });
      total += queued;
      if (claimed < REMINDER_BATCH) return total;
    }
  }

  async endingNoticeFor(entitlementId: string): Promise<EndingSubscriptionNotice | null> {
    const notice = await this.store.endingNotice(entitlementId);
    if (!notice) return null;
    const names = await this.catalog.examNames([notice.examId]);
    return {
      studentId: notice.studentId,
      examName: names.get(notice.examId) ?? "",
      endsAt: notice.endsAt,
      stillEnding: notice.stillEnding,
    };
  }
}
