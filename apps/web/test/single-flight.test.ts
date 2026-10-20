import { describe, expect, it, vi } from "vitest";

import { singleFlight } from "../src/lib/single-flight";

describe("singleFlight", () => {
  it("sends one request when a form is submitted twice before the first returns", async () => {
    let finish: (value: string) => void = () => {};
    const send = vi.fn((_input: string) => new Promise<string>((resolve) => (finish = resolve)));
    const submit = singleFlight(send);

    const first = submit("domain");
    const second = submit("domain");
    finish("created");

    expect(send).toHaveBeenCalledTimes(1);
    await expect(first).resolves.toBe("created");
    await expect(second).resolves.toBe("created");
  });

  it("sends again once the previous request has settled, even after a failure", async () => {
    const send = vi
      .fn<(input: string) => Promise<string>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce("created");
    const submit = singleFlight(send);

    await expect(submit("domain")).rejects.toThrow("offline");
    await expect(submit("domain")).resolves.toBe("created");
    expect(send).toHaveBeenCalledTimes(2);
  });
});
