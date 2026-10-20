import { Controller, Get, Inject, Param } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { uuidParam } from "../../../common/validation/schemas.js";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe.js";
import {
  type AuthoringExam,
  CATALOG_LOOKUP,
  type CatalogLookup,
  type TaxonomyOutline,
} from "../../catalog/catalog.contract.js";
import { Permission } from "../../rbac/permissions.js";
import { RequirePermissions } from "../../rbac/require-permissions.js";
import { AuthoringTaxonomyNotFound } from "../domain/questions.errors.js";

/**
 * What a question author needs to choose a taxonomy and map skills, without
 * taxonomy.manage (admins only, OPEN_QUESTIONS.md #16a): read-only, through the
 * catalog's public contract, never its tables.
 */
@ApiTags("admin: questions")
@RequirePermissions(Permission.QuestionsCreate)
@Controller("admin/question-authoring")
export class QuestionAuthoringController {
  constructor(@Inject(CATALOG_LOOKUP) private readonly catalog: CatalogLookup) {}

  @Get("taxonomies")
  @ApiOperation({ summary: "Exams in use, each with its taxonomy versions that are not archived." })
  async taxonomies(): Promise<{ items: AuthoringExam[] }> {
    // Exams number in the single digits (PRD §4); pagination adds nothing.
    return { items: await this.catalog.authoringTaxonomies() };
  }

  @Get("taxonomy-versions/:id/outline")
  @ApiOperation({ summary: "A version's active domains, skills and subskills, for mapping." })
  async outline(
    @Param("id", new ZodValidationPipe(uuidParam)) versionId: string,
  ): Promise<TaxonomyOutline> {
    const outline = await this.catalog.activeOutline(versionId);
    if (!outline) throw new AuthoringTaxonomyNotFound();
    return outline;
  }
}
