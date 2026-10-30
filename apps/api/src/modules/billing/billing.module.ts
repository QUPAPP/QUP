import { Module } from "@nestjs/common";

import { APP_CONFIG, type AppConfig } from "../../config/app-config.js";
import { AuthModule } from "../auth/auth.module.js";
import { CatalogModule } from "../catalog/catalog.module.js";
import { EntitlementsService } from "./application/entitlements.service.js";
import { PaymentsService } from "./application/payments.service.js";
import { PlansService } from "./application/plans.service.js";
import { EXAM_ACCESS } from "./billing.contract.js";
import { BILLING_STORE, PAYMENT_PROVIDER, type PaymentProvider } from "./domain/ports.js";
import { DrizzleBillingStore } from "./infrastructure/drizzle-billing-store.js";
import { StreamPaymentProvider } from "./infrastructure/stream/stream-payment-provider.js";
import { AdminBillingController } from "./presentation/admin-billing.controller.js";
import { BillingController } from "./presentation/billing.controller.js";
import { PaymentWebhooksController } from "./presentation/payment-webhooks.controller.js";

/**
 * Billing: plans, payments and entitlements.
 *
 * One module rather than separate `subscriptions` and `payments` modules
 * because they form one aggregate (DOMAIN_MODEL.md §2 "Billing") and one
 * transaction: a payment becoming SUCCEEDED and its entitlement being granted
 * must commit together (SECURITY.md "Payments").
 *
 * The provider is the only part that knows Stream. With no Stream credentials
 * configured it is null: selling is off, everything else works.
 */
@Module({
  imports: [CatalogModule, AuthModule],
  controllers: [BillingController, AdminBillingController, PaymentWebhooksController],
  providers: [
    PlansService,
    EntitlementsService,
    PaymentsService,
    { provide: BILLING_STORE, useClass: DrizzleBillingStore },
    { provide: EXAM_ACCESS, useExisting: EntitlementsService },
    {
      provide: PAYMENT_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): PaymentProvider | null =>
        config.payments.stream
          ? new StreamPaymentProvider({
              ...config.payments.stream,
              successUrl: config.payments.successUrl,
              failureUrl: config.payments.failureUrl,
            })
          : null,
    },
  ],
  // Other modules depend on the access contract, not on billing services.
  exports: [EXAM_ACCESS],
})
export class BillingModule {}
