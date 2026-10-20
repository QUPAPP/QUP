import { DomainError } from "../../../common/errors/domain-error.js";

/** AI is turned off (AI_PROVIDER=disabled), or the provider failed. Authors carry on by hand. */
export class AiUnavailable extends DomainError {
  readonly code = "AI_UNAVAILABLE";
  readonly kind = "UNAVAILABLE";

  constructor() {
    super("AI assistance is not available right now.");
  }
}

/** The model's answers stayed invalid after every attempt; nothing is shown. */
export class AiOutputInvalid extends DomainError {
  readonly code = "AI_OUTPUT_INVALID";
  readonly kind = "UNAVAILABLE";

  constructor() {
    super("AI assistance could not produce a usable suggestion. Try again later.");
  }
}

export class AiTimedOut extends DomainError {
  readonly code = "AI_TIMEOUT";
  readonly kind = "UNAVAILABLE";

  constructor() {
    super("AI assistance took too long to answer. Try again later.");
  }
}

/** Assistance is for the version an author is still writing. */
export class AiRequiresDraft extends DomainError {
  readonly code = "AI_REQUIRES_DRAFT";
  readonly kind = "CONFLICT";

  constructor() {
    super("AI assistance is available for draft versions only.");
  }
}

export class AiQuestionVersionNotFound extends DomainError {
  readonly code = "QUESTION_VERSION_NOT_FOUND";
  readonly kind = "NOT_FOUND";

  constructor() {
    super("The question version does not exist.");
  }
}

/** The version's taxonomy has no active skill to suggest. */
export class AiNoSkills extends DomainError {
  readonly code = "AI_NO_SKILLS";
  readonly kind = "RULE_VIOLATION";

  constructor() {
    super("The question's taxonomy has no active skills to suggest.");
  }
}
