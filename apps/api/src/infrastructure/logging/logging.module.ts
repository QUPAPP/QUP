import type { IncomingMessage, ServerResponse } from "node:http";

import { type DynamicModule, Module } from "@nestjs/common";
import { LoggerModule, type Params } from "nestjs-pino";
import { type DestinationStream, stdTimeFunctions } from "pino";
import type { Options as HttpLoggerOptions } from "pino-http";

import type { AppConfig } from "../../config/app-config.js";

/**
 * Structured logging (OBSERVABILITY.md): JSON via pino, one line per request,
 * every line carrying the request id so a single request can be followed
 * through the logs.
 *
 * SECURITY.md "Never log": passwords, session tokens, authorization headers,
 * provider secrets. Defence in depth:
 *   1. the request serializer keeps only id, method and path — no headers, no
 *      query string (where tokens sometimes travel);
 *   2. redaction still covers headers and common secret field names, in case
 *      anything logs a raw request or a payload directly.
 */

const SERVICE_NAME = "qup-api";

const REDACTED_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'res.headers["set-cookie"]',
  'req.headers["x-webhook-signature"]',
  "*.password",
  "*.passwordHash",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.secret",
  "*.apiKey",
  "*.webhookSecret",
];

/** Health probes run every few seconds; logging each one drowns real traffic. */
const UNLOGGED_PATH_PREFIX = "/health/";

function pathOnly(url: string | undefined): string | undefined {
  return url?.split("?", 1)[0];
}

/**
 * Under Fastify, Nest runs middleware through @fastify/middie, which rewrites
 * `req.url` relative to the mount point (it is "/" for every request). The
 * real path is in `originalUrl`.
 */
function requestPath(req: IncomingMessage): string | undefined {
  return (req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url;
}

export function buildLoggerParams(config: AppConfig, destination?: DestinationStream): Params {
  const options: HttpLoggerOptions = {
    level: config.logging.level,
    base: { service: SERVICE_NAME, environment: config.environment },
    timestamp: stdTimeFunctions.isoTime,
    redact: { paths: REDACTED_PATHS, censor: "[REDACTED]" },
    // Fastify assigns the id first (see create-app.ts); reuse it so the
    // response header, the error body and the log line all agree.
    genReqId: (req) => req.id,
    serializers: {
      req: (req: { id?: string; method?: string; url?: string }) => ({
        id: req.id,
        method: req.method,
        path: pathOnly(req.url),
      }),
      res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
    },
    customLogLevel: (_req: IncomingMessage, res: ServerResponse, error?: Error) => {
      if (error || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
    autoLogging: {
      ignore: (req: IncomingMessage) => requestPath(req)?.startsWith(UNLOGGED_PATH_PREFIX) ?? false,
    },
  };

  if (config.logging.pretty) {
    return { pinoHttp: { ...options, transport: { target: "pino-pretty" } } };
  }
  return { pinoHttp: destination ? [options, destination] : options };
}

@Module({})
export class LoggingModule {
  static forRoot(config: AppConfig, destination?: DestinationStream): DynamicModule {
    return {
      module: LoggingModule,
      imports: [LoggerModule.forRoot(buildLoggerParams(config, destination))],
      exports: [LoggerModule],
    };
  }
}
