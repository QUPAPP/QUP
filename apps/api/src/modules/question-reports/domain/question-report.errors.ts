import { DomainError } from "../../../common/errors/domain-error.js";

/** The item is not one the student was shown in their own session. */
export class ReportItemNotFound extends DomainError {
  readonly code = "ASSESSMENT_ITEM_NOT_FOUND";
  readonly kind = "NOT_FOUND";

  constructor() {
    super("The question was not shown in this session.");
  }
}

export class ReportNotFound extends DomainError {
  readonly code = "QUESTION_REPORT_NOT_FOUND";
  readonly kind = "NOT_FOUND";

  constructor() {
    super("The report does not exist.");
  }
}

export class ReportAlreadyClosed extends DomainError {
  readonly code = "QUESTION_REPORT_CLOSED";
  readonly kind = "CONFLICT";

  constructor() {
    super("The report was already resolved or dismissed.");
  }
}
