import { tables } from "@qup/db";

import type { DbExecutor } from "../database/executor.js";

/**
 * Transactional outbox (ARCHITECTURE.md §10, AGENTS.md §7): an event is
 * written in the same transaction as the business change it reports, so it
 * exists exactly when the change committed. A worker drains it afterwards
 * (outbox-relay.ts). Payloads carry ids and facts, never names, contact
 * details or answers.
 */

export const OutboxEventType = {
  SessionCreated: "assessment.session.created",
  AttemptRecorded: "assessment.attempt.recorded",
  SessionCompleted: "assessment.session.completed",
  ReassessmentRecorded: "mastery.reassessment.recorded",
  ImportDraftsCreated: "import.drafts.created",
} as const;

export type OutboxEventType = (typeof OutboxEventType)[keyof typeof OutboxEventType];

/** Version of the payload shapes above; consumers read it from the projected event. */
export const OUTBOX_PAYLOAD_SCHEMA = "1";

export interface OutboxEvent {
  type: OutboxEventType;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, string | number | boolean | null>;
}

export async function writeOutbox(executor: DbExecutor, event: OutboxEvent): Promise<void> {
  await executor.insert(tables.outboxEvents).values({
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    eventType: event.type,
    payload: event.payload,
  });
}
