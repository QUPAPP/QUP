import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { CATALOG_LOOKUP, type CatalogLookup } from "../../catalog/catalog.contract.js";
import { Permission } from "../../rbac/permissions.js";
import { RequirePermissions } from "../../rbac/require-permissions.js";
import { QuestionBankStats } from "../infrastructure/question-bank-stats.js";

/** Below this many published questions a skill cannot be measured or trained well. */
const THIN_SKILL_QUESTIONS = 5;
const THIN_SKILLS_SHOWN = 20;

/**
 * Content metrics (OBSERVABILITY.md "Content"): the question bank's review
 * backlog and the skills with too few published questions. ADMIN only.
 */
@ApiTags("admin: analytics")
@RequirePermissions(Permission.AuditView)
@Controller("admin/analytics")
export class AdminContentAnalyticsController {
  constructor(
    private readonly stats: QuestionBankStats,
    @Inject(CATALOG_LOOKUP) private readonly catalog: CatalogLookup,
  ) {}

  @Get("content")
  @ApiOperation({ summary: "Questions by status, review backlog, and thin skills of live exams." })
  async content() {
    const questions = await this.stats.latestStatusCounts();
    const thinSkills: { examName: string; skillName: string; published: number }[] = [];
    for (const exam of await this.catalog.activeExams()) {
      const taxonomy = await this.catalog.profileTaxonomy(exam.id);
      if (!taxonomy) continue;
      const skills = taxonomy.domains.flatMap((domain) => domain.skills);
      const published = await this.stats.publishedPerNode(
        skills.map((skill) => skill.id),
        skills.flatMap((skill) => skill.subskills.map((sub) => sub.id)),
      );
      for (const skill of skills) {
        const count =
          (published.get(skill.id) ?? 0) +
          skill.subskills.reduce((sum, sub) => sum + (published.get(sub.id) ?? 0), 0);
        if (count < THIN_SKILL_QUESTIONS) {
          thinSkills.push({ examName: exam.nameAr, skillName: skill.name, published: count });
        }
      }
    }
    return {
      questions,
      reviewBacklog: (questions.UNDER_REVIEW ?? 0) + (questions.APPROVED ?? 0),
      thinSkills: thinSkills.sort((a, b) => a.published - b.published).slice(0, THIN_SKILLS_SHOWN),
    };
  }
}
