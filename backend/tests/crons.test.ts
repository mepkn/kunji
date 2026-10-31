/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { encryptSecret, sha256Hex } from "../convex/lib/secrets";

const modules = import.meta.glob("../convex/**/*.ts");

beforeEach(() => {
  vi.stubEnv("ENCRYPTION_KEY", btoa(String.fromCharCode(...new Uint8Array(32).fill(7))));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("refreshAllTools refreshes enabled apps, skips disabled ones and survives a failing app", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (const [slug, enabled] of [["good", true], ["down", true], ["off", false]] as const) {
      await ctx.db.insert("apps", {
        slug,
        name: slug,
        siteUrl: `https://${slug}.example.com`,
        backendUrl: `https://${slug}.example.convex.site`,
        encryptedSecret: await encryptSecret(`kjs_${slug}`),
        secretHash: await sha256Hex(`kjs_${slug}`),
        enabled,
      });
    }
  });
  const fetch = vi.fn(async (url: string) =>
    url.includes("//down.") ? Promise.reject(new TypeError("fetch failed")) : Response.json([{ name: "do_it", description: "d", inputSchema: { type: "object" } }]),
  );
  vi.stubGlobal("fetch", fetch);

  await t.action(internal.apps.refreshAllTools, {});

  expect(fetch.mock.calls.map(([u]) => new URL(u).hostname.split(".")[0]).sort()).toEqual(["down", "good"]);
  const cached = await t.run(async (ctx) => {
    const apps = await ctx.db.query("apps").collect();
    const rows = await ctx.db.query("appTools").collect();
    return Object.fromEntries(rows.map((r) => [apps.find((a) => a._id === r.appId)!.slug, { count: r.tools.length, error: r.error ?? null }]));
  });
  expect(cached).toEqual({ good: { count: 1, error: null }, down: { count: 0, error: "Could not reach the app." } });
});
