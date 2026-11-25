/**
 * When a student hears that a time-limited subscription is about to end
 * (OPEN_QUESTIONS.md #5c): far enough ahead to renew without a gap, close
 * enough to still matter. One reminder per period; a renewal already bought
 * silences it.
 */
export const SUBSCRIPTION_REMINDER_LEAD_DAYS = 3;

const MS_PER_DAY = 86_400_000;

/** Entitlements ending before this instant are due a reminder now. */
export function reminderHorizon(now: Date): Date {
  return new Date(now.getTime() + SUBSCRIPTION_REMINDER_LEAD_DAYS * MS_PER_DAY);
}
