// MCP over Streamable HTTP, stateless JSON-RPC (SPEC.md → /mcp), the approach of setu's server.
// Auth: Bearer kj_… token; a token acts only as its owner, on their switched-on, connected apps.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { httpAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { recheck, type Reach } from "./myApps";
import { isAllowedEmail } from "./lib/allowlist";
import { AppError, callTool } from "./lib/appClient";
import { resultText, routeCall, visibleTools } from "./lib/mcp";
import { decryptSecret, sha256Hex } from "./lib/secrets";

const PROTOCOL_VERSION = "2025-06-18";
/** Cached access statuses older than this are rechecked on tools/list. */
const STATUS_TTL_MS = 60 * 60 * 1000;
const SITE_URL = () => process.env.SITE_URL ?? "https://kunji.pknspace.com";

/** The token's owner, if the token exists and the owner may still use kunji. */
export const tokenUser = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const token = await ctx.db
      .query("mcpTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (token === null) return null;
    const user = await ctx.db.get(token.userId);
    if (!user?.email || !isAllowedEmail(user.email)) return null;
    return { tokenId: token._id, userId: user._id, email: user.email };
  },
});

export const touch = internalMutation({
  args: { tokenId: v.id("mcpTokens") },
  handler: async (ctx, { tokenId }) => {
    await ctx.db.patch(tokenId, { lastUsedAt: Date.now() });
  },
});

type User = { userId: Id<"users">; email: string };

/** The person's reach, with switched-on apps whose status is missing or stale rechecked first. */
async function freshReach(ctx: ActionCtx, user: User): Promise<Reach> {
  const reach = await ctx.runQuery(internal.myApps.reach, { userId: user.userId });
  const stale = reach.filter((a) => a.on && (a.checkedAt === null || Date.now() - a.checkedAt > STATUS_TTL_MS));
  if (stale.length === 0) return reach;
  const statuses = await recheck(ctx, user.userId, user.email, stale);
  return reach.map((a) => (statuses.has(a.appId) ? { ...a, status: statuses.get(a.appId)!, checkedAt: Date.now() } : a));
}

type ToolReply = { content: { type: "text"; text: string }[]; isError?: boolean };
const toolError = (text: string): ToolReply => ({ content: [{ type: "text", text }], isError: true });

/** tools/call: routes "<slug>__<tool>" to that app's /kunji/call as the person, and logs it. */
async function runTool(ctx: ActionCtx, user: User, name: string, input: unknown): Promise<ToolReply> {
  const route = routeCall(await ctx.runQuery(internal.myApps.reach, { userId: user.userId }), name, SITE_URL());
  const log = (ok: boolean, error?: string) =>
    route.appId && route.tool ? ctx.runMutation(internal.apps.logCall, { userId: user.userId, appId: route.appId, tool: route.tool, ok, error }) : undefined;
  if (!route.ok) {
    await log(false, "refused");
    return toolError(route.message);
  }
  const target = await ctx.runQuery(internal.apps.target, { appId: route.appId });
  if (target === null || !target.enabled) return toolError(`Unknown tool "${name}". Call tools/list.`);
  try {
    const reply = await callTool({ backendUrl: target.backendUrl, secret: await decryptSecret(target.encryptedSecret) }, user.email, route.tool, input ?? {});
    await log(reply.ok, reply.ok ? undefined : reply.error.code);
    if (reply.ok) return { content: [{ type: "text", text: resultText(reply.result) }] };
    if (reply.error.code === "no_account" || reply.error.code === "not_allowed") {
      await ctx.runMutation(internal.myApps.storeStatus, { userId: user.userId, appId: route.appId, status: reply.error.code });
    }
    return toolError(reply.error.message);
  } catch (err) {
    await log(false, err instanceof AppError ? err.code : "error");
    if (!(err instanceof AppError)) console.error(`${name} failed`, err instanceof Error ? err.message : err);
    return toolError(err instanceof AppError ? `${target.slug}: ${err.message}` : "Calling the app failed.");
  }
}

type RpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

// Browser-based clients (e.g. MCP Inspector) need CORS. Auth is a bearer token, never a cookie,
// so any origin may call.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS, ...headers } });

export const preflight = httpAction(async () => new Response(null, { status: 204, headers: CORS }));

export const handle = httpAction(async (ctx, request) => {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST", ...CORS } });
  const bearer = request.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const user = bearer ? await ctx.runQuery(internal.mcp.tokenUser, { tokenHash: await sha256Hex(bearer) }) : null;
  if (user === null) {
    return json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized: pass Authorization: Bearer kj_… (create one on kunji's Connect page)" } },
      401,
      { "WWW-Authenticate": 'Bearer realm="kunji"' },
    );
  }
  await ctx.runMutation(internal.mcp.touch, { tokenId: user.tokenId });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }

  const answer = async (msg: RpcRequest): Promise<object | null> => {
    const reply = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id, result });
    const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id ?? null, error: { code, message } });
    if (msg.id === undefined) return null; // notification
    switch (msg.method) {
      case "initialize":
        return reply({
          protocolVersion: typeof msg.params?.protocolVersion === "string" ? msg.params.protocolVersion : PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "kunji", version: "1.0.0" },
          instructions: "Tools from the person's apps, named <app>__<tool>. Each runs as the person in that app.",
        });
      case "ping":
        return reply({});
      case "tools/list":
        return reply({ tools: visibleTools(await freshReach(ctx, user)).map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
      case "tools/call": {
        const name = msg.params?.name;
        if (typeof name !== "string") return fail(-32602, "Missing tool name");
        return reply(await runTool(ctx, user, name, msg.params?.arguments));
      }
      default:
        return fail(-32601, `Method not found: ${msg.method}`);
    }
  };

  if (Array.isArray(body)) {
    const replies = (await Promise.all(body.map((m) => answer(m as RpcRequest)))).filter((r) => r !== null);
    return replies.length ? json(replies) : new Response(null, { status: 202, headers: CORS });
  }
  const reply = await answer(body as RpcRequest);
  return reply ? json(reply) : new Response(null, { status: 202, headers: CORS });
});
