/**
 * Images and audio inside question content (PRD §10: a question is not text
 * only). Qudurat's quantitative section and Tahsili draw on figures, charts and
 * tables; STEP has a listening section. Pure rules: what may be uploaded and
 * what the bytes really are.
 *
 * The type is read from the bytes (their signature), never from a filename or
 * a declared content type, so a script renamed .png is refused. SVG is not
 * accepted at all: it is markup and can carry script.
 */

export type AssetKind = "IMAGE" | "AUDIO";

export const ASSET_LIMITS = Object.freeze({
  /** A clear figure or chart fits well within this. */
  maxImageBytes: 2_097_152,
  /** About eight minutes of speech at 128 kbps: a listening passage. */
  maxAudioBytes: 8_388_608,
  /** Alternative text a screen reader says instead of the image. */
  maxAltChars: 300,
});

/** Base64 of the largest file, for the upload route's body limit. */
export const MAX_ASSET_BASE64_CHARS = Math.ceil(ASSET_LIMITS.maxAudioBytes / 3) * 4;
/** The upload route's JSON body limit: the largest file as base64, plus room for the envelope. */
export const ASSET_UPLOAD_BODY_LIMIT_BYTES = MAX_ASSET_BASE64_CHARS + 65_536;

export interface SniffedAsset {
  kind: AssetKind;
  contentType: string;
}

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  bytes.length >= offset + signature.length &&
  signature.every((byte, index) => bytes[offset + index] === byte);

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const RIFF = ascii("RIFF");
const WEBP = ascii("WEBP");
const ID3 = ascii("ID3");
const FTYP = ascii("ftyp");
/** ISO base media brands of audio-only files (M4A). */
const AUDIO_BRANDS = new Set(["M4A ", "M4B ", "mp42", "isom", "mp41"]);
const WEBP_TAG_OFFSET = 8;
const FTYP_OFFSET = 4;
const BRAND_OFFSET = 8;
const BRAND_LENGTH = 4;
/** An MPEG audio frame starts with 11 set bits. */
const MPEG_SYNC_MASK = 0xe0;

/** What the bytes are, or null when they are none of the accepted kinds. */
export function sniffAsset(bytes: Uint8Array): SniffedAsset | null {
  if (startsWith(bytes, PNG)) return { kind: "IMAGE", contentType: "image/png" };
  if (startsWith(bytes, JPEG)) return { kind: "IMAGE", contentType: "image/jpeg" };
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, WEBP_TAG_OFFSET)) {
    return { kind: "IMAGE", contentType: "image/webp" };
  }
  if (startsWith(bytes, ID3)) return { kind: "AUDIO", contentType: "audio/mpeg" };
  if (
    bytes.length >= 2 &&
    bytes[0] === 0xff &&
    ((bytes[1] ?? 0) & MPEG_SYNC_MASK) === MPEG_SYNC_MASK
  ) {
    return { kind: "AUDIO", contentType: "audio/mpeg" };
  }
  if (startsWith(bytes, FTYP, FTYP_OFFSET)) {
    const brand = String.fromCharCode(...bytes.slice(BRAND_OFFSET, BRAND_OFFSET + BRAND_LENGTH));
    if (AUDIO_BRANDS.has(brand)) return { kind: "AUDIO", contentType: "audio/mp4" };
  }
  return null;
}

export function maxBytesFor(kind: AssetKind): number {
  return kind === "IMAGE" ? ASSET_LIMITS.maxImageBytes : ASSET_LIMITS.maxAudioBytes;
}

/** A byte range a player asked for (RFC 9110 single range), clamped to the file. */
export function parseByteRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | "UNSATISFIABLE" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, from = "", to = ""] = match;
  if (from === "" && to === "") return null;
  if (from === "") {
    // Suffix range: the last N bytes.
    const length = Number(to);
    if (length === 0) return "UNSATISFIABLE";
    return { start: Math.max(0, size - length), end: size - 1 };
  }
  const start = Number(from);
  const end = to === "" ? size - 1 : Math.min(Number(to), size - 1);
  if (start >= size || end < start) return "UNSATISFIABLE";
  return { start, end };
}
