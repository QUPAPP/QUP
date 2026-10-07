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

/**
 * Production and tests build the application through the same two functions,
 * so what the tests exercise is what ships.
 */

export const API_PREFIX = "api/v1";
const HEALTH_ROUTES = ["health/live", "health/ready"];
const OPENAPI_JSON_PATH = "api/openapi.json";

/**
 * Keeps each request's exact bytes next to its parsed body: a webhook
 * signature is computed over the bytes, and re-serialized JSON would not match.
 */
export const NEST_APP_OPTIONS = { rawBody: true } as const;

export function createAdapter(config: AppConfig): FastifyAdapter {
  return new FastifyAdapter({
    logger: false, // pino-http (nestjs-pino) owns request logging
    trustProxy: config.server.trustProxy,
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

  app
    .getHttpAdapter()
    .getInstance()
    .addHook("onRequest", async (request, reply) => {
      reply.header(REQUEST_ID_HEADER, request.id);
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
