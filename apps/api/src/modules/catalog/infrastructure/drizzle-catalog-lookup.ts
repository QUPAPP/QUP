import { Inject, Injectable } from "@nestjs/common";
import { type Database, tables } from "@qup/db";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";

import { DATABASE } from "../../../infrastructure/database/database.module.js";
import type {
  AuthoringExam,
  CatalogLookup,
  NodeSettings,
  ProfileTaxonomy,
  PublishedTaxonomy,
  SkillLabel,
  TaxonomyOutline,
  TaxonomyVersionStatus,
} from "../catalog.contract.js";

const { exams, taxonomyVersions, domains, skills, subskills, skillPrerequisites } = tables;

const toThreshold = (value: string | null) => (value === null ? null : Number(value));

@Injectable()
export class DrizzleCatalogLookup implements CatalogLookup {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Five queries whatever the tree size (PRD §16: no N+1). */
  async profileTaxonomy(examId: string): Promise<ProfileTaxonomy | null> {
    const [version] = await this.db
      .select({ id: taxonomyVersions.id })
      .from(taxonomyVersions)
      .where(and(eq(taxonomyVersions.examId, examId), eq(taxonomyVersions.status, "PUBLISHED")));
    if (!version) return null;

    const domainRows = await this.db
      .select({ id: domains.id, name: domains.name, weight: domains.weight })
      .from(domains)
      .where(and(eq(domains.taxonomyVersionId, version.id), eq(domains.status, "ACTIVE")))
      .orderBy(asc(domains.displayOrder), asc(domains.code));
    const domainIds = domainRows.map((d) => d.id);

    const skillRows = domainIds.length
      ? await this.db
          .select({
            id: skills.id,
            domainId: skills.domainId,
            name: skills.name,
            weight: skills.weight,
            priorityWeight: skills.priorityWeight,
            masteryThreshold: skills.masteryThreshold,
            minCoverage: skills.minCoverage,
          })
          .from(skills)
          .where(and(inArray(skills.domainId, domainIds), eq(skills.status, "ACTIVE")))
          .orderBy(asc(skills.displayOrder), asc(skills.code))
      : [];
    const skillIds = skillRows.map((s) => s.id);

    const subskillRows = skillIds.length
      ? await this.db
          .select({
            id: subskills.id,
            skillId: subskills.skillId,
            name: subskills.name,
            weight: subskills.weight,
            masteryThreshold: subskills.masteryThreshold,
          })
          .from(subskills)
          .where(and(inArray(subskills.skillId, skillIds), eq(subskills.status, "ACTIVE")))
          .orderBy(asc(subskills.displayOrder), asc(subskills.code))
      : [];
    const activeSkills = new Set(skillIds);
    const prerequisiteRows = skillIds.length
      ? await this.db
          .select({
            skillId: skillPrerequisites.skillId,
            prerequisiteSkillId: skillPrerequisites.prerequisiteSkillId,
          })
          .from(skillPrerequisites)
          .where(inArray(skillPrerequisites.skillId, skillIds))
      : [];

    return {
      domains: domainRows.map((d) => ({
        id: d.id,
        name: d.name,
        weight: Number(d.weight),
        skills: skillRows
          .filter((s) => s.domainId === d.id)
          .map((s) => ({
            id: s.id,
            name: s.name,
            weight: Number(s.weight),
            priorityWeight: Number(s.priorityWeight),
            masteryThreshold: toThreshold(s.masteryThreshold),
            minCoverage: s.minCoverage,
            prerequisiteSkillIds: prerequisiteRows
              .filter((p) => p.skillId === s.id && activeSkills.has(p.prerequisiteSkillId))
              .map((p) => p.prerequisiteSkillId),
            subskills: subskillRows
              .filter((ss) => ss.skillId === s.id)
              .map((ss) => ({
                id: ss.id,
                name: ss.name,
                weight: Number(ss.weight),
                masteryThreshold: toThreshold(ss.masteryThreshold),
              })),
          })),
      })),
    };
  }

  /** Two queries whatever the number of exams. */
  async authoringTaxonomies(): Promise<AuthoringExam[]> {
    const examRows = await this.db
      .select({ id: exams.id, code: exams.code, nameAr: exams.nameAr, status: exams.status })
      .from(exams)
      .where(ne(exams.status, "ARCHIVED"))
      .orderBy(asc(exams.code));
    if (examRows.length === 0) return [];

    const versionRows = await this.db
      .select({
        id: taxonomyVersions.id,
        examId: taxonomyVersions.examId,
        versionCode: taxonomyVersions.versionCode,
        status: taxonomyVersions.status,
      })
      .from(taxonomyVersions)
      .where(
        and(
          inArray(
            taxonomyVersions.examId,
            examRows.map((exam) => exam.id),
          ),
          ne(taxonomyVersions.status, "ARCHIVED"),
        ),
      )
      .orderBy(desc(taxonomyVersions.createdAt), desc(taxonomyVersions.id));

    return examRows.map((exam) => ({
      // Archived exams were filtered out above.
      exam: { ...exam, status: exam.status as "DRAFT" | "ACTIVE" },
      versions: versionRows
        .filter((version) => version.examId === exam.id)
        .map(({ id, versionCode, status }) => ({
          id,
          versionCode,
          // Archived versions were filtered out above.
          status: status as "DRAFT" | "PUBLISHED",
        })),
    }));
  }

  /** Four queries whatever the tree size (PRD §16: no N+1). */
  async activeOutline(taxonomyVersionId: string): Promise<TaxonomyOutline | null> {
    const [version] = await this.db
      .select({
        id: taxonomyVersions.id,
        examId: taxonomyVersions.examId,
        versionCode: taxonomyVersions.versionCode,
        status: taxonomyVersions.status,
      })
      .from(taxonomyVersions)
      .where(eq(taxonomyVersions.id, taxonomyVersionId));
    if (!version) return null;

    const domainRows = await this.db
      .select({ id: domains.id, code: domains.code, name: domains.name, weight: domains.weight })
      .from(domains)
      .where(and(eq(domains.taxonomyVersionId, version.id), eq(domains.status, "ACTIVE")))
      .orderBy(asc(domains.displayOrder), asc(domains.code));
    const domainIds = domainRows.map((d) => d.id);

    const skillRows = domainIds.length
      ? await this.db
          .select({
            id: skills.id,
            domainId: skills.domainId,
            code: skills.code,
            name: skills.name,
          })
          .from(skills)
          .where(and(inArray(skills.domainId, domainIds), eq(skills.status, "ACTIVE")))
          .orderBy(asc(skills.displayOrder), asc(skills.code))
      : [];
    const skillIds = skillRows.map((s) => s.id);

    const subskillRows = skillIds.length
      ? await this.db
          .select({
            id: subskills.id,
            skillId: subskills.skillId,
            code: subskills.code,
            name: subskills.name,
          })
          .from(subskills)
          .where(and(inArray(subskills.skillId, skillIds), eq(subskills.status, "ACTIVE")))
          .orderBy(asc(subskills.displayOrder), asc(subskills.code))
      : [];

    return {
      version,
      domains: domainRows.map((d) => ({
        ...d,
        weight: Number(d.weight),
        skills: skillRows
          .filter((s) => s.domainId === d.id)
          .map(({ id, code, name }) => ({
            id,
            code,
            name,
            subskills: subskillRows
              .filter((ss) => ss.skillId === id)
              .map(({ id: subskillId, code: subskillCode, name: subskillName }) => ({
                id: subskillId,
                code: subskillCode,
                name: subskillName,
              })),
          })),
      })),
    };
  }

  async examNames(examIds: readonly string[]): Promise<Map<string, string>> {
    if (examIds.length === 0) return new Map();
    const rows = await this.db
      .select({ id: exams.id, name: exams.nameAr })
      .from(exams)
      .where(inArray(exams.id, [...examIds]));
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  activeExams() {
    return this.db
      .select({ id: exams.id, code: exams.code, nameAr: exams.nameAr })
      .from(exams)
      .where(eq(exams.status, "ACTIVE"))
      .orderBy(asc(exams.code));
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
