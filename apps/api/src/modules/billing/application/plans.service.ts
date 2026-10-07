import { Inject, Injectable } from "@nestjs/common";

import type { ActorContext } from "../../../common/actor.js";
import { CATALOG_LOOKUP, type CatalogLookup } from "../../catalog/catalog.contract.js";
import {
  ExamNotFound,
  InvalidPlanTransition,
  PlanNotDraft,
  PlanNotFound,
  PlanNotSellable,
} from "../domain/billing.errors.js";
import { isSupportedCurrency, minimumSellablePriceMinor } from "../domain/money.js";
import { canTransitionPlan, type PlanStatus } from "../domain/plan-lifecycle.js";
import { BILLING_STORE, type BillingStore, type Plan } from "../domain/ports.js";

export interface NewPlan {
  examId: string;
  code: string;
  name: string;
  priceMinor: number;
  currency: string;
  durationDays: number | null;
}

export interface PlanChanges {
  name?: string;
  priceMinor?: number;
  durationDays?: number | null;
}

/** Plans: one package per exam (PRD §15 "separate plan per Exam"). */
@Injectable()
export class PlansService {
  constructor(
    @Inject(BILLING_STORE) private readonly store: BillingStore,
    @Inject(CATALOG_LOOKUP) private readonly catalog: CatalogLookup,
  ) {}

  listAll(filter: { examId?: string }): Promise<Plan[]> {
    return this.store.listPlans(filter);
  }

  /** Plans a student can buy now. An exam that is not offered has none. */
  async listForSale(examId: string): Promise<Plan[]> {
    if ((await this.catalog.examStatus(examId)) !== "ACTIVE") return [];
    return this.store.listPlans({ examId, status: "ACTIVE" });
  }

  async create(input: NewPlan): Promise<Plan> {
    if ((await this.catalog.examStatus(input.examId)) === null) throw new ExamNotFound();
    return this.store.createPlan(input);
  }

  async update(planId: string, changes: PlanChanges): Promise<Plan> {
    const updated = await this.store.updateDraftPlan(planId, changes);
    if (updated) return updated;
    if (!(await this.store.findPlan(planId))) throw new PlanNotFound();
    throw new PlanNotDraft();
  }

  async activate(planId: string, actor: ActorContext): Promise<Plan> {
    const plan = await this.requirePlan(planId);
    this.assertTransition(plan.status, "ACTIVE");

    if (!isSupportedCurrency(plan.currency)) {
      throw new PlanNotSellable(`Plans cannot be sold in ${plan.currency} yet.`);
    }
    if (plan.priceMinor < minimumSellablePriceMinor(plan.currency)) {
      throw new PlanNotSellable("The price is below the minimum the payment provider accepts.");
    }
    if ((await this.catalog.examStatus(plan.examId)) === "ARCHIVED") {
      throw new PlanNotSellable("The exam of this plan is archived.");
    }
    return this.transition(plan, "ACTIVE", actor);
  }

  async retire(planId: string, actor: ActorContext): Promise<Plan> {
    const plan = await this.requirePlan(planId);
    this.assertTransition(plan.status, "RETIRED");
    return this.transition(plan, "RETIRED", actor);
  }

  private async requirePlan(planId: string): Promise<Plan> {
    const plan = await this.store.findPlan(planId);
    if (!plan) throw new PlanNotFound();
    return plan;
  }

  private assertTransition(from: PlanStatus, to: PlanStatus): void {
    if (!canTransitionPlan(from, to)) throw new InvalidPlanTransition(from, to);
  }

  private async transition(plan: Plan, to: PlanStatus, actor: ActorContext): Promise<Plan> {
    const moved = await this.store.transitionPlan(plan.id, plan.status, to, actor);
    // Someone else moved the plan between our read and our write.
    if (!moved) throw new InvalidPlanTransition(plan.status, to);
    return moved;
  }
}
