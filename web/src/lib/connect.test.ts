import { describe, expect, it } from "vitest";
import { mcpUrl, snippets } from "./connect";

describe("connect", () => {
  it("derives the /mcp URL from the Convex URL", () => {
    expect(mcpUrl("https://exciting-echidna-830.convex.cloud")).toBe("https://exciting-echidna-830.convex.site/mcp");
    expect(mcpUrl("http://127.0.0.1:3210")).toBe("http://127.0.0.1:3211/mcp");
  });

  it("fills the token into every snippet", () => {
    for (const s of snippets("https://x.convex.site/mcp", "kj_abc")) {
      expect(s.code).toContain("https://x.convex.site/mcp");
      expect(s.code).toContain("Bearer kj_abc");
    }
  });
});
