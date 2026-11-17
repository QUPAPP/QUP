/**
 * The knowledge library's text rules (AI_INTEGRATION.md "Knowledge Library",
 * "Retrieval"): how an entry is cut into passages and how a message becomes
 * a full-text query. Pure functions; the store runs the query.
 */

export const KNOWLEDGE_KINDS = ["EXAMPLE", "REFERENCE"] as const;
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];

export const KNOWLEDGE_TITLE_MAX = 200;
export const KNOWLEDGE_CONTENT_MAX = 20_000;
/**
 * The add route's body limit: the longest entry in Arabic (two bytes a
 * letter in UTF-8, more if escaped), its title and the JSON around them.
 */
export const KNOWLEDGE_BODY_LIMIT_BYTES = 262_144;
/** A passage short enough that a few of them fit a prompt, long enough to hold a whole question. */
export const CHUNK_MAX_CHARS = 1200;
/** Words of a message that make the query; more only dilutes the ranking. */
const QUERY_TERMS_MAX = 16;
const TERM_MIN_CHARS = 2;

/**
 * Cuts text into passages of at most CHUNK_MAX_CHARS, keeping paragraphs
 * (blank-line separated, as model exams usually put one question per
 * paragraph) together whenever they fit.
 */
export function chunkText(content: string, max = CHUNK_MAX_CHARS): string[] {
  const paragraphs = content
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "")
    .flatMap((paragraph) => splitLong(paragraph, max));

  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const joined = current === "" ? paragraph : `${current}\n\n${paragraph}`;
    if (joined.length <= max) {
      current = joined;
    } else {
      chunks.push(current);
      current = paragraph;
    }
  }
  if (current !== "") chunks.push(current);
  return chunks;
}

/** A paragraph longer than `max`, cut at line or sentence ends where it can be. */
function splitLong(paragraph: string, max: number): string[] {
  const pieces: string[] = [];
  let rest = paragraph;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    const cut = Math.max(
      window.lastIndexOf("\n"),
      window.lastIndexOf(". "),
      window.lastIndexOf("؟ "),
      window.lastIndexOf("? "),
      window.lastIndexOf("، "),
      window.lastIndexOf(" "),
    );
    const end = cut > max / 2 ? cut + 1 : max;
    pieces.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }
  if (rest !== "") pieces.push(rest);
  return pieces;
}

/**
 * The distinct words of a text worth searching for: letters and digits only
 * (Arabic diacritics and tatweel dropped), so nothing reaches the query
 * parser as an operator.
 */
export function searchTerms(text: string, max = QUERY_TERMS_MAX): string[] {
  const words = text
    .normalize("NFKC")
    .replace(/[ً-ْـ]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= TERM_MIN_CHARS);
  const distinct = new Set(words.map((word) => word.toLowerCase()));
  // The query syntax's own keyword; as a search word it would only join terms.
  distinct.delete("or");
  return [...distinct].slice(0, max);
}

/** A `websearch_to_tsquery` text that matches a passage holding any of the terms. */
export function anyOfQuery(terms: readonly string[]): string {
  return terms.join(" or ");
}
