import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { requireActionUser } from "./lib/actionAuth";
import { requireUserId } from "./lib/access";
import { newMcpToken, sha256Hex } from "./lib/secrets";

/** A new MCP token, returned once. kunji keeps only its hash and last 4 characters. */
export const create = action({
  args: { name: v.string() },
  handler: async (ctx, { name }): Promise<{ token: string }> => {
    const { userId } = await requireActionUser(ctx);
    if (!name.trim()) throw new ConvexError("Give the token a name.");
    const token = newMcpToken();
    await ctx.runMutation(internal.tokens.insert, { userId, name: name.trim().slice(0, 60), tokenHash: await sha256Hex(token), last4: token.slice(-4) });
    return { token };
  },
});

export const insert = internalMutation({
  args: { userId: v.id("users"), name: v.string(), tokenHash: v.string(), last4: v.string() },
  handler: async (ctx, a) => {
    await ctx.db.insert("mcpTokens", { ...a, createdAt: Date.now() });
  },
});

/** My tokens: name, last 4, created and last used. Never the hash. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("mcpTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows.map(({ _id, name, last4, createdAt, lastUsedAt }) => ({ _id, name, last4, createdAt, lastUsedAt: lastUsedAt ?? null }));
  },
});

/** Revoking deletes the token: it stops working on the next request. */
export const revoke = mutation({
  args: { tokenId: v.id("mcpTokens") },
  handler: async (ctx, { tokenId }) => {
    const userId = await requireUserId(ctx);
    const token = await ctx.db.get(tokenId);
    if (token === null || token.userId !== userId) throw new ConvexError("Token not found.");
    await ctx.db.delete(tokenId);
  },
});
