import { authTables } from "@convex-dev/auth/server";
import { defineSchema } from "convex/server";

// Only the auth tables for now; SPEC.md's data model arrives with each section.
export default defineSchema({
  ...authTables,
});
