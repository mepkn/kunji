import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Spinner } from "@/components/ui/spinner";

const fmt = new Intl.NumberFormat();

/** Calls and tokens per app per day, all on the person's own keys. */
export function UsagePage() {
  const rows = useQuery(api.usage.byDay);
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Usage</h1>
        <p className="text-muted-foreground">AI calls apps made with your keys in the last 30 days (UTC days).</p>
      </div>
      {rows === undefined ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">No calls yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Day</th>
                <th className="px-3 py-2 font-medium">App</th>
                <th className="px-3 py-2 font-medium text-right">Calls</th>
                <th className="px-3 py-2 font-medium text-right">Failed</th>
                <th className="px-3 py-2 font-medium text-right">Input tokens</th>
                <th className="px-3 py-2 font-medium text-right">Output tokens</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={`${r.day}-${r.app}`}>
                  <td className="px-3 py-2 tabular-nums">{r.day}</td>
                  <td className="px-3 py-2">{r.app}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt.format(r.calls)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.errors ? fmt.format(r.errors) : ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt.format(r.inputTokens)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt.format(r.outputTokens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
