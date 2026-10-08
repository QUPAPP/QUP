import { DomainError } from "../../../common/errors/domain-error.js";

/** Also used for another student's session, so ids cannot be probed (SECURITY.md: IDOR). */
export class AssessmentNotFound extends DomainError {
  readonly code = "ASSESSMENT_NOT_FOUND";
  readonly kind = "NOT_FOUND";

  constructor() {
    super("The assessment was not found.");
  }
}

export class AssessmentItemNotFound extends DomainError {
  readonly code = "ASSESSMENT_ITEM_NOT_FOUND";
  readonly kind = "NOT_FOUND";

  constructor() {
    super("The item is not part of this assessment.");
  }
}

export class ExamNotAvailable extends DomainError {
  readonly code = "EXAM_NOT_AVAILABLE";
  readonly kind = "NOT_FOUND";

  constructor() {
    super("The exam is not available.");
  }
}

export class NoQuestionsAvailable extends DomainError {
  readonly code = "NO_QUESTIONS_AVAILABLE";
  readonly kind = "RULE_VIOLATION";

  constructor() {
    super("No published questions are available for this exam yet.");
  }
}

/** OPEN_QUESTIONS.md #10a: one free mini diagnostic per exam. */
export class MiniDiagnosticAlreadyCompleted extends DomainError {
  readonly code = "MINI_DIAGNOSTIC_ALREADY_COMPLETED";
  readonly kind = "CONFLICT";
  /** The caller's own completed session, so a client can show its result. */
  override readonly details: { sessionId: string };

  constructor(sessionId: string) {
    super("You have already completed the mini diagnostic for this exam.");
    this.details = { sessionId };
  }
}

export class AssessmentNotActive extends DomainError {
  readonly code = "ASSESSMENT_NOT_ACTIVE";
  readonly kind = "RULE_VIOLATION";

  constructor(status: string) {
    super(`The assessment is ${status}, not in progress.`);
  }
}

export class AssessmentIncomplete extends DomainError {
  readonly code = "ASSESSMENT_INCOMPLETE";
  readonly kind = "RULE_VIOLATION";

  constructor() {
    super("Answer or skip every item before completing the assessment.");
  }
}

export class AssessmentNotCompleted extends DomainError {
  readonly code = "ASSESSMENT_NOT_COMPLETED";
  readonly kind = "RULE_VIOLATION";

  constructor() {
    super("The result is available once the assessment is completed.");
  }
}

/** API_CONTRACTS.md example code. */
export class ItemAlreadyAnswered extends DomainError {
  readonly code = "ASSESSMENT_ITEM_ALREADY_ANSWERED";
  readonly kind = "CONFLICT";

  constructor() {
    super("This item has already been finalized.");
  }
}

export class InvalidAnswer extends DomainError {
  readonly code = "INVALID_ANSWER";
  readonly kind = "INVALID_INPUT";

  constructor(reason: string) {
    super(reason);
  }
}

/** The key was already used for a different submission: refusing is the only safe answer. */
export class IdempotencyKeyReused extends DomainError {
  readonly code = "IDEMPOTENCY_KEY_REUSED";
  readonly kind = "RULE_VIOLATION";

  constructor() {
    super("This Idempotency-Key was already used for a different request.");
  }
}
