import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { ArrowLeft, Copy, RefreshCw } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/errors";

type App = Pick<Doc<"apps">, "_id" | "slug" | "name" | "siteUrl" | "backendUrl" | "enabled">;
type Tool = { name: string; description: string; inputSchema: unknown };

export function SecretOnce({ secret }: { secret: string }) {
  return (
    <Alert>
      <AlertTitle>App secret, shown once</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>Set it on the app's Convex deployment as KUNJI_SECRET. kunji keeps only a hash and an encrypted copy.</p>
        <div className="flex items-center gap-2">
          <code className="break-all rounded bg-muted px-2 py-1 text-xs">{secret}</code>
          <Button variant="ghost" size="icon" aria-label="Copy secret" onClick={() => void navigator.clipboard.writeText(secret)}>
            <Copy />
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

function Details({ app }: { app: App }) {
  const update = useMutation(api.apps.update);
  const setEnabled = useMutation(api.apps.setEnabled);
  const rotate = useAction(api.apps.rotateSecret);
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: app.name, slug: app.slug, siteUrl: app.siteUrl, backendUrl: app.backendUrl });
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "rotate" | null>(null);

  async function run(kind: "save" | "rotate", fn: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  function save(e: FormEvent) {
    e.preventDefault();
    void run("save", async () => {
      const slug = await update({ appId: app._id, ...form });
      if (slug !== app.slug) navigate(`/apps/${slug}`, { replace: true });
    });
  }

  function rotateSecret() {
    if (!window.confirm(`Rotate ${app.name}'s secret? The old one stops working until you set the new one on the app.`)) return;
    void run("rotate", async () => setSecret((await rotate({ appId: app._id })).secret));
  }

  const field = (key: keyof typeof form, label: string) => (
    <Field>
      <FieldLabel htmlFor={key}>{label}</FieldLabel>
      <Input id={key} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </Field>
  );
  const dirty = (Object.keys(form) as (keyof typeof form)[]).some((k) => form[k] !== app[k]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
        <CardDescription>The slug prefixes the app's tools: {app.slug}.tool_name.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={app.enabled} onCheckedChange={(enabled) => void setEnabled({ appId: app._id, enabled })} />
          {app.enabled ? "Enabled" : "Disabled: its secret is refused and kunji doesn't call it"}
        </label>
        <form onSubmit={save}>
          <FieldGroup>
            {field("name", "Name")}
            {field("slug", "Slug")}
            {field("siteUrl", "Site URL")}
            {field("backendUrl", "Backend URL")}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={!dirty || busy !== null}>
                {busy === "save" && <Spinner />} Save
              </Button>
              <Button type="button" variant="outline" disabled={busy !== null} onClick={rotateSecret}>
                {busy === "rotate" && <Spinner />} Rotate secret
              </Button>
            </div>
          </FieldGroup>
        </form>
        {secret && <SecretOnce secret={secret} />}
      </CardContent>
    </Card>
  );
}

function Tools({ app, tools, fetchedAt, fetchError }: { app: App; tools: Tool[] | null; fetchedAt: number | null; fetchError: string | null }) {
  const refresh = useAction(api.apps.refreshTools);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onRefresh() {
    setBusy(true);
    setError(null);
    try {
      await refresh({ appId: app._id });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>Tools</CardTitle>
          <CardDescription>
            {fetchedAt ? `From GET /kunji/tools, fetched ${new Date(fetchedAt).toLocaleString()}.` : "Not fetched yet."}
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" disabled={busy || !app.enabled} onClick={() => void onRefresh()}>
          {busy ? <Spinner /> : <RefreshCw />} Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {(error ?? fetchError) && <p className="text-sm text-destructive">Last refresh failed: {error ?? fetchError}</p>}
        {tools && tools.length === 0 && <p className="text-sm text-muted-foreground">The app lists no tools.</p>}
        {tools && tools.length > 0 && (
          <ul className="divide-y text-sm">
            {tools.map((t) => (
              <li key={t.name} className="space-y-1 py-2">
                <code className="font-medium">
                  {app.slug}.{t.name}
                </code>
                <p className="text-muted-foreground">{t.description}</p>
                <details>
                  <summary className="cursor-pointer text-xs text-muted-foreground">Input schema</summary>
                  <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs">{JSON.stringify(t.inputSchema, null, 2)}</pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const controlClass =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function TryTool({ appId, tools }: { appId: Id<"apps">; tools: Tool[] }) {
  const tryTool = useAction(api.apps.tryTool);
  const [tool, setTool] = useState(tools[0]?.name ?? "");
  const [input, setInput] = useState("{}");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await tryTool({ appId, tool, input }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Try a tool</CardTitle>
        <CardDescription>Runs the tool as you, by your kunji email, the way your AI clients will.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="tool">Tool</FieldLabel>
              <select id="tool" className={controlClass} value={tool} onChange={(e) => setTool(e.target.value)}>
                {tools.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="input">Input (JSON)</FieldLabel>
              <textarea id="input" rows={4} className={`${controlClass} font-mono`} value={input} onChange={(e) => setInput(e.target.value)} />
            </Field>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div>
              <Button type="submit" disabled={busy || !tool}>
                {busy && <Spinner />} Run
              </Button>
            </div>
            {result !== null && <pre className="max-h-96 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(result, null, 2)}</pre>}
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

/** Admin only: one registered app. */
export function AppPage() {
  const { slug = "" } = useParams();
  const data = useQuery(api.apps.get, { slug });

  return (
    <div className="space-y-6">
      <Link to="/apps" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Apps
      </Link>
      {data === undefined ? (
        <Spinner />
      ) : data === null ? (
        <p className="text-muted-foreground">No app with slug "{slug}".</p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{data.app.name}</h1>
            {!data.app.enabled && <Badge variant="secondary">Disabled</Badge>}
            <a href={data.app.siteUrl} target="_blank" rel="noreferrer" className="ml-auto text-sm text-primary underline-offset-4 hover:underline">
              {new URL(data.app.siteUrl).host}
            </a>
          </div>
          <Details key={data.app._id + data.app.slug} app={data.app} />
          <Tools app={data.app} tools={data.tools} fetchedAt={data.fetchedAt} fetchError={data.fetchError} />
          {data.app.enabled && data.tools && data.tools.length > 0 && <TryTool appId={data.app._id} tools={data.tools} />}
        </>
      )}
    </div>
  );
}
