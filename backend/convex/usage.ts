import { query } from "./_generated/server";
import { requireUserId } from "./lib/access";

const DAYS = 30;

/** Calls and tokens per app per day (UTC) over the last 30 days, newest first. */
export const byDay = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const calls = await ctx.db
      .query("aiCalls")
      .withIndex("by_user_at", (q) => q.eq("userId", userId).gt("at", Date.now() - DAYS * 86_400_000))
      .order("desc")
      .collect();
    const names = new Map<string, string>();
    const rows = new Map<string, { day: string; app: string; calls: number; errors: number; inputTokens: number; outputTokens: number }>();
    for (const c of calls) {
      if (!names.has(c.appId)) names.set(c.appId, (await ctx.db.get(c.appId))?.name ?? "Removed app");
      const day = new Date(c.at).toISOString().slice(0, 10);
      const key = `${day}|${c.appId}`;
      const row = rows.get(key) ?? { day, app: names.get(c.appId)!, calls: 0, errors: 0, inputTokens: 0, outputTokens: 0 };
      row.calls++;
      if (c.error) row.errors++;
      row.inputTokens += c.inputTokens;
      row.outputTokens += c.outputTokens;
      rows.set(key, row);
    }
    return [...rows.values()];
  },
});
