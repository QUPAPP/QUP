import { describe, expect, it } from "vitest";

import { InvalidConfigError, loadConfig } from "../../src/config/app-config.js";
import {
  accessSummary,
  type EntitlementWindow,
  isInForce,
  nextEntitlementPeriod,
} from "../../src/modules/billing/domain/entitlement-period.js";
import {
  isSupportedCurrency,
  minimumSellablePriceMinor,
  toDecimalString,
} from "../../src/modules/billing/domain/money.js";
import { canTransitionPlan } from "../../src/modules/billing/domain/plan-lifecycle.js";
import {
  checkoutStillMatches,
  contentChanges,
  contentProblems,
  lockedFields,
  type PlanContent,
  purchasedTerms,
  wouldAddAccess,
} from "../../src/modules/billing/domain/plan-rules.js";
import { refundableUntil } from "../../src/modules/billing/domain/refund-policy.js";
import {
  isValidStreamSignature,
  signStreamPayload,
} from "../../src/modules/billing/infrastructure/stream/stream-signature.js";

const day = (n: number) => new Date(Date.UTC(2026, 9, n, 12));
const NOW = day(10);

const window = (
  startDay: number,
  endDay: number | null,
  status: EntitlementWindow["status"] = "ACTIVE",
): EntitlementWindow => ({
  startsAt: day(startDay),
  endsAt: endDay === null ? null : day(endDay),
  status,
});

describe("money", () => {
  it.each([
    [19_900, "199.00"],
    [100, "1.00"],
    [5, "0.05"],
    [0, "0.00"],
    [123_456_789, "1234567.89"],
  ])("writes %i halalas as %s", (minor, text) => {
    expect(toDecimalString(minor, "SAR")).toBe(text);
  });

  it("refuses anything that is not a whole, non-negative number of minor units", () => {
    for (const bad of [199.5, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => toDecimalString(bad, "SAR")).toThrow();
    }
  });

  it("sells in SAR only, with a floor of one riyal", () => {
    expect(isSupportedCurrency("SAR")).toBe(true);
    // KWD has three decimals: selling it with SAR's two would misprice by 10×.
    expect(isSupportedCurrency("KWD")).toBe(false);
    expect(isSupportedCurrency("toString")).toBe(false);
    expect(minimumSellablePriceMinor("SAR")).toBe(100);
  });
});

describe("plan rules", () => {
  const content: PlanContent = {
    name: "الباقة الشاملة",
    description: null,
    features: ["أ", "ب"],
    highlighted: false,
    sortOrder: 0,
    priceMinor: 39_900,
    compareAtPriceMinor: null,
    durationDays: 90,
    examIds: ["exam-b", "exam-a"],
  };

  it.each([
    ["DRAFT", { examIds: ["x"], priceMinor: 1 }, []],
    ["ACTIVE", { priceMinor: 1, features: [], durationDays: null }, []],
    ["ACTIVE", { examIds: ["x"], name: "n" }, ["examIds"]],
    ["RETIRED", { name: "n", priceMinor: 1 }, ["name", "priceMinor"]],
  ] as const)("in %s, locks %j to %j", (status, changes, locked) => {
    expect(lockedFields(status, changes)).toEqual(locked);
  });

  it("wants the 'was' price above the price, and at least one distinct exam", () => {
    expect(contentProblems(content)).toEqual([]);
    expect(contentProblems({ ...content, compareAtPriceMinor: 39_900 })).toEqual([
      "COMPARE_AT_NOT_ABOVE_PRICE",
    ]);
    expect(contentProblems({ ...content, examIds: [] })).toEqual(["NO_EXAMS"]);
    expect(contentProblems({ ...content, examIds: ["a", "a"] })).toEqual(["DUPLICATE_EXAMS"]);
  });

  it("audits only what really changes, as before/after pairs", () => {
    expect(contentChanges(content, { priceMinor: 39_900, features: ["أ", "ب"] })).toEqual({});
    expect(contentChanges(content, { priceMinor: 29_900, features: ["أ"] })).toEqual({
      "priceMinor.before": 39_900,
      "priceMinor.after": 29_900,
      "features.before": "أ | ب",
      "features.after": "أ",
    });
  });

  it("freezes what was bought, with exams in one global order", () => {
    expect(purchasedTerms(content)).toEqual({
      planName: "الباقة الشاملة",
      durationDays: 90,
      examIds: ["exam-a", "exam-b"],
    });
  });

  it("reuses an open checkout only while it still sells what the plan sells", () => {
    const terms = purchasedTerms(content);
    const open = { amountMinor: 39_900, currency: "SAR", terms };
    const plan = { ...content, currency: "SAR" };
    expect(checkoutStillMatches(open, plan)).toBe(true);
    expect(checkoutStillMatches(open, { ...plan, priceMinor: 29_900 })).toBe(false);
    expect(checkoutStillMatches(open, { ...plan, durationDays: 365 })).toBe(false);
    // A checkout from before terms were recorded is judged by its amount alone.
    expect(checkoutStillMatches({ ...open, terms: null }, plan)).toBe(true);
  });

  it("sells unless the student already has every exam the plan covers", () => {
    expect(wouldAddAccess([false])).toBe(true);
    expect(wouldAddAccess([true, false, true])).toBe(true);
    expect(wouldAddAccess([true, true, true])).toBe(false);
  });

  it("gives 48 hours to ask for a refund", () => {
    expect(refundableUntil(null)).toBeNull();
    expect(refundableUntil(NOW)).toEqual(new Date(NOW.getTime() + 48 * 3_600_000));
  });
});

describe("plan lifecycle", () => {
  it("moves forward only", () => {
    expect(canTransitionPlan("DRAFT", "ACTIVE")).toBe(true);
    expect(canTransitionPlan("DRAFT", "RETIRED")).toBe(true);
    expect(canTransitionPlan("ACTIVE", "RETIRED")).toBe(true);
    expect(canTransitionPlan("ACTIVE", "DRAFT")).toBe(false);
    expect(canTransitionPlan("RETIRED", "ACTIVE")).toBe(false);
    expect(canTransitionPlan("ACTIVE", "ACTIVE")).toBe(false);
  });
});

describe("entitlement in force", () => {
  it("is in force from its start until its end", () => {
    expect(isInForce(window(1, 20), NOW)).toBe(true);
    expect(isInForce(window(10, 20), NOW)).toBe(true); // starts exactly now
    expect(isInForce(window(1, 10), NOW)).toBe(false); // ends exactly now
    expect(isInForce(window(11, 20), NOW)).toBe(false); // not started
    expect(isInForce(window(1, null), NOW)).toBe(true); // no end
  });

  it("is never in force once revoked", () => {
    expect(isInForce(window(1, null, "REVOKED"), NOW)).toBe(false);
  });
});

describe("the period of a new grant", () => {
  it("starts now and runs for the plan's duration", () => {
    const period = nextEntitlementPeriod({ now: NOW, durationDays: 30, existing: [] });
    expect(period).toEqual({ startsAt: NOW, endsAt: new Date(NOW.getTime() + 30 * 86_400_000) });
  });

  it("has no end when the plan has no duration", () => {
    expect(nextEntitlementPeriod({ now: NOW, durationDays: null, existing: [] }).endsAt).toBeNull();
  });

  it("starts when the student's current access ends, so no paid time is lost", () => {
    const period = nextEntitlementPeriod({ now: NOW, durationDays: 30, existing: [window(1, 15)] });
    expect(period.startsAt).toEqual(day(15));
    expect(period.endsAt).toEqual(new Date(day(15).getTime() + 30 * 86_400_000));
  });

  it("ignores access that has ended or was revoked", () => {
    const existing = [window(1, 5), window(1, 20, "REVOKED")];
    expect(nextEntitlementPeriod({ now: NOW, durationDays: 30, existing }).startsAt).toEqual(NOW);
  });
});

describe("access summary", () => {
  it("reports no access when nothing is in force", () => {
    expect(accessSummary([], NOW)).toEqual({ hasAccess: false, activeUntil: null });
    expect(accessSummary([window(1, 5), window(1, 20, "REVOKED")], NOW)).toEqual({
      hasAccess: false,
      activeUntil: null,
    });
  });

  it("reports when dated access ends", () => {
    expect(accessSummary([window(1, 20)], NOW)).toEqual({ hasAccess: true, activeUntil: day(20) });
  });

  it("reports access without an end as such", () => {
    expect(accessSummary([window(1, 20), window(1, null)], NOW)).toEqual({
      hasAccess: true,
      activeUntil: null,
    });
  });

  it("follows a renewal queued behind the current access", () => {
    expect(accessSummary([window(1, 15), window(15, 30)], NOW).activeUntil).toEqual(day(30));
  });

  it("does not count access that only begins after a gap", () => {
    expect(accessSummary([window(1, 15), window(20, 30)], NOW).activeUntil).toEqual(day(15));
  });

  it("does not grant access for an entitlement that has not started", () => {
    expect(accessSummary([window(12, 30)], NOW).hasAccess).toBe(false);
  });
});

describe("Stream webhook signature", () => {
  const SECRET = "whsec_test_secret";
  const BODY = Buffer.from('{"event_type":"PAYMENT_SUCCEEDED"}');
  const TIMESTAMP = 1_753_195_231;
  // Computed independently: printf '%s' '<timestamp>.<body>' | openssl dgst -sha256 -hmac <secret>
  const KNOWN = "7b25529e074173352028d9ff5e6cb1e821ea208f7091fad6efe5f55a562ee969";
  const HEADER = `t=${TIMESTAMP},v1=${KNOWN}`;

  it("accepts the signature Stream documents: HMAC-SHA256 over '<t>.<raw body>'", () => {
    expect(isValidStreamSignature(SECRET, BODY, HEADER)).toBe(true);
    expect(signStreamPayload(SECRET, BODY, TIMESTAMP)).toBe(HEADER);
  });

  it("rejects a body that differs by a single byte", () => {
    const tampered = Buffer.from('{"event_type":"PAYMENT_SUCCEEDED" }');
    expect(isValidStreamSignature(SECRET, tampered, HEADER)).toBe(false);
  });

  it("rejects a signature made with another secret or for another timestamp", () => {
    expect(isValidStreamSignature("another-secret", BODY, HEADER)).toBe(false);
    expect(isValidStreamSignature(SECRET, BODY, `t=${TIMESTAMP + 1},v1=${KNOWN}`)).toBe(false);
  });

  it.each([
    ["a missing header", undefined],
    ["an empty header", ""],
    ["no timestamp", `v1=${KNOWN}`],
    ["no signature", `t=${TIMESTAMP}`],
    ["a truncated signature", `t=${TIMESTAMP},v1=${KNOWN.slice(0, 32)}`],
    ["a non-hex signature", `t=${TIMESTAMP},v1=${"z".repeat(64)}`],
    ["a non-numeric timestamp", `t=abc,v1=${KNOWN}`],
    ["garbage", "not a signature header"],
  ])("rejects %s", (_name, header) => {
    expect(isValidStreamSignature(SECRET, BODY, header)).toBe(false);
  });
});

describe("payment configuration", () => {
  const BASE = { DATABASE_URL: "postgresql://user:pass@db.internal:5432/qup_db" };

  function problems(env: Record<string, string>): readonly string[] {
    try {
      loadConfig({ ...BASE, ...env });
    } catch (error) {
      if (error instanceof InvalidConfigError) return error.problems;
      throw error;
    }
    return [];
  }

  it("runs without online payment when Stream is not configured", () => {
    expect(loadConfig(BASE).payments.stream).toBeNull();
    expect(
      loadConfig({ ...BASE, STREAM_API_KEY: "", STREAM_WEBHOOK_SECRET: "" }).payments.stream,
    ).toBeNull();
  });

  it("needs the API key and the webhook secret together", () => {
    expect(problems({ STREAM_API_KEY: "key-only" }).join()).toContain("set both, or neither");
    expect(problems({ STREAM_WEBHOOK_SECRET: "secret-only" }).join()).toContain(
      "set both, or neither",
    );
  });

  it("never echoes a Stream credential in a configuration error", () => {
    const message = problems({ STREAM_API_KEY: "sk-very-secret" }).join();
    expect(message).not.toContain("sk-very-secret");
  });

  it("refuses to send the API key over plain HTTP in production", () => {
    const env = {
      NODE_ENV: "production",
      PROXY_SHARED_SECRET: "a-proxy-secret-that-is-long-enough-1234",
      STREAM_API_KEY: "k",
      STREAM_WEBHOOK_SECRET: "s",
      STREAM_API_BASE_URL: "http://stream.example.com",
    };
    expect(problems(env).join()).toContain("must use https in production");
    const returnUrls = {
      PAYMENT_SUCCESS_URL: "https://qupedu.com/payment/return",
      PAYMENT_FAILURE_URL: "https://qupedu.com/payment/return",
    };
    expect(
      problems({ ...env, ...returnUrls, STREAM_API_BASE_URL: "https://stream.example.com" }),
    ).toEqual([]);
  });

  it("needs the return pages in production, so the payer comes back to QUP", () => {
    const env = {
      NODE_ENV: "production",
      PROXY_SHARED_SECRET: "a-proxy-secret-that-is-long-enough-1234",
      STREAM_API_KEY: "k",
      STREAM_WEBHOOK_SECRET: "s",
    };
    expect(problems(env).join()).toContain("PAYMENT_SUCCESS_URL");
    expect(problems(env).join()).toContain("PAYMENT_FAILURE_URL");
  });

  it("defaults to Stream's production API and a 60-minute checkout", () => {
    const config = loadConfig({ ...BASE, STREAM_API_KEY: "k", STREAM_WEBHOOK_SECRET: "s" });
    expect(config.payments.stream?.baseUrl).toBe("https://stream-app-service.streampay.sa");
    expect(config.payments.checkoutTtlMinutes).toBe(60);
  });
});
