import { describe, expect, it } from "vitest";

import {
  forwardedRequestHeaders,
  forwardedResponseHeaders,
  upstreamPath,
  upstreamUrl,
} from "../src/lib/api-proxy";

describe("which paths are proxied", () => {
  it("maps the requested segments under the API's versioned prefix", () => {
    expect(upstreamPath(["auth", "me"])).toBe("/api/v1/auth/me");
    expect(upstreamPath(["exams", "0b9f3c0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b", "plans"])).toBe(
      "/api/v1/exams/0b9f3c0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b/plans",
    );
  });

  it("never exposes the payment webhooks to browsers", () => {
    expect(upstreamPath(["payments", "webhooks", "stream"])).toBeNull();
    expect(upstreamPath(["payments", "0b9f3c0e"])).not.toBeNull();
  });

  it.each([
    ["an empty path", []],
    ["a parent-directory segment", ["..", "admin"]],
    ["a current-directory segment", ["auth", "."]],
    ["an encoded slash smuggled in a segment", ["auth%2F..%2Fhealth"]],
    ["a segment with a slash", ["auth/me"]],
    ["a segment with a query", ["me?x=1"]],
    ["an empty segment", ["auth", ""]],
  ])("refuses %s", (_name, segments) => {
    expect(upstreamPath(segments)).toBeNull();
  });

  it("keeps the configured host whatever the request asks for", () => {
    const url = upstreamUrl("http://api.internal:3000", ["exams"], "?limit=5");
    expect(url?.toString()).toBe("http://api.internal:3000/api/v1/exams?limit=5");
    // A segment that looks like a host is still just a path segment.
    expect(upstreamUrl("http://api.internal:3000", ["evil.example.com"], "")?.host).toBe(
      "api.internal:3000",
    );
  });
});

describe("which headers cross the proxy", () => {
  it("forwards what the API needs and nothing else", () => {
    const headers = forwardedRequestHeaders(
      new Headers({
        cookie: "qup_session=abc",
        "content-type": "application/json",
        "idempotency-key": "k-1",
        "x-forwarded-for": "203.0.113.7",
        host: "qupedu.com",
        authorization: "Bearer should-not-pass",
        "x-api-key": "should-not-pass",
        connection: "keep-alive",
      }),
    );
    expect(Object.fromEntries(headers)).toEqual({
      cookie: "qup_session=abc",
      "content-type": "application/json",
      "idempotency-key": "k-1",
      "x-forwarded-for": "203.0.113.7",
    });
  });

  it("returns every Set-Cookie and forbids caching", () => {
    const upstream = new Headers({ "content-type": "application/json", "x-request-id": "r-1" });
    upstream.append("set-cookie", "a=1; Path=/; HttpOnly");
    upstream.append("set-cookie", "b=2; Path=/; HttpOnly");
    upstream.set("cache-control", "public, max-age=3600");
    upstream.set("x-internal-debug", "should-not-pass");

    const headers = forwardedResponseHeaders(upstream);
    expect(headers.getSetCookie()).toEqual(["a=1; Path=/; HttpOnly", "b=2; Path=/; HttpOnly"]);
    expect(headers.get("cache-control")).toBe("no-store");
    expect(headers.get("x-request-id")).toBe("r-1");
    expect(headers.get("x-internal-debug")).toBeNull();
  });
});
