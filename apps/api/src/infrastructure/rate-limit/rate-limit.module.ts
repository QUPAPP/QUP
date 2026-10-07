import { type ExecutionContext, Module, SetMetadata } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";

import { APP_CONFIG, type AppConfig } from "../../config/app-config.js";

/**
 * Per-IP rate limiting (SECURITY.md). Two budgets:
 *   - `global`: generous ceiling on every route, against floods;
 *   - `auth`:   tight budget on credential endpoints, against password guessing.
 *     Applies only to handlers marked @CredentialEndpoint().
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

export const GLOBAL_THROTTLER = "global";
export const AUTH_THROTTLER = "auth";

export const CredentialEndpoint = (): MethodDecorator => SetMetadata(CREDENTIAL_ENDPOINT, true);

function isCredentialEndpoint(context: ExecutionContext): boolean {
  return Reflect.getMetadata(CREDENTIAL_ENDPOINT, context.getHandler()) === true;
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
            skipIf: (context: ExecutionContext) => !isCredentialEndpoint(context),
          },
        ],
      }),
    }),
  ],
  exports: [ThrottlerModule],
})
export class RateLimitModule {}
