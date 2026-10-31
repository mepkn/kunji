/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import { CALLS_PER_MINUTE } from "../convex/mcp";
import schema from "../convex/schema";
import { encryptSecret, sha256Hex } from "../convex/lib/secrets";

const modules = import.meta.glob("../convex/**/*.ts");

const karyaTools = [{ name: "list_tickets", description: "Tickets", inputSchema: { type: "object" } }];

/** A fake karya: /kunji/access answers `status`, /kunji/call echoes its body. */
function fakeApp(status: () => string) {
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(init.body as string) : null;
    if (url.endsWith("/kunji/access")) return Response.json({ status: status() });
    if (url.endsWith("/kunji/call")) {
      if (body.tool === "boom") return Response.json({ ok: false, error: { code: "tool_error", message: "It broke." } });
      return Response.json({ ok: true, result: { tool: body.tool, as: body.userEmail, input: body.input } });
    }
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "me@example.com", emailVerificationTime: 1 });
    const appId = await ctx.db.insert("apps", {
      slug: "karya",
      name: "Karya",
      siteUrl: "https://karya.example.com",
      backendUrl: "https://karya.example.convex.site",
      encryptedSecret: await encryptSecret("kjs_karya"),
      secretHash: await sha256Hex("kjs_karya"),
      enabled: true,
    });
    await ctx.db.insert("appTools", { appId, tools: [...karyaTools, { name: "boom", description: "Fails", inputSchema: { type: "object" } }], fetchedAt: 0 });
    return { userId, appId };
  });
  const me = t.withIdentity({ subject: `${ids.userId}|s` });
  const { token } = await me.action(api.tokens.create, { name: "laptop" });
  let id = 0;
  const rpc = async (bearer: string | null, method: string, params?: object) => {
    const res = await t.fetch("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    });
    return { status: res.status, body: res.status === 202 ? null : await res.json() };
  };
  const names = async () => (await rpc(token, "tools/list")).body.result.tools.map((x: { name: string }) => x.name);
  const call = async (name: string, args: object = {}) => (await rpc(token, "tools/call", { name, arguments: args })).body.result;
  return { t, me, token, rpc, names, call, ...ids };
}

beforeEach(() => {
  vi.stubEnv("ALLOWED_EMAILS", "me@example.com");
  vi.stubEnv("ENCRYPTION_KEY", btoa(String.fromCharCode(...new Uint8Array(32).fill(7))));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("tokens are kj_, stored hashed with last 4, and revoking cuts them off", async () => {
  fakeApp(() => "ok");
  const { t, me, token, rpc, userId } = await setup();
  expect(token).toMatch(/^kj_[\w-]{43}$/);
  const rows = await t.run((ctx) => ctx.db.query("mcpTokens").collect());
  expect(rows).toEqual([expect.objectContaining({ userId, name: "laptop", tokenHash: await sha256Hex(token), last4: token.slice(-4) })]);
  expect(JSON.stringify(rows)).not.toContain(token);

  expect((await rpc(token, "ping")).status).toBe(200);
  const [listed] = await me.query(api.tokens.list);
  expect(listed).toMatchObject({ name: "laptop", last4: token.slice(-4) });
  expect(listed.lastUsedAt).toBeGreaterThan(0);
  expect(listed).not.toHaveProperty("tokenHash");

  await me.mutation(api.tokens.revoke, { tokenId: listed._id });
  expect((await rpc(token, "ping")).status).toBe(401);
});

test("refuses a missing, unknown or no-longer-allowed token", async () => {
  fakeApp(() => "ok");
  const { t, token, rpc } = await setup();
  expect((await rpc(null, "tools/list")).status).toBe(401);
  expect((await rpc("kj_nope", "tools/list")).status).toBe(401);
  const denied = await t.fetch("/mcp", { method: "POST", body: "{}" });
  expect(denied.headers.get("WWW-Authenticate")).toMatch(/^Bearer/);
  vi.stubEnv("ALLOWED_EMAILS", "someone@else.com");
  expect((await rpc(token, "tools/list")).status).toBe(401);
});

test("initialize, ping and notifications", async () => {
  fakeApp(() => "ok");
  const { t, token, rpc } = await setup();
  expect((await rpc(token, "initialize", { protocolVersion: "2025-03-26" })).body.result).toMatchObject({
    protocolVersion: "2025-03-26",
    serverInfo: { name: "kunji" },
  });
  expect((await rpc(token, "ping")).body.result).toEqual({});
  const res = await t.fetch("/mcp", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
  expect(res.status).toBe(202);
});

test("tools/list shows connected, switched-on apps only, prefixed", async () => {
  let status = "ok";
  const fetch = fakeApp(() => status);
  const { t, me, names, appId, userId } = await setup();
  expect(await names()).toEqual(["karya__list_tickets", "karya__boom"]);
  // The status is cached: no second access check within the hour.
  await names();
  expect(fetch.mock.calls.filter(([u]) => String(u).endsWith("/access"))).toHaveLength(1);

  await me.mutation(api.myApps.setOn, { appId, on: false });
  expect(await names()).toEqual([]);
  await me.mutation(api.myApps.setOn, { appId, on: true });

  status = "no_account";
  await me.action(api.myApps.check, {});
  expect(await names()).toEqual([]);
  const [browse] = await me.query(api.myApps.browse);
  expect(browse).toMatchObject({ slug: "karya", status: "no_account", on: true, toolCount: 2, siteUrl: "https://karya.example.com" });

  // A stale status is rechecked by tools/list.
  status = "ok";
  await t.run(async (ctx) => {
    const row = (await ctx.db.query("userApps").collect()).find((r) => r.userId === userId)!;
    await ctx.db.patch(row._id, { checkedAt: 0 });
  });
  expect(await names()).toEqual(["karya__list_tickets", "karya__boom"]);
});

test("tools/call routes to the app as the person, maps errors and logs each call", async () => {
  fakeApp(() => "ok");
  const { me, names, call, appId } = await setup();
  await names();

  const ok = await call("karya__list_tickets", { status: "open" });
  expect(ok.isError).toBeUndefined();
  expect(JSON.parse(ok.content[0].text)).toEqual({ tool: "list_tickets", as: "me@example.com", input: { status: "open" } });

  expect(await call("karya__boom")).toEqual({ content: [{ type: "text", text: "It broke." }], isError: true });
  expect((await call("karya__nope")).content[0].text).toContain("Unknown tool");
  expect((await call("other__list_tickets")).isError).toBe(true);

  await me.mutation(api.myApps.setOn, { appId, on: false });
  const off = await call("karya__list_tickets");
  expect(off.isError).toBe(true);
  expect(off.content[0].text).toContain("switched Karya off");

  const activity = await me.query(api.activity.recent);
  expect(activity.every((a) => a.source === "mcp")).toBe(true);
  expect(activity.map((a) => [a.app, a.tool, a.ok, a.error])).toEqual([
    ["Karya", "list_tickets", false, "refused"],
    ["Karya", "boom", false, "tool_error"],
    ["Karya", "list_tickets", true, null],
  ]);
});

test("the gateway refuses an app the person switched off", async () => {
  fakeApp(() => "ok");
  const { t, me, appId } = await setup();
  await me.mutation(api.myApps.setOn, { appId, on: false });
  const res = await t.fetch("/ai/v1/generate", {
    method: "POST",
    headers: { Authorization: "Bearer kjs_karya", "Content-Type": "application/json" },
    body: JSON.stringify({ userEmail: "me@example.com", messages: [{ role: "user", content: "hi" }] }),
  });
  expect(res.status).toBe(403);
  expect((await res.json()).error.code).toBe("app_off");
});

test("tools/call is limited per person per minute", async () => {
  fakeApp(() => "ok");
  const { t, names, call, userId, appId } = await setup();
  await names();
  await t.run(async (ctx) => {
    for (let i = 0; i < CALLS_PER_MINUTE; i++) await ctx.db.insert("toolCalls", { userId, appId, tool: "list_tickets", ok: true, at: Date.now() });
  });
  const limited = await call("karya__list_tickets");
  expect(limited.isError).toBe(true);
  expect(limited.content[0].text).toContain(`${CALLS_PER_MINUTE} tool calls a minute`);
  // Calls older than a minute no longer count.
  await t.run(async (ctx) => {
    for (const row of await ctx.db.query("toolCalls").collect()) await ctx.db.patch(row._id, { at: Date.now() - 61_000 });
  });
  expect((await call("karya__list_tickets")).isError).toBeUndefined();
});
