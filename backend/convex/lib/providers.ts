/**
 * The one place providers and their models are named. "fast" and "smart" are
 * kunji's aliases, so apps never change when a model is retired: update the
 * ids here and redeploy.
 */
export const BUILTIN_PROVIDERS = ["anthropic", "openai", "gemini", "groq"] as const;
export type BuiltinProvider = (typeof BUILTIN_PROVIDERS)[number];

export type Dialect = "openai" | "anthropic";

export type ProviderConfig = {
  /** "anthropic", "openai", "gemini", "groq" or "custom:<slug>". */
  id: string;
  label: string;
  dialect: Dialect;
  baseUrl: string;
  models: { fast: string; smart: string };
  /** OpenAI's newer models take max_completion_tokens; most compatible APIs take max_tokens. */
  tokensParam: "max_tokens" | "max_completion_tokens";
  /** "schema": response_format json_schema; "object": json_object with the schema in the prompt. */
  jsonMode: "schema" | "object";
};

export const BUILTIN: Record<BuiltinProvider, ProviderConfig> = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    dialect: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    models: { fast: "claude-haiku-5-5", smart: "claude-sonnet-5-5" },
    tokensParam: "max_tokens",
    jsonMode: "schema",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    dialect: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: { fast: "gpt-5-mini", smart: "gpt-5" },
    tokensParam: "max_completion_tokens",
    jsonMode: "schema",
  },
  // Gemini's OpenAI-compatible endpoint. Flash-Lite answers in ~2s (karya's experience).
  gemini: {
    id: "gemini",
    label: "Gemini",
    dialect: "openai",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    models: { fast: "gemini-3.1-flash-lite", smart: "gemini-3-flash-preview" },
    tokensParam: "max_tokens",
    jsonMode: "schema",
  },
  groq: {
    id: "groq",
    label: "Groq",
    dialect: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    models: { fast: "openai/gpt-oss-20b", smart: "openai/gpt-oss-120b" },
    tokensParam: "max_tokens",
    jsonMode: "object",
  },
};

export function isBuiltin(id: string): id is BuiltinProvider {
  return (BUILTIN_PROVIDERS as readonly string[]).includes(id);
}

export function customId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) throw new Error("Give the provider a name.");
  return `custom:${slug}`;
}

/** A Custom provider: any OpenAI-compatible API, with one model for both aliases. */
export function customConfig(id: string, name: string, baseUrl: string, model: string): ProviderConfig {
  return {
    id,
    label: name,
    dialect: "openai",
    baseUrl,
    models: { fast: model, smart: model },
    tokensParam: "max_tokens",
    jsonMode: "object",
  };
}

/** Normalizes a Custom base URL: http(s), no trailing slash. */
export function cleanBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Enter the API's base URL, e.g. https://openrouter.ai/api/v1.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("The base URL must start with https://.");
  return url.toString().replace(/\/+$/, "");
}

/** "fast" / "smart" map to the provider's model; anything else is an exact id. */
export function resolveModel(config: ProviderConfig, model: string | undefined): string {
  if (model === undefined || model === "fast") return config.models.fast;
  if (model === "smart") return config.models.smart;
  return model;
}
