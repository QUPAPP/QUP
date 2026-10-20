import { z } from "zod";

import {
  displayOrder,
  masteryThreshold,
  nodeCode,
  optionalText,
  weight,
} from "../../../common/validation/schemas.js";

/** Request bodies for the Exam Catalog. All strict: unknown fields are rejected. */

const NAME_MAX = 120;
const DESCRIPTION_MAX = 2000;

const atLeastOneField = (body: Record<string, unknown>) =>
  Object.values(body).some((value) => value !== undefined);

/* ------------------------------------------------------------------- exams */

export const createExamBody = z.strictObject({
  code: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]{1,31}$/, "must be 2–32 of A–Z, 0–9, _ and start with a letter"),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "must be lower-case words joined by hyphens")
    .max(64),
  nameAr: z.string().trim().min(1).max(NAME_MAX),
  nameEn: optionalText(NAME_MAX),
  description: optionalText(DESCRIPTION_MAX),
});
export type CreateExamBody = z.output<typeof createExamBody>;

/** `code` and `slug` are identifiers other records and URLs rely on; they are not editable. */
export const updateExamBody = z
  .strictObject({
    nameAr: z.string().trim().min(1).max(NAME_MAX).optional(),
    nameEn: z.string().trim().min(1).max(NAME_MAX).nullable().optional(),
    description: z.string().trim().min(1).max(DESCRIPTION_MAX).nullable().optional(),
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
  })
  .refine(atLeastOneField, "provide at least one field to change");
export type UpdateExamBody = z.output<typeof updateExamBody>;

/* -------------------------------------------------------- taxonomy version */

export const createTaxonomyVersionBody = z.strictObject({
  versionCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/, "must be 1–32 of letters, digits, . _ -"),
  effectiveFrom: z.iso.datetime({ offset: true }).optional(),
});
export type CreateTaxonomyVersionBody = z.output<typeof createTaxonomyVersionBody>;

/* ------------------------------------------------------------------- nodes */

export const createDomainBody = z.strictObject({
  taxonomyVersionId: z.uuid(),
  code: nodeCode,
  name: z.string().trim().min(1).max(NAME_MAX),
  description: optionalText(DESCRIPTION_MAX),
  weight: weight.optional(),
  displayOrder: displayOrder.optional(),
});
export type CreateDomainBody = z.output<typeof createDomainBody>;

export const createSkillBody = z.strictObject({
  domainId: z.uuid(),
  code: nodeCode,
  name: z.string().trim().min(1).max(NAME_MAX),
  description: optionalText(DESCRIPTION_MAX),
  weight: weight.optional(),
  masteryThreshold: masteryThreshold.optional(),
  priorityWeight: weight.optional(),
  minCoverage: z.number().int().min(0).max(10_000).optional(),
  displayOrder: displayOrder.optional(),
});
export type CreateSkillBody = z.output<typeof createSkillBody>;

/** `code` is not editable: questions and imports refer to nodes by it. */
export const updateDomainBody = z
  .strictObject({
    name: z.string().trim().min(1).max(NAME_MAX).optional(),
    description: z.string().trim().min(1).max(DESCRIPTION_MAX).nullable().optional(),
    weight: weight.optional(),
    displayOrder: displayOrder.optional(),
  })
  .refine(atLeastOneField, "provide at least one field to change");
export type UpdateDomainBody = z.output<typeof updateDomainBody>;

export const updateSkillBody = z
  .strictObject({
    name: z.string().trim().min(1).max(NAME_MAX).optional(),
    description: z.string().trim().min(1).max(DESCRIPTION_MAX).nullable().optional(),
    weight: weight.optional(),
    // null clears the override, falling back to the versioned config default.
    masteryThreshold: masteryThreshold.nullable().optional(),
    priorityWeight: weight.optional(),
    minCoverage: z.number().int().min(0).max(10_000).optional(),
    displayOrder: displayOrder.optional(),
  })
  .refine(atLeastOneField, "provide at least one field to change");
export type UpdateSkillBody = z.output<typeof updateSkillBody>;

export const createSubskillBody = z.strictObject({
  skillId: z.uuid(),
  code: nodeCode,
  name: z.string().trim().min(1).max(NAME_MAX),
  description: optionalText(DESCRIPTION_MAX),
  weight: weight.optional(),
  masteryThreshold: masteryThreshold.optional(),
  displayOrder: displayOrder.optional(),
});
export type CreateSubskillBody = z.output<typeof createSubskillBody>;

export const updateSubskillBody = z
  .strictObject({
    name: z.string().trim().min(1).max(NAME_MAX).optional(),
    description: z.string().trim().min(1).max(DESCRIPTION_MAX).nullable().optional(),
    weight: weight.optional(),
    // null clears the override, falling back to the versioned config default.
    masteryThreshold: masteryThreshold.nullable().optional(),
    displayOrder: displayOrder.optional(),
  })
  .refine(atLeastOneField, "provide at least one field to change");
export type UpdateSubskillBody = z.output<typeof updateSubskillBody>;

export const addPrerequisiteBody = z.strictObject({
  prerequisiteSkillId: z.uuid(),
  importanceWeight: weight.optional(),
});
export type AddPrerequisiteBody = z.output<typeof addPrerequisiteBody>;

export const nodeTypeParam = z.enum(["domain", "skill", "subskill"]);
