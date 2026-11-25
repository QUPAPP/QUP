import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  deleteE2eUsers,
  E2E_DATABASE_URL,
  e2eEmail,
  e2ePhone,
  e2eSql,
} from "../support/e2e-database.js";
import {
  FAKE_OTP_SECRET,
  FAKE_SNDR_API_KEY,
  FAKE_SNDR_FROM,
  FAKE_SNDR_WEBHOOK_SECRET,
  type FakeSndr,
  sndrWebhook,
  startFakeSndr,
} from "../support/fake-sndr.js";
import { TERMS_VERSION } from "../support/terms.js";
import { buildTestApp, testConfig } from "../support/test-app.js";

/**
 * One-time codes end to end (OPEN_QUESTIONS.md #6a): verify an address and
 * reset a password with a mailed code, against the real database and a local
 * stand-in for SNDR.
 */

const COOKIE = "qup_session";
const PASSWORD = "otp test passphrase";
const NEW_PASSWORD = "a brand new passphrase";
const WRONG = "000000";
const MINUTE_MS = 60_000;

let app: NestFastifyApplication;
let sndr: FakeSndr;

type Method = "GET" | "POST";

function call(method: Method, url: string, options: { token?: string; payload?: unknown } = {}) {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    ...(options.token ? { cookies: { [COOKIE]: options.token } } : {}),
    ...(options.payload === undefined
      ? {}
      : { payload: options.payload as Record<string, unknown> }),
  });
}

const errorCode = (r: { json: () => unknown }) =>
  (r.json() as { error: { code: string } }).error.code;

async function register(
  label: string,
  identity: "email" | "phone" = "email",
): Promise<{ token: string; id: string; email: string }> {
  const email = e2eEmail(label);
  const response = await call("POST", "/auth/register", {
    payload:
      identity === "email"
        ? { email, password: PASSWORD, acceptedTermsVersion: TERMS_VERSION }
        : { phone: e2ePhone(), password: PASSWORD, acceptedTermsVersion: TERMS_VERSION },
  });
  expect(response.statusCode).toBe(201);
  return {
    token: response.cookies.find((c) => c.name === COOKIE)?.value ?? "",
    id: response.json<{ user: { id: string } }>().user.id,
    email,
  };
}

/** Lets the one-minute resend cooldown pass without waiting for it. */
async function ageCodes(userId: string): Promise<void> {
  await e2eSql`
    UPDATE one_time_codes SET created_at = created_at - interval '2 minutes' WHERE user_id = ${userId}`;
}

const auditActions = async (userId: string) =>
  (
    await e2eSql<{ action: string }[]>`
      SELECT action FROM audit_logs WHERE resource_id = ${userId} ORDER BY created_at`
  ).map((r) => r.action);

beforeAll(async () => {
  await deleteE2eUsers();
  sndr = await startFakeSndr();
  ({ app } = await buildTestApp({
    config: testConfig({
      DATABASE_URL: E2E_DATABASE_URL,
      AUTH_RATE_LIMIT_PER_MINUTE: "10000",
      SNDR_API_KEY: FAKE_SNDR_API_KEY,
      SNDR_FROM: FAKE_SNDR_FROM,
      SNDR_API_BASE_URL: sndr.baseUrl,
      SNDR_WEBHOOK_SECRET: FAKE_SNDR_WEBHOOK_SECRET,
      OTP_SECRET: FAKE_OTP_SECRET,
    }),
  }));
});

afterAll(async () => {
  await app.close();
  await sndr.close();
  await deleteE2eUsers();
  await e2eSql.end();
});

describe("email verification", () => {
  it("mails a code, takes the right one once, and marks the address verified", async () => {
    const user = await register("verify");
    const me = await call("GET", "/auth/me", { token: user.token });
    expect(me.json()).toMatchObject({
      user: { emailVerified: false },
      features: { emailCodes: true },
    });

    const requested = await call("POST", "/auth/email/verification", { token: user.token });
    expect(requested.statusCode).toBe(202);
    expect(requested.json()).toEqual({ validForMinutes: 10, resendAfterSeconds: 60 });
    expect(sndr.to(user.email)).toHaveLength(1);
    const mail = sndr.to(user.email)[0];
    expect(mail?.body.subject).toBe("رمز توثيق بريدك الإلكتروني");
    expect(mail?.body.subject).not.toMatch(/\d{6}/);
    const code = sndr.latestCode(user.email);

    const confirmed = await call("POST", "/auth/email/verify", {
      token: user.token,
      payload: { code },
    });
    expect(confirmed.statusCode).toBe(204);
    expect((await call("GET", "/auth/me", { token: user.token })).json()).toMatchObject({
      user: { emailVerified: true },
    });
    expect(await auditActions(user.id)).toContain("user.email.verify");

    // Nothing left to verify.
    const again = await call("POST", "/auth/email/verification", { token: user.token });
    expect(again.statusCode).toBe(409);
    expect(errorCode(again)).toBe("EMAIL_ALREADY_VERIFIED");
    const replay = await call("POST", "/auth/email/verify", {
      token: user.token,
      payload: { code },
    });
    expect(errorCode(replay)).toBe("EMAIL_ALREADY_VERIFIED");
  });

  it("stores only a hash of the code and logs the delivery without its content", async () => {
    const user = await register("hash");
    await call("POST", "/auth/email/verification", { token: user.token });
    const code = sndr.latestCode(user.email);

    const [row] = await e2eSql<
      { code_hash: string; email: string; expires_at: Date; created_at: Date }[]
    >`
      SELECT code_hash, email, expires_at, created_at FROM one_time_codes WHERE user_id = ${user.id}`;
    expect(row?.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.code_hash).not.toContain(code);
    expect(Number(row?.expires_at) - Number(row?.created_at)).toBe(10 * MINUTE_MS);

    const [delivery] = await e2eSql<
      {
        kind: string;
        status: string;
        provider: string;
        attempts: number;
        provider_message_id: string;
        to_address: string;
      }[]
    >`SELECT kind, status, provider, attempts, provider_message_id, to_address FROM email_deliveries WHERE user_id = ${user.id}`;
    expect(delivery).toMatchObject({
      kind: "OTP_EMAIL_VERIFICATION",
      status: "SENT",
      provider: "sndr",
      attempts: 1,
      to_address: user.email,
    });
    expect(delivery?.provider_message_id).toBe(sndr.to(user.email)[0]?.id);
  });

  it("answers a second request within a minute with when to retry, and sends nothing", async () => {
    const user = await register("cooldown");
    await call("POST", "/auth/email/verification", { token: user.token });

    const soon = await call("POST", "/auth/email/verification", { token: user.token });
    expect(soon.statusCode).toBe(429);
    expect(errorCode(soon)).toBe("CODE_REQUESTED_TOO_OFTEN");
    const { retryAfterSeconds } = (
      soon.json() as { error: { details: { retryAfterSeconds: number } } }
    ).error.details;
    expect(retryAfterSeconds).toBeGreaterThan(0);
    expect(retryAfterSeconds).toBeLessThanOrEqual(60);
    expect(sndr.to(user.email)).toHaveLength(1);

    await ageCodes(user.id);
    expect((await call("POST", "/auth/email/verification", { token: user.token })).statusCode).toBe(
      202,
    );
    expect(sndr.to(user.email)).toHaveLength(2);
    // The newer code replaced the older one: only one is live.
    const [live] = await e2eSql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM one_time_codes WHERE user_id = ${user.id} AND consumed_at IS NULL`;
    expect(live?.n).toBe(1);
  });

  it("stops at five codes an hour", async () => {
    const user = await register("hourly");
    for (let i = 0; i < 5; i += 1) {
      expect(
        (await call("POST", "/auth/email/verification", { token: user.token })).statusCode,
      ).toBe(202);
      await ageCodes(user.id);
    }
    const sixth = await call("POST", "/auth/email/verification", { token: user.token });
    expect(sixth.statusCode).toBe(429);
    expect(sndr.to(user.email)).toHaveLength(5);
  });

  it("burns a code after five wrong guesses, even for the right one afterwards", async () => {
    const user = await register("burn");
    await call("POST", "/auth/email/verification", { token: user.token });
    const code = sndr.latestCode(user.email);

    for (let i = 0; i < 5; i += 1) {
      const wrong = await call("POST", "/auth/email/verify", {
        token: user.token,
        payload: { code: WRONG },
      });
      expect(wrong.statusCode).toBe(400);
      expect(errorCode(wrong)).toBe("INVALID_OR_EXPIRED_CODE");
    }
    const late = await call("POST", "/auth/email/verify", { token: user.token, payload: { code } });
    expect(errorCode(late)).toBe("INVALID_OR_EXPIRED_CODE");
    expect((await call("GET", "/auth/me", { token: user.token })).json()).toMatchObject({
      user: { emailVerified: false },
    });

    // A fresh code works.
    await ageCodes(user.id);
    await call("POST", "/auth/email/verification", { token: user.token });
    const fresh = sndr.latestCode(user.email);
    expect(
      (await call("POST", "/auth/email/verify", { token: user.token, payload: { code: fresh } }))
        .statusCode,
    ).toBe(204);
  });

  it("does not accept an expired code, and reads spaced or Arabic-Indic digits", async () => {
    const user = await register("expiry");
    await call("POST", "/auth/email/verification", { token: user.token });
    const code = sndr.latestCode(user.email);
    await e2eSql`UPDATE one_time_codes SET expires_at = now() - interval '1 second' WHERE user_id = ${user.id}`;
    const expired = await call("POST", "/auth/email/verify", {
      token: user.token,
      payload: { code },
    });
    expect(errorCode(expired)).toBe("INVALID_OR_EXPIRED_CODE");

    await ageCodes(user.id);
    await call("POST", "/auth/email/verification", { token: user.token });
    const fresh = sndr.latestCode(user.email);
    const arabic = [...fresh].map((d) => String.fromCharCode(0x0660 + Number(d))).join("");
    const spaced = `${arabic.slice(0, 3)} ${arabic.slice(3)}`;
    expect(
      (await call("POST", "/auth/email/verify", { token: user.token, payload: { code: spaced } }))
        .statusCode,
    ).toBe(204);
  });

  it("refuses a malformed code without counting it, and strangers entirely", async () => {
    const user = await register("shape");
    await call("POST", "/auth/email/verification", { token: user.token });
    const malformed = await call("POST", "/auth/email/verify", {
      token: user.token,
      payload: { code: "12ab" },
    });
    expect(errorCode(malformed)).toBe("INVALID_OR_EXPIRED_CODE");
    const [row] = await e2eSql<{ failed_attempts: number }[]>`
      SELECT failed_attempts FROM one_time_codes WHERE user_id = ${user.id}`;
    expect(row?.failed_attempts).toBe(0);

    expect((await call("POST", "/auth/email/verification")).statusCode).toBe(401);
    expect(
      (await call("POST", "/auth/email/verify", { payload: { code: "123456" } })).statusCode,
    ).toBe(401);
    const extra = await call("POST", "/auth/email/verify", {
      token: user.token,
      payload: { code: "123456", userId: user.id },
    });
    expect(extra.statusCode).toBe(400);
  });

  it("cannot be used by one account for another's address", async () => {
    const a = await register("owner-a");
    const b = await register("owner-b");
    await call("POST", "/auth/email/verification", { token: a.token });
    const codeForA = sndr.latestCode(a.email);

    // B has no live code of their own: A's code does nothing for B.
    const stolen = await call("POST", "/auth/email/verify", {
      token: b.token,
      payload: { code: codeForA },
    });
    expect(errorCode(stolen)).toBe("INVALID_OR_EXPIRED_CODE");
    expect((await call("GET", "/auth/me", { token: b.token })).json()).toMatchObject({
      user: { emailVerified: false },
    });
  });

  it("needs an email address on the account", async () => {
    const phoneOnly = await register("phone-only", "phone");
    const response = await call("POST", "/auth/email/verification", { token: phoneOnly.token });
    expect(response.statusCode).toBe(422);
    expect(errorCode(response)).toBe("EMAIL_REQUIRED");
  });
});

describe("when the provider fails", () => {
  it("tells the person, tries twice for an outage, and does not burn their cooldown", async () => {
    const user = await register("outage");
    const before = sndr.calls;
    sndr.failNext(503, "provider_error", 2);

    const failed = await call("POST", "/auth/email/verification", { token: user.token });
    expect(failed.statusCode).toBe(503);
    expect(errorCode(failed)).toBe("EMAIL_UNAVAILABLE");
    expect(failed.payload).not.toContain(FAKE_SNDR_API_KEY);
    expect(sndr.calls - before).toBe(2);
    expect(sndr.to(user.email)).toHaveLength(0);

    // The unsent code was discarded: asking again is allowed at once.
    const [count] = await e2eSql<
      { n: number }[]
    >`SELECT count(*)::int AS n FROM one_time_codes WHERE user_id = ${user.id}`;
    expect(count?.n).toBe(0);
    expect((await call("POST", "/auth/email/verification", { token: user.token })).statusCode).toBe(
      202,
    );
    expect(sndr.to(user.email)).toHaveLength(1);
  });

  it("succeeds when the second try gets through, mailing the code once", async () => {
    const user = await register("blip");
    sndr.failNext(503);
    expect((await call("POST", "/auth/email/verification", { token: user.token })).statusCode).toBe(
      202,
    );
    expect(sndr.to(user.email)).toHaveLength(1);
    const [delivery] = await e2eSql<{ attempts: number; status: string }[]>`
      SELECT attempts, status FROM email_deliveries WHERE user_id = ${user.id}`;
    expect(delivery).toEqual({ attempts: 2, status: "SENT" });
  });

  it("does not retry a rejection that repeating cannot fix", async () => {
    const user = await register("rejected");
    const before = sndr.calls;
    sndr.failNext(422, "domain_not_verified");
    const response = await call("POST", "/auth/email/verification", { token: user.token });
    expect(response.statusCode).toBe(503);
    expect(sndr.calls - before).toBe(1);
    const [delivery] = await e2eSql<{ status: string; last_error: string }[]>`
      SELECT status, last_error FROM email_deliveries WHERE user_id = ${user.id}`;
    expect(delivery?.status).toBe("FAILED");
    expect(delivery?.last_error).toContain("domain_not_verified");
  });
});

describe("password reset", () => {
  it("sets a new password with the mailed code, signs out every session and warns by mail", async () => {
    const user = await register("reset");
    const other =
      (
        await call("POST", "/auth/login", {
          payload: { identifier: user.email, password: PASSWORD },
        })
      ).cookies.find((c) => c.name === COOKIE)?.value ?? "";
    expect((await call("GET", "/auth/me", { token: other })).statusCode).toBe(200);

    const forgot = await call("POST", "/auth/password/forgot", { payload: { email: user.email } });
    expect(forgot.statusCode).toBe(202);
    expect(sndr.to(user.email)).toHaveLength(1);
    expect(sndr.to(user.email)[0]?.body.subject).toBe("رمز استعادة كلمة المرور");
    const code = sndr.latestCode(user.email);

    const reset = await call("POST", "/auth/password/reset", {
      payload: { email: user.email, code, newPassword: NEW_PASSWORD },
    });
    expect(reset.statusCode).toBe(204);

    // Every session — including the one that registered — is gone; the old password too.
    expect((await call("GET", "/auth/me", { token: user.token })).statusCode).toBe(401);
    expect((await call("GET", "/auth/me", { token: other })).statusCode).toBe(401);
    const oldLogin = await call("POST", "/auth/login", {
      payload: { identifier: user.email, password: PASSWORD },
    });
    expect(oldLogin.statusCode).toBe(401);
    const newLogin = await call("POST", "/auth/login", {
      payload: { identifier: user.email, password: NEW_PASSWORD },
    });
    expect(newLogin.statusCode).toBe(200);
    expect(newLogin.json()).toMatchObject({ user: { emailVerified: true } });

    expect(await auditActions(user.id)).toContain("user.password.reset");
    // A notice is owed, queued with the change, carrying ids and nothing else.
    const [event] = await e2eSql<{ payload: Record<string, unknown> }[]>`
      SELECT payload FROM outbox_events
      WHERE event_type = 'notification.email.requested' AND payload->>'userId' = ${user.id}`;
    expect(event?.payload).toEqual({ kind: "PASSWORD_CHANGED", userId: user.id });

    // The code cannot be used twice.
    const replay = await call("POST", "/auth/password/reset", {
      payload: { email: user.email, code, newPassword: "yet another passphrase" },
    });
    expect(errorCode(replay)).toBe("INVALID_OR_EXPIRED_CODE");
  });

  it("answers the same for an address that has no account, and mails nothing", async () => {
    const real = await register("real");
    const known = await call("POST", "/auth/password/forgot", { payload: { email: real.email } });
    const unknown = await call("POST", "/auth/password/forgot", {
      payload: { email: e2eEmail("nobody") },
    });
    expect(unknown.statusCode).toBe(known.statusCode);
    expect(unknown.json()).toEqual(known.json());
    expect(sndr.to(real.email)).toHaveLength(1);
    expect(sndr.sent.filter((m) => m.body.to[0]?.startsWith("nobody-"))).toHaveLength(0);
  });

  it("looks the same to a too-eager asker and still sends nothing more", async () => {
    const user = await register("eager");
    const first = await call("POST", "/auth/password/forgot", { payload: { email: user.email } });
    const second = await call("POST", "/auth/password/forgot", { payload: { email: user.email } });
    expect(second.statusCode).toBe(202);
    expect(second.json()).toEqual(first.json());
    expect(sndr.to(user.email)).toHaveLength(1);
  });

  it("does not reveal that the mail could not be sent", async () => {
    const user = await register("silent");
    sndr.failNext(503, "provider_error", 2);
    const response = await call("POST", "/auth/password/forgot", {
      payload: { email: user.email },
    });
    expect(response.statusCode).toBe(202);
    expect(sndr.to(user.email)).toHaveLength(0);
    // And the person is not locked out of asking again.
    const retry = await call("POST", "/auth/password/forgot", { payload: { email: user.email } });
    expect(retry.statusCode).toBe(202);
    expect(sndr.to(user.email)).toHaveLength(1);
  });

  it("burns the code after five wrong guesses and keeps the old password working", async () => {
    const user = await register("guess");
    await call("POST", "/auth/password/forgot", { payload: { email: user.email } });
    const code = sndr.latestCode(user.email);
    for (let i = 0; i < 5; i += 1) {
      const wrong = await call("POST", "/auth/password/reset", {
        payload: { email: user.email, code: WRONG, newPassword: NEW_PASSWORD },
      });
      expect(errorCode(wrong)).toBe("INVALID_OR_EXPIRED_CODE");
    }
    const late = await call("POST", "/auth/password/reset", {
      payload: { email: user.email, code, newPassword: NEW_PASSWORD },
    });
    expect(errorCode(late)).toBe("INVALID_OR_EXPIRED_CODE");
    const login = await call("POST", "/auth/login", {
      payload: { identifier: user.email, password: PASSWORD },
    });
    expect(login.statusCode).toBe(200);
  });

  it("will not take a verification code for a reset, nor a reset code for a verification", async () => {
    const user = await register("purpose");
    await call("POST", "/auth/email/verification", { token: user.token });
    const verifyCode = sndr.latestCode(user.email);
    await call("POST", "/auth/password/forgot", { payload: { email: user.email } });
    const resetCode = sndr.latestCode(user.email);
    expect(resetCode).not.toBe(verifyCode);

    const wrongPurpose = await call("POST", "/auth/password/reset", {
      payload: { email: user.email, code: verifyCode, newPassword: NEW_PASSWORD },
    });
    expect(errorCode(wrongPurpose)).toBe("INVALID_OR_EXPIRED_CODE");
    const other = await call("POST", "/auth/email/verify", {
      token: user.token,
      payload: { code: resetCode },
    });
    expect(errorCode(other)).toBe("INVALID_OR_EXPIRED_CODE");

    // Each real code still does its own job.
    expect(
      (
        await call("POST", "/auth/email/verify", {
          token: user.token,
          payload: { code: verifyCode },
        })
      ).statusCode,
    ).toBe(204);
  });

  it("holds the same line for an unknown address, a weak password and a suspended account", async () => {
    const unknown = await call("POST", "/auth/password/reset", {
      payload: { email: e2eEmail("ghost"), code: "123456", newPassword: NEW_PASSWORD },
    });
    expect(errorCode(unknown)).toBe("INVALID_OR_EXPIRED_CODE");

    const user = await register("suspended");
    await call("POST", "/auth/password/forgot", { payload: { email: user.email } });
    const code = sndr.latestCode(user.email);
    const weak = await call("POST", "/auth/password/reset", {
      payload: { email: user.email, code, newPassword: "short" },
    });
    expect(weak.statusCode).toBe(400);

    await e2eSql`UPDATE users SET status = 'SUSPENDED' WHERE id = ${user.id}`;
    const blocked = await call("POST", "/auth/password/reset", {
      payload: { email: user.email, code, newPassword: NEW_PASSWORD },
    });
    expect(errorCode(blocked)).toBe("INVALID_OR_EXPIRED_CODE");
    // A suspended account is not even mailed a code.
    const before = sndr.to(user.email).length;
    await ageCodes(user.id);
    await call("POST", "/auth/password/forgot", { payload: { email: user.email } });
    expect(sndr.to(user.email)).toHaveLength(before);
  });

  it("sends a change-of-password notice to the outbox for an ordinary password change too", async () => {
    const user = await register("changed");
    const response = await call("POST", "/auth/password", {
      token: user.token,
      payload: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
    });
    expect(response.statusCode).toBe(204);
    const events = await e2eSql<{ payload: Record<string, unknown> }[]>`
      SELECT payload FROM outbox_events
      WHERE event_type = 'notification.email.requested' AND payload->>'userId' = ${user.id}`;
    expect(events.map((e) => e.payload)).toEqual([{ kind: "PASSWORD_CHANGED", userId: user.id }]);
  });
});

describe("SNDR webhook", () => {
  async function sentMessage(label: string): Promise<{ messageId: string; userId: string }> {
    const user = await register(label);
    await call("POST", "/auth/email/verification", { token: user.token });
    const [row] = await e2eSql<{ provider_message_id: string }[]>`
      SELECT provider_message_id FROM email_deliveries WHERE user_id = ${user.id}`;
    return { messageId: row?.provider_message_id ?? "", userId: user.id };
  }

  function deliver(
    event: Parameters<typeof sndrWebhook>[0],
    options?: Parameters<typeof sndrWebhook>[1],
    provider = "sndr",
  ) {
    const delivery = sndrWebhook(event, options);
    return app.inject({
      method: "POST",
      url: `/api/v1/email/webhooks/${provider}`,
      headers: delivery.headers,
      payload: delivery.payload,
    });
  }

  const statusOf = async (userId: string) =>
    (
      await e2eSql<
        { status: string }[]
      >`SELECT status FROM email_deliveries WHERE user_id = ${userId}`
    )[0]?.status;

  it("records delivered and bounced, and never overwrites a final status", async () => {
    const delivered = await sentMessage("wh-delivered");
    expect(
      (await deliver({ type: "email.delivered", emailId: delivered.messageId })).statusCode,
    ).toBe(200);
    expect(await statusOf(delivered.userId)).toBe("DELIVERED");
    // A replay, and a stale bounce arriving afterwards, change nothing.
    expect(
      (await deliver({ type: "email.delivered", emailId: delivered.messageId })).statusCode,
    ).toBe(200);
    expect(
      (await deliver({ type: "email.bounced", emailId: delivered.messageId })).statusCode,
    ).toBe(200);
    expect(await statusOf(delivered.userId)).toBe("DELIVERED");

    const bounced = await sentMessage("wh-bounced");
    await deliver({
      type: "email.bounced",
      emailId: bounced.messageId,
      reason: "mailbox does not exist",
    });
    expect(await statusOf(bounced.userId)).toBe("BOUNCED");
    const [row] = await e2eSql<{ last_error: string }[]>`
      SELECT last_error FROM email_deliveries WHERE user_id = ${bounced.userId}`;
    expect(row?.last_error).toBe("mailbox does not exist");
  });

  it("acknowledges events that are not about delivery", async () => {
    const message = await sentMessage("wh-unsub");
    const response = await deliver({ type: "email.unsubscribed", emailId: message.messageId });
    expect(response.statusCode).toBe(200);
    expect(await statusOf(message.userId)).toBe("SENT");
  });

  it("rejects forged, stale and unsigned deliveries and changes nothing", async () => {
    const message = await sentMessage("wh-forged");
    const forged = await deliver(
      { type: "email.bounced", emailId: message.messageId },
      { secret: "not-the-secret" },
    );
    expect(forged.statusCode).toBe(401);
    expect(errorCode(forged)).toBe("WEBHOOK_SIGNATURE_INVALID");

    const stale = await deliver(
      { type: "email.bounced", emailId: message.messageId },
      { at: new Date(Date.now() - 10 * MINUTE_MS) },
    );
    expect(stale.statusCode).toBe(401);

    const unsigned = await app.inject({
      method: "POST",
      url: "/api/v1/email/webhooks/sndr",
      payload: JSON.parse(
        sndrWebhook({ type: "email.bounced", emailId: message.messageId }).payload,
      ) as Record<string, unknown>,
    });
    expect(unsigned.statusCode).toBe(401);
    expect(await statusOf(message.userId)).toBe("SENT");
  });

  it("asks SNDR to retry a message it has not recorded yet, and drops an old stranger", async () => {
    const unknownNow = await deliver({ type: "email.delivered", emailId: "eml_not_ours" });
    expect(unknownNow.statusCode).toBe(404);
    expect(errorCode(unknownNow)).toBe("EMAIL_NOT_FOUND");

    const unknownOld = await deliver({
      type: "email.delivered",
      emailId: "eml_not_ours",
      createdAt: new Date(Date.now() - 20 * MINUTE_MS),
    });
    expect(unknownOld.statusCode).toBe(200);
  });

  it("does not answer for a provider it does not use", async () => {
    const response = await deliver({ type: "email.delivered", emailId: "x" }, undefined, "mailgun");
    expect(response.statusCode).toBe(503);
  });
});
