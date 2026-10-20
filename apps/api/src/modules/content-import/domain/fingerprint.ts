import { createHash } from "node:crypto";

import { normaliseWording } from "./text-normalisation.js";

/**
 * QUESTION_BANK_IMPORT.md duplicate layer 1, "normalized exact hash": two
 * stems that differ only in diacritics, letter forms, punctuation, spacing or
 * case have the same fingerprint. Near duplicates are left to a person.
 */
export function stemFingerprint(text: string): string {
  return createHash("sha256").update(normaliseWording(text)).digest("hex");
}
