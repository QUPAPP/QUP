import { afterEach, describe, expect, it } from "vitest";

import { CONTACT_REASONS, mailtoFor } from "../src/lib/contact";
import { LEGAL_CONTACT } from "../src/lib/legal";
import { PRIVATE_PATHS, PUBLIC_PAGES, siteUrl } from "../src/lib/site";

describe("contact emails", () => {
  it("opens a mail to support with the reason's subject and the facts support needs", () => {
    const refund = CONTACT_REASONS.find((reason) => reason.id === "refund");
    if (!refund) throw new Error("refund reason missing");
    const link = new URL(mailtoFor(refund));
    expect(link.protocol).toBe("mailto:");
    expect(link.pathname).toBe(LEGAL_CONTACT.email);
    expect(link.searchParams.get("subject")).toBe(refund.subject);
    expect(link.searchParams.get("body")).toContain("تاريخ الدفع");
    // Spaces as %20: some mail apps show a literal "+" otherwise.
    expect(mailtoFor(refund)).not.toContain("+");
  });

  it("never asks for a full card number", () => {
    for (const reason of CONTACT_REASONS) {
      expect(reason.body).not.toMatch(/رقم البطاقة(?! كاملًا)/);
    }
  });
});

describe("site map", () => {
  const original = process.env.APP_PUBLIC_URL;
  afterEach(() => {
    process.env.APP_PUBLIC_URL = original;
  });

  it("uses the configured public address, or the production one", () => {
    process.env.APP_PUBLIC_URL = "https://staging.qupedu.com";
    expect(siteUrl().host).toBe("staging.qupedu.com");
    process.env.APP_PUBLIC_URL = "not a url";
    expect(siteUrl().host).toBe("qupedu.com");
  });

  it("never lists a private area as a public page", () => {
    for (const page of PUBLIC_PAGES) {
      expect(PRIVATE_PATHS.some((path) => page.path.startsWith(path))).toBe(false);
    }
  });
});
