import { describe, expect, it } from "vitest";

import {
  assertEditable,
  effectiveDomainWeights,
} from "../../src/modules/assessments/domain/blueprint.js";

describe("blueprint rules", () => {
  it("lets only a draft change", () => {
    expect(() => assertEditable("DRAFT")).not.toThrow();
    for (const status of ["ACTIVE", "ARCHIVED"] as const) {
      expect(() => assertEditable(status)).toThrow(
        expect.objectContaining({ code: "BLUEPRINT_NOT_EDITABLE" }),
      );
    }
  });

  it("takes each domain's override, or its taxonomy weight", () => {
    const weights = effectiveDomainWeights(
      [
        { id: "verbal", weight: 1 },
        { id: "quant", weight: 2 },
      ],
      new Map([["verbal", 3]]),
    );
    expect([...weights]).toEqual([
      ["verbal", 3],
      ["quant", 2],
    ]);
  });

  it("refuses weights that leave no domain to ask from", () => {
    expect(() =>
      effectiveDomainWeights(
        [
          { id: "verbal", weight: 1 },
          { id: "quant", weight: 2 },
        ],
        new Map([
          ["verbal", 0],
          ["quant", 0],
        ]),
      ),
    ).toThrow(expect.objectContaining({ code: "BLUEPRINT_WEIGHTS_EMPTY" }));
  });
});
