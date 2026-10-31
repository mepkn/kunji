import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery, mutation, query, type ActionCtx } from "./_generated/server";
import { requireActionAdmin } from "./lib/actionAuth";
import { requireAdmin } from "./lib/access";
import { AppError, callTool, checkAccess, listTools, type AppTarget } from "./lib/appClient";
import { decryptSecret, encryptSecret, newAppSecret, sha256Hex } from "./lib/secrets";

/** The registry for the admin page: never the secret. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const apps = await ctx.db.query("apps").collect();
    return await Promise.all(
      apps.map(async ({ _id, slug, name, siteUrl, backendUrl, enabled }) => {
        const cached = await ctx.db
          .query("appTools")
          .withIndex("by_app", (q) => q.eq("appId", _id))
          .unique();
        return { _id, slug, name, siteUrl, backendUrl, enabled, toolCount: cached?.tools.length ?? null };
      }),
    );
  },
});

/** One app for its admin page, with its cached tools. */
export const get = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    await requireAdmin(ctx);
    const app = await ctx.db
      .query("apps")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (app === null) return null;
    const cached = await ctx.db
      .query("appTools")
      .withIndex("by_app", (q) => q.eq("appId", app._id))
      .unique();
    const { _id, name, siteUrl, backendUrl, enabled } = app;
    return {
      app: { _id, slug, name, siteUrl, backendUrl, enabled },
      tools: cached?.tools ?? null,
      fetchedAt: cached?.fetchedAt ?? null,
      fetchError: cached?.error ?? null,
    };
  },
});

const SLUG = /^[a-z][a-z0-9-]{0,31}$/;

function url(label: string, raw: string): string {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
    return u.toString().replace(/\/+$/, "");
  } catch {
    throw new ConvexError(`${label} must be a full URL.`);
  }
}

/** Registers an app and returns its secret. The only time the secret is ever shown. */
export const create = action({
  args: { name: v.string(), slug: v.string(), siteUrl: v.string(), backendUrl: v.string() },
  handler: async (ctx, a): Promise<{ secret: string }> => {
    await requireActionAdmin(ctx);
    const name = a.name.trim();
    const slug = a.slug.trim().toLowerCase();
    if (!name) throw new ConvexError("Enter the app's name.");
    if (!SLUG.test(slug)) throw new ConvexError("The slug is lowercase letters, digits and dashes.");
    const secret = newAppSecret();
    await ctx.runMutation(internal.apps.insert, {
      name,
      slug,
      siteUrl: url("Site URL", a.siteUrl),
      backendUrl: url("Backend URL", a.backendUrl),
      encryptedSecret: await encryptSecret(secret),
      secretHash: await sha256Hex(secret),
    });
    return { secret };
  },
});

export const insert = internalMutation({
  args: { name: v.string(), slug: v.string(), siteUrl: v.string(), backendUrl: v.string(), encryptedSecret: v.string(), secretHash: v.string() },
  handler: async (ctx, a) => {
    const taken = await ctx.db
      .query("apps")
      .withIndex("by_slug", (q) => q.eq("slug", a.slug))
      .unique();
    if (taken) throw new ConvexError(`An app with slug "${a.slug}" already exists.`);
    await ctx.db.insert("apps", { ...a, enabled: true });
  },
});

/** The enabled app a secret belongs to, or null. */
export const bySecretHash = internalQuery({
  args: { secretHash: v.string() },
  handler: async (ctx, { secretHash }) => {
    const app = await ctx.db
      .query("apps")
      .withIndex("by_secretHash", (q) => q.eq("secretHash", secretHash))
      .unique();
    return app?.enabled ? { _id: app._id, slug: app.slug } : null;
  },
});

/** Edits name, slug and URLs. The slug prefixes the app's tools, so renaming it renames them. */
export const update = mutation({
  args: { appId: v.id("apps"), name: v.string(), slug: v.string(), siteUrl: v.string(), backendUrl: v.string() },
  handler: async (ctx, a) => {
    await requireAdmin(ctx);
    const name = a.name.trim();
    const slug = a.slug.trim().toLowerCase();
    if (!name) throw new ConvexError("Enter the app's name.");
    if (!SLUG.test(slug)) throw new ConvexError("The slug is lowercase letters, digits and dashes.");
    const taken = await ctx.db
      .query("apps")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (taken && taken._id !== a.appId) throw new ConvexError(`An app with slug "${slug}" already exists.`);
    await ctx.db.patch(a.appId, { name, slug, siteUrl: url("Site URL", a.siteUrl), backendUrl: url("Backend URL", a.backendUrl) });
    return slug;
  },
});

/** A disabled app's secret stops working at once, both ways. */
export const setEnabled = mutation({
  args: { appId: v.id("apps"), enabled: v.boolean() },
  handler: async (ctx, { appId, enabled }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(appId, { enabled });
  },
});

/** A new secret, shown once; the old one stops working immediately. */
export const rotateSecret = action({
  args: { appId: v.id("apps") },
  handler: async (ctx, { appId }): Promise<{ secret: string }> => {
    await requireActionAdmin(ctx);
    const secret = newAppSecret();
    await ctx.runMutation(internal.apps.setSecret, { appId, encryptedSecret: await encryptSecret(secret), secretHash: await sha256Hex(secret) });
    return { secret };
  },
});

export const setSecret = internalMutation({
  args: { appId: v.id("apps"), encryptedSecret: v.string(), secretHash: v.string() },
  handler: async (ctx, { appId, ...fields }) => {
    await ctx.db.patch(appId, fields);
  },
});

/** What kunji needs to call an app: its URL and (still encrypted) secret. */
export const target = internalQuery({
  args: { appId: v.id("apps") },
  handler: async (ctx, { appId }) => {
    const app = await ctx.db.get(appId);
    return app === null ? null : { slug: app.slug, backendUrl: app.backendUrl, encryptedSecret: app.encryptedSecret, enabled: app.enabled };
  },
});

async function appTarget(ctx: ActionCtx, appId: Id<"apps">): Promise<AppTarget> {
  const app = await ctx.runQuery(internal.apps.target, { appId });
  if (app === null) throw new ConvexError("App not found.");
  if (!app.enabled) throw new ConvexError("The app is disabled.");
  return { backendUrl: app.backendUrl, secret: await decryptSecret(app.encryptedSecret) };
}

function appMessage(err: unknown): string {
  if (err instanceof AppError) return err.message;
  console.error("App call failed", err instanceof Error ? err.message : err);
  return "Calling the app failed.";
}

/** Fetches GET /kunji/tools into appTools. A failure keeps the old list and records the error. */
async function fetchTools(ctx: ActionCtx, appId: Id<"apps">): Promise<number> {
  const app = await appTarget(ctx, appId);
  try {
    const tools = await listTools(app);
    await ctx.runMutation(internal.apps.storeTools, { appId, tools });
    return tools.length;
  } catch (err) {
    const message = appMessage(err);
    await ctx.runMutation(internal.apps.storeTools, { appId, error: message });
    throw new ConvexError(message);
  }
}

/** Admin Refresh on an app's page. */
export const refreshTools = action({
  args: { appId: v.id("apps") },
  handler: async (ctx, { appId }): Promise<{ count: number }> => {
    await requireActionAdmin(ctx);
    return { count: await fetchTools(ctx, appId) };
  },
});

export const enabledIds = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("apps").collect()).filter((a) => a.enabled).map((a) => a._id),
});

/** The cron: refreshes every enabled app's tools. One app failing doesn't stop the others. */
export const refreshAllTools = internalAction({
  args: {},
  handler: async (ctx) => {
    const ids = await ctx.runQuery(internal.apps.enabledIds, {});
    await Promise.allSettled(ids.map((appId) => fetchTools(ctx, appId)));
  },
});

export const storeTools = internalMutation({
  args: {
    appId: v.id("apps"),
    tools: v.optional(v.array(v.object({ name: v.string(), description: v.string(), inputSchema: v.any() }))),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { appId, tools, error }) => {
    const row = await ctx.db
      .query("appTools")
      .withIndex("by_app", (q) => q.eq("appId", appId))
      .unique();
    const fetchedAt = Date.now();
    if (row === null) await ctx.db.insert("appTools", { appId, tools: tools ?? [], fetchedAt, error });
    else await ctx.db.patch(row._id, tools ? { tools, fetchedAt, error: undefined } : { error });
  },
});

export const logCall = internalMutation({
  args: { userId: v.id("users"), appId: v.id("apps"), tool: v.string(), ok: v.boolean(), error: v.optional(v.string()) },
  handler: async (ctx, a) => {
    await ctx.db.insert("toolCalls", { ...a, at: Date.now() });
  },
});

/**
 * Admin "Try a tool": runs one of the app's tools as the admin (by their kunji
 * email), the way /mcp will in step 4. Logged like any tool call.
 */
export const tryTool = action({
  args: { appId: v.id("apps"), tool: v.string(), input: v.string() },
  handler: async (ctx, { appId, tool, input }): Promise<{ access: string; ok: boolean; result?: unknown; error?: { code: string; message: string } }> => {
    const userId = await requireActionAdmin(ctx);
    const email = await ctx.runQuery(internal.users.emailOf, { userId });
    let parsed: unknown;
    try {
      parsed = input.trim() ? JSON.parse(input) : {};
    } catch {
      throw new ConvexError("The input is not valid JSON.");
    }
    const app = await appTarget(ctx, appId);
    try {
      const access = await checkAccess(app, email);
      const reply = await callTool(app, email, tool, parsed);
      await ctx.runMutation(internal.apps.logCall, { userId, appId, tool, ok: reply.ok, error: reply.ok ? undefined : reply.error.code });
      return { access, ...reply };
    } catch (err) {
      const message = appMessage(err);
      await ctx.runMutation(internal.apps.logCall, { userId, appId, tool, ok: false, error: err instanceof AppError ? err.code : "error" });
      throw new ConvexError(message);
    }
  },
});
