import { describe, expect, it } from "vitest";

import { parseByteRange, sniffAsset } from "../../src/modules/questions/domain/question-assets.js";
import {
  assetReferences,
  blockAsText,
  type RichContent,
} from "../../src/modules/questions/domain/question-content.js";

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new Uint8Array([...text].map((c) => c.charCodeAt(0)));

describe("sniffAsset", () => {
  it("reads images and audio from their signatures", () => {
    expect(sniffAsset(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toEqual({
      kind: "IMAGE",
      contentType: "image/png",
    });
    expect(sniffAsset(bytes(0xff, 0xd8, 0xff, 0xe0))?.contentType).toBe("image/jpeg");
    expect(sniffAsset(ascii("RIFF\0\0\0\0WEBPVP8 "))?.contentType).toBe("image/webp");
    expect(sniffAsset(ascii("ID3\u0004\0"))?.contentType).toBe("audio/mpeg");
    expect(sniffAsset(bytes(0xff, 0xfb, 0x90, 0x00))?.contentType).toBe("audio/mpeg");
    expect(sniffAsset(ascii("\0\0\0 ftypM4A \0\0"))?.contentType).toBe("audio/mp4");
  });

  it("refuses everything else, however it is named", () => {
    expect(sniffAsset(ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffAsset(ascii("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniffAsset(ascii("GIF89a"))).toBeNull();
    expect(sniffAsset(ascii("%PDF-1.7"))).toBeNull();
    expect(sniffAsset(new Uint8Array())).toBeNull();
  });
});

describe("parseByteRange", () => {
  it.each([
    ["bytes=0-9", 100, { start: 0, end: 9 }],
    ["bytes=90-", 100, { start: 90, end: 99 }],
    ["bytes=-10", 100, { start: 90, end: 99 }],
    ["bytes=50-500", 100, { start: 50, end: 99 }],
  ])("%s of %i bytes", (header, size, expected) => {
    expect(parseByteRange(header, size)).toEqual(expected);
  });

  it("answers unsatisfiable past the end, and ignores what it cannot read", () => {
    expect(parseByteRange("bytes=100-", 100)).toBe("UNSATISFIABLE");
    expect(parseByteRange("bytes=9-3", 100)).toBe("UNSATISFIABLE");
    expect(parseByteRange("bytes=0-1,5-6", 100)).toBeNull();
    expect(parseByteRange("items=0-1", 100)).toBeNull();
    expect(parseByteRange(undefined, 100)).toBeNull();
  });
});

describe("media blocks", () => {
  const rich = (...blocks: RichContent["blocks"]): RichContent => ({ blocks });

  it("reads as plain text where media cannot show", () => {
    expect(blockAsText({ type: "image", assetId: "a", alt: "مثلث قائم" })).toBe(
      "[صورة: مثلث قائم]",
    );
    expect(blockAsText({ type: "audio", assetId: "a" })).toBe("[مقطع صوتي]");
  });

  it("lists every asset with where it sits", () => {
    const references = assetReferences({
      stem: rich({ type: "text", text: "x" }, { type: "audio", assetId: "s1" }),
      explanation: rich({ type: "image", assetId: "e1", alt: "حل" }),
      options: [
        {
          key: "A",
          content: rich({ type: "image", assetId: "o1", alt: "شكل" }),
          isCorrect: true,
          displayOrder: 0,
        },
      ],
    });
    expect(references).toEqual([
      { assetId: "s1", kind: "AUDIO", path: "stem.blocks.1" },
      { assetId: "e1", kind: "IMAGE", path: "explanation.blocks.0" },
      { assetId: "o1", kind: "IMAGE", path: "options.0.content.blocks.0" },
    ]);
  });
});
