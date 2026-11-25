import { DomainError } from "../../../common/errors/domain-error.js";

export class UserNotFound extends DomainError {
  readonly code = "USER_NOT_FOUND";
  readonly kind = "NOT_FOUND";

  constructor() {
    super("No account with this id.");
  }
}

/** An admin changing their own access could lock themselves out mid-request. */
export class CannotChangeOwnAccess extends DomainError {
  readonly code = "CANNOT_CHANGE_OWN_ACCESS";
  readonly kind = "RULE_VIOLATION";

  constructor() {
    super("You cannot change your own roles or status. Ask another admin.");
  }
}

export class LastAdminRequired extends DomainError {
  readonly code = "LAST_ADMIN_REQUIRED";
  readonly kind = "RULE_VIOLATION";

  constructor() {
    super("The platform must keep at least one active admin.");
  }
}

export class RolesRequired extends DomainError {
  readonly code = "ROLES_REQUIRED";
  readonly kind = "INVALID_INPUT";

  constructor() {
    super("An account needs at least one role.");
  }
}

/** An erased account has nothing left to change, and can never sign in again. */
export class AccountErased extends DomainError {
  readonly code = "ACCOUNT_ERASED";
  readonly kind = "CONFLICT";

  constructor() {
    super("This account was deleted. It cannot be changed or reactivated.");
  }
}

export class StaffAccountMustLoseRolesFirst extends DomainError {
  readonly code = "STAFF_ACCOUNT_CANNOT_BE_ERASED";
  readonly kind = "RULE_VIOLATION";

  constructor() {
    super("Take this account's staff roles away before deleting it.");
  }
}
