/**
 * How long operational rows are kept after they stop being useful (privacy
 * policy, "الحماية والاحتفاظ": kept only as long as the service needs, then
 * destroyed). Interpretations to confirm: OPEN_QUESTIONS.md #22b.
 *
 * Kept for good, on purpose: payments and entitlements (financial records),
 * learning evidence (it carries no contact details), the audit log
 * (append-only), FAILED outbox events (a person must look at them), and the
 * email delivery log (support answers "the email never came" from it).
 */
export const RETENTION = Object.freeze({
  /** Sign-in sessions, after they expired or were signed out: the "my devices" history. */
  sessionDays: 30,
  /** One-time codes, after they were issued: well past their 10 minutes and the hourly limit. */
  oneTimeCodeDays: 1,
  /** Outbox events already handled: copied to learning_events, nothing reads them after. */
  publishedOutboxDays: 30,
  /** Rows deleted per statement, so a large backlog never holds a long lock. */
  deleteBatch: 1_000,
});
