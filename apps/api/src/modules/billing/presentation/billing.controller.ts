import { Body, Controller, Get, Headers, HttpStatus, Param, Post, Res } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyReply } from "fastify";

import { requireIdempotencyKey } from "../../../common/http/idempotency-key.js";
import { uuidParam } from "../../../common/validation/schemas.js";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe.js";
import type { Principal } from "../../auth/domain/principal.js";
import { CurrentPrincipal } from "../../auth/presentation/current-principal.decorator.js";
import { EntitlementsService } from "../application/entitlements.service.js";
import { PaymentsService } from "../application/payments.service.js";
import { PlansService } from "../application/plans.service.js";
import { type CheckoutBody, checkoutBody } from "./billing.dto.js";
import {
  toAccessView,
  toEntitlementView,
  toPaymentView,
  toPlanOfferView,
} from "./billing.views.js";

const uuid = new ZodValidationPipe(uuidParam);

/**
 * Student billing routes (API_CONTRACTS.md "Billing"). Signed-in users only;
 * the student is always the session's, never an id from the request.
 */
@ApiTags("billing")
@Controller()
export class BillingController {
  constructor(
    private readonly plans: PlansService,
    private readonly entitlements: EntitlementsService,
    private readonly payments: PaymentsService,
  ) {}

  @Get("exams/:examId/plans")
  @ApiOperation({ summary: "Plans on sale for an exam." })
  async plansForExam(@Param("examId", uuid) examId: string) {
    return { items: (await this.plans.listForSale(examId)).map(toPlanOfferView) };
  }

  @Get("exams/:examId/my-access")
  @ApiOperation({ summary: "Whether the caller has paid access to the exam, and until when." })
  async myAccess(@CurrentPrincipal() principal: Principal, @Param("examId", uuid) examId: string) {
    return toAccessView(examId, await this.entitlements.accessTo(principal.userId, examId));
  }

  @Get("me/entitlements")
  @ApiOperation({ summary: "The caller's entitlements, newest first." })
  async myEntitlements(@CurrentPrincipal() principal: Principal) {
    return { items: (await this.entitlements.listFor(principal.userId)).map(toEntitlementView) };
  }

  @Post("payments")
  @ApiHeader({ name: "Idempotency-Key", required: true, description: "UUID; retries reuse it." })
  @ApiOperation({
    summary: "Start buying a plan: returns the provider's checkout page (201 new, 200 existing).",
    description:
      "The payment becomes SUCCEEDED only when the provider confirms it; returning from the checkout page proves nothing. Poll GET /payments/:id.",
  })
  async checkout(
    @CurrentPrincipal() principal: Principal,
    @Headers("idempotency-key") rawKey: string | undefined,
    @Body(new ZodValidationPipe(checkoutBody)) body: CheckoutBody,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const key = requireIdempotencyKey(rawKey);
    const { payment, created } = await this.payments.checkout(principal.userId, body.planId, key);
    reply.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return toPaymentView(payment);
  }

  @Get("payments/:id")
  @ApiOperation({ summary: "One of the caller's payments." })
  async payment(@CurrentPrincipal() principal: Principal, @Param("id", uuid) id: string) {
    return toPaymentView(await this.payments.get(principal.userId, id));
  }
}
