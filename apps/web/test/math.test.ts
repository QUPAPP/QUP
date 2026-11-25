import { describe, expect, it } from "vitest";

import { renderMath } from "../src/lib/math";

/** The markup, without the escaped LaTeX source KaTeX keeps for copy and screen readers. */
const markupOf = (html: string) => html.replace(/<annotation[^>]*>[\s\S]*?<\/annotation>/g, "");

describe("renderMath", () => {
  it("typesets a formula, with MathML for screen readers", () => {
    const html = renderMath(String.raw`\frac{a}{b} + \sqrt{x^2}`);
    expect(html).toContain('class="katex"');
    expect(html).toContain("<math");
  });

  it("typesets chemistry for Tahsili", () => {
    expect(renderMath(String.raw`\ce{2H2 + O2 -> 2H2O}`)).toContain('class="katex"');
  });

  it("refuses links, includes and HTML hooks from author input", () => {
    for (const latex of [
      String.raw`\href{javascript:alert(1)}{click}`,
      String.raw`\url{javascript:alert(1)}`,
      String.raw`\includegraphics{https://evil.example/x.png}`,
      String.raw`\htmlClass{x}{y}`,
      String.raw`\htmlData{onload=alert(1)}{y}`,
    ]) {
      expect(markupOf(renderMath(latex))).not.toMatch(/<a\s|href=|<img|onload=/i);
    }
  });

  it("escapes markup typed as text, and shows unreadable input instead of throwing", () => {
    expect(renderMath(String.raw`\text{<script>alert(1)</script>}`)).not.toContain("<script>");
    expect(() => renderMath(String.raw`\frac{`)).not.toThrow();
    expect(renderMath(String.raw`\frac{`)).toContain("katex-error");
  });

  it("caps sizes so a formula cannot cover the page", () => {
    const html = markupOf(renderMath(String.raw`\rule{1000em}{1000em}`));
    expect(html).not.toContain("1000em");
    expect(html).toContain("10em");
  });
});
