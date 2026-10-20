import { Controller, Get, Inject, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";

import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe.js";
import { ADAPTIVE_SELECTOR, type AdaptiveSelector } from "../../adaptive/adaptive.contract.js";
import { CATALOG_LOOKUP, type CatalogLookup } from "../../catalog/catalog.contract.js";
import { Permission } from "../../rbac/permissions.js";
import { RequirePermissions } from "../../rbac/require-permissions.js";
import { AssessmentNotFound } from "../domain/assessment.errors.js";
import { ASSESSMENT_STORE, type AssessmentStore } from "../domain/ports.js";

const decisionsQuery = z.strictObject({ sessionId: z.uuid() });

/**
 * "لماذا اختير هذا السؤال؟" (OBSERVABILITY.md): every adaptive decision of a
 * session, in item order, as stored. ADMIN only (audit.view). Carries no
 * answer key and no attempt answers.
 */
@ApiTags("admin: audit")
@RequirePermissions(Permission.AuditView)
@Controller("admin")
export class AdminDecisionsController {
  constructor(
    @Inject(ASSESSMENT_STORE) private readonly store: AssessmentStore,
    @Inject(ADAPTIVE_SELECTOR) private readonly adaptive: AdaptiveSelector,
    @Inject(CATALOG_LOOKUP) private readonly catalog: CatalogLookup,
  ) {}

  @Get("adaptive-decisions")
  @ApiOperation({ summary: "The adaptive decisions behind a session's items, in order." })
  async decisions(
    @Query(new ZodValidationPipe(decisionsQuery)) query: z.output<typeof decisionsQuery>,
  ) {
    const session = await this.store.findSession(query.sessionId);
    if (!session) throw new AssessmentNotFound();
    const items = await this.store.items(session.id);
    const details = await this.adaptive.decisionDetails(
      items.flatMap((item) => (item.adaptiveDecisionId ? [item.adaptiveDecisionId] : [])),
    );
    const examName = (await this.catalog.examNames([session.examId])).get(session.examId) ?? "";
    return {
      session: {
        id: session.id,
        type: session.type,
        status: session.status,
        examId: session.examId,
        examName,
        studentId: session.studentId,
        createdAt: session.createdAt.toISOString(),
      },
      items: items.flatMap((item) => {
        const detail = item.adaptiveDecisionId ? details.get(item.adaptiveDecisionId) : undefined;
        return detail
          ? [{ itemOrdinal: item.ordinal, answered: item.attempt !== null, ...detail }]
          : [];
      }),
    };
  }
}
