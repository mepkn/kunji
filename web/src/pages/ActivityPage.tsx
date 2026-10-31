import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { NO_SOURCE_HINT, resultHint, SOURCES } from "@/lib/activity";

/** Its children, with `hint` on hover or focus. */
function Hint({ hint, children }: { hint: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger className="cursor-help rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">{children}</TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}

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
        <TooltipProvider delay={200}>
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
                    <td className="px-3 py-2 text-muted-foreground">
                      <Hint hint={c.source === null ? NO_SOURCE_HINT : SOURCES[c.source].hint}>{c.source === null ? "—" : SOURCES[c.source].label}</Hint>
                    </td>
                    <td className="px-3 py-2">
                      <Hint hint={resultHint(c.ok ? "ok" : (c.error ?? "error"))}>
                        {c.ok ? <Badge variant="secondary">ok</Badge> : <Badge variant="destructive">{c.error ?? "error"}</Badge>}
                      </Hint>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}
