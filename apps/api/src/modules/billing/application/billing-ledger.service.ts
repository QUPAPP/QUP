import { Inject, Injectable } from "@nestjs/common";

import type { PurchaseFacts } from "../billing.contract.js";
import {
  BILLING_STORE,
  type BillingStore,
  type PaymentFilter,
  type PaymentRecord,
  type RevenueSummary,
} from "../domain/ports.js";

const MS_PER_DAY = 86_400_000;

export interface LedgerPage {
  items: PaymentRecord[];
  /** Pass back as `before` for the next page; null on the last one. */
  next: { createdAt: Date; id: string } | null;
}

/**
 * The admin's view of money: every payment, who made it and for what, and
 * what came in over a period. Read-only; refunds are made at Stream and reach
 * QUP through its webhook (OPEN_QUESTIONS.md #5).
 */
@Injectable()
export class BillingLedgerService implements PurchaseFacts {
  constructor(@Inject(BILLING_STORE) private readonly store: BillingStore) {}

  payingStudentsAmong(studentIds: readonly string[], since: Date): Promise<number> {
    return this.store.payingStudentsAmong(studentIds, since);
  }

  async list(filter: PaymentFilter): Promise<LedgerPage> {
    // One extra row tells whether another page exists, without a count query.
    const rows = await this.store.listPayments({ ...filter, limit: filter.limit + 1 });
    const items = rows.slice(0, filter.limit);
    const last = items.at(-1);
    return {
      items,
      next: rows.length > filter.limit && last ? { createdAt: last.createdAt, id: last.id } : null,
    };
  }

  summary(days: number, now = new Date()): Promise<RevenueSummary> {
    return this.store.revenueSummary(new Date(now.getTime() - days * MS_PER_DAY));
  }
}
