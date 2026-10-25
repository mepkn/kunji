import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { requireActionAdmin } from "./lib/actionAuth";
import { requireAdmin } from "./lib/access";
import { encryptSecret, newAppSecret, sha256Hex } from "./lib/secrets";

/** The registry for the admin page: never the secret. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const apps = await ctx.db.query("apps").collect();
    return apps.map(({ _id, slug, name, siteUrl, backendUrl, enabled }) => ({ _id, slug, name, siteUrl, backendUrl, enabled }));
  },
});

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
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(slug)) throw new ConvexError("The slug is lowercase letters, digits and dashes.");
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
