import { DomainError } from "../../../common/errors/domain-error.js";

/**
 * Exam Catalog errors. Exams and their taxonomy form one aggregate
 * (DOMAIN_MODEL.md §2 "Exam Catalog"), hence one module and one error set.
 */

export class ExamNotFound extends DomainError {
  readonly code = "EXAM_NOT_FOUND";
  readonly kind = "NOT_FOUND";

  constructor() {
    super("The exam was not found.");
  }
}

export class ExamIdentifierTaken extends DomainError {
  readonly code = "EXAM_IDENTIFIER_TAKEN";
  readonly kind = "CONFLICT";

  constructor(readonly field: "code" | "slug") {
    super(`Another exam already uses this ${field}.`);
  }
}

export class InvalidExamTransition extends DomainError {
  readonly code = "INVALID_EXAM_TRANSITION";
  readonly kind = "RULE_VIOLATION";

  constructor(from: string, to: string) {
    super(`An exam cannot move from ${from} to ${to}.`);
  }
}

/** OPEN_QUESTIONS.md #16b: students must not reach an exam that has no skills. */
export class ExamHasNoPublishedTaxonomy extends DomainError {
  readonly code = "EXAM_HAS_NO_PUBLISHED_TAXONOMY";
  readonly kind = "RULE_VIOLATION";

  constructor() {
    super("An exam can only be activated once it has a published taxonomy version.");
  }
}

export class TaxonomyVersionNotFound extends DomainError {
  readonly code = "TAXONOMY_VERSION_NOT_FOUND";
  readonly kind = "NOT_FOUND";

  constructor() {
    super("The taxonomy version was not found.");
  }
}

export class TaxonomyNodeNotFound extends DomainError {
  readonly code = "TAXONOMY_NODE_NOT_FOUND";
  readonly kind = "NOT_FOUND";

  constructor(readonly nodeType: string) {
    super(`The ${nodeType} was not found.`);
  }
}

/** OPEN_QUESTIONS.md #16b: a published taxonomy is read-only; changes go into a new version. */
export class TaxonomyVersionNotDraft extends DomainError {
  readonly code = "TAXONOMY_VERSION_NOT_DRAFT";
  readonly kind = "RULE_VIOLATION";

  constructor() {
    super("Only a draft taxonomy version can be changed. Create a new version instead.");
  }
}

export class TaxonomyVersionCodeTaken extends DomainError {
  readonly code = "TAXONOMY_VERSION_CODE_TAKEN";
  readonly kind = "CONFLICT";

  constructor() {
    super("This exam already has a taxonomy version with that code.");
  }
}

export class TaxonomyCodeTaken extends DomainError {
  readonly code = "TAXONOMY_CODE_TAKEN";
  readonly kind = "CONFLICT";

  constructor(readonly nodeType: string) {
    super(`Another ${nodeType} under the same parent already uses that code.`);
  }
}

export class PrerequisiteCycle extends DomainError {
  readonly code = "PREREQUISITE_CYCLE";
  readonly kind = "RULE_VIOLATION";

  constructor() {
    super("This prerequisite would create a cycle between skills.");
  }
}

export class PrerequisiteOutsideVersion extends DomainError {
  readonly code = "PREREQUISITE_OUTSIDE_VERSION";
  readonly kind = "RULE_VIOLATION";

  constructor() {
    super("A prerequisite must belong to the same taxonomy version as the skill.");
  }
}

export class TaxonomyIncomplete extends DomainError {
  readonly code = "TAXONOMY_INCOMPLETE";
  readonly kind = "RULE_VIOLATION";

  constructor(reason: string) {
    super(`The taxonomy cannot be published: ${reason}`);
  }
}

export class TaxonomyPublishConflict extends DomainError {
  readonly code = "TAXONOMY_PUBLISH_CONFLICT";
  readonly kind = "CONFLICT";

  constructor() {
    super(
      "Another taxonomy version of this exam was published at the same time. Reload and retry.",
    );
  }
}
