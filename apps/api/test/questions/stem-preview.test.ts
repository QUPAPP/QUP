import { describe, expect, it } from "vitest";

import {
  STEM_PREVIEW_LENGTH,
  stemPreview,
} from "../../src/modules/questions/domain/stem-preview.js";

const text = (value: string) => ({ type: "text" as const, text: value });
const math = (latex: string) => ({ type: "math" as const, latex });

describe("stem preview", () => {
  it("joins text blocks with one space and stands in for math", () => {
    expect(stemPreview({ blocks: [text("إذا كان"), math("x^2 = 4"), text("فما قيمة x؟")] })).toBe(
      "إذا كان […] فما قيمة x؟",
    );
  });

  it("collapses whitespace", () => {
    expect(stemPreview({ blocks: [text("  سطر\n\nثانٍ   ")] })).toBe("سطر ثانٍ");
  });

  it("cuts a long stem to the preview length with an ellipsis", () => {
    const preview = stemPreview({ blocks: [text("ب".repeat(500))] });
    expect(preview).toHaveLength(STEM_PREVIEW_LENGTH);
    expect(preview.endsWith("…")).toBe(true);
  });

  it("keeps a short stem whole", () => {
    expect(stemPreview({ blocks: [text("قصير")] })).toBe("قصير");
  });

  it("is empty for an empty stem", () => {
    expect(stemPreview({ blocks: [] })).toBe("");
  });
});
