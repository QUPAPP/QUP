import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";

import { actorFrom } from "../../../common/http/actor-context.js";
import {
  type AnalyticsWindowQuery,
  analyticsWindowQuery,
} from "../../../common/validation/analytics-window.js";
import { uuidParam } from "../../../common/validation/schemas.js";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe.js";
import { Permission } from "../../rbac/permissions.js";
import { RequirePermissions } from "../../rbac/require-permissions.js";
import { BillingLedgerService } from "../application/billing-ledger.service.js";
import { EntitlementsService } from "../application/entitlements.service.js";
import { PaymentsService } from "../application/payments.service.js";
import { PlansService } from "../application/plans.service.js";
import {
  type CreatePlanBody,
  createPlanBody,
  encodeLedgerCursor,
  type GrantEntitlementBody,
  grantEntitlementBody,
  type ListPaymentsQuery,
  type ListPlansQuery,
  listPaymentsQuery,
  listPlansQuery,
  type ReconcilePaymentBody,
  reconcilePaymentBody,
  type StudentLookupQuery,
  studentLookupQuery,
  type UpdatePlanBody,
  updatePlanBody,
} from "./billing.dto.js";
import {
  toAdminEntitlementView,
  toAdminPaymentView,
  toAdminPlanView,
  toRevenueSummaryView,
} from "./billing.views.js";

const uuid = new ZodValidationPipe(uuidParam);

/** Plans and manual grants. Class-level permission: every route here is covered. */
@ApiTags("admin: billing")
@RequirePermissions(Permission.BillingManage)
@Controller("admin")
export class AdminBillingController {
  constructor(
    private readonly plans: PlansService,
    private readonly entitlements: EntitlementsService,
    private readonly ledger: BillingLedgerService,
    private readonly payments: PaymentsService,
  ) {}

  @Get("plans")
  @ApiOperation({ summary: "All plans, in every status. Optionally for one exam." })
  async listPlans(@Query(new ZodValidationPipe(listPlansQuery)) query: ListPlansQuery) {
    // A handful of plans per exam (PRD §4); pagination adds nothing yet.
    const plans = await this.plans.listAll(query.examId ? { examId: query.examId } : {});
    return { items: plans.map(toAdminPlanView) };
  }

  @Post("plans")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a plan. It starts as DRAFT, not for sale." })
  async createPlan(@Body(new ZodValidationPipe(createPlanBody)) body: CreatePlanBody) {
    return toAdminPlanView(await this.plans.create(body));
  }

  @Patch("plans/:id")
  @ApiOperation({
    summary: "Edit a plan. Audited.",
    description:
      "DRAFT: anything. ACTIVE: wording, features, order, price and duration — the next buyer pays the new price, earlier payments keep theirs; the exams stay (422 PLAN_FIELDS_LOCKED). RETIRED: nothing.",
  })
  async updatePlan(
    @Param("id", uuid) id: string,
    @Body(new ZodValidationPipe(updatePlanBody)) body: UpdatePlanBody,
    @Req() request: FastifyRequest,
  ) {
    return toAdminPlanView(await this.plans.update(id, body, actorFrom(request)));
  }

  @Post("plans/:id/activate")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Offer the plan for sale (DRAFT → ACTIVE). Audited." })
  async activatePlan(@Param("id", uuid) id: string, @Req() request: FastifyRequest) {
    return toAdminPlanView(await this.plans.activate(id, actorFrom(request)));
  }

  @Post("plans/:id/retire")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Stop selling the plan (→ RETIRED). Existing entitlements are kept. Audited.",
  })
  async retirePlan(@Param("id", uuid) id: string, @Req() request: FastifyRequest) {
    return toAdminPlanView(await this.plans.retire(id, actorFrom(request)));
  }

  @Get("payments")
  @ApiOperation({ summary: "Every payment, newest first, keyset-paginated (cursor = next)." })
  async listPayments(@Query(new ZodValidationPipe(listPaymentsQuery)) query: ListPaymentsQuery) {
    const page = await this.ledger.list({
      ...(query.status ? { status: query.status } : {}),
      ...(query.cursor ? { before: query.cursor } : {}),
      limit: query.limit,
    });
    return {
      items: page.items.map(toAdminPaymentView),
      next: page.next ? encodeLedgerCursor(page.next) : null,
    };
  }

  @Post("payments/:id/reconcile")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Settle (or refund) a payment by asking the provider about its payment. Audited.",
    description:
      "For a student who paid but whose webhook never arrived. Only the provider's answer counts: 422 PROVIDER_PAYMENT_DOES_NOT_MATCH (amount or currency), 422 PROVIDER_PAYMENT_NOT_PAID, 409 PROVIDER_PAYMENT_ALREADY_USED (it settled another payment), 503 when the provider cannot be reached.",
  })
  async reconcilePayment(
    @Param("id", uuid) id: string,
    @Body(new ZodValidationPipe(reconcilePaymentBody)) body: ReconcilePaymentBody,
    @Req() request: FastifyRequest,
  ) {
    const { outcome, payment } = await this.payments.reconcile(
      id,
      body.providerPaymentId,
      actorFrom(request),
    );
    return { outcome, payment: { id: payment.id, status: payment.status } };
  }

  @Get("billing/summary")
  @ApiOperation({ summary: "Payments over the last 7 or 30 days: kept, refunded, abandoned." })
  async summary(@Query(new ZodValidationPipe(analyticsWindowQuery)) query: AnalyticsWindowQuery) {
    return toRevenueSummaryView(await this.ledger.summary(query.days));
  }

  @Get("students/lookup")
  @ApiOperation({ summary: "Find one account by exact email or phone, with its entitlements." })
  async lookupStudent(@Query(new ZodValidationPipe(studentLookupQuery)) query: StudentLookupQuery) {
    const { student, entitlements } = await this.entitlements.lookupStudent(query.identifier);
    return { student, entitlements: entitlements.map(toAdminEntitlementView) };
  }

  @Post("entitlements")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Grant a student access to an exam without a payment. Audited." })
  async grantEntitlement(
    @Body(new ZodValidationPipe(grantEntitlementBody)) body: GrantEntitlementBody,
    @Req() request: FastifyRequest,
  ) {
    return toAdminEntitlementView(await this.entitlements.grantByAdmin(body, actorFrom(request)));
  }

  @Post("entitlements/:id/revoke")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Revoke an entitlement. Idempotent. Audited." })
  async revokeEntitlement(@Param("id", uuid) id: string, @Req() request: FastifyRequest) {
    return toAdminEntitlementView(await this.entitlements.revoke(id, actorFrom(request)));
  }
}
