import { z } from "zod";

/**
 * Reusable boundary schemas.
 *
 * `decimal` matches a PostgreSQL numeric(precision, scale) column exactly: a
 * value with more decimals or a larger magnitude than the column holds is
 * rejected, never silently rounded (CODING_STANDARDS.md: no silent coercion).
 */
export function decimal(options: {
  scale: number;
  /** Exclusive lower bound unless `minInclusive`. */
  min: number;
  minInclusive?: boolean;
  max: number;
}) {
  const factor = 10 ** options.scale;
  return z
    .number()
    .refine(Number.isFinite, "must be a finite number")
    .refine(
      (value) => (options.minInclusive ? value >= options.min : value > options.min),
      `must be ${options.minInclusive ? "at least" : "greater than"} ${options.min}`,
    )
    .refine((value) => value <= options.max, `must be at most ${options.max}`)
    .refine(
      // Tolerance absorbs binary floating-point noise (0.1 + 0.2), not real extra digits.
      (value) => Math.abs(Math.round(value * factor) - value * factor) < 1e-6,
      `must have at most ${options.scale} decimal places`,
    );
}

/** numeric(6, 4): weights and importance factors. Positive, at most 99.9999. */
export const weight = decimal({ scale: 4, min: 0, max: 99.9999 });

/** numeric(4, 3): mastery thresholds. A share in (0, 1]. */
export const masteryThreshold = decimal({ scale: 3, min: 0, max: 1 });

export const displayOrder = z.number().int().min(0).max(1_000_000);

/** Stable machine code: upper-case letters, digits, "_", "-", ".". */
export const nodeCode = z
  .string()
  .trim()
  .regex(/^[A-Z0-9][A-Z0-9_.-]{0,63}$/, "must be 1–64 of A–Z, 0–9, _ . - (upper case)");

export const uuidParam = z.uuid();

export const optionalText = (max: number) => z.string().trim().min(1).max(max).optional();
