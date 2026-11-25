import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CAPTCHA_VERIFIER } from "../../src/modules/auth/domain/captcha.js";
import { TurnstileCaptcha } from "../../src/modules/auth/infrastructure/turnstile-captcha.js";
import { deleteE2eUsers, E2E_DATABASE_URL, e2eEmail, e2eSql } from "../support/e2e-database.js";
import { TERMS_VERSION } from "../support/terms.js";
import { buildTestApp, testConfig } from "../support/test-app.js";

/**
 * The human check on sign-up and "forgot password", with the real Turnstile
 * adapter talking to a local stand-in for Cloudflare's siteverify.
 */

const PASSWORD = "captcha test passphrase";
const SECRET = "test-turnstile-secret";
/** What the stand-in answers for each token the tests send. */
const ANSWERS: Record<string, object> = {
  "good-register": { success: true, action: "register", hostname: "qupedu.com" },
  "good-forgot": { success: true, action: "forgot-password", hostname: "qupedu.com" },
  "other-site": { success: true, action: "register", hostname: "evil.example" },
  expired: { success: false, "error-codes": ["timeout-or-duplicate"] },
};

let siteverify: Server;
let app: NestFastifyApplication;
const received: URLSearchParams[] = [];

beforeAll(async () => {
  await deleteE2eUsers();
  siteverify = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const form = new URLSearchParams(body);
      received.push(form);
      if (form.get("response") === "cloudflare-down") {
        response.writeHead(502).end();
        return;
      }
      const secretOk = form.get("secret") === SECRET;
      const answer = secretOk
        ? (ANSWERS[form.get("response") ?? ""] ?? { success: false })
        : { success: false };
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(answer));
    });
  });
  await new Promise<void>((resolve) => siteverify.listen(0, "127.0.0.1", resolve));
  const verifyUrl = `http://127.0.0.1:${(siteverify.address() as AddressInfo).port}/siteverify`;
  ({ app } = await buildTestApp({
    config: testConfig({
      DATABASE_URL: E2E_DATABASE_URL,
      AUTH_RATE_LIMIT_PER_MINUTE: "10000",
      TURNSTILE_SITE_KEY: "test-site-key",
      TURNSTILE_SECRET_KEY: SECRET,
    }),
    overrides: [
      {
        provide: CAPTCHA_VERIFIER,
        useValue: new TurnstileCaptcha({
          secretKey: SECRET,
          expectedHostname: "qupedu.com",
          verifyUrl,
        }),
      },
    ],
  }));
});

afterAll(async () => {
  await app.close();
  await new Promise((resolve) => siteverify.close(resolve));
  await deleteE2eUsers();
  await e2eSql.end();
});

const register = (captchaToken?: string) =>
  app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      email: e2eEmail("captcha"),
      password: PASSWORD,
      acceptedTermsVersion: TERMS_VERSION,
      ...(captchaToken ? { captchaToken } : {}),
    },
  });

const errorCode = (r: { json: () => unknown }) =>
  (r.json() as { error: { code: string } }).error.code;

describe("human check", () => {
  it("tells the public forms the site key", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/auth/sign-up-options" });
    expect(response.json()).toEqual({ captchaSiteKey: "test-site-key" });
  });

  it("signs up only with a token Cloudflare confirms, for this form and this site", async () => {
    expect(errorCode(await register())).toBe("CAPTCHA_FAILED");
    expect(errorCode(await register("expired"))).toBe("CAPTCHA_FAILED");
    expect(errorCode(await register("other-site"))).toBe("CAPTCHA_FAILED");
    // A token solved on the forgot-password form does not open an account.
    expect(errorCode(await register("good-forgot"))).toBe("CAPTCHA_FAILED");
    expect((await register("good-register")).statusCode).toBe(201);
    expect(received.at(-1)?.get("secret")).toBe(SECRET);
  });

  it("answers 503, not 'robot', when Cloudflare cannot be asked", async () => {
    const response = await register("cloudflare-down");
    expect(response.statusCode).toBe(503);
    expect(errorCode(response)).toBe("CAPTCHA_UNAVAILABLE");
  });

  it("guards the forgot-password form the same way", async () => {
    const send = (captchaToken?: string) =>
      app.inject({
        method: "POST",
        url: "/api/v1/auth/password/forgot",
        payload: { email: e2eEmail("captcha-forgot"), ...(captchaToken ? { captchaToken } : {}) },
      });
    expect(errorCode(await send())).toBe("CAPTCHA_FAILED");
    // Past the check, the usual answer (email is not configured in this test app).
    expect(errorCode(await send("good-forgot"))).not.toBe("CAPTCHA_FAILED");
  });
});
