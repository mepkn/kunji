/**
 * kunji's client for an app's contract routes (SPEC.md → App contract):
 * GET /kunji/tools, POST /kunji/access, POST /kunji/call, each with the app's
 * secret as a Bearer token. Failures are AppError with a typed code.
 */
export type AppTool = { name: string; description: string; inputSchema: Record<string, unknown> };
export type AccessStatus = "ok" | "no_account" | "not_allowed";
export type CallResult = { ok: true; result: unknown } | { ok: false; error: { code: string; message: string } };

export type AppErrorCode = "unreachable" | "timeout" | "unauthorized" | "bad_response";

export class AppError extends Error {
  readonly code: AppErrorCode;
  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export type AppTarget = { backendUrl: string; secret: string };

const TOOLS_TIMEOUT_MS = 10_000;
const CALL_TIMEOUT_MS = 30_000;

async function request(app: AppTarget, path: string, body: unknown, timeoutMs: number): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${app.backendUrl.replace(/\/+$/, "")}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${app.secret}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new AppError("timeout", `The app did not answer within ${timeoutMs / 1000}s.`);
    }
    throw new AppError("unreachable", "Could not reach the app.");
  }
  if (res.status === 401) throw new AppError("unauthorized", "The app refused kunji's secret. Check KUNJI_SECRET on the app.");
  const json = await res.json().catch(() => undefined);
  if (!res.ok || json === undefined) throw new AppError("bad_response", `The app answered ${res.status}${res.ok ? " without JSON" : ""}.`);
  return json;
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

export function parseTools(json: unknown): AppTool[] {
  if (!Array.isArray(json)) throw new AppError("bad_response", "The tool list is not an array.");
  return json.map((t, i) => {
    if (!isObject(t) || typeof t.name !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(t.name) || typeof t.description !== "string" || !isObject(t.inputSchema)) {
      throw new AppError("bad_response", `Tool ${i + 1} needs a snake_case name, a description and an inputSchema object.`);
    }
    return { name: t.name, description: t.description, inputSchema: t.inputSchema };
  });
}

export async function listTools(app: AppTarget): Promise<AppTool[]> {
  return parseTools(await request(app, "/kunji/tools", undefined, TOOLS_TIMEOUT_MS));
}

export async function checkAccess(app: AppTarget, userEmail: string): Promise<AccessStatus> {
  const json = await request(app, "/kunji/access", { userEmail }, TOOLS_TIMEOUT_MS);
  const status = isObject(json) ? json.status : undefined;
  if (status !== "ok" && status !== "no_account" && status !== "not_allowed") throw new AppError("bad_response", "Unknown access status.");
  return status;
}

export async function callTool(app: AppTarget, userEmail: string, tool: string, input: unknown): Promise<CallResult> {
  const json = await request(app, "/kunji/call", { tool, input, userEmail }, CALL_TIMEOUT_MS);
  if (isObject(json) && json.ok === true) return { ok: true, result: json.result ?? null };
  if (isObject(json) && json.ok === false) {
    const e = json.error;
    return isObject(e) && typeof e.code === "string"
      ? { ok: false, error: { code: e.code, message: typeof e.message === "string" ? e.message : e.code } }
      : { ok: false, error: { code: "tool_error", message: typeof e === "string" ? e : "The tool failed." } };
  }
  throw new AppError("bad_response", "The call reply has no ok field.");
}
