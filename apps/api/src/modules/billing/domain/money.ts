/**
 * Money is an integer count of minor units plus a currency — never a float
 * (packages/db billing schema). Only the currencies listed here can be sold
 * in: each needs its exponent to be converted correctly, and a wrong exponent
 * is a 10× or 1000× pricing error (KWD has three decimals, not two).
 */

/** OPEN_QUESTIONS.md #5a: SAR only in V1. Value = minor units per major unit, as a power of ten. */
const MINOR_UNIT_DIGITS = { SAR: 2 } as const satisfies Record<string, number>;

export type SupportedCurrency = keyof typeof MINOR_UNIT_DIGITS;

export const SUPPORTED_CURRENCIES = Object.keys(MINOR_UNIT_DIGITS) as SupportedCurrency[];

export function isSupportedCurrency(currency: string): currency is SupportedCurrency {
  return Object.hasOwn(MINOR_UNIT_DIGITS, currency);
}

/** The payment provider's floor for a product price: one major unit. */
export function minimumSellablePriceMinor(currency: SupportedCurrency): number {
  return 10 ** MINOR_UNIT_DIGITS[currency];
}

/** 19900 SAR-minor → "199.00". Exact: integer arithmetic only. */
export function toDecimalString(amountMinor: number, currency: SupportedCurrency): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new Error("An amount in minor units must be a non-negative integer.");
  }
  const digits = MINOR_UNIT_DIGITS[currency];
  const scale = 10 ** digits;
  const major = Math.trunc(amountMinor / scale);
  const minor = String(amountMinor % scale).padStart(digits, "0");
  return `${major}.${minor}`;
}
