import { randomUUID } from "node:crypto";

import { expect, type Page, test } from "@playwright/test";

/**
 * The path every paying student starts on, in a real browser against the real
 * API: sign up with explicit consent, take the free mini diagnostic to the
 * end, read the preliminary result — then delete the account again.
 */

const PASSWORD = "e2e journey passphrase";
const DEMO_EXAM = "اختبار القدرات العامة (تجريبي)";

/**
 * Opens a page once its scripts have loaded: a form used before hydration
 * submits natively and reloads, which is not what a student sees on a warm site.
 */
async function open(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: "networkidle" });
}

async function signUp(page: Page): Promise<string> {
  const email = `journey-${randomUUID().slice(0, 8)}@browser.qup.test`;
  await open(page, "/register");
  await page.getByLabel("البريد الإلكتروني", { exact: true }).fill(email);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(PASSWORD);

  // Consent is a tick, not an implication: without it the form refuses.
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();
  await expect(page.getByText("وافق على الشروط وسياسة الخصوصية للمتابعة")).toBeVisible();

  await page.getByRole("checkbox", { name: /أوافق عليهما/ }).check();
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();
  await expect(page).toHaveURL(/\/exams$/);
  return email;
}

test("a new student signs up, finishes the free diagnostic, sees a result, and can delete the account", async ({
  page,
}) => {
  await signUp(page);

  const card = page.locator("article, li, section").filter({ hasText: DEMO_EXAM }).first();
  await card.getByRole("link", { name: "ابدأ التشخيص المجاني" }).click();
  await expect(page).toHaveURL(/\/assessments\/[0-9a-f-]+$/);

  // Answer every question with its first option until the session ends. Each step waits for
  // its own question to be on screen before choosing, or the choice lands on the previous one.
  for (let step = 1; step <= 60; step++) {
    if (/\/result$/.test(page.url())) break;
    const question = page.getByRole("region", { name: new RegExp(`^السؤال ${step} من`) });
    await expect(question).toBeVisible();
    await question.getByRole("radio").first().check();
    const confirm = question.getByRole("button", { name: /^تأكيد/ });
    await expect(confirm).toBeEnabled();
    await confirm.click();
    // After confirming, the footer offers the way on: the next question, or the result.
    const next = question.locator(".question-footer .btn").first();
    await expect(next).not.toHaveText(/^تأكيد/);
    await next.click();
    await expect(question).toBeHidden();
  }

  await expect(page).toHaveURL(/\/result$/);
  await expect(page.getByRole("heading", { name: /مستواك التشخيصي/ })).toBeVisible();

  // The account can be deleted by its owner, and is gone afterwards.
  await open(page, "/account");
  await page.getByRole("button", { name: "أريد حذف حسابي" }).click();
  await page.getByLabel("كلمة المرور", { exact: true }).fill(PASSWORD);
  await page.getByLabel(/للتأكيد اكتب/).fill("حذف حسابي");
  await page.getByRole("button", { name: "احذف حسابي نهائيًا" }).click();
  await expect(page).toHaveURL(/\/$/);

  await open(page, "/account");
  await expect(page).toHaveURL(/\/login/);
});

test("a sign-up is refused without an email or phone, with the reason shown", async ({ page }) => {
  await open(page, "/register");
  await page.getByLabel("كلمة المرور", { exact: true }).fill(PASSWORD);
  await page.getByRole("checkbox", { name: /أوافق عليهما/ }).check();
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();
  await expect(page.getByText("اكتب بريدك الإلكتروني أو رقم جوالك (أو كليهما)")).toBeVisible();
  await expect(page).toHaveURL(/\/register$/);
});
