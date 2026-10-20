import { DomainError } from "../../../common/errors/domain-error.js";
import type { ValidationIssue } from "../../../common/validation/zod-validation.pipe.js";

export class QuestionNotFound extends DomainError {
  readonly code = "QUESTION_NOT_FOUND";
  readonly kind = "NOT_FOUND";

  constructor() {
    super("The question was not found.");
  }
}

export class QuestionVersionNotFound extends DomainError {
  readonly code = "QUESTION_VERSION_NOT_FOUND";
  readonly kind = "NOT_FOUND";

  constructor() {
    super("The question version was not found.");
  }
}

export class StableCodeTaken extends DomainError {
  readonly code = "QUESTION_CODE_TAKEN";
  readonly kind = "CONFLICT";

  constructor() {
    super("Another question already uses this stable code.");
  }
}

/** The version is not in the status this action needs (e.g. editing a non-draft). */
export class InvalidQuestionTransition extends DomainError {
  readonly code = "INVALID_QUESTION_TRANSITION";
  readonly kind = "RULE_VIOLATION";

  constructor(action: string, status: string) {
    super(`Cannot ${action} a question version that is ${status}.`);
  }
}

/** Another request changed the version between our read and our write. */
export class QuestionVersionChanged extends DomainError {
  readonly code = "QUESTION_VERSION_CHANGED";
  readonly kind = "CONFLICT";

  constructor() {
    super("The question version was changed by another request. Reload and retry.");
  }
}

export class VersionAlreadyInProgress extends DomainError {
  readonly code = "QUESTION_VERSION_IN_PROGRESS";
  readonly kind = "CONFLICT";

  constructor() {
    super("This question already has a version in progress. Finish or archive it first.");
  }
}

export class QuestionArchived extends DomainError {
  readonly code = "QUESTION_ARCHIVED";
  readonly kind = "RULE_VIOLATION";

  constructor() {
    super("The question is archived.");
  }
}

export class QuestionContentInvalid extends DomainError {
  readonly code = "QUESTION_CONTENT_INVALID";
  readonly kind = "RULE_VIOLATION";

  constructor(override readonly details: readonly ValidationIssue[]) {
    super("The question content does not meet the requirements for this action.");
  }
}

/** OPEN_QUESTIONS.md #16c: questions are published only against a published taxonomy. */
export class TaxonomyNotPublished extends DomainError {
  readonly code = "TAXONOMY_NOT_PUBLISHED";
  readonly kind = "RULE_VIOLATION";

  constructor() {
    super("The question's taxonomy version is not published.");
  }
}

/** The taxonomy version an author asked to map to does not exist. Same code as the catalog's. */
export class AuthoringTaxonomyNotFound extends DomainError {
  readonly code = "TAXONOMY_VERSION_NOT_FOUND";
  readonly kind = "NOT_FOUND";

  constructor() {
    super("The taxonomy version was not found.");
  }
}
