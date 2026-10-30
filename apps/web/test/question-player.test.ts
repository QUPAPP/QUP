import { describe, expect, it } from "vitest";

import { optionIndexForKey, optionLetter } from "../src/lib/diagnostics";

describe("question player options", () => {
  it("labels options with Arabic letters in display order", () => {
    expect([0, 1, 2, 3].map(optionLetter)).toEqual(["أ", "ب", "ج", "د"]);
    expect(optionLetter(20)).toBe("21");
  });

  it.each([
    ["1", 0],
    ["4", 3],
    ["٢", 1],
    ["c", 2],
    ["D", 3],
    ["أ", 0],
    ["ا", 0],
    ["ج", 2],
  ])("maps the key %s to option %i", (key, index) => {
    expect(optionIndexForKey(key, 4)).toBe(index);
  });

  it("ignores keys beyond the options shown and unrelated keys", () => {
    expect(optionIndexForKey("5", 4)).toBeNull();
    expect(optionIndexForKey("e", 4)).toBeNull();
    expect(optionIndexForKey("Enter", 4)).toBeNull();
    expect(optionIndexForKey("x", 4)).toBeNull();
  });
});
