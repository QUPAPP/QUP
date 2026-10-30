import { Inject, Injectable } from "@nestjs/common";

import type { ActorContext } from "../../../common/actor.js";
import {
  type DirectoryEntry,
  USER_DIRECTORY,
  type UserDirectory,
} from "../../auth/auth.contract.js";
import { CATALOG_LOOKUP, type CatalogLookup } from "../../catalog/catalog.contract.js";
import type { ExamAccess } from "../billing.contract.js";
import { EntitlementNotFound, ExamNotFound, StudentNotFound } from "../domain/billing.errors.js";
import { accessSummary } from "../domain/entitlement-period.js";
import { BILLING_STORE, type BillingStore, type Entitlement } from "../domain/ports.js";

export interface AccessStatus {
  hasAccess: boolean;
  /** Null with access: it does not end. Null without: there is none. */
  activeUntil: Date | null;
}

/**
 * Entitlements: a student's right to an exam's paid features (DOMAIN_MODEL.md
 * §1). Whether one is in force is computed from its dates at read time, so
 * access ends on time without a scheduled job (OPEN_QUESTIONS.md #5a).
 */
@Injectable()
export class EntitlementsService implements ExamAccess {
  constructor(
    @Inject(BILLING_STORE) private readonly store: BillingStore,
    @Inject(CATALOG_LOOKUP) private readonly catalog: CatalogLookup,
    @Inject(USER_DIRECTORY) private readonly directory: UserDirectory,
  ) {}

  async accessTo(studentId: string, examId: string): Promise<AccessStatus> {
    const { asOf, entitlements } = await this.store.entitlementSnapshot(studentId, examId);
    return accessSummary(entitlements, asOf);
  }

  async hasExamAccess(studentId: string, examId: string): Promise<boolean> {
    return (await this.accessTo(studentId, examId)).hasAccess;
  }

  listFor(studentId: string): Promise<Entitlement[]> {
    return this.store.entitlementsFor(studentId);
  }

  async lookupStudent(
    identifier: string,
  ): Promise<{ student: DirectoryEntry; entitlements: Entitlement[] }> {
    const student = await this.directory.findByIdentifier(identifier);
    if (!student) throw new StudentNotFound();
    return { student, entitlements: await this.store.entitlementsFor(student.id) };
  }

  async grantByAdmin(
    input: { studentId: string; examId: string; durationDays: number | null },
    actor: ActorContext,
  ): Promise<Entitlement> {
    if (!(await this.store.studentExists(input.studentId))) throw new StudentNotFound();
    if ((await this.catalog.examStatus(input.examId)) === null) throw new ExamNotFound();
    return this.store.grantByAdmin(input, actor);
  }

  async revoke(entitlementId: string, actor: ActorContext): Promise<Entitlement> {
    const revoked = await this.store.revokeEntitlement(entitlementId, actor);
    if (!revoked) throw new EntitlementNotFound();
    return revoked;
  }
}
