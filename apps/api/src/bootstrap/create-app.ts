import type { IncomingMessage } from "node:http";

import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger, PinoLogger } from "nestjs-pino";

import { AppModule, type AppModuleOptions } from "../app.module.js";
import { ErrorResponseFilter } from "../common/errors/error-response.filter.js";
import { REQUEST_ID_HEADER, resolveRequestId } from "../common/http/request-id.js";
import type { AppConfig } from "../config/app-config.js";
import { IMPORT_UPLOAD_BODY_LIMIT_BYTES } from "../modules/content-import/domain/import-limits.js";
import { registerClientAddress } from "./client-address.js";

/**
 * Production and tests build the application through the same two functions,
 * so what the tests exercise is what ships.
 */

export const API_PREFIX = "api/v1";
const HEALTH_ROUTES = ["health/live", "health/ready"];
const OPENAPI_JSON_PATH = "api/openapi.json";

/** Routes whose JSON body carries a file, each with its own limit; every other keeps the global one. */
const UPLOAD_BODY_LIMITS: Readonly<Record<string, number>> = {
  [`/${API_PREFIX}/admin/imports/upload`]: IMPORT_UPLOAD_BODY_LIMIT_BYTES,
};

/**
 * Keeps each request's exact bytes next to its parsed body: a webhook
 * signature is computed over the bytes, and re-serialized JSON would not match.
 */
export const NEST_APP_OPTIONS = { rawBody: true } as const;

/**
 * Trusts the socket address and the next `hops - 1` X-Forwarded-For entries
 * from the right, as Fastify does for a number (the adapter's type wants the
 * function form). `request.ip` is then the address the outermost trusted
 * proxy saw, never one the client wrote.
 */
function trustedHops(hops: number | false): false | ((address: string, hop: number) => boolean) {
  return hops === false ? false : (_address, hop) => hop < hops;
}

export function createAdapter(config: AppConfig): FastifyAdapter {
  return new FastifyAdapter({
    logger: false, // pino-http (nestjs-pino) owns request logging
    trustProxy: trustedHops(config.server.trustProxy),
    bodyLimit: config.server.bodyLimitBytes,
    // Validated ourselves rather than trusted blindly from the header.
    requestIdHeader: false,
    genReqId: (raw: IncomingMessage) => {
      const id = resolveRequestId(raw.headers[REQUEST_ID_HEADER]);
      // Shared with pino-http, which reads the id from the raw request
      // (pino-http declares `id` on IncomingMessage).
      raw.id = id;
      return id;
    },
  });
}

export async function configureApp(app: NestFastifyApplication, config: AppConfig): Promise<void> {
  app.useLogger(app.get(Logger));

  // Nest's Fastify adapter already routes Fastify's own failures (malformed
  // JSON, oversized or unsupported bodies) through global filters, so this one
  // filter covers every error path. Do not add a Fastify setErrorHandler too.
  const errorLogger = await app.resolve(PinoLogger);
  errorLogger.setContext("HttpError");
  app.useGlobalFilters(new ErrorResponseFilter(errorLogger));

  const fastify = app.getHttpAdapter().getInstance();
  // Registered before Nest adds its routes (app.init), so it sees every one.
  fastify.addHook("onRoute", (route) => {
    const limit = UPLOAD_BODY_LIMITS[route.url];
    if (limit !== undefined) route.bodyLimit = limit;
  });

  // Before the guards run: the rate limiter counts requests per client address.
  registerClientAddress(fastify, config.proxy.sharedSecret);

  fastify.addHook("onRequest", async (request, reply) => {
    reply.header(REQUEST_ID_HEADER, request.id);
    // The API sits behind a CDN, and every response is either private to a
    // signed-in user or must be fresh. Nothing here may be stored by a
    // shared cache and replayed to someone else.
    reply.header("cache-control", "no-store");
  });

  await app.register(helmet);
  await app.register(cookie);
  app.enableCors({
    // An empty allowlist disables cross-origin access entirely.
    origin: config.cors.allowedOrigins.length > 0 ? config.cors.allowedOrigins : false,
    credentials: true,
  });

  app.setGlobalPrefix(API_PREFIX, { exclude: HEALTH_ROUTES });
  app.enableShutdownHooks();

  if (config.apiDocs.enabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle("QUP API").setVersion("v1").build(),
    );
    SwaggerModule.setup("api/docs", app, document, {
      swaggerUiEnabled: false,
      jsonDocumentUrl: OPENAPI_JSON_PATH,
      raw: ["json"],
    });
  }
}

export async function createApp(
  config: AppConfig,
  options: AppModuleOptions = {},
): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(config, options),
    createAdapter(config),
    // Throw instead of calling process.exit, so callers decide how to fail.
    { bufferLogs: true, abortOnError: false, ...NEST_APP_OPTIONS },
  );
  await configureApp(app, config);
  return app;
}
