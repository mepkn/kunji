import { ConvexError } from "convex/values";

/** The user-facing message of a Convex call failure; server crashes get a generic one. */
export function errorMessage(err: unknown, fallback = "Something went wrong. Try again."): string {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  return fallback;
}
