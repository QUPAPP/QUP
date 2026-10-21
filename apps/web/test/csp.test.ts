import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy, createNonce } from "../src/lib/csp";

/** C4: SECURITY.md "Web Security" — a CSP that only lets this request's scripts run. */

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy
      .split(";")
      .map((part) => part.trim().split(/\s+/))
      .filter((parts) => parts[0])
      .map(([name = "", ...values]) => [name, values]),
  );
}

describe("buildContentSecurityPolicy", () => {
  const production = directives(
    buildContentSecurityPolicy({ nonce: "abc123", development: false }),
  );
  const development = directives(
    buildContentSecurityPolicy({ nonce: "abc123", development: true }),
  );

  it("runs only scripts carrying this request's nonce", () => {
    expect(production.get("script-src")).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
    expect(production.get("script-src")).not.toContain("'unsafe-inline'");
    expect(production.get("script-src")).not.toContain("'unsafe-eval'");
  });

  it("allows nothing else to load from or frame the app", () => {
    expect(production.get("default-src")).toEqual(["'self'"]);
    expect(production.get("object-src")).toEqual(["'none'"]);
    expect(production.get("frame-ancestors")).toEqual(["'none'"]);
    expect(production.get("base-uri")).toEqual(["'self'"]);
    expect(production.get("form-action")).toEqual(["'self'"]);
    expect(production.get("connect-src")).toEqual(["'self'"]);
    expect(production.has("upgrade-insecure-requests")).toBe(true);
  });

  it("lets React debug in development, over plain HTTP", () => {
    expect(development.get("script-src")).toContain("'unsafe-eval'");
    expect(development.has("upgrade-insecure-requests")).toBe(false);
  });
});

describe("createNonce", () => {
  it("is base64 of 128 random bits, different every time", () => {
    const nonce = createNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(createNonce()).not.toBe(nonce);
  });
});
