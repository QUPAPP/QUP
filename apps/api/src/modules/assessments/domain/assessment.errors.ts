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

/* ---------------------------------------------------------------- blueprints */

export class BlueprintNotFound extends DomainError {
  readonly code = "BLUEPRINT_NOT_FOUND";
  readonly kind = "NOT_FOUND";

  constructor() {
    super("The blueprint was not found.");
  }
}

/** The exam a blueprint is created for does not exist. */
export class BlueprintExamNotFound extends DomainError {
  readonly code = "EXAM_NOT_FOUND";
  readonly kind = "NOT_FOUND";

  constructor() {
    super("The exam was not found.");
  }
}

/** A blueprint is pinned to the published taxonomy version; there must be one. */
export class BlueprintNeedsPublishedTaxonomy extends DomainError {
  readonly code = "EXAM_HAS_NO_PUBLISHED_TAXONOMY";
  readonly kind = "RULE_VIOLATION";

  constructor() {
    super("Publish a taxonomy version for this exam before creating a blueprint.");
  }
}

export class BlueprintCodeTaken extends DomainError {
  readonly code = "BLUEPRINT_CODE_TAKEN";
  readonly kind = "CONFLICT";

  constructor() {
    super("This exam already has a blueprint with that code.");
  }
}

/** Sessions reference active and archived blueprints, so only a draft may change. */
export class BlueprintNotEditable extends DomainError {
  readonly code = "BLUEPRINT_NOT_EDITABLE";
  readonly kind = "CONFLICT";

  constructor(status: string) {
    super(`The blueprint is ${status}; only a draft can change.`);
  }
}

export class BlueprintDomainUnknown extends DomainError {
  readonly code = "BLUEPRINT_DOMAIN_UNKNOWN";
  readonly kind = "RULE_VIOLATION";

  constructor() {
    super("A weight names a domain that is not in the blueprint's taxonomy version.");
  }
}

export class BlueprintWeightsEmpty extends DomainError {
  readonly code = "BLUEPRINT_WEIGHTS_EMPTY";
  readonly kind = "RULE_VIOLATION";

  constructor() {
    super("At least one domain needs a weight above zero.");
  }
}

/** The taxonomy version was replaced after the draft was written; start a new draft. */
export class BlueprintTaxonomyNotPublished extends DomainError {
  readonly code = "BLUEPRINT_TAXONOMY_NOT_PUBLISHED";
  readonly kind = "CONFLICT";

  constructor() {
    super("The blueprint's taxonomy version is no longer the published one.");
  }
}

/* ----------------------------------------------------------- full diagnostic */

/** PRD §7: the full diagnostic comes with the exam's package. */
export class FullDiagnosticRequiresAccess extends DomainError {
  readonly code = "FULL_DIAGNOSTIC_REQUIRES_ACCESS";
  readonly kind = "FORBIDDEN";

  constructor() {
    super("The full diagnostic is part of this exam's package.");
  }
}

/** One full diagnostic per exam; measuring again is the full re-diagnostic (PRD §8). */
export class FullDiagnosticAlreadyCompleted extends DomainError {
  readonly code = "FULL_DIAGNOSTIC_ALREADY_COMPLETED";
  readonly kind = "CONFLICT";
  /** The caller's own completed session. */
  override readonly details: { sessionId: string };

  constructor(sessionId: string) {
    super("You have already completed the full diagnostic for this exam.");
    this.details = { sessionId };
  }
}

/* -------------------------------------------------------- full re-diagnostic */

export class FullReassessmentRequiresAccess extends DomainError {
  readonly code = "FULL_REASSESSMENT_REQUIRES_ACCESS";
  readonly kind = "FORBIDDEN";

  constructor() {
    super("The full re-diagnostic is part of this exam's package.");
  }
}

/** PRD §8: the full diagnostic comes first, then a cooldown and training answers. */
export class FullReassessmentNotEligible extends DomainError {
  readonly code = "FULL_REASSESSMENT_NOT_ELIGIBLE";
  readonly kind = "CONFLICT";
  override readonly details: {
    reason: "FULL_DIAGNOSTIC_REQUIRED" | "WAITING";
    availableAt: string | null;
    attemptsRemaining: number;
  };

  constructor(
    reason: "FULL_DIAGNOSTIC_REQUIRED" | "WAITING",
    availableAt: Date | null,
    attemptsRemaining: number,
  ) {
    super(
      reason === "FULL_DIAGNOSTIC_REQUIRED"
        ? "Take the full diagnostic first."
        : "The full re-diagnostic is not available yet.",
    );
    this.details = { reason, availableAt: availableAt?.toISOString() ?? null, attemptsRemaining };
  }
}

/* ------------------------------------------------------------------ training */

/** PRD §7: training comes with the exam's package. */
export class TrainingRequiresAccess extends DomainError {
  readonly code = "TRAINING_REQUIRES_ACCESS";
  readonly kind = "FORBIDDEN";

  constructor() {
    super("Adaptive training is part of this exam's package.");
  }
}

/** No skill is trainable with a question left (OPEN_QUESTIONS.md #12d). */
export class NothingToTrain extends DomainError {
  readonly code = "NOTHING_TO_TRAIN";
  readonly kind = "RULE_VIOLATION";

  constructor() {
    super("There is nothing left to train in this exam right now.");
  }
}

/* -------------------------------------------------------------- reassessment */

/** PRD §7: reassessment comes with the exam's package. */
export class ReassessmentRequiresAccess extends DomainError {
  readonly code = "REASSESSMENT_REQUIRES_ACCESS";
  readonly kind = "FORBIDDEN";

  constructor() {
    super("Skill reassessment is part of this exam's package.");
  }
}

/** The skill is not one of the exam's published, active skills. */
export class SkillNotFound extends DomainError {
  readonly code = "SKILL_NOT_FOUND";
  readonly kind = "NOT_FOUND";

  constructor() {
    super("The skill is not part of this exam.");
  }
}

/** ADAPTIVE_ENGINE.md §12–§13: only a READY_FOR_REASSESSMENT skill is reassessed. */
export class SkillNotReadyForReassessment extends DomainError {
  readonly code = "SKILL_NOT_READY_FOR_REASSESSMENT";
  readonly kind = "CONFLICT";
  /** Where the skill stands, and how many answers a failed reassessment still asks for. */
  override readonly details: { state: string; remainingAttempts: number | null };

  constructor(state: string, remainingAttempts: number | null) {
    super(`The skill is ${state}, not ready for reassessment.`);
    this.details = { state, remainingAttempts };
  }
}

export class ReassessmentNotEnoughQuestions extends DomainError {
  readonly code = "REASSESSMENT_NOT_ENOUGH_QUESTIONS";
  readonly kind = "RULE_VIOLATION";

  constructor() {
    super("The skill has too few published questions for a reassessment.");
  }
}

/** One open reassessment per exam: finish it before starting another skill's. */
export class ReassessmentInProgress extends DomainError {
  readonly code = "REASSESSMENT_IN_PROGRESS";
  readonly kind = "CONFLICT";
  override readonly details: { sessionId: string };

  constructor(sessionId: string) {
    super("Another skill's reassessment is still open.");
    this.details = { sessionId };
  }
}
