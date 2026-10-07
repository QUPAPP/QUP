import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { DomainError, type DomainErrorKind } from "../src/common/errors/domain-error.js";
import { toErrorResponse } from "../src/common/errors/error-mapping.js";

class ExampleError extends DomainError {
  readonly code = "EXAMPLE_FAILURE";
  constructor(readonly kind: DomainErrorKind) {
    super("Client-safe explanation.");
  }
}

describe("error mapping", () => {
  it.each([
    ["INVALID_INPUT", 400],
    ["UNAUTHENTICATED", 401],
    ["FORBIDDEN", 403],
    ["NOT_FOUND", 404],
    ["CONFLICT", 409],
    ["RULE_VIOLATION", 422],
    ["UNAVAILABLE", 503],
  ] as const)("maps a %s domain error to HTTP %i with its own code and message", (kind, status) => {
    expect(toErrorResponse(new ExampleError(kind))).toEqual({
      status,
      code: "EXAMPLE_FAILURE",
      message: "Client-safe explanation.",
    });
  });

  it("replaces framework exception text with a fixed message", () => {
    const response = toErrorResponse(new NotFoundException("Cannot GET /internal/route"));

    expect(response).toEqual({
      status: 404,
      code: "NOT_FOUND",
      message: "The requested resource was not found.",
    });
    expect(toErrorResponse(new ConflictException("row 42 locked")).message).not.toContain("42");
  });

  it("hides the details of unexpected errors", () => {
    const response = toErrorResponse(new Error('duplicate key value violates "users_pkey"'));

    expect(response).toEqual({
      status: 500,
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
    });
  });

  it("maps Fastify's statusCode-bearing errors", () => {
    expect(toErrorResponse({ statusCode: 413, message: "body too large" }).code).toBe(
      "PAYLOAD_TOO_LARGE",
    );
    expect(toErrorResponse({ statusCode: 415 }).code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("still gives an unlisted 4xx a stable code", () => {
    expect(toErrorResponse({ statusCode: 418 })).toMatchObject({
      status: 418,
      code: "MALFORMED_REQUEST",
    });
  });

  it("never trusts a non-numeric or out-of-range statusCode", () => {
    expect(toErrorResponse({ statusCode: "400" }).status).toBe(500);
    expect(toErrorResponse({ statusCode: 200 }).status).toBe(500);
  });
});
