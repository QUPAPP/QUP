import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  type RawBodyRequest,
  Req,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import type { FastifyRequest } from "fastify";

import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe.js";
import {
  AUTH_THROTTLER,
  GLOBAL_THROTTLER,
} from "../../../infrastructure/rate-limit/rate-limit.module.js";
import { Public } from "../../auth/presentation/public.decorator.js";
import { PaymentsService } from "../application/payments.service.js";
import { WebhookPayloadInvalid } from "../domain/billing.errors.js";
import { providerName } from "./billing.dto.js";

/**
 * Payment provider webhooks (SECURITY.md "Payments").
 *
 * @Public: the provider has no session. The request is authenticated by its
 * signature instead, checked over the exact bytes received before anything in
 * the body is believed.
 *
 * Not rate limited: deliveries come from the provider's few addresses, and a
 * throttled delivery is retried minutes or hours later — a paid student
 * waiting for access. An unsigned request costs one HMAC and is rejected.
 *
 * A 2xx acknowledges the delivery (including events that are not ours, so the
 * provider stops retrying them); any error makes the provider try again.
 */
@ApiExcludeController()
@Public()
@SkipThrottle({ [GLOBAL_THROTTLER]: true, [AUTH_THROTTLER]: true })
@Controller("payments/webhooks")
export class PaymentWebhooksController {
  constructor(private readonly payments: PaymentsService) {}

  @Post(":provider")
  @HttpCode(HttpStatus.OK)
  async receive(
    @Param("provider", new ZodValidationPipe(providerName)) provider: string,
    @Req() request: RawBodyRequest<FastifyRequest>,
  ) {
    if (!request.rawBody) throw new WebhookPayloadInvalid();
    await this.payments.handleWebhook(provider, request.rawBody, singleHeaders(request.headers), {
      userId: null,
      requestId: request.id,
    });
    return { received: true };
  }
}

/** A header sent more than once is ambiguous; the first value is used. */
function singleHeaders(headers: FastifyRequest["headers"]): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name, Array.isArray(value) ? value[0] : value]),
  );
}
