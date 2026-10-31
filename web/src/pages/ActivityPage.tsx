import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

const SOURCES = { mcp: "AI client", try: "Try a tool" } as const;

/** My last 100 tool calls, from any AI client or Try a tool. */
export function ActivityPage() {
  const calls = useQuery(api.activity.recent);
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="text-muted-foreground">Tool calls your AI clients made in your apps, newest first.</p>
      </div>
      {calls === undefined ? (
        <Spinner />
      ) : calls.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">No tool calls yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">App</th>
                <th className="px-3 py-2 font-medium">Tool</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {calls.map((c) => (
                <tr key={c._id}>
                  <td className="px-3 py-2 tabular-nums whitespace-nowrap">{new Date(c.at).toLocaleString()}</td>
                  <td className="px-3 py-2">{c.app}</td>
                  <td className="px-3 py-2">
                    <code>{c.tool}</code>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{c.source === null ? "—" : SOURCES[c.source]}</td>
                  <td className="px-3 py-2">
                    {c.ok ? <Badge variant="secondary">ok</Badge> : <Badge variant="destructive">{c.error ?? "error"}</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
