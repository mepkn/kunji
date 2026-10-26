/**
 * Pure helpers for /mcp (SPEC.md → /mcp). Tool names are "<slug>__<tool>": MCP itself
 * allows dots, but Claude's API (and so Claude Code) accepts only [a-zA-Z0-9_-] in tool
 * names. Slugs never contain "_", so the first "__" always splits slug from tool.
 */
import type { Id } from "../_generated/dataModel";
import type { Reach } from "../myApps";
import type { AppTool } from "./appClient";

export const SEP = "__";

export const toolName = (slug: string, tool: string) => `${slug}${SEP}${tool}`;

/** The tools /mcp lists: apps that are switched on and where the person has an account. */
export function visibleTools(reach: Reach): (AppTool & { app: string })[] {
  return reach
    .filter((a) => a.on && a.status === "ok")
    .flatMap((a) => a.tools.map((t) => ({ ...t, name: toolName(a.slug, t.name), description: `${a.name}: ${t.description}`, app: a.slug })));
}

export type Route =
  | { ok: true; appId: Id<"apps">; app: string; tool: string }
  | { ok: false; appId?: Id<"apps">; app?: string; tool?: string; message: string };

/** Which app and tool a prefixed name means, or why it cannot be called. */
export function routeCall(reach: Reach, name: string, siteUrl: string): Route {
  const at = name.indexOf(SEP);
  const slug = at > 0 ? name.slice(0, at) : "";
  const tool = at > 0 ? name.slice(at + SEP.length) : "";
  const app = reach.find((a) => a.slug === slug);
  if (app === undefined || !app.tools.some((t) => t.name === tool)) return { ok: false, message: `Unknown tool "${name}". Call tools/list.` };
  const base = { appId: app.appId, app: app.slug, tool };
  if (!app.on) return { ...base, ok: false, message: `You switched ${app.name} off in kunji. Turn it on at ${siteUrl}/apps.` };
  if (app.status === "no_account") return { ...base, ok: false, message: `You have no ${app.name} account. Sign up at ${app.siteUrl}.` };
  if (app.status === "not_allowed") return { ...base, ok: false, message: `${app.name} does not allow your email.` };
  return { ...base, ok: true };
}

/** An app's result as MCP text content. */
export const resultText = (result: unknown) => (typeof result === "string" ? result : JSON.stringify(result, null, 2));
