import { type ExecutionContext, Module, SetMetadata } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";

import { APP_CONFIG, type AppConfig } from "../../config/app-config.js";

/**
 * Per-IP rate limiting (SECURITY.md). Three budgets:
 *   - `global`: generous ceiling on every route, against floods;
 *   - `auth`:   tight budget on credential endpoints, against password guessing.
 *     Applies only to handlers marked @CredentialEndpoint();
 *   - `ai`:     budget on AI calls, against runaway cost (AI_INTEGRATION.md
 *     "Cost Control"). Applies only to handlers marked @AiEndpoint().
 *
 * Counters are in process memory: correct for a single instance. Running more
 * than one API instance requires moving the storage to Redis
 * (ARCHITECTURE.md already plans Redis for rate limits).
 *
 * Client IPs come from Fastify's `request.ip`; behind a proxy set TRUST_PROXY,
 * or every client will share the proxy's address and budget.
 */

const WINDOW_MS = 60_000;
const CREDENTIAL_ENDPOINT = "qup:credentialEndpoint";
const AI_ENDPOINT = "qup:aiEndpoint";

export const GLOBAL_THROTTLER = "global";
export const AUTH_THROTTLER = "auth";
export const AI_THROTTLER = "ai";

export const CredentialEndpoint = (): MethodDecorator => SetMetadata(CREDENTIAL_ENDPOINT, true);
export const AiEndpoint = (): MethodDecorator => SetMetadata(AI_ENDPOINT, true);

function isMarked(context: ExecutionContext, marker: string): boolean {
  return Reflect.getMetadata(marker, context.getHandler()) === true;
}

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [], // APP_CONFIG is provided globally by ConfigModule
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        throttlers: [
          { name: GLOBAL_THROTTLER, ttl: WINDOW_MS, limit: config.rateLimit.perMinute },
          {
            name: AUTH_THROTTLER,
            ttl: WINDOW_MS,
            limit: config.rateLimit.authPerMinute,
            skipIf: (context: ExecutionContext) => !isMarked(context, CREDENTIAL_ENDPOINT),
          },
          {
            name: AI_THROTTLER,
            ttl: WINDOW_MS,
            limit: config.rateLimit.aiPerMinute,
            skipIf: (context: ExecutionContext) => !isMarked(context, AI_ENDPOINT),
            // One budget across every AI route, not one per route: the cost is per call.
            generateKey: (_context: ExecutionContext, tracker: string, name: string) =>
              `${name}-${tracker}`,
          },
        ],
      }),
    }),
  ],
  exports: [ThrottlerModule],
})
export class RateLimitModule {}
