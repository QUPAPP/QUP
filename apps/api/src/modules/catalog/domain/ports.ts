import type { ActorContext } from "../../../common/actor.js";
import type { ExamStatus } from "./exam-lifecycle.js";
import type { PrerequisiteEdge } from "./prerequisite-graph.js";

/**
 * Persistence port for the Exam Catalog aggregate (DOMAIN_MODEL.md §2).
 *
 * Weights and thresholds are plain numbers here; the store owns their
 * fixed-precision database representation.
 */

export type TaxonomyVersionStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type NodeStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type NodeType = "domain" | "skill" | "subskill";

export interface Exam {
  id: string;
  code: string;
  slug: string;
  nameAr: string;
  nameEn: string | null;
  description: string | null;
  status: ExamStatus;
  createdAt: Date;
}

export interface NewExam {
  code: string;
  slug: string;
  nameAr: string;
  nameEn: string | null;
  description: string | null;
}

export interface ExamChanges {
  nameAr?: string | undefined;
  nameEn?: string | null | undefined;
  description?: string | null | undefined;
  status?: ExamStatus | undefined;
}

export interface TaxonomyVersion {
  id: string;
  examId: string;
  versionCode: string;
  status: TaxonomyVersionStatus;
  effectiveFrom: Date | null;
  createdAt: Date;
}

export interface NewDomain {
  taxonomyVersionId: string;
  code: string;
  name: string;
  description: string | null;
  weight: number | undefined;
  displayOrder: number | undefined;
}

export interface NewSkill {
  domainId: string;
  code: string;
  name: string;
  description: string | null;
  weight: number | undefined;
  masteryThreshold: number | null;
  priorityWeight: number | undefined;
  minCoverage: number | undefined;
  displayOrder: number | undefined;
}

export interface DomainChanges {
  name?: string | undefined;
  description?: string | null | undefined;
  weight?: number | undefined;
  displayOrder?: number | undefined;
}

export interface SubskillChanges {
  name?: string | undefined;
  description?: string | null | undefined;
  weight?: number | undefined;
  masteryThreshold?: number | null | undefined;
  displayOrder?: number | undefined;
}

export interface SkillChanges {
  name?: string | undefined;
  description?: string | null | undefined;
  weight?: number | undefined;
  masteryThreshold?: number | null | undefined;
  priorityWeight?: number | undefined;
  minCoverage?: number | undefined;
  displayOrder?: number | undefined;
}

export interface NewSubskill {
  skillId: string;
  code: string;
  name: string;
  description: string | null;
  weight: number | undefined;
  masteryThreshold: number | null;
  displayOrder: number | undefined;
}

export interface NewPrerequisite {
  skillId: string;
  prerequisiteSkillId: string;
  importanceWeight: number | undefined;
}

export interface CreatedNode {
  id: string;
}

export interface SubskillNode {
  id: string;
  code: string;
  name: string;
  description: string | null;
  weight: number;
  masteryThreshold: number | null;
  displayOrder: number;
  status: NodeStatus;
}

export interface SkillNode {
  id: string;
  code: string;
  name: string;
  description: string | null;
  weight: number;
  masteryThreshold: number | null;
  priorityWeight: number;
  minCoverage: number;
  displayOrder: number;
  status: NodeStatus;
  prerequisites: { prerequisiteSkillId: string; importanceWeight: number }[];
  subskills: SubskillNode[];
}

export interface DomainNode {
  id: string;
  code: string;
  name: string;
  description: string | null;
  weight: number;
  displayOrder: number;
  status: NodeStatus;
  skills: SkillNode[];
}

export interface TaxonomyTree {
  version: TaxonomyVersion;
  domains: DomainNode[];
}

export interface PublishReadiness {
  activeDomains: number;
  activeSkills: number;
  /** Active domains that contain no active skill. */
  emptyDomains: number;
}

export interface CatalogStore {
  // Exams
  createExam(exam: NewExam): Promise<Exam>;
  findExam(examId: string): Promise<Exam | null>;
  listExams(filter: { status?: ExamStatus }): Promise<Exam[]>;
  updateExam(examId: string, changes: ExamChanges): Promise<Exam>;
  hasPublishedTaxonomy(examId: string): Promise<boolean>;

  // Taxonomy versions
  createTaxonomyVersion(input: {
    examId: string;
    versionCode: string;
    effectiveFrom: Date | null;
    createdBy: string | null;
  }): Promise<TaxonomyVersion>;
  findTaxonomyVersion(versionId: string): Promise<TaxonomyVersion | null>;
  /** The exam's versions in every status, newest first. */
  listTaxonomyVersions(examId: string): Promise<TaxonomyVersion[]>;
  /** The version owning a node, or null when the node does not exist. */
  versionOfNode(type: NodeType, nodeId: string): Promise<TaxonomyVersion | null>;
  loadTree(versionId: string): Promise<TaxonomyTree | null>;
  publishReadiness(versionId: string): Promise<PublishReadiness>;
  /**
   * Atomically archives the exam's currently published version (if any),
   * publishes this one and writes the audit entry.
   */
  publishTaxonomyVersion(version: TaxonomyVersion, actor: ActorContext): Promise<TaxonomyVersion>;

  // Nodes (draft versions only; the service checks, the database enforces)
  createDomain(domain: NewDomain): Promise<CreatedNode>;
  createSkill(skill: NewSkill): Promise<CreatedNode>;
  createSubskill(subskill: NewSubskill): Promise<CreatedNode>;
  updateDomain(domainId: string, changes: DomainChanges): Promise<void>;
  updateSkill(skillId: string, changes: SkillChanges): Promise<void>;
  updateSubskill(subskillId: string, changes: SubskillChanges): Promise<void>;
  archiveNode(type: NodeType, nodeId: string): Promise<void>;
  /**
   * Adds the edge under a per-version lock. `assertAcyclic` runs inside the
   * lock with the version's current edges, so two concurrent additions cannot
   * each pass the check and together form a cycle.
   */
  addPrerequisite(
    prerequisite: NewPrerequisite,
    versionId: string,
    assertAcyclic: (edges: readonly PrerequisiteEdge[]) => void,
  ): Promise<void>;
}

export const CATALOG_STORE = Symbol("CATALOG_STORE");
