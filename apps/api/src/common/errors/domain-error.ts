/**
 * Base class for expected, typed failures (CODING_STANDARDS.md "Errors").
 *
 * Framework-free: a domain error states *what kind* of failure it is, never an
 * HTTP status. The presentation layer maps the kind to a status code, so the
 * domain stays usable from workers and CLIs as well as HTTP.
 *
 * Contract: `message` is written for API clients and must be safe to return
 * verbatim — no identifiers of other users, no internals, no answer keys.
 *
 * Example:
 *   export class ItemAlreadyAnswered extends DomainError {
 *     readonly code = "ASSESSMENT_ITEM_ALREADY_ANSWERED";
 *     readonly kind = "CONFLICT";
 *   }
 */

export type DomainErrorKind =
  | "INVALID_INPUT"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RULE_VIOLATION"
  /** A dependency the request needs (e.g. the payment provider) cannot serve it right now. */
  | "UNAVAILABLE";

export abstract class DomainError extends Error {
  /** Stable, SCREAMING_SNAKE_CASE code clients may branch on. Never change once shipped. */
  abstract readonly code: string;
  abstract readonly kind: DomainErrorKind;
  /** Optional structured detail for clients (e.g. which fields failed validation). Must be client-safe. */
  readonly details?: unknown;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
