import { query } from "./_generated/server";
import { requireUserId } from "./lib/access";

/** My last 100 tool calls, newest first, for the Activity page. */
export const recent = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const calls = await ctx.db
      .query("toolCalls")
      .withIndex("by_user_at", (q) => q.eq("userId", userId))
      .order("desc")
      .take(100);
    const names = new Map<string, string>();
    for (const c of calls) if (!names.has(c.appId)) names.set(c.appId, (await ctx.db.get(c.appId))?.name ?? "Removed app");
    return calls.map(({ _id, appId, tool, ok, error, source, at }) => ({ _id, app: names.get(appId)!, tool, ok, error: error ?? null, source: source ?? null, at }));
  },
});
