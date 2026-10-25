import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { isAdminEmail, isAllowedEmail } from "./allowlist";

/** The signed-in, still-allowlisted user, or null. */
export async function currentUser(ctx: QueryCtx): Promise<Doc<"users"> | null> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  // Re-checked on every call, so removing an email cuts off existing sessions.
  const user = await ctx.db.get(userId);
  return user && isAllowedEmail(user.email) ? user : null;
}

export async function requireUserId(ctx: QueryCtx): Promise<Id<"users">> {
  const user = await currentUser(ctx);
  if (user === null) throw new ConvexError("Not signed in.");
  return user._id;
}

export async function requireAdmin(ctx: QueryCtx): Promise<Id<"users">> {
  const user = await currentUser(ctx);
  if (user === null) throw new ConvexError("Not signed in.");
  if (!isAdminEmail(user.email)) throw new ConvexError("Admins only.");
  return user._id;
}
