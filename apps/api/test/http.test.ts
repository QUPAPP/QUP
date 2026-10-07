import { Body, Controller, Get, Post } from "@nestjs/common";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DomainError } from "../src/common/errors/domain-error.js";
import { Public } from "../src/modules/auth/presentation/public.decorator.js";
import {
  buildTestApp,
  type LogCapture,
  TEST_ALLOWED_ORIGIN,
  TEST_BODY_LIMIT_BYTES,
} from "./support/test-app.js";

const LEAKED_SECRET = "leaked-secret-9f2c";

class ProbeConflict extends DomainError {
  readonly code = "PROBE_CONFLICT";
  readonly kind = "CONFLICT";
}

/** Test-only routes that fail on purpose. Never registered in the real app. */
@Public()
@Controller("probe")
class ProbeController {
  @Get("conflict")
  conflict(): never {
    throw new ProbeConflict("This probe is already in the requested state.");
  }

  @Get("crash")
  crash(): never {
    throw new Error(`connect failed: postgresql://admin:${LEAKED_SECRET}@db/qup`);
  }

  @Post("echo")
  echo(@Body() body: unknown): unknown {
    return body;
  }
}

let app: NestFastifyApplication;
let logs: LogCapture;

beforeAll(async () => {
  ({ app, logs } = await buildTestApp({ controllers: [ProbeController] }));
});

afterAll(async () => {
  await app.close();
});

function errorBody(payload: string): { code: string; message: string; requestId: string } {
  return (JSON.parse(payload) as { error: { code: string; message: string; requestId: string } })
    .error;
}

describe("health probes", () => {
  it("serves liveness outside the versioned API prefix", async () => {
    const response = await app.inject({ method: "GET", url: "/health/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("does not serve probes under /api/v1", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/health/live" });
    expect(response.statusCode).toBe(404);
  });
});

describe("request ids", () => {
  it("assigns an id and returns it in the response header", async () => {
    const response = await app.inject({ method: "GET", url: "/health/live" });
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("keeps a well-formed id supplied by an upstream proxy", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health/live",
      headers: { "x-request-id": "edge-7f3a.42" },
    });
    expect(response.headers["x-request-id"]).toBe("edge-7f3a.42");
  });

  it("replaces an id that could inject content into the logs", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health/live",
      headers: { "x-request-id": 'x" injected="yes' },
    });
    expect(response.headers["x-request-id"]).not.toContain("injected");
  });
});

describe("error envelope", () => {
  it("returns the contract shape for an unknown route, with the request id", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/does-not-exist" });
    const error = errorBody(response.payload);

    expect(response.statusCode).toBe(404);
    expect(error.code).toBe("NOT_FOUND");
    expect(error.requestId).toBe(response.headers["x-request-id"]);
  });

  it("maps a domain error to its status, code and client-safe message", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/probe/conflict" });

    expect(response.statusCode).toBe(409);
    expect(errorBody(response.payload)).toMatchObject({
      code: "PROBE_CONFLICT",
      message: "This probe is already in the requested state.",
    });
  });

  it("never returns internal details of an unexpected error", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/probe/crash" });

    expect(response.statusCode).toBe(500);
    expect(errorBody(response.payload).code).toBe("INTERNAL_ERROR");
    expect(response.payload).not.toContain(LEAKED_SECRET);
    expect(response.payload).not.toContain("stack");
  });

  it("uses the envelope for malformed JSON rejected before any handler runs", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/probe/echo",
      headers: { "content-type": "application/json" },
      payload: '{"answer": ',
    });

    expect(response.statusCode).toBe(400);
    expect(errorBody(response.payload).code).toBe("MALFORMED_REQUEST");
  });

  it("rejects bodies over the configured limit with the envelope", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/probe/echo",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ padding: "x".repeat(TEST_BODY_LIMIT_BYTES * 2) }),
    });

    expect(response.statusCode).toBe(413);
    expect(errorBody(response.payload).code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("rejects unsupported content types with the envelope", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/probe/echo",
      headers: { "content-type": "application/xml" },
      payload: "<answer/>",
    });

    expect(response.statusCode).toBe(415);
    expect(errorBody(response.payload).code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });
});

describe("security baseline", () => {
  it("sends hardening headers", async () => {
    const response = await app.inject({ method: "GET", url: "/health/live" });

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["content-security-policy"]).toBeDefined();
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("allows cross-origin calls only from the configured allowlist", async () => {
    const preflight = (origin: string) =>
      app.inject({
        method: "OPTIONS",
        url: "/api/v1/probe/echo",
        headers: { origin, "access-control-request-method": "POST" },
      });

    const allowed = await preflight(TEST_ALLOWED_ORIGIN);
    const denied = await preflight("https://attacker.example");

    expect(allowed.headers["access-control-allow-origin"]).toBe(TEST_ALLOWED_ORIGIN);
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("logging", () => {
  it("logs API requests but not health probes, which would drown real traffic", async () => {
    const probe = await app.inject({ method: "GET", url: "/health/live" });
    const api = await app.inject({ method: "GET", url: "/api/v1/probe/conflict" });

    const requestLines = logs.text.split("\n").filter((l) => l.includes('"req"'));
    const loggedIds = requestLines.join("\n");
    expect(loggedIds).toContain(String(api.headers["x-request-id"]));
    expect(loggedIds).not.toContain(String(probe.headers["x-request-id"]));
  });

  it("never writes credentials or query strings to the logs", async () => {
    await app.inject({
      method: "GET",
      url: "/api/v1/probe/conflict?token=query-secret-5b1e",
      headers: {
        authorization: "Bearer bearer-secret-81d0",
        cookie: "session=cookie-secret-3a77",
      },
    });

    expect(logs.text).not.toContain("bearer-secret-81d0");
    expect(logs.text).not.toContain("cookie-secret-3a77");
    expect(logs.text).not.toContain("query-secret-5b1e");
  });

  it("logs server errors with the request id but without leaking them to the client", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/probe/crash" });
    const requestId = response.headers["x-request-id"] as string;

    const line = logs.text.split("\n").find((l) => l.includes(requestId) && l.includes("stack"));
    expect(line, "server log should hold the stack for this request").toBeDefined();
  });
});

describe("OpenAPI", () => {
  it("serves the generated document when docs are enabled", async () => {
    const response = await app.inject({ method: "GET", url: "/api/openapi.json" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ info: { title: "QUP API" } });
  });
});
