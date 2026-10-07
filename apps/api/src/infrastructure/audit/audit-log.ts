import { tables } from "@qup/db";

import type { ActorContext } from "../../common/actor.js";
import type { DbExecutor } from "../database/executor.js";

/**
 * Audit log (SECURITY.md "Audit", OBSERVABILITY.md "Audit Log vs App Log"):
 * the durable record of security-sensitive actions — who did what to which
 * resource, correlated to the request. The table is append-only (0001 guard).
 *
 * Write the entry through the same executor as the change it records, inside
 * one transaction: a publish without its audit entry, or an audit entry for a
 * publish that rolled back, must both be impossible.
 *
 * `metadata` must be minimal and already safe to keep forever: identifiers and
 * outcomes, never passwords, tokens, or personal data beyond ids.
 */

export const AuditAction = {
  RoleGranted: "user.role.grant",
  TaxonomyPublished: "taxonomy.publish",
  QuestionPublished: "question.publish",
  QuestionArchived: "question.archive",
  PlanActivated: "plan.activate",
  PlanRetired: "plan.retire",
  EntitlementGranted: "entitlement.grant",
  EntitlementRevoked: "entitlement.revoke",
  PaymentSettled: "payment.settle",
  PaymentRefunded: "payment.refund",
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuditEntry {
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export async function writeAudit(
  executor: DbExecutor,
  actor: ActorContext,
  entry: AuditEntry,
): Promise<void> {
  await executor.insert(tables.auditLogs).values({
    actorId: actor.userId,
    requestId: actor.requestId,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    metadataRedacted: entry.metadata ?? null,
  });
}
