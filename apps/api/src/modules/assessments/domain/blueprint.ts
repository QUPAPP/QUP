import { BlueprintNotEditable, BlueprintWeightsEmpty } from "./assessment.errors.js";

/**
 * Assessment blueprints: the recipe for one kind of diagnostic in one exam
 * (DOMAIN_MODEL.md "Assessment Blueprint"). Pure rules; the store persists.
 */

/** The diagnostics a blueprint can size and weight in V1 (B2). */
export const DIAGNOSTIC_BLUEPRINT_TYPES = ["MINI_DIAGNOSTIC", "FULL_DIAGNOSTIC"] as const;
export type DiagnosticBlueprintType = (typeof DIAGNOSTIC_BLUEPRINT_TYPES)[number];

export type BlueprintStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

/** Questions in one diagnosis (OPEN_QUESTIONS.md #9a). */
export const BLUEPRINT_QUESTION_COUNT = Object.freeze({ min: 1, max: 200 });

/** What a blueprint's rows mean; stored on each blueprint (ERD: config_version). */
export const BLUEPRINT_CONFIG_VERSION = "blueprint-v1";

export interface Blueprint {
  id: string;
  examId: string;
  taxonomyVersionId: string;
  type: DiagnosticBlueprintType;
  code: string;
  name: string;
  questionCount: number;
  status: BlueprintStatus;
  createdAt: Date;
  updatedAt: Date;
  /** Weight overrides by domain id; a domain absent here keeps its taxonomy weight. */
  domainWeights: ReadonlyMap<string, number>;
}

/** Active and archived blueprints are referenced by sessions: only a draft may change. */
export function assertEditable(status: BlueprintStatus): void {
  if (status !== "DRAFT") throw new BlueprintNotEditable(status);
}

/**
 * The weight each domain is planned with: the blueprint's override, else the
 * taxonomy's. Refuses a recipe that leaves no domain to ask from.
 */
export function effectiveDomainWeights(
  domains: readonly { id: string; weight: number }[],
  overrides: ReadonlyMap<string, number>,
): Map<string, number> {
  const weights = new Map(domains.map((d) => [d.id, overrides.get(d.id) ?? d.weight]));
  if (![...weights.values()].some((weight) => weight > 0)) throw new BlueprintWeightsEmpty();
  return weights;
}
