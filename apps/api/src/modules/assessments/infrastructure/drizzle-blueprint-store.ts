import { Inject, Injectable } from "@nestjs/common";
import { type Database, tables } from "@qup/db";
import { and, asc, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";

import type { ActorContext } from "../../../common/actor.js";
import { AuditAction, writeAudit } from "../../../infrastructure/audit/audit-log.js";
import { DATABASE } from "../../../infrastructure/database/database.module.js";
import { PgErrorCode, pgErrorInfo } from "../../../infrastructure/database/postgres-errors.js";
import { BlueprintCodeTaken } from "../domain/assessment.errors.js";
import {
  BLUEPRINT_CONFIG_VERSION,
  BLUEPRINT_QUESTION_COUNT,
  type Blueprint,
  DIAGNOSTIC_BLUEPRINT_TYPES,
  type DiagnosticBlueprintType,
} from "../domain/blueprint.js";
import type { BlueprintChanges, BlueprintStore, NewBlueprint } from "../domain/ports.js";

const { assessmentBlueprints: blueprints, blueprintRules: rules } = tables;

type Executor = Pick<Database, "select">;

const columns = {
  id: blueprints.id,
  examId: blueprints.examId,
  taxonomyVersionId: blueprints.taxonomyVersionId,
  type: blueprints.type,
  code: blueprints.code,
  name: blueprints.name,
  questionCount: blueprints.maxQuestions,
  status: blueprints.status,
  createdAt: blueprints.createdAt,
  updatedAt: blueprints.updatedAt,
};
type Row = { [K in keyof typeof columns]: (typeof columns)[K]["_"]["data"] };

/** Blueprints of the other session types are not managed here yet (B2 covers diagnostics). */
const diagnosticOnly = inArray(blueprints.type, [...DIAGNOSTIC_BLUEPRINT_TYPES]);
const AUDIT_RESOURCE = "assessment_blueprint";

@Injectable()
export class DrizzleBlueprintStore implements BlueprintStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listForExam(examId: string): Promise<Blueprint[]> {
    const rows = await this.db
      .select(columns)
      .from(blueprints)
      .where(and(eq(blueprints.examId, examId), diagnosticOnly))
      .orderBy(desc(blueprints.createdAt), desc(blueprints.id));
    return withWeights(this.db, rows);
  }

  async find(blueprintId: string): Promise<Blueprint | null> {
    return findIn(this.db, blueprintId);
  }

  async active(examId: string, type: DiagnosticBlueprintType): Promise<Blueprint | null> {
    const rows = await this.db
      .select(columns)
      .from(blueprints)
      .where(
        and(
          eq(blueprints.examId, examId),
          eq(blueprints.type, type),
          eq(blueprints.status, "ACTIVE"),
        ),
      );
    return (await withWeights(this.db, rows))[0] ?? null;
  }

  async create(input: NewBlueprint): Promise<Blueprint> {
    try {
      const [row] = await this.db
        .insert(blueprints)
        .values({
          examId: input.examId,
          taxonomyVersionId: input.taxonomyVersionId,
          type: input.type,
          code: input.code,
          name: input.name,
          // The planner proceeds with what is available, as the mini diagnostic always has.
          minQuestions: BLUEPRINT_QUESTION_COUNT.min,
          maxQuestions: input.questionCount,
          configVersion: BLUEPRINT_CONFIG_VERSION,
        })
        .returning(columns);
      if (!row) throw new Error("Blueprint insert returned no row.");
      return toBlueprint(row, new Map());
    } catch (error) {
      const info = pgErrorInfo(error);
      if (
        info?.code === PgErrorCode.uniqueViolation &&
        info.constraint === "assessment_blueprints_exam_code_unique"
      ) {
        throw new BlueprintCodeTaken();
      }
      throw error;
    }
  }

  updateDraft(blueprintId: string, changes: BlueprintChanges): Promise<Blueprint | null> {
    return this.db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ status: blueprints.status })
        .from(blueprints)
        .where(eq(blueprints.id, blueprintId))
        .for("update");
      if (locked?.status !== "DRAFT") return null;

      await tx
        .update(blueprints)
        .set({
          // Always written, so a weights-only change still moves updated_at (trigger 0001).
          updatedAt: new Date(),
          ...(changes.name === undefined ? {} : { name: changes.name }),
          ...(changes.questionCount === undefined ? {} : { maxQuestions: changes.questionCount }),
        })
        .where(eq(blueprints.id, blueprintId));

      for (const [domainId, weight] of changes.domainWeights ?? []) {
        await tx
          .delete(rules)
          .where(and(eq(rules.blueprintId, blueprintId), eq(rules.domainId, domainId)));
        if (weight !== null) {
          await tx.insert(rules).values({ blueprintId, domainId, targetWeight: String(weight) });
        }
      }
      return findIn(tx, blueprintId);
    });
  }

  activate(blueprintId: string, actor: ActorContext): Promise<Blueprint | null> {
    return this.db.transaction(async (tx) => {
      const [target] = await tx
        .select({ examId: blueprints.examId, type: blueprints.type })
        .from(blueprints)
        .where(eq(blueprints.id, blueprintId));
      if (!target) return null;

      // Every blueprint of this exam and type, locked in one order: concurrent
      // activations queue here, and the later one archives what the earlier
      // one activated (the one-active index is the backstop, migration 0012).
      const siblings = await tx
        .select({ id: blueprints.id, status: blueprints.status })
        .from(blueprints)
        .where(and(eq(blueprints.examId, target.examId), eq(blueprints.type, target.type)))
        .orderBy(asc(blueprints.id))
        .for("update");
      if (siblings.find((s) => s.id === blueprintId)?.status !== "DRAFT") return null;
      const previous = siblings.find((s) => s.status === "ACTIVE");

      await tx
        .update(blueprints)
        .set({ status: "ARCHIVED" })
        .where(
          and(
            eq(blueprints.examId, target.examId),
            eq(blueprints.type, target.type),
            eq(blueprints.status, "ACTIVE"),
            ne(blueprints.id, blueprintId),
          ),
        );
      await tx.update(blueprints).set({ status: "ACTIVE" }).where(eq(blueprints.id, blueprintId));
      await writeAudit(tx, actor, {
        action: AuditAction.BlueprintActivated,
        resourceType: AUDIT_RESOURCE,
        resourceId: blueprintId,
        metadata: { examId: target.examId, type: target.type, archived: previous?.id ?? null },
      });
      return findIn(tx, blueprintId);
    });
  }

  archive(blueprintId: string, actor: ActorContext): Promise<Blueprint> {
    return this.db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ status: blueprints.status })
        .from(blueprints)
        .where(eq(blueprints.id, blueprintId))
        .for("update");
      if (locked && locked.status !== "ARCHIVED") {
        await tx
          .update(blueprints)
          .set({ status: "ARCHIVED" })
          .where(eq(blueprints.id, blueprintId));
        await writeAudit(tx, actor, {
          action: AuditAction.BlueprintArchived,
          resourceType: AUDIT_RESOURCE,
          resourceId: blueprintId,
          metadata: { from: locked.status },
        });
      }
      const archived = await findIn(tx, blueprintId);
      if (!archived) throw new Error(`Blueprint ${blueprintId} vanished while archiving.`);
      return archived;
    });
  }
}

async function findIn(executor: Executor, blueprintId: string): Promise<Blueprint | null> {
  const rows = await executor
    .select(columns)
    .from(blueprints)
    .where(and(eq(blueprints.id, blueprintId), diagnosticOnly));
  return (await withWeights(executor, rows))[0] ?? null;
}

/** One query for every blueprint's domain overrides (no N+1). */
async function withWeights(executor: Executor, rows: readonly Row[]): Promise<Blueprint[]> {
  if (rows.length === 0) return [];
  const ruleRows = await executor
    .select({
      blueprintId: rules.blueprintId,
      domainId: rules.domainId,
      weight: rules.targetWeight,
    })
    .from(rules)
    .where(
      and(
        inArray(
          rules.blueprintId,
          rows.map((r) => r.id),
        ),
        isNotNull(rules.domainId),
        isNotNull(rules.targetWeight),
      ),
    );
  return rows.map((row) =>
    toBlueprint(
      row,
      new Map(
        ruleRows.flatMap((rule) =>
          rule.blueprintId === row.id && rule.domainId
            ? [[rule.domainId, Number(rule.weight)] as const]
            : [],
        ),
      ),
    ),
  );
}

function toBlueprint(row: Row, domainWeights: Map<string, number>): Blueprint {
  const type = DIAGNOSTIC_BLUEPRINT_TYPES.find((t) => t === row.type);
  if (!type) throw new Error(`Blueprint ${row.id} is not a diagnostic blueprint.`);
  return { ...row, type, domainWeights };
}
