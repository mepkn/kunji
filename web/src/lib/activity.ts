/** What each Activity value means, shown on hover. Codes come from kunji (refused, AppError) and the app contract. */
export const SOURCES = {
  mcp: { label: "AI client", hint: "Through /mcp with one of your kj_… tokens (Claude Code, Cursor, Claude Desktop…)." },
  try: { label: "Try a tool", hint: "From the Try a tool box on an app's admin page." },
} as const;

export const NO_SOURCE_HINT = "Logged before 31 Oct 2026, when kunji didn't record the source yet.";

const RESULTS: Record<string, string> = {
  ok: "The app ran the tool and returned a result.",
  refused:
    "kunji didn't call the app: you switched it off on Apps, or kunji's cached status says you have no account there or aren't allowed.",
  no_account: "The app has no verified account with your email.",
  not_allowed: "Your email is no longer in the app's ALLOWED_EMAILS.",
  unknown_tool: "The app doesn't have this tool any more; kunji's cached list was out of date (refreshed every 6 hours or by admin Refresh).",
  bad_input: "The arguments didn't match the tool's input schema (a missing required field or a wrong type).",
  tool_error: "The tool itself failed; the AI client got the app's message.",
  unreachable: "kunji couldn't reach the app's backend (down or wrong URL).",
  timeout: "The app didn't answer within 30 seconds.",
  unauthorized: "The app refused kunji's secret: its KUNJI_SECRET doesn't match (often after a secret rotation).",
  bad_response: "The app answered with an error status or with something that isn't a contract reply.",
  error: "Something unexpected went wrong inside kunji.",
};

export function resultHint(code: string): string {
  return RESULTS[code] ?? "An error code from the app.";
}
