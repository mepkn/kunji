import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// SPEC.md → Data model. Secrets (encrypted*) are AES-GCM ciphertexts; no query returns them.
export default defineSchema({
  ...authTables,

  // One row per saved key. provider is "anthropic" | "openai" | "gemini" | "groq"
  // or "custom:<slug>"; Custom rows also carry name, baseUrl and model.
  aiKeys: defineTable({
    userId: v.id("users"),
    provider: v.string(),
    name: v.optional(v.string()),
    baseUrl: v.optional(v.string()),
    model: v.optional(v.string()),
    encryptedKey: v.string(),
    last4: v.string(),
    createdAt: v.number(),
  }).index("by_user_provider", ["userId", "provider"]),

  // The order keys are tried in: preferred first, then the fallbacks.
  aiPrefs: defineTable({
    userId: v.id("users"),
    preferred: v.optional(v.string()),
    fallback: v.array(v.string()),
  }).index("by_user", ["userId"]),

  // One row per gateway call: the rate limit and the Usage page.
  aiCalls: defineTable({
    userId: v.id("users"),
    appId: v.id("apps"),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    inputTokens: v.number(),
    outputTokens: v.number(),
    error: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_user_at", ["userId", "at"])
    .index("by_user_app_at", ["userId", "appId", "at"]),

  // Registered apps. The secret is shown once; kunji keeps its hash (to check
  // calls from the app) and a ciphertext (for kunji's calls to the app, step 3).
  apps: defineTable({
    slug: v.string(),
    name: v.string(),
    icon: v.optional(v.string()),
    siteUrl: v.string(),
    backendUrl: v.string(),
    encryptedSecret: v.string(),
    secretHash: v.string(),
    enabled: v.boolean(),
  })
    .index("by_slug", ["slug"])
    .index("by_secretHash", ["secretHash"]),
});
