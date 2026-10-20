/**
 * One way to compare Arabic and Latin text typed by different people:
 * Unicode NFKC, no tashkeel or tatweel, one alef, ى→ي, ة→ه, Arabic-Indic
 * digits as ASCII, single spaces, lower case. Used for fingerprints, headers,
 * answers and taxonomy names.
 */

const TASHKEEL = /[ً-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;
const ALEF_FORMS = /[أإآٱ]/g;
const ARABIC_INDIC_ZERO = 0x0660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0;

export function normaliseText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(TASHKEEL, "")
    .replace(TATWEEL, "")
    .replace(ALEF_FORMS, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - ARABIC_INDIC_ZERO))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - EXTENDED_ARABIC_INDIC_ZERO))
    .replace(/٫/g, ".")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** As `normaliseText`, without punctuation or symbols: for comparing wording only. */
export function normaliseWording(value: string): string {
  return normaliseText(value)
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
