import { DomainError } from "../../../common/errors/domain-error.js";

/** PRD §7: the full skill map is part of the paid exam. */
export class SkillProfileRequiresAccess extends DomainError {
  readonly code = "SKILL_PROFILE_REQUIRES_ACCESS";
  readonly kind = "FORBIDDEN";

  constructor() {
    super("The skill profile is available with access to the exam.");
  }
}

/** Same code as the other student routes for an exam that is not on offer. */
export class ProfileExamNotAvailable extends DomainError {
  readonly code = "EXAM_NOT_AVAILABLE";
  readonly kind = "NOT_FOUND";

  constructor() {
    super("The exam is not available.");
  }
}
