import { DomainError } from "../../../common/errors/domain-error.js";

/**
 * Deliberately identical for "no such account" and "wrong password", so the
 * login endpoint cannot be used to discover which emails/phones are registered.
 */
export class InvalidCredentials extends DomainError {
  readonly code = "INVALID_CREDENTIALS";
  readonly kind = "UNAUTHENTICATED";

  constructor() {
    super("The email/phone or password is incorrect.");
  }
}

export class NotAuthenticated extends DomainError {
  readonly code = "UNAUTHENTICATED";
  readonly kind = "UNAUTHENTICATED";

  constructor() {
    super("Authentication is required.");
  }
}

/** Only reported after the correct password, so it reveals nothing to a guesser. */
export class AccountDisabled extends DomainError {
  readonly code = "ACCOUNT_DISABLED";
  readonly kind = "FORBIDDEN";

  constructor() {
    super("This account is disabled.");
  }
}

export class IdentifierTaken extends DomainError {
  readonly code = "IDENTIFIER_TAKEN";
  readonly kind = "CONFLICT";

  constructor(readonly identifier: "email" | "phone") {
    super(`An account with this ${identifier} already exists.`);
  }
}

export class PermissionDenied extends DomainError {
  readonly code = "FORBIDDEN";
  readonly kind = "FORBIDDEN";

  constructor() {
    super("You do not have permission to perform this action.");
  }
}
