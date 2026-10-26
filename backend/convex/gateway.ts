import { v } from "convex/values";
import { internal } from "./_generated/api";
import { httpAction, internalMutation, internalQuery } from "./_generated/server";
import { configFor } from "./aiKeys";
import { isAllowedEmail } from "./lib/allowlist";
import { callWithRetry, GatewayError, parseRequest, tryOrder } from "./lib/gateway";
import { decryptSecret, sha256Hex } from "./lib/secrets";

const RATE_LIMIT_PER_MINUTE = 20;

/**
 * The kunji user with this verified email, if they may still use kunji. An
 * unverified sign-up leaves its own users row with the same email, so only a
 * single verified row counts (the rule Convex Auth uses to link accounts).
 */
export const userByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    if (!isAllowedEmail(email)) return null;
    const users = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .filter((q) => q.neq(q.field("emailVerificationTime"), undefined))
      .take(2);
    return users.length === 1 ? users[0]._id : null;
  },
});

/** Records a call, or refuses it when this user made too many from this app in the last minute. */
export const reserveCall = internalMutation({
  args: { userId: v.id("users"), appId: v.id("apps") },
  handler: async (ctx, { userId, appId }) => {
    const now = Date.now();
    const recent = await ctx.db
      .query("aiCalls")
      .withIndex("by_user_app_at", (q) => q.eq("userId", userId).eq("appId", appId).gt("at", now - 60_000))
      .take(RATE_LIMIT_PER_MINUTE);
    if (recent.length >= RATE_LIMIT_PER_MINUTE) return null;
    return await ctx.db.insert("aiCalls", { userId, appId, inputTokens: 0, outputTokens: 0, at: now });
  },
});

export const finishCall = internalMutation({
  args: {
    callId: v.id("aiCalls"),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    inputTokens: v.number(),
    outputTokens: v.number(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { callId, ...fields }) => {
    await ctx.db.patch(callId, fields);
  },
});

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * POST /ai/v1/generate (SPEC.md → Gateway). App secret → app, email → user,
 * then the user's keys in try order until one answers. A failure moves to the
 * next key; when all fail, the first failure's code is returned.
 */
export const generate = httpAction(async (ctx, req) => {
  try {
    const secret = /^Bearer\s+(\S+)$/.exec(req.headers.get("Authorization") ?? "")?.[1];
    const app = secret ? await ctx.runQuery(internal.apps.bySecretHash, { secretHash: await sha256Hex(secret) }) : null;
    if (app === null) throw new GatewayError("unauthorized", "Unknown or disabled app secret.");

    const body = parseRequest(await req.json().catch(() => null));
    const noKey = new GatewayError("no_key", "Add your AI key at kunji.pknspace.com");
    const userId = await ctx.runQuery(internal.gateway.userByEmail, { email: body.userEmail });
    if (userId === null) throw noKey;
    if (await ctx.runQuery(internal.myApps.isOff, { userId, appId: app._id })) {
      throw new GatewayError("app_off", "You switched this app off in kunji. Turn it on at kunji.pknspace.com/apps.");
    }

    const keys = await ctx.runQuery(internal.aiKeys.encryptedInOrder, { userId });
    const order = tryOrder(
      keys.map((k) => k.provider),
      body.provider,
    );
    if (order.length === 0) throw noKey;

    const callId = await ctx.runMutation(internal.gateway.reserveCall, { userId, appId: app._id });
    if (callId === null) throw new GatewayError("rate_limited", `kunji allows ${RATE_LIMIT_PER_MINUTE} AI calls a minute per app. Try again shortly.`);

    const failures: GatewayError[] = [];
    for (const id of order) {
      const row = keys.find((k) => k.provider === id)!;
      try {
        const res = await callWithRetry(configFor(row), await decryptSecret(row.encryptedKey), body);
        await ctx.runMutation(internal.gateway.finishCall, { callId, provider: res.provider, model: res.model, ...res.usage });
        return reply(200, res);
      } catch (err) {
        if (!(err instanceof GatewayError)) throw err;
        console.error(`${id} call failed`, err.code, err.message.slice(0, 500));
        failures.push(err);
      }
    }
    const first = failures[0];
    await ctx.runMutation(internal.gateway.finishCall, { callId, inputTokens: 0, outputTokens: 0, error: first.code });
    throw new GatewayError(first.code, failures.map((f) => f.message).join(" "));
  } catch (err) {
    if (err instanceof GatewayError) return reply(err.status, err.toBody());
    console.error("gateway error", err instanceof Error ? err.message : err);
    return reply(500, { error: { code: "provider_error", message: "kunji hit an internal error." } });
  }
});
