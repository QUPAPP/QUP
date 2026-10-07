/**
 * When an entitlement runs, and whether one is in force. Pure, so the rules
 * are testable without a database (OPEN_QUESTIONS.md #5a).
 */

const MS_PER_DAY = 86_400_000;

export interface EntitlementPeriod {
  startsAt: Date;
  /** Null: no end. */
  endsAt: Date | null;
}

export interface EntitlementWindow extends EntitlementPeriod {
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
}

/** In force at `now`: not revoked, already started, not yet ended. */
export function isInForce(entitlement: EntitlementWindow, now: Date): boolean {
  return (
    entitlement.status === "ACTIVE" &&
    entitlement.startsAt.getTime() <= now.getTime() &&
    (entitlement.endsAt === null || entitlement.endsAt.getTime() > now.getTime())
  );
}

/**
 * The period a new grant covers. It starts now — unless the student still has
 * time left on a dated entitlement, in which case it starts when that one
 * ends, so paid time is never lost to an overlap.
 *
 * `existing`: the student's entitlements for the same exam.
 */
export function nextEntitlementPeriod(input: {
  now: Date;
  durationDays: number | null;
  existing: readonly EntitlementWindow[];
}): EntitlementPeriod {
  const { now, durationDays, existing } = input;
  const latestEnd = existing
    .filter((e) => e.status === "ACTIVE" && e.endsAt !== null && e.endsAt.getTime() > now.getTime())
    .reduce((latest, e) => Math.max(latest, e.endsAt?.getTime() ?? 0), 0);

  const startsAt = latestEnd > 0 ? new Date(latestEnd) : now;
  return {
    startsAt,
    endsAt: durationDays === null ? null : new Date(startsAt.getTime() + durationDays * MS_PER_DAY),
  };
}

/**
 * How long the student's access lasts, across all entitlements in force or
 * queued behind them. `hasAccess` false means nothing is in force right now.
 */
export function accessSummary(
  entitlements: readonly EntitlementWindow[],
  now: Date,
): { hasAccess: boolean; activeUntil: Date | null } {
  const inForce = entitlements.filter((e) => isInForce(e, now));
  if (inForce.length === 0) return { hasAccess: false, activeUntil: null };
  if (inForce.some((e) => e.endsAt === null)) return { hasAccess: true, activeUntil: null };

  // Follow entitlements that begin no later than the current end (stacked renewals).
  let until = Math.max(...inForce.map((e) => e.endsAt?.getTime() ?? 0));
  const queued = entitlements
    .filter((e) => e.status === "ACTIVE" && e.startsAt.getTime() > now.getTime())
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  for (const next of queued) {
    if (next.startsAt.getTime() > until) break;
    if (next.endsAt === null) return { hasAccess: true, activeUntil: null };
    until = Math.max(until, next.endsAt.getTime());
  }
  return { hasAccess: true, activeUntil: new Date(until) };
}
