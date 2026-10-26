import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, mutation, query, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireActionUser } from "./lib/actionAuth";
import { requireUserId } from "./lib/access";
import { checkAccess, type AppTool } from "./lib/appClient";
import { decryptSecret } from "./lib/secrets";

export type Status = "ok" | "no_account" | "not_allowed" | "error";

export type Reach = {
  appId: Id<"apps">;
  slug: string;
  name: string;
  siteUrl: string;
  on: boolean;
  status: Status | null;
  checkedAt: number | null;
  tools: AppTool[];
}[];

/** Every enabled app with this person's switch, cached status and the app's cached tools. */
async function reachOf(ctx: QueryCtx, userId: Id<"users">): Promise<Reach> {
  const apps = (await ctx.db.query("apps").collect()).filter((a) => a.enabled);
  return await Promise.all(
    apps.map(async (app) => {
      const row = await ctx.db
        .query("userApps")
        .withIndex("by_user_app", (q) => q.eq("userId", userId).eq("appId", app._id))
        .unique();
      const cached = await ctx.db
        .query("appTools")
        .withIndex("by_app", (q) => q.eq("appId", app._id))
        .unique();
      return {
        appId: app._id,
        slug: app.slug,
        name: app.name,
        siteUrl: app.siteUrl,
        on: row?.enabled ?? true,
        status: row?.status ?? null,
        checkedAt: row?.checkedAt ?? null,
        tools: (cached?.tools ?? []) as AppTool[],
      };
    }),
  );
}

export const reach = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => await reachOf(ctx, userId),
});

/** The Browse page: every enabled app with my status and tool count. */
export const browse = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return (await reachOf(ctx, userId)).map(({ tools, ...app }) => ({ ...app, toolCount: tools.length }));
  },
});

async function upsert(ctx: MutationCtx, userId: Id<"users">, appId: Id<"apps">, fields: { enabled?: boolean; status?: Status; checkedAt?: number }) {
  const row = await ctx.db
    .query("userApps")
    .withIndex("by_user_app", (q) => q.eq("userId", userId).eq("appId", appId))
    .unique();
  if (row === null) await ctx.db.insert("userApps", { userId, appId, enabled: fields.enabled ?? true, ...fields });
  else await ctx.db.patch(row._id, fields);
}

/** My on/off switch for one app: off hides its tools from /mcp and refuses its gateway calls for me. */
export const setOn = mutation({
  args: { appId: v.id("apps"), on: v.boolean() },
  handler: async (ctx, { appId, on }) => {
    const userId = await requireUserId(ctx);
    await upsert(ctx, userId, appId, { enabled: on });
  },
});

export const storeStatus = internalMutation({
  args: {
    userId: v.id("users"),
    appId: v.id("apps"),
    status: v.union(v.literal("ok"), v.literal("no_account"), v.literal("not_allowed"), v.literal("error")),
  },
  handler: async (ctx, { userId, appId, status }) => {
    await upsert(ctx, userId, appId, { status, checkedAt: Date.now() });
  },
});

/** Asks each app's /kunji/access about this person and caches the answers. An unreachable app is "error". */
export async function recheck(ctx: ActionCtx, userId: Id<"users">, email: string, apps: { appId: Id<"apps"> }[]): Promise<Map<Id<"apps">, Status>> {
  const statuses = new Map<Id<"apps">, Status>();
  await Promise.all(
    apps.map(async ({ appId }) => {
      const target = await ctx.runQuery(internal.apps.target, { appId });
      if (target === null || !target.enabled) return;
      let status: Status;
      try {
        status = await checkAccess({ backendUrl: target.backendUrl, secret: await decryptSecret(target.encryptedSecret) }, email);
      } catch (err) {
        console.error(`access check for ${target.slug} failed`, err instanceof Error ? err.message : err);
        status = "error";
      }
      statuses.set(appId, status);
      await ctx.runMutation(internal.myApps.storeStatus, { userId, appId, status });
    }),
  );
  return statuses;
}

/** Rechecks my status in every enabled app (on page open and Refresh). */
export const check = action({
  args: {},
  handler: async (ctx): Promise<void> => {
    const { userId } = await requireActionUser(ctx);
    const email = await ctx.runQuery(internal.users.emailOf, { userId });
    await recheck(ctx, userId, email, await ctx.runQuery(internal.myApps.reach, { userId }));
  },
});

/** Whether this person has switched the app off (the gateway's per-user check). */
export const isOff = internalQuery({
  args: { userId: v.id("users"), appId: v.id("apps") },
  handler: async (ctx, { userId, appId }) => {
    const row = await ctx.db
      .query("userApps")
      .withIndex("by_user_app", (q) => q.eq("userId", userId).eq("appId", appId))
      .unique();
    return row?.enabled === false;
  },
});
