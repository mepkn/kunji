/**
 * kunji's common request/response shape (SPEC.md → Gateway) and the two
 * adapters behind it: OpenAI-compatible Chat Completions and Anthropic's native
 * Messages API. Plain fetch, no SDKs, so every provider goes through the same
 * small code path. No Convex imports: tests run this directly.
 */
import { resolveModel, type ProviderConfig } from "./providers";

export type Message = { role: "user" | "assistant"; content: string };
export type Tool = { name: string; description?: string; inputSchema: object };
export type ToolCall = { id: string; name: string; input: unknown };

export type GenerateRequest = {
  userEmail: string;
  provider: string; // "auto" or a provider id
  model?: string; // "fast" | "smart" | exact id
  system?: string;
  messages: Message[];
  tools?: Tool[];
  json?: object; // JSON Schema of the reply
  maxTokens?: number;
  temperature?: number;
};

export type GenerateResponse = {
  text: string;
  json?: unknown;
  toolCalls?: ToolCall[];
  provider: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
};

export type ErrorCode = "unauthorized" | "bad_request" | "no_key" | "key_refused" | "rate_limited" | "provider_error";

const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  bad_request: 400,
  no_key: 403,
  key_refused: 403,
  rate_limited: 429,
  provider_error: 502,
};

export class GatewayError extends Error {
  readonly code: ErrorCode;
  /** Overloaded or no answer in time: worth one retry on another model. */
  readonly busy: boolean;
  constructor(code: ErrorCode, message: string, busy = false) {
    super(message);
    this.code = code;
    this.busy = busy;
  }
  get status(): number {
    return STATUS[this.code];
  }
  toBody() {
    return { error: { code: this.code, message: this.message } };
  }
}

const DEFAULT_MAX_TOKENS = 4096;
const MAX_MAX_TOKENS = 32_000;
const REQUEST_TIMEOUT_MS = 30_000;

function bad(message: string): never {
  throw new GatewayError("bad_request", message);
}

/** Validates an incoming request body into a GenerateRequest. */
export function parseRequest(body: unknown): GenerateRequest {
  if (typeof body !== "object" || body === null) bad("Body must be a JSON object.");
  const b = body as Record<string, unknown>;
  if (typeof b.userEmail !== "string" || !b.userEmail.includes("@")) bad("userEmail is required.");
  if (!Array.isArray(b.messages) || b.messages.length === 0) bad("messages must be a non-empty array.");
  const messages = b.messages.map((m: unknown): Message => {
    const msg = m as Record<string, unknown> | null;
    if (!msg || (msg.role !== "user" && msg.role !== "assistant") || typeof msg.content !== "string") {
      bad('Each message needs role "user" | "assistant" and string content.');
    }
    return { role: msg.role as Message["role"], content: msg.content as string };
  });
  const opt = <T>(key: string, type: string): T | undefined => {
    if (b[key] === undefined || b[key] === null) return undefined;
    if (typeof b[key] !== type) bad(`${key} must be a ${type}.`);
    return b[key] as T;
  };
  let tools: Tool[] | undefined;
  if (b.tools !== undefined) {
    if (!Array.isArray(b.tools)) bad("tools must be an array.");
    tools = b.tools.map((t: unknown): Tool => {
      const tool = t as Record<string, unknown> | null;
      if (!tool || typeof tool.name !== "string" || typeof tool.inputSchema !== "object" || tool.inputSchema === null) {
        bad("Each tool needs a name and an inputSchema.");
      }
      return { name: tool.name as string, description: tool.description as string | undefined, inputSchema: tool.inputSchema as object };
    });
  }
  const maxTokens = opt<number>("maxTokens", "number");
  if (maxTokens !== undefined && !(maxTokens > 0 && maxTokens <= MAX_MAX_TOKENS)) bad(`maxTokens must be 1-${MAX_MAX_TOKENS}.`);
  return {
    userEmail: b.userEmail.trim().toLowerCase(),
    provider: opt<string>("provider", "string") ?? "auto",
    model: opt<string>("model", "string"),
    system: opt<string>("system", "string"),
    messages,
    tools,
    json: opt<object>("json", "object"),
    maxTokens,
    temperature: opt<number>("temperature", "number"),
  };
}

/** The saved providers (already in the user's order) to try: an explicit provider alone, else all. */
export function tryOrder(saved: string[], requested: string): string[] {
  if (requested !== "auto") return saved.includes(requested) ? [requested] : [];
  return saved;
}

function schemaInstruction(schema: object): string {
  return `Respond with a JSON object matching this JSON Schema, and nothing else:\n${JSON.stringify(schema)}`;
}

/** Chat Completions body for OpenAI, Groq, Gemini and Custom providers. */
export function toOpenAiBody(config: ProviderConfig, req: GenerateRequest): Record<string, unknown> {
  let system = req.system;
  const body: Record<string, unknown> = { model: resolveModel(config, req.model) };
  if (req.json) {
    if (config.jsonMode === "schema") {
      body.response_format = { type: "json_schema", json_schema: { name: "reply", schema: req.json } };
    } else {
      body.response_format = { type: "json_object" };
      system = system ? `${system}\n\n${schemaInstruction(req.json)}` : schemaInstruction(req.json);
    }
  }
  body.messages = [...(system ? [{ role: "system", content: system }] : []), ...req.messages];
  if (req.tools?.length) {
    body.tools = req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.inputSchema } }));
  }
  body[config.tokensParam] = req.maxTokens ?? DEFAULT_MAX_TOKENS;
  if (req.temperature !== undefined) body.temperature = req.temperature;
  return body;
}

type OpenAiReply = {
  model?: string;
  choices?: { message?: { content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export function fromOpenAiReply(config: ProviderConfig, req: GenerateRequest, reply: OpenAiReply): GenerateResponse {
  const message = reply.choices?.[0]?.message;
  const text = message?.content ?? "";
  const toolCalls = message?.tool_calls?.map((c) => ({ id: c.id, name: c.function.name, input: parseJson(c.function.arguments) }));
  return finish(config, req, text, toolCalls, reply.model, reply.usage?.prompt_tokens, reply.usage?.completion_tokens);
}

/**
 * Messages API body. JSON replies use structured outputs (output_config.format);
 * temperature is never sent: API version 2026-10-21 rejects it on every model.
 */
export function toAnthropicBody(config: ProviderConfig, req: GenerateRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: resolveModel(config, req.model),
    max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: req.messages,
  };
  if (req.system) body.system = req.system;
  if (req.tools?.length) body.tools = req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
  if (req.json) body.output_config = { format: { type: "json_schema", schema: req.json } };
  return body;
}

type AnthropicReply = {
  model?: string;
  content?: ({ type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown } | { type: string })[];
  usage?: { input_tokens?: number; output_tokens?: number };
};

export function fromAnthropicReply(config: ProviderConfig, req: GenerateRequest, reply: AnthropicReply): GenerateResponse {
  const blocks = reply.content ?? [];
  const text = blocks.flatMap((b) => (b.type === "text" && "text" in b ? [b.text] : [])).join("");
  const toolCalls = blocks.flatMap((b) => (b.type === "tool_use" && "id" in b ? [{ id: b.id, name: b.name, input: b.input }] : []));
  return finish(config, req, text, toolCalls.length ? toolCalls : undefined, reply.model, reply.usage?.input_tokens, reply.usage?.output_tokens);
}

function finish(
  config: ProviderConfig,
  req: GenerateRequest,
  text: string,
  toolCalls: ToolCall[] | undefined,
  model: string | undefined,
  inputTokens: number | undefined,
  outputTokens: number | undefined,
): GenerateResponse {
  const res: GenerateResponse = {
    text,
    provider: config.id,
    model: model ?? resolveModel(config, req.model),
    usage: { inputTokens: inputTokens ?? 0, outputTokens: outputTokens ?? 0 },
  };
  if (req.json) {
    const json = parseJson(text);
    if (json !== undefined) res.json = json;
  }
  if (toolCalls?.length) res.toolCalls = toolCalls;
  return res;
}

/** Parses a JSON reply, tolerating a ```json fence around it; undefined when unreadable. */
export function parseJson(text: string): unknown {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(stripped);
  } catch {
    return undefined;
  }
}

/** Maps a provider's HTTP failure to a typed error the app can show. */
export function providerError(label: string, status: number, message: string): GatewayError {
  if (status === 0) {
    return message === "timeout"
      ? new GatewayError("provider_error", `${label} didn't answer in time.`, true)
      : new GatewayError("provider_error", `Could not reach ${label}.`);
  }
  if (status === 401 || status === 403 || /api[_ ]?key/i.test(message)) {
    return new GatewayError("key_refused", `${label} rejected the API key.`);
  }
  if (status === 429) return new GatewayError("rate_limited", `${label} rate limit hit, try again in a minute.`);
  if (status === 404) return new GatewayError("provider_error", `${label}: model not found (${message.slice(0, 200)}).`);
  if (status >= 500) return new GatewayError("provider_error", `${label} is having trouble right now, try again shortly.`, true);
  return new GatewayError("provider_error", `${label} refused the request (${status}): ${message.slice(0, 200)}`);
}

/**
 * callProvider, retried once on the "smart" model when the "fast" one is busy
 * (Gemini's Flash-Lite often answers 503 under load).
 */
export async function callWithRetry(config: ProviderConfig, apiKey: string, req: GenerateRequest): Promise<GenerateResponse> {
  try {
    return await callProvider(config, apiKey, req);
  } catch (err) {
    const fast = req.model === undefined || req.model === "fast";
    if (!(err instanceof GatewayError) || !err.busy || !fast || config.models.fast === config.models.smart) throw err;
    return await callProvider(config, apiKey, { ...req, model: "smart" });
  }
}

/** One call to one provider with one key. Throws GatewayError. */
export async function callProvider(config: ProviderConfig, apiKey: string, req: GenerateRequest): Promise<GenerateResponse> {
  const anthropic = config.dialect === "anthropic";
  const url = `${config.baseUrl}${anthropic ? "/messages" : "/chat/completions"}`;
  const headers: Record<string, string> = anthropic
    ? { "x-api-key": apiKey, "anthropic-version": "2026-10-21", "Content-Type": "application/json" }
    : { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  const body = anthropic ? toAnthropicBody(config, req) : toOpenAiBody(config, req);
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    throw providerError(config.label, 0, err instanceof Error && /timeout|abort/i.test(err.name + err.message) ? "timeout" : "network");
  }
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (json as { error?: { message?: string } | { message?: string }[] } | null)?.error;
    const msg = (Array.isArray(e) ? e[0]?.message : e?.message) ?? res.statusText;
    throw providerError(config.label, res.status, msg);
  }
  return anthropic ? fromAnthropicReply(config, req, json as AnthropicReply) : fromOpenAiReply(config, req, json as OpenAiReply);
}
