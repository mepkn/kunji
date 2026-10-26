import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // convex-test runs functions in the same runtime Convex uses.
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
});
