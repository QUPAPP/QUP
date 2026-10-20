/**
 * Public read contract of the Exam Catalog, for other modules (AGENTS.md §5:
 * a module never reaches into another module's tables or repositories).
 *
 * Owned by the catalog, the provider, so dependencies point one way:
 * questions → catalog, assessments → catalog, never back.
 */

export type TaxonomyVersionStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

/** Active structure of an exam's published taxonomy, with the weights sampling needs. */
export interface PublishedTaxonomy {
  taxonomyVersionId: string;
  domains: {
    id: string;
    weight: number;
    skills: { id: string; weight: number; subskillIds: string[] }[];
  }[];
}

/** What the Mastery Engine needs from a learning node (ADAPTIVE_ENGINE.md §12). */
export interface NodeSettings {
  masteryThreshold: number | null;
  /** Distinct questions for full coverage. Subskills carry none, so 0 (OPEN_QUESTIONS.md #12b). */
  minCoverage: number;
}

/** A skill as a student sees it named. */
export interface SkillLabel {
  id: string;
  name: string;
}

/** An exam question authors may write for, with the versions they may map to. */
export interface AuthoringExam {
  exam: { id: string; code: string; nameAr: string; status: "DRAFT" | "ACTIVE" };
  /** Not archived, newest first. */
  versions: { id: string; versionCode: string; status: "DRAFT" | "PUBLISHED" }[];
}

/** A version's active nodes, named, in display order — what a mapping may point at. */
export interface TaxonomyOutline {
  version: { id: string; examId: string; versionCode: string; status: TaxonomyVersionStatus };
  domains: {
    id: string;
    code: string;
    name: string;
    skills: {
      id: string;
      code: string;
      name: string;
      subskills: { id: string; code: string; name: string }[];
    }[];
  }[];
}

/** The exam's published taxonomy as a student's skill profile presents it. */
export interface ProfileTaxonomy {
  domains: {
    id: string;
    name: string;
    skills: {
      id: string;
      name: string;
      weight: number;
      masteryThreshold: number | null;
      minCoverage: number;
      subskills: { id: string; name: string; weight: number; masteryThreshold: number | null }[];
    }[];
  }[];
}

export interface CatalogLookup {
  /** The exam's published version: active nodes, named, with their settings, in display order. */
  profileTaxonomy(examId: string): Promise<ProfileTaxonomy | null>;
  /** Exams that are not archived, by code, each with its versions that are not archived. */
  authoringTaxonomies(): Promise<AuthoringExam[]>;
  /** The version's active domains, skills and subskills, or null when it does not exist. */
  activeOutline(taxonomyVersionId: string): Promise<TaxonomyOutline | null>;
  /** Names for historical sessions, including exams no longer on sale. */
  examNames(examIds: readonly string[]): Promise<Map<string, string>>;
  /** The exam's status, or null when it does not exist. */
  examStatus(examId: string): Promise<"DRAFT" | "ACTIVE" | "ARCHIVED" | null>;
  /** The exam's single published taxonomy (active nodes only), or null. */
  publishedTaxonomy(examId: string): Promise<PublishedTaxonomy | null>;
  versionStatus(taxonomyVersionId: string): Promise<TaxonomyVersionStatus | null>;
  /** Of the given node ids, those that exist, are ACTIVE and belong to the version. */
  activeNodesInVersion(
    taxonomyVersionId: string,
    nodes: { skillIds: readonly string[]; subskillIds: readonly string[] },
  ): Promise<{ skillIds: Set<string>; subskillIds: Set<string> }>;
  /** Engine settings per node; nodes that do not exist are absent from the maps. */
  nodeSettings(nodes: {
    skillIds: readonly string[];
    subskillIds: readonly string[];
  }): Promise<{ skills: Map<string, NodeSettings>; subskills: Map<string, NodeSettings> }>;
  /**
   * The skill each node is reported under: a skill is itself, a subskill its
   * parent. Any status and any taxonomy version, so a past session stays
   * explainable after its taxonomy is archived. Nodes that do not exist are
   * absent from the maps.
   */
  reportingSkills(nodes: {
    skillIds: readonly string[];
    subskillIds: readonly string[];
  }): Promise<{ skills: Map<string, SkillLabel>; subskills: Map<string, SkillLabel> }>;
}

export const CATALOG_LOOKUP = Symbol("CATALOG_LOOKUP");
