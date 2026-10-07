import { Inject, Injectable } from "@nestjs/common";
import { type Database, tables } from "@qup/db";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";

import type { ActorContext } from "../../../common/actor.js";
import { DomainError } from "../../../common/errors/domain-error.js";
import { AuditAction, writeAudit } from "../../../infrastructure/audit/audit-log.js";
import { DATABASE } from "../../../infrastructure/database/database.module.js";
import { PgErrorCode, pgErrorInfo } from "../../../infrastructure/database/postgres-errors.js";
import {
  ExamIdentifierTaken,
  ExamNotFound,
  PrerequisiteCycle,
  PrerequisiteOutsideVersion,
  TaxonomyCodeTaken,
  TaxonomyPublishConflict,
  TaxonomyVersionCodeTaken,
  TaxonomyVersionNotDraft,
} from "../domain/catalog.errors.js";
import type {
  CatalogStore,
  CreatedNode,
  DomainNode,
  Exam,
  ExamChanges,
  NewDomain,
  NewExam,
  NewPrerequisite,
  NewSkill,
  NewSubskill,
  NodeType,
  PublishReadiness,
  SkillChanges,
  SkillNode,
  TaxonomyTree,
  TaxonomyVersion,
} from "../domain/ports.js";
import type { PrerequisiteEdge } from "../domain/prerequisite-graph.js";

const { exams, taxonomyVersions, domains, skills, subskills, skillPrerequisites } = tables;

/** Column scales, matching the numeric(p, s) definitions in @qup/db. */
const WEIGHT_SCALE = 4;
const THRESHOLD_SCALE = 3;

const toWeight = (value: number | undefined) => value?.toFixed(WEIGHT_SCALE);
const toThreshold = (value: number | null | undefined) =>
  value === undefined ? undefined : value === null ? null : value.toFixed(THRESHOLD_SCALE);
const fromDecimal = (value: string) => Number(value);
const fromNullableDecimal = (value: string | null) => (value === null ? null : Number(value));

const examColumns = {
  id: exams.id,
  code: exams.code,
  slug: exams.slug,
  nameAr: exams.nameAr,
  nameEn: exams.nameEn,
  description: exams.description,
  status: exams.status,
  createdAt: exams.createdAt,
};

const versionColumns = {
  id: taxonomyVersions.id,
  examId: taxonomyVersions.examId,
  versionCode: taxonomyVersions.versionCode,
  status: taxonomyVersions.status,
  effectiveFrom: taxonomyVersions.effectiveFrom,
  createdAt: taxonomyVersions.createdAt,
};

const CODE_CONSTRAINTS: Record<string, NodeType> = {
  domains_version_code_unique: "domain",
  skills_domain_code_unique: "skill",
  subskills_skill_code_unique: "subskill",
};

/** Turns constraint and guard violations into domain errors; rethrows anything else. */
function translate(error: unknown): never {
  // Domain errors raised inside a transaction pass through untouched.
  if (error instanceof DomainError) throw error;
  const info = pgErrorInfo(error);
  if (info?.code === PgErrorCode.restrictViolation) throw new TaxonomyVersionNotDraft();
  if (info?.code === PgErrorCode.uniqueViolation && info.constraint) {
    const nodeType = CODE_CONSTRAINTS[info.constraint];
    if (nodeType) throw new TaxonomyCodeTaken(nodeType);
    if (info.constraint === "exams_code_unique") throw new ExamIdentifierTaken("code");
    if (info.constraint === "exams_slug_unique") throw new ExamIdentifierTaken("slug");
    if (info.constraint === "taxonomy_versions_exam_version_unique") {
      throw new TaxonomyVersionCodeTaken();
    }
    if (info.constraint === "taxonomy_versions_one_published_per_exam") {
      throw new TaxonomyPublishConflict();
    }
  }
  throw error;
}

async function guarded<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    translate(error);
  }
}

@Injectable()
export class DrizzleCatalogStore implements CatalogStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /* ------------------------------------------------------------------ exams */

  createExam(exam: NewExam): Promise<Exam> {
    return guarded(async () => {
      const [row] = await this.db.insert(exams).values(exam).returning(examColumns);
      if (!row) throw new Error("Exam insert returned no row.");
      return row;
    });
  }

  async findExam(examId: string): Promise<Exam | null> {
    const [row] = await this.db.select(examColumns).from(exams).where(eq(exams.id, examId));
    return row ?? null;
  }

  listExams(filter: { status?: Exam["status"] }): Promise<Exam[]> {
    return this.db
      .select(examColumns)
      .from(exams)
      .where(filter.status ? eq(exams.status, filter.status) : undefined)
      .orderBy(asc(exams.code));
  }

  async updateExam(examId: string, changes: ExamChanges): Promise<Exam> {
    const [row] = await this.db
      .update(exams)
      .set(changes)
      .where(eq(exams.id, examId))
      .returning(examColumns);
    if (!row) throw new ExamNotFound();
    return row;
  }

  async hasPublishedTaxonomy(examId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: taxonomyVersions.id })
      .from(taxonomyVersions)
      .where(and(eq(taxonomyVersions.examId, examId), eq(taxonomyVersions.status, "PUBLISHED")))
      .limit(1);
    return row !== undefined;
  }

  /* ------------------------------------------------------ taxonomy versions */

  createTaxonomyVersion(input: {
    examId: string;
    versionCode: string;
    effectiveFrom: Date | null;
    createdBy: string | null;
  }): Promise<TaxonomyVersion> {
    return guarded(async () => {
      const [row] = await this.db.insert(taxonomyVersions).values(input).returning(versionColumns);
      if (!row) throw new Error("Taxonomy version insert returned no row.");
      return row;
    });
  }

  async findTaxonomyVersion(versionId: string): Promise<TaxonomyVersion | null> {
    const [row] = await this.db
      .select(versionColumns)
      .from(taxonomyVersions)
      .where(eq(taxonomyVersions.id, versionId));
    return row ?? null;
  }

  async versionOfNode(type: NodeType, nodeId: string): Promise<TaxonomyVersion | null> {
    const query = this.db.select(versionColumns).from(taxonomyVersions);
    const rows =
      type === "domain"
        ? await query
            .innerJoin(domains, eq(domains.taxonomyVersionId, taxonomyVersions.id))
            .where(eq(domains.id, nodeId))
        : type === "skill"
          ? await query
              .innerJoin(domains, eq(domains.taxonomyVersionId, taxonomyVersions.id))
              .innerJoin(skills, eq(skills.domainId, domains.id))
              .where(eq(skills.id, nodeId))
          : await query
              .innerJoin(domains, eq(domains.taxonomyVersionId, taxonomyVersions.id))
              .innerJoin(skills, eq(skills.domainId, domains.id))
              .innerJoin(subskills, eq(subskills.skillId, skills.id))
              .where(eq(subskills.id, nodeId));
    return rows[0] ?? null;
  }

  /** Four queries regardless of tree size — no per-node round trips (PRD §16: no N+1). */
  async loadTree(versionId: string): Promise<TaxonomyTree | null> {
    const version = await this.findTaxonomyVersion(versionId);
    if (!version) return null;

    const domainRows = await this.db
      .select()
      .from(domains)
      .where(eq(domains.taxonomyVersionId, versionId))
      .orderBy(asc(domains.displayOrder), asc(domains.code));
    const domainIds = domainRows.map((d) => d.id);

    const skillRows = domainIds.length
      ? await this.db
          .select()
          .from(skills)
          .where(inArray(skills.domainId, domainIds))
          .orderBy(asc(skills.displayOrder), asc(skills.code))
      : [];
    const skillIds = skillRows.map((s) => s.id);

    const [subskillRows, prerequisiteRows] = skillIds.length
      ? await Promise.all([
          this.db
            .select()
            .from(subskills)
            .where(inArray(subskills.skillId, skillIds))
            .orderBy(asc(subskills.displayOrder), asc(subskills.code)),
          this.db
            .select()
            .from(skillPrerequisites)
            .where(inArray(skillPrerequisites.skillId, skillIds)),
        ])
      : [[], []];

    const skillsByDomain = new Map<string, SkillNode[]>();
    const skillById = new Map<string, SkillNode>();
    for (const s of skillRows) {
      const node: SkillNode = {
        id: s.id,
        code: s.code,
        name: s.name,
        description: s.description,
        weight: fromDecimal(s.weight),
        masteryThreshold: fromNullableDecimal(s.masteryThreshold),
        priorityWeight: fromDecimal(s.priorityWeight),
        minCoverage: s.minCoverage,
        displayOrder: s.displayOrder,
        status: s.status,
        prerequisites: [],
        subskills: [],
      };
      skillById.set(s.id, node);
      skillsByDomain.set(s.domainId, [...(skillsByDomain.get(s.domainId) ?? []), node]);
    }
    for (const ss of subskillRows) {
      skillById.get(ss.skillId)?.subskills.push({
        id: ss.id,
        code: ss.code,
        name: ss.name,
        description: ss.description,
        weight: fromDecimal(ss.weight),
        masteryThreshold: fromNullableDecimal(ss.masteryThreshold),
        displayOrder: ss.displayOrder,
        status: ss.status,
      });
    }
    for (const p of prerequisiteRows) {
      skillById.get(p.skillId)?.prerequisites.push({
        prerequisiteSkillId: p.prerequisiteSkillId,
        importanceWeight: fromDecimal(p.importanceWeight),
      });
    }

    const domainNodes: DomainNode[] = domainRows.map((d) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      description: d.description,
      weight: fromDecimal(d.weight),
      displayOrder: d.displayOrder,
      status: d.status,
      skills: skillsByDomain.get(d.id) ?? [],
    }));
    return { version, domains: domainNodes };
  }

  async publishReadiness(versionId: string): Promise<PublishReadiness> {
    const [row] = await this.db.execute<{
      active_domains: number;
      active_skills: number;
      empty_domains: number;
    }>(sql`
      SELECT
        count(DISTINCT d.id)::int AS active_domains,
        count(s.id)::int AS active_skills,
        (SELECT count(*)::int FROM domains d2
          WHERE d2.taxonomy_version_id = ${versionId} AND d2.status = 'ACTIVE'
            AND NOT EXISTS (
              SELECT 1 FROM skills s2 WHERE s2.domain_id = d2.id AND s2.status = 'ACTIVE')
        ) AS empty_domains
      FROM domains d
      LEFT JOIN skills s ON s.domain_id = d.id AND s.status = 'ACTIVE'
      WHERE d.taxonomy_version_id = ${versionId} AND d.status = 'ACTIVE'`);
    return {
      activeDomains: row?.active_domains ?? 0,
      activeSkills: row?.active_skills ?? 0,
      emptyDomains: row?.empty_domains ?? 0,
    };
  }

  publishTaxonomyVersion(version: TaxonomyVersion, actor: ActorContext): Promise<TaxonomyVersion> {
    return guarded(() =>
      this.db.transaction(async (tx) => {
        const archived = await tx
          .update(taxonomyVersions)
          .set({ status: "ARCHIVED" })
          .where(
            and(
              eq(taxonomyVersions.examId, version.examId),
              eq(taxonomyVersions.status, "PUBLISHED"),
              ne(taxonomyVersions.id, version.id),
            ),
          )
          .returning({ id: taxonomyVersions.id });

        // Conditional on DRAFT: if a concurrent request already published it,
        // this updates nothing and the request fails cleanly.
        const [published] = await tx
          .update(taxonomyVersions)
          .set({ status: "PUBLISHED" })
          .where(and(eq(taxonomyVersions.id, version.id), eq(taxonomyVersions.status, "DRAFT")))
          .returning(versionColumns);
        if (!published) throw new TaxonomyVersionNotDraft();

        await writeAudit(tx, actor, {
          action: AuditAction.TaxonomyPublished,
          resourceType: "taxonomy_version",
          resourceId: version.id,
          metadata: {
            examId: version.examId,
            versionCode: version.versionCode,
            archivedVersionId: archived[0]?.id ?? null,
          },
        });
        return published;
      }),
    );
  }

  /* ------------------------------------------------------------------ nodes */

  createDomain(domain: NewDomain): Promise<CreatedNode> {
    return guarded(async () => {
      const [row] = await this.db
        .insert(domains)
        .values({ ...domain, weight: toWeight(domain.weight) })
        .returning({ id: domains.id });
      if (!row) throw new Error("Domain insert returned no row.");
      return row;
    });
  }

  createSkill(skill: NewSkill): Promise<CreatedNode> {
    return guarded(async () => {
      const [row] = await this.db
        .insert(skills)
        .values({
          ...skill,
          weight: toWeight(skill.weight),
          masteryThreshold: toThreshold(skill.masteryThreshold),
          priorityWeight: toWeight(skill.priorityWeight),
        })
        .returning({ id: skills.id });
      if (!row) throw new Error("Skill insert returned no row.");
      return row;
    });
  }

  createSubskill(subskill: NewSubskill): Promise<CreatedNode> {
    return guarded(async () => {
      const [row] = await this.db
        .insert(subskills)
        .values({
          ...subskill,
          weight: toWeight(subskill.weight),
          masteryThreshold: toThreshold(subskill.masteryThreshold),
        })
        .returning({ id: subskills.id });
      if (!row) throw new Error("Subskill insert returned no row.");
      return row;
    });
  }

  updateSkill(skillId: string, changes: SkillChanges): Promise<void> {
    return guarded(async () => {
      await this.db
        .update(skills)
        .set({
          ...changes,
          weight: toWeight(changes.weight),
          masteryThreshold: toThreshold(changes.masteryThreshold),
          priorityWeight: toWeight(changes.priorityWeight),
        })
        .where(eq(skills.id, skillId));
    });
  }

  archiveNode(type: NodeType, nodeId: string): Promise<void> {
    return guarded(async () => {
      if (type === "domain") {
        await this.db.update(domains).set({ status: "ARCHIVED" }).where(eq(domains.id, nodeId));
      } else if (type === "skill") {
        await this.db.update(skills).set({ status: "ARCHIVED" }).where(eq(skills.id, nodeId));
      } else {
        await this.db.update(subskills).set({ status: "ARCHIVED" }).where(eq(subskills.id, nodeId));
      }
    });
  }

  async addPrerequisite(
    prerequisite: NewPrerequisite,
    versionId: string,
    assertAcyclic: (edges: readonly PrerequisiteEdge[]) => void,
  ): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        // Serializes prerequisite changes within one version, so the cycle
        // check below sees every committed edge.
        await tx
          .select({ id: taxonomyVersions.id })
          .from(taxonomyVersions)
          .where(eq(taxonomyVersions.id, versionId))
          .for("update");

        const edges = await tx
          .select({
            skillId: skillPrerequisites.skillId,
            prerequisiteSkillId: skillPrerequisites.prerequisiteSkillId,
          })
          .from(skillPrerequisites)
          .innerJoin(skills, eq(skills.id, skillPrerequisites.skillId))
          .innerJoin(domains, eq(domains.id, skills.domainId))
          .where(eq(domains.taxonomyVersionId, versionId));
        assertAcyclic(edges);

        const importanceWeight = toWeight(prerequisite.importanceWeight);
        await tx
          .insert(skillPrerequisites)
          .values({ ...prerequisite, importanceWeight })
          .onConflictDoUpdate({
            target: [skillPrerequisites.skillId, skillPrerequisites.prerequisiteSkillId],
            set: {
              importanceWeight: importanceWeight ?? sql`${skillPrerequisites.importanceWeight}`,
            },
          });
      });
    } catch (error) {
      const info = pgErrorInfo(error);
      if (info?.code === PgErrorCode.checkViolation) {
        // The table's own CHECK is the self-reference rule; the trigger's
        // (0005, no constraint name) is the cross-version rule.
        if (info.constraint === "skill_prerequisites_no_self") throw new PrerequisiteCycle();
        throw new PrerequisiteOutsideVersion();
      }
      translate(error);
    }
  }
}
