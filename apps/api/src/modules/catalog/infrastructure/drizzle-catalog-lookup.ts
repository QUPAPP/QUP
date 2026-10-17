import { Inject, Injectable } from "@nestjs/common";
import { type Database, tables } from "@qup/db";
import { and, asc, eq, inArray } from "drizzle-orm";

import { DATABASE } from "../../../infrastructure/database/database.module.js";
import type {
  CatalogLookup,
  NodeSettings,
  PublishedTaxonomy,
  SkillLabel,
  TaxonomyVersionStatus,
} from "../catalog.contract.js";

const { exams, taxonomyVersions, domains, skills, subskills } = tables;

const toThreshold = (value: string | null) => (value === null ? null : Number(value));

@Injectable()
export class DrizzleCatalogLookup implements CatalogLookup {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async examNames(examIds: readonly string[]): Promise<Map<string, string>> {
    if (examIds.length === 0) return new Map();
    const rows = await this.db
      .select({ id: exams.id, name: exams.nameAr })
      .from(exams)
      .where(inArray(exams.id, [...examIds]));
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  async examStatus(examId: string) {
    const [row] = await this.db
      .select({ status: exams.status })
      .from(exams)
      .where(eq(exams.id, examId));
    return row?.status ?? null;
  }

  /** Three queries whatever the tree size (PRD §16: no N+1). */
  async publishedTaxonomy(examId: string): Promise<PublishedTaxonomy | null> {
    const [version] = await this.db
      .select({ id: taxonomyVersions.id })
      .from(taxonomyVersions)
      .where(and(eq(taxonomyVersions.examId, examId), eq(taxonomyVersions.status, "PUBLISHED")));
    if (!version) return null;

    const domainRows = await this.db
      .select({ id: domains.id, weight: domains.weight })
      .from(domains)
      .where(and(eq(domains.taxonomyVersionId, version.id), eq(domains.status, "ACTIVE")))
      .orderBy(asc(domains.displayOrder), asc(domains.code));
    const domainIds = domainRows.map((d) => d.id);

    const skillRows = domainIds.length
      ? await this.db
          .select({ id: skills.id, domainId: skills.domainId, weight: skills.weight })
          .from(skills)
          .where(and(inArray(skills.domainId, domainIds), eq(skills.status, "ACTIVE")))
          .orderBy(asc(skills.displayOrder), asc(skills.code))
      : [];
    const skillIds = skillRows.map((s) => s.id);

    const subskillRows = skillIds.length
      ? await this.db
          .select({ id: subskills.id, skillId: subskills.skillId })
          .from(subskills)
          .where(and(inArray(subskills.skillId, skillIds), eq(subskills.status, "ACTIVE")))
      : [];

    return {
      taxonomyVersionId: version.id,
      domains: domainRows.map((d) => ({
        id: d.id,
        weight: Number(d.weight),
        skills: skillRows
          .filter((s) => s.domainId === d.id)
          .map((s) => ({
            id: s.id,
            weight: Number(s.weight),
            subskillIds: subskillRows.filter((ss) => ss.skillId === s.id).map((ss) => ss.id),
          })),
      })),
    };
  }

  async versionStatus(taxonomyVersionId: string): Promise<TaxonomyVersionStatus | null> {
    const [row] = await this.db
      .select({ status: taxonomyVersions.status })
      .from(taxonomyVersions)
      .where(eq(taxonomyVersions.id, taxonomyVersionId));
    return row?.status ?? null;
  }

  async activeNodesInVersion(
    taxonomyVersionId: string,
    nodes: { skillIds: readonly string[]; subskillIds: readonly string[] },
  ): Promise<{ skillIds: Set<string>; subskillIds: Set<string> }> {
    const skillRows = nodes.skillIds.length
      ? await this.db
          .select({ id: skills.id })
          .from(skills)
          .innerJoin(domains, eq(domains.id, skills.domainId))
          .where(
            and(
              inArray(skills.id, [...nodes.skillIds]),
              eq(skills.status, "ACTIVE"),
              eq(domains.taxonomyVersionId, taxonomyVersionId),
            ),
          )
      : [];
    const subskillRows = nodes.subskillIds.length
      ? await this.db
          .select({ id: subskills.id })
          .from(subskills)
          .innerJoin(skills, eq(skills.id, subskills.skillId))
          .innerJoin(domains, eq(domains.id, skills.domainId))
          .where(
            and(
              inArray(subskills.id, [...nodes.subskillIds]),
              eq(subskills.status, "ACTIVE"),
              eq(domains.taxonomyVersionId, taxonomyVersionId),
            ),
          )
      : [];
    return {
      skillIds: new Set(skillRows.map((r) => r.id)),
      subskillIds: new Set(subskillRows.map((r) => r.id)),
    };
  }

  async nodeSettings(nodes: {
    skillIds: readonly string[];
    subskillIds: readonly string[];
  }): Promise<{ skills: Map<string, NodeSettings>; subskills: Map<string, NodeSettings> }> {
    const skillRows = nodes.skillIds.length
      ? await this.db
          .select({
            id: skills.id,
            masteryThreshold: skills.masteryThreshold,
            minCoverage: skills.minCoverage,
          })
          .from(skills)
          .where(inArray(skills.id, [...nodes.skillIds]))
      : [];
    const subskillRows = nodes.subskillIds.length
      ? await this.db
          .select({ id: subskills.id, masteryThreshold: subskills.masteryThreshold })
          .from(subskills)
          .where(inArray(subskills.id, [...nodes.subskillIds]))
      : [];

    return {
      skills: new Map(
        skillRows.map((s) => [
          s.id,
          { masteryThreshold: toThreshold(s.masteryThreshold), minCoverage: s.minCoverage },
        ]),
      ),
      subskills: new Map(
        subskillRows.map((s) => [
          s.id,
          { masteryThreshold: toThreshold(s.masteryThreshold), minCoverage: 0 },
        ]),
      ),
    };
  }

  async reportingSkills(nodes: {
    skillIds: readonly string[];
    subskillIds: readonly string[];
  }): Promise<{ skills: Map<string, SkillLabel>; subskills: Map<string, SkillLabel> }> {
    const skillRows = nodes.skillIds.length
      ? await this.db
          .select({ id: skills.id, name: skills.name })
          .from(skills)
          .where(inArray(skills.id, [...nodes.skillIds]))
      : [];
    const subskillRows = nodes.subskillIds.length
      ? await this.db
          .select({ subskillId: subskills.id, id: skills.id, name: skills.name })
          .from(subskills)
          .innerJoin(skills, eq(skills.id, subskills.skillId))
          .where(inArray(subskills.id, [...nodes.subskillIds]))
      : [];

    return {
      skills: new Map(skillRows.map((s) => [s.id, { id: s.id, name: s.name }])),
      subskills: new Map(subskillRows.map((s) => [s.subskillId, { id: s.id, name: s.name }])),
    };
  }
}
