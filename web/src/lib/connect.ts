/** kunji's /mcp URL: the deployment's .convex.site (locally the site port, API port + 1). */
export function mcpUrl(convexUrl: string): string {
  const u = new URL(convexUrl);
  if (u.hostname.endsWith(".convex.cloud")) u.hostname = u.hostname.replace(/\.convex\.cloud$/, ".convex.site");
  else if (u.port) u.port = String(Number(u.port) + 1);
  return `${u.origin}/mcp`;
}

export type Snippet = { id: string; label: string; hint: string; code: string };

/** Setup snippets for each client, with the token filled in when one was just created. */
export function snippets(url: string, token = "kj_…"): Snippet[] {
  const json = (x: unknown) => JSON.stringify(x, null, 2);
  return [
    {
      id: "claude-code",
      label: "Claude Code",
      hint: "Run in a terminal. Add --scope user to use kunji in every project.",
      code: `claude mcp add --transport http kunji ${url} --header "Authorization: Bearer ${token}"`,
    },
    {
      id: "cursor",
      label: "Cursor / other",
      hint: "Cursor: ~/.cursor/mcp.json. Most clients that speak streamable HTTP take the same url + headers.",
      code: json({ mcpServers: { kunji: { url, headers: { Authorization: `Bearer ${token}` } } } }),
    },
    {
      id: "claude-desktop",
      label: "Claude Desktop",
      hint: "Settings → Developer → Edit Config (claude_desktop_config.json), then restart. Needs Node; mcp-remote bridges to kunji.",
      code: json({
        mcpServers: {
          kunji: {
            command: "npx",
            args: ["-y", "mcp-remote", url, "--header", "Authorization:${KUNJI_AUTH}"],
            env: { KUNJI_AUTH: `Bearer ${token}` },
          },
        },
      }),
    },
  ];
}
