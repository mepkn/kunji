/** The built-in providers as the keys page shows them; Custom ones come from the saved rows. */
export const PROVIDERS = [
  { id: "anthropic", label: "Anthropic", prefix: "sk-ant-", url: "https://console.anthropic.com/settings/keys" },
  { id: "openai", label: "OpenAI", prefix: "sk-", url: "https://platform.openai.com/api-keys" },
  { id: "gemini", label: "Gemini", prefix: "AIza", url: "https://aistudio.google.com/apikey" },
  { id: "groq", label: "Groq", prefix: "gsk_", url: "https://console.groq.com/keys" },
] as const;

/** "sk-ant-…F3x9": the provider's usual prefix and the last 4 characters, never more. */
export function maskKey(provider: string, last4: string): string {
  const prefix = PROVIDERS.find((p) => p.id === provider)?.prefix ?? "";
  return `${prefix}…${last4}`;
}

/** Moves item i one step up (-1) or down (+1); out-of-range moves leave the list as is. */
export function move<T>(list: T[], i: number, step: -1 | 1): T[] {
  const j = i + step;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
