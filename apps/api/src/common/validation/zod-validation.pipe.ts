import type { PipeTransform } from "@nestjs/common";
import type { z } from "zod";

import { DomainError } from "../errors/domain-error.js";

export interface ValidationIssue {
  path: string;
  message: string;
}

export class ValidationFailed extends DomainError {
  readonly code = "VALIDATION_FAILED";
  readonly kind = "INVALID_INPUT";

  constructor(override readonly details: readonly ValidationIssue[]) {
    super("The request is invalid.");
  }
}

/**
 * Validates a request body against a Zod schema at the boundary (AGENTS.md §8).
 *
 * Schemas should be `.strict()`: unknown keys are rejected rather than silently
 * dropped, so a client cannot mass-assign protected fields such as `role` or
 * `status` (SECURITY.md checklist). Issue messages describe the rule, never
 * echo the submitted value.
 */
export class ZodValidationPipe<TSchema extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.output<TSchema> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ValidationFailed(
        result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      );
    }
    return result.data;
  }
}
