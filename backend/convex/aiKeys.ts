import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { requireActionUser } from "./lib/actionAuth";
import { requireUserId } from "./lib/access";
import { callProvider, GatewayError } from "./lib/gateway";
import { BUILTIN, cleanBaseUrl, customConfig, customId, isBuiltin, type ProviderConfig } from "./lib/providers";
import { decryptSecret, encryptSecret } from "./lib/secrets";

type TestResult = { ok: true } | { ok: false; error: string };

export function configFor(row: Pick<Doc<"aiKeys">, "provider" | "name" | "baseUrl" | "model">): ProviderConfig {
  if (isBuiltin(row.provider)) return BUILTIN[row.provider];
  return customConfig(row.provider, row.name ?? row.provider, row.baseUrl ?? "", row.model ?? "");
}

/** The smallest real call: proves the key works with the provider's fast model. */
async function test(config: ProviderConfig, apiKey: string): Promise<TestResult> {
  try {
    await callProvider(config, apiKey, { userEmail: "", provider: config.id, messages: [{ role: "user", content: "Reply with OK." }], maxTokens: 16 });
    return { ok: true };
  } catch (err) {
    // The message only; the key itself is never logged.
    console.error(`${config.id} test call failed`, err instanceof Error ? err.message.slice(0, 500) : err);
    return { ok: false, error: err instanceof GatewayError ? err.message : `Could not reach ${config.label}.` };
  }
}

function cleanKey(label: string, key: string): string {
  const k = key.trim();
  if (k.length < 8 || /\s/.test(k)) throw new ConvexError(`That doesn't look like a ${label} API key.`);
  return k;
}

async function keysOf(ctx: QueryCtx, userId: Id<"users">) {
  return await ctx.db
    .query("aiKeys")
    .withIndex("by_user_provider", (q) => q.eq("userId", userId))
    .collect();
}

async function prefsOf(ctx: QueryCtx, userId: Id<"users">) {
  return await ctx.db
    .query("aiPrefs")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

/** Try order: preferred, then fallback, then any other saved key by age. */
function ordered(keys: Doc<"aiKeys">[], prefs: Doc<"aiPrefs"> | null): string[] {
  const order = prefs ? [...(prefs.preferred ? [prefs.preferred] : []), ...prefs.fallback] : [];
  const saved = keys.map((k) => k.provider);
  return [...order.filter((id) => saved.includes(id)), ...saved.filter((id) => !order.includes(id))];
}

/** The saved keys as the page shows them: never the key, only its last 4 characters. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const keys = await keysOf(ctx, userId);
    const order = ordered(keys, await prefsOf(ctx, userId));
    return order.map((provider) => {
      const k = keys.find((x) => x.provider === provider)!;
      return { provider, label: configFor(k).label, name: k.name, baseUrl: k.baseUrl, model: k.model, last4: k.last4, createdAt: k.createdAt };
    });
  },
});

const keyArgs = {
  provider: v.string(), // a builtin id or "custom"
  key: v.string(),
  name: v.optional(v.string()),
  baseUrl: v.optional(v.string()),
  model: v.optional(v.string()),
};

function pastedConfig(a: { provider: string; name?: string; baseUrl?: string; model?: string }): ProviderConfig & { name?: string; baseUrl?: string; model?: string } {
  if (isBuiltin(a.provider)) return BUILTIN[a.provider];
  if (a.provider !== "custom") throw new ConvexError("Unknown provider.");
  const name = (a.name ?? "").trim();
  const model = (a.model ?? "").trim();
  if (!name) throw new ConvexError("Give the provider a name.");
  if (!model) throw new ConvexError("Enter the model id to use, e.g. mistralai/mistral-small.");
  let baseUrl: string;
  try {
    baseUrl = cleanBaseUrl(a.baseUrl ?? "");
  } catch (err) {
    throw new ConvexError((err as Error).message);
  }
  return { ...customConfig(customId(name), name, baseUrl, model), name, baseUrl, model };
}

/** Tests a pasted key without saving it. */
export const testNew = action({
  args: keyArgs,
  handler: async (ctx, a): Promise<TestResult> => {
    await requireActionUser(ctx);
    const config = pastedConfig(a);
    return await test(config, cleanKey(config.label, a.key));
  },
});

/** Tests the saved key of one provider. */
export const testSaved = action({
  args: { provider: v.string() },
  handler: async (ctx, { provider }): Promise<TestResult> => {
    const { userId } = await requireActionUser(ctx);
    const row = await ctx.runQuery(internal.aiKeys.encrypted, { userId, provider });
    if (row === null) return { ok: false, error: "No key saved." };
    return await test(configFor(row), await decryptSecret(row.encryptedKey));
  },
});

/** Saves the key encrypted, only after a successful test call. Replaces a key for the same provider. */
export const save = action({
  args: keyArgs,
  handler: async (ctx, a): Promise<TestResult> => {
    const { userId } = await requireActionUser(ctx);
    const config = pastedConfig(a);
    const apiKey = cleanKey(config.label, a.key);
    const result = await test(config, apiKey);
    if (!result.ok) return result;
    await ctx.runMutation(internal.aiKeys.store, {
      userId,
      provider: config.id,
      name: config.name,
      baseUrl: config.baseUrl,
      model: config.model,
      encryptedKey: await encryptSecret(apiKey),
      last4: apiKey.slice(-4),
    });
    return result;
  },
});

export const store = internalMutation({
  args: {
    userId: v.id("users"),
    provider: v.string(),
    name: v.optional(v.string()),
    baseUrl: v.optional(v.string()),
    model: v.optional(v.string()),
    encryptedKey: v.string(),
    last4: v.string(),
  },
  handler: async (ctx, a) => {
    const existing = await ctx.db
      .query("aiKeys")
      .withIndex("by_user_provider", (q) => q.eq("userId", a.userId).eq("provider", a.provider))
      .unique();
    if (existing) await ctx.db.patch(existing._id, { ...a, createdAt: Date.now() });
    else await ctx.db.insert("aiKeys", { ...a, createdAt: Date.now() });
  },
});

export const remove = mutation({
  args: { provider: v.string() },
  handler: async (ctx, { provider }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db
      .query("aiKeys")
      .withIndex("by_user_provider", (q) => q.eq("userId", userId).eq("provider", provider))
      .unique();
    if (row) await ctx.db.delete(row._id);
  },
});

/** Sets the try order: the first is preferred, the rest are the fallback. */
export const setOrder = mutation({
  args: { order: v.array(v.string()) },
  handler: async (ctx, { order }) => {
    const userId = await requireUserId(ctx);
    const [preferred, ...fallback] = order;
    const prefs = await prefsOf(ctx, userId);
    if (prefs) await ctx.db.patch(prefs._id, { preferred, fallback });
    else await ctx.db.insert("aiPrefs", { userId, preferred, fallback });
  },
});

export const encrypted = internalQuery({
  args: { userId: v.id("users"), provider: v.string() },
  handler: async (ctx, { userId, provider }) =>
    await ctx.db
      .query("aiKeys")
      .withIndex("by_user_provider", (q) => q.eq("userId", userId).eq("provider", provider))
      .unique(),
});

/** Every saved key of a user in try order, encrypted, for the gateway. */
export const encryptedInOrder = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const keys = await keysOf(ctx, userId);
    const order = ordered(keys, await prefsOf(ctx, userId));
    return order.map((p) => keys.find((k) => k.provider === p)!);
  },
});
