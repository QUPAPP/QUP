import { HttpException } from "@nestjs/common";

import { DomainError, type DomainErrorKind } from "./domain-error.js";

/**
 * Translates any thrown value into the API error contract (API_CONTRACTS.md):
 *
 *   { "error": { "code": "...", "message": "...", "requestId": "..." } }
 *
 * Only DomainError messages reach the client verbatim — they are authored to be
 * client-safe. Everything else gets a fixed generic message per code, so
 * framework text, SQL errors and stack traces never leak.
 */

export const PlatformErrorCode = {
  MALFORMED_REQUEST: "MALFORMED_REQUEST",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
  CONFLICT: "CONFLICT",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  UNSUPPORTED_MEDIA_TYPE: "UNSUPPORTED_MEDIA_TYPE",
  RULE_VIOLATION: "RULE_VIOLATION",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
} as const;

type PlatformErrorCode = (typeof PlatformErrorCode)[keyof typeof PlatformErrorCode];

export interface ErrorResponse {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

const HTTP_STATUS_BY_KIND: Record<DomainErrorKind, number> = {
  INVALID_INPUT: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RULE_VIOLATION: 422,
  UNAVAILABLE: 503,
};

type PlatformError = { code: PlatformErrorCode; message: string };

const MALFORMED_REQUEST: PlatformError = {
  code: "MALFORMED_REQUEST",
  message: "The request could not be understood.",
};

const PLATFORM_ERRORS: Record<number, PlatformError> = {
  400: MALFORMED_REQUEST,
  401: { code: "UNAUTHENTICATED", message: "Authentication is required." },
  403: { code: "FORBIDDEN", message: "You do not have permission to perform this action." },
  404: { code: "NOT_FOUND", message: "The requested resource was not found." },
  405: { code: "METHOD_NOT_ALLOWED", message: "This method is not allowed for this resource." },
  409: { code: "CONFLICT", message: "The request conflicts with the current state." },
  413: { code: "PAYLOAD_TOO_LARGE", message: "The request body is too large." },
  415: { code: "UNSUPPORTED_MEDIA_TYPE", message: "The request content type is not supported." },
  422: { code: "RULE_VIOLATION", message: "The request violates a business rule." },
  429: { code: "RATE_LIMITED", message: "Too many requests. Please try again later." },
  503: { code: "SERVICE_UNAVAILABLE", message: "The service is temporarily unavailable." },
};

const INTERNAL_ERROR: ErrorResponse = {
  status: 500,
  code: PlatformErrorCode.INTERNAL_ERROR,
  message: "An unexpected error occurred.",
};

const MIN_CLIENT_ERROR = 400;
const MIN_SERVER_ERROR = 500;

export function toErrorResponse(error: unknown): ErrorResponse {
  if (error instanceof DomainError) {
    const response: ErrorResponse = {
      status: HTTP_STATUS_BY_KIND[error.kind],
      code: error.code,
      message: error.message,
    };
    if (error.details !== undefined) response.details = error.details;
    return response;
  }

  const status = httpStatusOf(error);
  if (status === undefined || status >= MIN_SERVER_ERROR) {
    // Unknown or server-side: never describe it to the client.
    return status === 503 ? platformError(503) : INTERNAL_ERROR;
  }
  return platformError(status);
}

function platformError(status: number): ErrorResponse {
  // Any 4xx without a dedicated entry still gets a stable code, never framework text.
  return { status, ...(PLATFORM_ERRORS[status] ?? MALFORMED_REQUEST) };
}

/** Status from Nest's HttpException or from Fastify's own errors (which carry `statusCode`). */
function httpStatusOf(error: unknown): number | undefined {
  if (error instanceof HttpException) return error.getStatus();
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    const { statusCode } = error as { statusCode: unknown };
    if (typeof statusCode === "number" && statusCode >= MIN_CLIENT_ERROR && statusCode < 600) {
      return statusCode;
    }
  }
  return undefined;
}

export function isServerError(response: ErrorResponse): boolean {
  return response.status >= MIN_SERVER_ERROR;
}
