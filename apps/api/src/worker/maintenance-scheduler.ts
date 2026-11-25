import { Inject, Injectable } from "@nestjs/common";
import { InjectPinoLogger, type PinoLogger } from "nestjs-pino";

import { RetentionSweeper } from "../infrastructure/maintenance/retention-sweeper.js";
import {
  SUBSCRIPTION_NOTICES,
  type SubscriptionNotices,
} from "../modules/billing/billing.contract.js";

/** How often the periodic jobs run. Each is idempotent, so a missed or doubled run is harmless. */
export const MAINTENANCE_INTERVAL_MS = 60 * 60_000;

type SchedulerLogger = Pick<PinoLogger, "info" | "error">;

/**
 * The worker's periodic jobs, beside the outbox relay: delete operational rows
 * past their retention, and queue "your subscription ends soon" emails. Both
 * may run on several workers at once (deletes are idempotent; reminders claim
 * rows with SKIP LOCKED), so no leader election is needed.
 */
@Injectable()
export class MaintenanceScheduler {
  constructor(
    private readonly retention: RetentionSweeper,
    @Inject(SUBSCRIPTION_NOTICES) private readonly subscriptions: SubscriptionNotices,
    @InjectPinoLogger(MaintenanceScheduler.name) private readonly logger: SchedulerLogger,
  ) {}

  /** One pass of every job. A failing job is logged and does not stop the others. */
  async runOnce(now = new Date()): Promise<void> {
    try {
      const removed = await this.retention.sweep();
      this.logger.info({ removed }, "Retention sweep done");
    } catch (error) {
      this.logger.error({ err: error }, "Retention sweep failed");
    }
    try {
      const queued = await this.subscriptions.queueEndingReminders(now);
      this.logger.info({ queued }, "Subscription reminders queued");
    } catch (error) {
      this.logger.error({ err: error }, "Queueing subscription reminders failed");
    }
  }

  /** Runs every job now, then every MAINTENANCE_INTERVAL_MS until the signal aborts. */
  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      await this.runOnce();
      await waitFor(MAINTENANCE_INTERVAL_MS, signal);
    }
  }
}

function waitFor(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
}
