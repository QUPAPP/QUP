import { z } from "zod";

import { ZodValidationPipe } from "../validation/zod-validation.pipe.js";

/** API_CONTRACTS.md: `Idempotency-Key: <uuid>` on critical writes. */
const idempotencyKeyHeader = new ZodValidationPipe(z.uuid("Idempotency-Key must be a UUID"));

/**
 * Nest applies no pipes to @Headers(), so handlers validate the key with this,
 * getting the same error shape as any other invalid input.
 */
export function requireIdempotencyKey(value: string | undefined): string {
  return idempotencyKeyHeader.transform(value ?? "");
}
