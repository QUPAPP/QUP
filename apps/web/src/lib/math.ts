import katex from "katex";
// Chemical equations (\ce{H2O}) for Tahsili chemistry; registers its macros with KaTeX.
import "katex/contrib/mhchem";

/**
 * LaTeX written by question authors, rendered to markup by KaTeX.
 *
 * Safe for content authors type: `trust: false` refuses every command that
 * could reach outside the formula (\href, \url, \includegraphics, \htmlClass…),
 * KaTeX escapes all text it emits, and sizes and macro expansion are capped so
 * a formula cannot freeze the page or cover it. A formula KaTeX cannot read is
 * shown as its source, never thrown.
 */
const OPTIONS = Object.freeze({
  displayMode: false,
  output: "htmlAndMathml" as const,
  throwOnError: false,
  // An unreadable formula shows its source in the muted text colour, not alarm red.
  errorColor: "#5b6b7d",
  trust: false,
  strict: "ignore" as const,
  // In ems: generous for real formulas, small enough that none covers the screen.
  maxSize: 10,
  maxExpand: 300,
});

export function renderMath(latex: string, options: { display?: boolean } = {}): string {
  return katex.renderToString(latex, { ...OPTIONS, displayMode: options.display ?? false });
}
