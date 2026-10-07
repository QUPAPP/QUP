import { type ArgumentsHost, Catch, type ExceptionFilter } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { PinoLogger } from "nestjs-pino";

import { type ErrorResponse, isServerError, toErrorResponse } from "./error-mapping.js";

export interface ErrorEnvelope {
  error: { code: string; message: string; requestId: string; details?: unknown };
}

/**
 * Writes the API_CONTRACTS.md error envelope. Nest routes both handler errors
 * and Fastify's pre-handler failures (malformed JSON, oversized bodies) through
 * the global filter, so every error path produces this same shape.
 */
export function sendError(
  reply: FastifyReply,
  requestId: string,
  error: unknown,
  logger: Pick<PinoLogger, "error">,
): ErrorResponse {
  const response = toErrorResponse(error);
  if (isServerError(response)) {
    // Full detail, stack included, goes to the server log only.
    logger.error({ err: error, requestId, code: response.code }, "Request failed");
  }
  const envelope: ErrorEnvelope = {
    error: { code: response.code, message: response.message, requestId },
  };
  if (response.details !== undefined) envelope.error.details = response.details;
  void reply.status(response.status).send(envelope);
  return response;
}

@Catch()
export class ErrorResponseFilter implements ExceptionFilter {
  constructor(private readonly logger: Pick<PinoLogger, "error">) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    sendError(reply, request.id, exception, this.logger);
  }
}
