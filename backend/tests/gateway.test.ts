import { afterEach, describe, expect, it, vi } from "vitest";
import {
  callProvider,
  callWithRetry,
  fromAnthropicReply,
  fromOpenAiReply,
  GatewayError,
  parseJson,
  parseRequest,
  providerError,
  toAnthropicBody,
  toOpenAiBody,
  tryOrder,
  type GenerateRequest,
} from "../convex/lib/gateway";
import { BUILTIN, cleanBaseUrl, customConfig, customId, resolveModel } from "../convex/lib/providers";
import { newAppSecret, sha256Hex } from "../convex/lib/secrets";

const schema = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] };
const base: GenerateRequest = { userEmail: "a@b.co", provider: "auto", messages: [{ role: "user", content: "hi" }] };

describe("parseRequest", () => {
  it("fills defaults and lowercases the email", () => {
    const r = parseRequest({ userEmail: " A@B.co ", messages: [{ role: "user", content: "hi" }] });
    expect(r).toMatchObject({ userEmail: "a@b.co", provider: "auto", model: undefined });
  });

  it.each([
    [null, "Body must be"],
    [{ messages: [{ role: "user", content: "x" }] }, "userEmail"],
    [{ userEmail: "a@b.co", messages: [] }, "messages"],
    [{ userEmail: "a@b.co", messages: [{ role: "system", content: "x" }] }, "role"],
    [{ userEmail: "a@b.co", messages: [{ role: "user", content: "x" }], maxTokens: 0 }, "maxTokens"],
    [{ userEmail: "a@b.co", messages: [{ role: "user", content: "x" }], tools: [{ name: "t" }] }, "inputSchema"],
  ])("rejects %j as bad_request", (body, msg) => {
    try {
      parseRequest(body);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(GatewayError);
      expect((err as GatewayError).code).toBe("bad_request");
      expect((err as GatewayError).status).toBe(400);
      expect((err as Error).message).toContain(msg);
    }
  });
});

describe("models and providers", () => {
  it("maps fast/smart per provider and passes exact ids through", () => {
    expect(resolveModel(BUILTIN.anthropic, undefined)).toBe(BUILTIN.anthropic.models.fast);
    expect(resolveModel(BUILTIN.groq, "smart")).toBe(BUILTIN.groq.models.smart);
    expect(resolveModel(BUILTIN.openai, "gpt-x")).toBe("gpt-x");
  });

  it("names Custom providers by slug and cleans base URLs", () => {
    expect(customId(" Open Router! ")).toBe("custom:open-router");
    expect(cleanBaseUrl("https://openrouter.ai/api/v1/")).toBe("https://openrouter.ai/api/v1");
    expect(() => cleanBaseUrl("ftp://x")).toThrow();
    expect(() => cleanBaseUrl("nope")).toThrow();
  });

  it("orders providers: explicit alone, auto all", () => {
    expect(tryOrder(["groq", "gemini"], "auto")).toEqual(["groq", "gemini"]);
    expect(tryOrder(["groq", "gemini"], "gemini")).toEqual(["gemini"]);
    expect(tryOrder(["groq"], "openai")).toEqual([]);
  });
});

describe("OpenAI-compatible adapter", () => {
  it("builds a Chat Completions body with system, tools and json_schema", () => {
    const body = toOpenAiBody(BUILTIN.openai, {
      ...base,
      model: "smart",
      system: "be brief",
      json: schema,
      tools: [{ name: "pick", description: "d", inputSchema: schema }],
      maxTokens: 100,
      temperature: 0.2,
    });
    expect(body).toEqual({
      model: "gpt-5",
      response_format: { type: "json_schema", json_schema: { name: "reply", schema } },
      messages: [
        { role: "system", content: "be brief" },
        { role: "user", content: "hi" },
      ],
      tools: [{ type: "function", function: { name: "pick", description: "d", parameters: schema } }],
      max_completion_tokens: 100,
      temperature: 0.2,
    });
  });

  it("uses json_object with the schema in the prompt for Groq and Custom", () => {
    const body = toOpenAiBody(customConfig("custom:x", "X", "https://x", "m"), { ...base, json: schema });
    expect(body.response_format).toEqual({ type: "json_object" });
    expect((body.messages as { content: string }[])[0].content).toContain('"required":["ok"]');
    expect(body.max_tokens).toBe(4096);
    expect(body.model).toBe("m");
  });

  it("maps the reply to the common shape", () => {
    const res = fromOpenAiReply(BUILTIN.groq, { ...base, json: schema }, {
      model: "openai/gpt-oss-20b",
      choices: [{ message: { content: '```json\n{"ok":true}\n```', tool_calls: [{ id: "c1", function: { name: "pick", arguments: '{"n":2}' } }] } }],
      usage: { prompt_tokens: 12, completion_tokens: 3 },
    });
    expect(res).toEqual({
      text: '```json\n{"ok":true}\n```',
      json: { ok: true },
      toolCalls: [{ id: "c1", name: "pick", input: { n: 2 } }],
      provider: "groq",
      model: "openai/gpt-oss-20b",
      usage: { inputTokens: 12, outputTokens: 3 },
    });
  });
});

describe("Anthropic adapter", () => {
  it("builds a Messages body with structured outputs and no temperature", () => {
    const body = toAnthropicBody(BUILTIN.anthropic, { ...base, system: "s", json: schema, temperature: 0.5, tools: [{ name: "t", inputSchema: schema }] });
    expect(body).toEqual({
      model: "claude-haiku-5-5",
      max_tokens: 4096,
      messages: [{ role: "user", content: "hi" }],
      system: "s",
      tools: [{ name: "t", description: undefined, input_schema: schema }],
      output_config: { format: { type: "json_schema", schema } },
    });
  });

  it("joins text blocks and collects tool_use blocks", () => {
    const res = fromAnthropicReply(BUILTIN.anthropic, { ...base, json: schema }, {
      model: "claude-haiku-5-5",
      content: [
        { type: "thinking" },
        { type: "text", text: '{"ok":' },
        { type: "text", text: "false}" },
        { type: "tool_use", id: "t1", name: "pick", input: { a: 1 } },
      ],
      usage: { input_tokens: 5, output_tokens: 7 },
    });
    expect(res).toEqual({
      text: '{"ok":false}',
      json: { ok: false },
      toolCalls: [{ id: "t1", name: "pick", input: { a: 1 } }],
      provider: "anthropic",
      model: "claude-haiku-5-5",
      usage: { inputTokens: 5, outputTokens: 7 },
    });
  });

  it("leaves json out when the reply isn't JSON", () => {
    expect(parseJson("not json")).toBeUndefined();
    expect(fromAnthropicReply(BUILTIN.anthropic, { ...base, json: schema }, { content: [{ type: "text", text: "sorry" }] }).json).toBeUndefined();
  });
});

describe("errors", () => {
  it.each([
    [401, "bad", "key_refused", 403],
    [403, "forbidden", "key_refused", 403],
    [400, "API key not valid. Please pass a valid API key.", "key_refused", 403],
    [429, "slow down", "rate_limited", 429],
    [404, "no such model", "provider_error", 502],
    [500, "boom", "provider_error", 502],
    [400, "bad param", "provider_error", 502],
    [0, "timeout", "provider_error", 502],
  ] as const)("HTTP %i %j → %s", (status, msg, code, httpStatus) => {
    const err = providerError("Groq", status, msg);
    expect(err.code).toBe(code);
    expect(err.status).toBe(httpStatus);
    expect(err.toBody()).toEqual({ error: { code, message: err.message } });
  });

  describe("callProvider", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("sends Anthropic headers and maps a refusal of the key", async () => {
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { message: "invalid x-api-key" } }), { status: 401 }));
      vi.stubGlobal("fetch", fetchMock);
      await expect(callProvider(BUILTIN.anthropic, "sk-ant-test", base)).rejects.toMatchObject({ code: "key_refused" });
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://api.anthropic.com/v1/messages");
      expect(init.headers).toMatchObject({ "x-api-key": "sk-ant-test", "anthropic-version": "2026-10-21" });
    });

    it("maps a network failure to provider_error", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
      await expect(callProvider(BUILTIN.gemini, "k", base)).rejects.toMatchObject({ code: "provider_error", message: "Could not reach Gemini." });
    });

    it("retries a busy fast model once on the smart model", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify([{ error: { message: "high demand" } }]), { status: 503 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      const res = await callWithRetry(BUILTIN.gemini, "k", base);
      expect(res.model).toBe(BUILTIN.gemini.models.smart);
      expect(JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string).model).toBe(BUILTIN.gemini.models.smart);
    });

    it("doesn't retry a refused key or an exact model id", async () => {
      const fetchMock = vi.fn(async () => new Response("{}", { status: 503 }));
      vi.stubGlobal("fetch", fetchMock);
      await expect(callWithRetry(BUILTIN.gemini, "k", { ...base, model: "gemini-x" })).rejects.toMatchObject({ busy: true });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("returns the common shape on success", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), { status: 200 })));
      await expect(callProvider(BUILTIN.groq, "k", base)).resolves.toMatchObject({ text: "OK", provider: "groq", model: "openai/gpt-oss-20b" });
    });
  });
});

describe("app secrets", () => {
  it("are random kjs_ tokens hashed with SHA-256", async () => {
    const a = newAppSecret();
    expect(a).toMatch(/^kjs_[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(newAppSecret());
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
