import { describe, expect, it } from "vitest";
import { maskKey, move } from "./keys";

describe("maskKey", () => {
  it("shows the known prefix and last 4", () => {
    expect(maskKey("anthropic", "F3x9")).toBe("sk-ant-…F3x9");
    expect(maskKey("custom:openrouter", "abcd")).toBe("…abcd");
  });
});

describe("move", () => {
  it("swaps neighbours and ignores moves off the ends", () => {
    expect(move(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(move(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });
});
