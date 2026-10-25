import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError, callTool, checkAccess, listTools, parseTools } from "../convex/lib/appClient";

const app = { backendUrl: "https://app.example.convex.site/", secret: "kjs_x" };

function reply(status: number, body: unknown) {
  return vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
}

afterEach(() => vi.unstubAllGlobals());

describe("app client", () => {
  it("sends the secret and parses tools", async () => {
    const fetch = reply(200, [{ name: "list_x", description: "d", inputSchema: { type: "object" } }]);
    vi.stubGlobal("fetch", fetch);
    expect(await listTools(app)).toHaveLength(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://app.example.convex.site/kunji/tools");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer kjs_x");
  });

  it("rejects malformed tools", () => {
    expect(() => parseTools([{ name: "Bad Name", description: "", inputSchema: {} }])).toThrow(AppError);
    expect(() => parseTools({})).toThrow("not an array");
  });

  it.each([
    [401, {}, "unauthorized"],
    [500, "oops", "bad_response"],
  ])("maps HTTP %i to %s", async (status, body, code) => {
    vi.stubGlobal("fetch", reply(status, body));
    await expect(checkAccess(app, "a@b.co")).rejects.toMatchObject({ code });
  });

  it("maps network failures and timeouts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    await expect(listTools(app)).rejects.toMatchObject({ code: "unreachable" });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new DOMException("t", "TimeoutError"))));
    await expect(listTools(app)).rejects.toMatchObject({ code: "timeout" });
  });

  it("checks the access status", async () => {
    vi.stubGlobal("fetch", reply(200, { status: "no_account" }));
    expect(await checkAccess(app, "a@b.co")).toBe("no_account");
    vi.stubGlobal("fetch", reply(200, { status: "maybe" }));
    await expect(checkAccess(app, "a@b.co")).rejects.toMatchObject({ code: "bad_response" });
  });

  it("passes call results and typed errors through", async () => {
    vi.stubGlobal("fetch", reply(200, { ok: true, result: { n: 1 } }));
    expect(await callTool(app, "a@b.co", "t", {})).toEqual({ ok: true, result: { n: 1 } });
    vi.stubGlobal("fetch", reply(200, { ok: false, error: { code: "no_account", message: "No account" } }));
    expect(await callTool(app, "a@b.co", "t", {})).toEqual({ ok: false, error: { code: "no_account", message: "No account" } });
    vi.stubGlobal("fetch", reply(200, { ok: false, error: "plain" }));
    expect(await callTool(app, "a@b.co", "t", {})).toEqual({ ok: false, error: { code: "tool_error", message: "plain" } });
  });
});
