import { DomainError } from "../../../common/errors/domain-error.js";
import type { ValidationIssue } from "../../../common/validation/zod-validation.pipe.js";

export class SettingNotFound extends DomainError {
  readonly code = "SETTING_NOT_FOUND";
  readonly kind = "NOT_FOUND";

  constructor() {
    super("There is no such setting.");
  }
}

export class SettingValueInvalid extends DomainError {
  readonly code = "SETTING_VALUE_INVALID";
  readonly kind = "RULE_VIOLATION";

  constructor(override readonly details: readonly ValidationIssue[]) {
    super("The value does not satisfy the setting's rules.");
  }
}

/** Someone saved a newer version since the caller read it. */
export class SettingVersionConflict extends DomainError {
  readonly code = "SETTING_VERSION_CONFLICT";
  readonly kind = "CONFLICT";

  constructor() {
    super("The setting was changed since you read it. Reload and retry.");
  }
}
