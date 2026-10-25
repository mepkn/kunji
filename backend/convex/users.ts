import { v } from "convex/values";
import { internalQuery, query } from "./_generated/server";
import { currentUser } from "./lib/access";
import { isAdminEmail } from "./lib/allowlist";

/** The signed-in person, or null when signed out or no longer allowlisted. */
export const me = query({
  args: {},
  returns: v.union(v.null(), v.object({ email: v.string(), isAdmin: v.boolean() })),
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (user === null || !user.email) return null;
    return { email: user.email, isAdmin: isAdminEmail(user.email) };
  },
});

/** The caller as actions see it (the auth identity carries over to runQuery). */
export const current = internalQuery({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    return user === null ? null : { userId: user._id, isAdmin: isAdminEmail(user.email) };
  },
});
