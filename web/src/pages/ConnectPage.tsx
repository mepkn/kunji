import { useState, type FormEvent } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Check, Copy, Trash2 } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { mcpUrl, snippets } from "@/lib/connect";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

const URL_ = mcpUrl(import.meta.env.VITE_CONVEX_URL as string);
const when = (at: number | null) => (at === null ? "never" : new Date(at).toLocaleString());

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check /> : <Copy />}
    </Button>
  );
}

function Tokens({ onCreated }: { onCreated: (token: string) => void }) {
  const tokens = useQuery(api.tokens.list);
  const create = useAction(api.tokens.create);
  const revoke = useMutation(api.tokens.revoke);
  const [name, setName] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token } = await create({ name });
      setShown(token);
      onCreated(token);
      setName("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tokens</CardTitle>
        <CardDescription>One per device or client. Tokens never expire; revoke the ones you no longer use.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {tokens === undefined ? (
          <Spinner />
        ) : (
          tokens.length > 0 && (
            <ul className="divide-y text-sm">
              {tokens.map((t) => (
                <li key={t._id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="font-medium">{t.name}</span>
                  <code className="text-muted-foreground">kj_…{t.last4}</code>
                  <span className="ml-auto text-muted-foreground">Last used {when(t.lastUsedAt)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Revoke ${t.name}`}
                    onClick={() => {
                      if (window.confirm(`Revoke "${t.name}"? Clients using it stop working at once.`)) void revoke({ tokenId: t._id });
                    }}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )
        )}

        {shown && (
          <Alert>
            <AlertTitle>Token, shown once</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>Copy it now: kunji keeps only a hash. The snippets below already include it.</p>
              <div className="flex items-center gap-2">
                <code className="break-all rounded bg-muted px-2 py-1 text-xs">{shown}</code>
                <CopyButton text={shown} label="Copy token" />
              </div>
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={submit} className="flex gap-2">
          <Input placeholder="Name, e.g. laptop" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy && <Spinner />} Create token
          </Button>
        </form>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

function Setup({ token }: { token?: string }) {
  const all = snippets(URL_, token);
  const [tab, setTab] = useState(all[0].id);
  const current = all.find((s) => s.id === tab)!;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Set up a client</CardTitle>
        <CardDescription>
          kunji's MCP server is <code>{URL_}</code>, with your token as a Bearer header.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1" role="tablist">
          {all.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={s.id === tab}
              onClick={() => setTab(s.id)}
              className={cn("rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground", s.id === tab && "bg-muted text-foreground")}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{current.hint}</p>
        <div className="relative">
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 pr-12 text-xs">{current.code}</pre>
          <div className="absolute right-1 top-1">
            <CopyButton text={current.code} label="Copy snippet" />
          </div>
        </div>
        {!token && <p className="text-xs text-muted-foreground">Create a token above and it is filled in here; otherwise replace kj_… with yours.</p>}
        <p className="text-xs text-muted-foreground">
          claude.ai and Claude Desktop's own "custom connector" need OAuth sign-in, which kunji does not offer yet; use the config above for
          Claude Desktop.
        </p>
      </CardContent>
    </Card>
  );
}

export function ConnectPage() {
  const [token, setToken] = useState<string>();
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Connect</h1>
        <p className="text-muted-foreground">Give Claude, Cursor and other AI clients your apps' tools.</p>
      </div>
      <Tokens onCreated={setToken} />
      <Setup token={token} />
    </div>
  );
}
