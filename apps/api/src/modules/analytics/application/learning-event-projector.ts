import { Inject, Injectable } from "@nestjs/common";
import { type Database, tables } from "@qup/db";

import { DATABASE } from "../../../infrastructure/database/database.module.js";
import { OUTBOX_PAYLOAD_SCHEMA, OutboxEventType } from "../../../infrastructure/outbox/outbox.js";
import type { OutboxHandler, OutboxRecord } from "../../../infrastructure/outbox/outbox-relay.js";

/**
 * The analytics stream (OBSERVABILITY.md "Metrics"): every outbox event that
 * describes learning or content becomes one `learning_events` row. The row
 * takes the event's id, so handling an event twice changes nothing.
 */
@Injectable()
export class LearningEventProjector implements OutboxHandler {
  readonly handles: readonly string[] = Object.values(OutboxEventType);

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async handle(event: OutboxRecord): Promise<void> {
    const studentId = event.payload.studentId;
    await this.db
      .insert(tables.learningEvents)
      .values({
        id: event.id,
        studentId: typeof studentId === "string" ? studentId : null,
        eventType: event.eventType,
        payload: event.payload,
        schemaVersion: OUTBOX_PAYLOAD_SCHEMA,
        occurredAt: event.createdAt,
      })
      .onConflictDoNothing({ target: tables.learningEvents.id });
  }
}
