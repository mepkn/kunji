import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";

/** requireUserId for actions, which have no ctx.db: the allowlist check runs in a query. */
export async function requireActionUser(ctx: ActionCtx): Promise<{ userId: Id<"users">; isAdmin: boolean }> {
  const user = await ctx.runQuery(internal.users.current, {});
  if (user === null) throw new ConvexError("Not signed in.");
  return user;
}

export async function requireActionAdmin(ctx: ActionCtx): Promise<Id<"users">> {
  const { userId, isAdmin } = await requireActionUser(ctx);
  if (!isAdmin) throw new ConvexError("Admins only.");
  return userId;
}
