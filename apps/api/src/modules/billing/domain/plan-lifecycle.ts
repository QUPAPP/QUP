/**
 * Plan lifecycle. Forward-only, like the other lifecycles in DOMAIN_MODEL.md
 * §4: drafted, offered for sale, then retired. A retired plan stays
 * referenceable by the payments and entitlements it produced.
 */

export type PlanStatus = "DRAFT" | "ACTIVE" | "RETIRED";

const ALLOWED: Record<PlanStatus, readonly PlanStatus[]> = {
  DRAFT: ["ACTIVE", "RETIRED"],
  ACTIVE: ["RETIRED"],
  RETIRED: [],
};

export function canTransitionPlan(from: PlanStatus, to: PlanStatus): boolean {
  return ALLOWED[from].includes(to);
}
