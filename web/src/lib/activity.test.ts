import { describe, expect, it } from "vitest";
import { resultHint } from "./activity";

describe("resultHint", () => {
  it("explains known codes and falls back for others", () => {
    expect(resultHint("refused")).toContain("switched it off");
    expect(resultHint("timeout")).toContain("30 seconds");
    expect(resultHint("something_new")).toBe("An error code from the app.");
  });
});
