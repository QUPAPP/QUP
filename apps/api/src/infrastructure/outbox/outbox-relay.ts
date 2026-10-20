import { Inject, Injectable } from "@nestjs/common";
import { type Database, tables } from "@qup/db";
import { eq, sql } from "drizzle-orm";
import { InjectPinoLogger, type PinoLogger } from "nestjs-pino";

import { DATABASE } from "../database/database.module.js";

const { outboxEvents } = tables;

export const OUTBOX_CONFIG = Object.freeze({
  /** Events claimed per drain. */
  batchSize: 50,
  /** Idle wait between drains when nothing was due. */
  pollMs: 2_000,
  /** Failed handling attempts before an event is FAILED for a person to look at. */
  maxAttempts: 8,
  /** Backoff after the n-th failure: min(base × 2^n, max). */
  baseBackoffMs: 5_000,
  maxBackoffMs: 600_000,
  /** How long a claim lasts: a worker that dies mid-way loses its events after this. */
  leaseMs: 300_000,
  /** Error text kept on the row; longer messages are cut. */
  maxErrorChars: 500,
});

export interface OutboxRecord {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  attempts: number;
  createdAt: Date;
}

/** Does something with events of the given types; must be safe to run twice for one event. */
export interface OutboxHandler {
  handles: readonly string[];
  handle(event: OutboxRecord): Promise<void>;
}

export const OUTBOX_HANDLERS = Symbol("OUTBOX_HANDLERS");

type RelayLogger = Pick<PinoLogger, "info" | "warn" | "error">;

/**
 * Drains the outbox (ARCHITECTURE.md §10). Events are claimed with
 * FOR UPDATE SKIP LOCKED under a lease, so any number of workers can run:
 * none handles an event another holds, and an event whose worker died is
 * claimed again when its lease runs out. Handlers are idempotent; a failing
 * one is retried with exponential backoff, then left FAILED.
 */
@Injectable()
export class OutboxRelay {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(OUTBOX_HANDLERS) private readonly handlers: readonly OutboxHandler[],
    @InjectPinoLogger(OutboxRelay.name) private readonly logger: RelayLogger,
  ) {}

  /** Handles what is due now; returns how many events were claimed. */
  async drain(limit: number = OUTBOX_CONFIG.batchSize): Promise<number> {
    const claimed = await this.claim(limit);
    for (const event of claimed) await this.handle(event);
    return claimed.length;
  }

  /** Drains until the signal aborts, waiting `pollMs` whenever nothing was due. */
  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      let claimed = 0;
      try {
        claimed = await this.drain();
      } catch (error) {
        this.logger.error({ err: error }, "Outbox drain failed");
      }
      if (claimed === 0 && !signal.aborted) await sleep(OUTBOX_CONFIG.pollMs, signal);
    }
  }

  private async claim(limit: number): Promise<OutboxRecord[]> {
    const rows = await this.db.execute<{
      id: string;
      aggregate_type: string;
      aggregate_id: string;
      event_type: string;
      payload: Record<string, unknown>;
      attempts: number;
      created_at: string;
    }>(sql`
      UPDATE ${outboxEvents}
      SET status = 'PROCESSING',
          available_at = now() + make_interval(secs => ${OUTBOX_CONFIG.leaseMs / 1000})
      WHERE id IN (
        SELECT id FROM ${outboxEvents}
        WHERE status IN ('PENDING', 'PROCESSING') AND available_at <= now()
        ORDER BY available_at, created_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, aggregate_type, aggregate_id, event_type, payload, attempts, created_at`);
    return rows.map((row) => ({
      id: row.id,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      payload: row.payload,
      attempts: row.attempts,
      createdAt: new Date(row.created_at),
    }));
  }

  private async handle(event: OutboxRecord): Promise<void> {
    try {
      for (const handler of this.handlers) {
        if (handler.handles.includes(event.eventType)) await handler.handle(event);
      }
      await this.db
        .update(outboxEvents)
        .set({ status: "PUBLISHED", publishedAt: sql`now()`, lastError: null })
        .where(eq(outboxEvents.id, event.id));
    } catch (error) {
      const attempts = event.attempts + 1;
      const failed = attempts >= OUTBOX_CONFIG.maxAttempts;
      const backoffMs = Math.min(
        OUTBOX_CONFIG.baseBackoffMs * 2 ** attempts,
        OUTBOX_CONFIG.maxBackoffMs,
      );
      await this.db
        .update(outboxEvents)
        .set({
          status: failed ? "FAILED" : "PENDING",
          attempts,
          lastError: String(error instanceof Error ? error.message : error).slice(
            0,
            OUTBOX_CONFIG.maxErrorChars,
          ),
          availableAt: sql`now() + make_interval(secs => ${backoffMs / 1000})`,
        })
        .where(eq(outboxEvents.id, event.id));
      const log = { eventId: event.id, eventType: event.eventType, attempts };
      if (failed) this.logger.error(log, "Outbox event failed for good");
      else this.logger.warn(log, "Outbox event failed; will retry");
    }
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
