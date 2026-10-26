import { useEffect, useState, type FormEvent } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Link } from "react-router";
import { ChevronRight, RefreshCw } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/errors";
import { SecretOnce } from "@/pages/AppPage";

/** Admin only: the registered apps, and a form to add one (its secret is shown once). */
function Registry() {
  const apps = useQuery(api.apps.list);
  const create = useAction(api.apps.create);
  const [form, setForm] = useState({ name: "", slug: "", siteUrl: "", backendUrl: "" });
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSecret((await create(form)).secret);
      setForm({ name: "", slug: "", siteUrl: "", backendUrl: "" });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof typeof form, label: string, placeholder: string, hint?: string) => (
    <Field>
      <FieldLabel htmlFor={key}>{label}</FieldLabel>
      <Input id={key} placeholder={placeholder} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
      {hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registry</CardTitle>
        <CardDescription>Apps that may call kunji. Only admins see this.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {apps === undefined ? (
          <Spinner />
        ) : (
          apps.length > 0 && (
            <ul className="divide-y text-sm">
              {apps.map((a) => (
                <li key={a._id}>
                  <Link to={`/apps/${a.slug}`} className="flex flex-wrap items-center gap-2 py-2 hover:bg-muted/50 -mx-2 px-2 rounded-md">
                    <span className="font-medium">{a.name}</span>
                    <code className="text-muted-foreground">{a.slug}</code>
                    {!a.enabled && <Badge variant="secondary">Disabled</Badge>}
                    <span className="ml-auto text-muted-foreground">
                      {a.toolCount === null ? "Not fetched" : `${a.toolCount} tool${a.toolCount === 1 ? "" : "s"}`}
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )
        )}

        {secret && <SecretOnce secret={secret} />}

        <form onSubmit={submit}>
          <FieldGroup>
            {field("name", "Name", "Karya")}
            {field("slug", "Slug", "karya", "Lowercase; prefixes the app's tools later.")}
            {field("siteUrl", "Site URL", "https://karya.pknspace.com")}
            {field("backendUrl", "Backend URL", "https://<deployment>.convex.site")}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div>
              <Button type="submit" disabled={busy || !form.name || !form.slug || !form.siteUrl || !form.backendUrl}>
                {busy && <Spinner />} Add app
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

/** Every enabled app with my status (rechecked on open and Refresh) and my on/off switch. */
function Browse() {
  const apps = useQuery(api.myApps.browse);
  const check = useAction(api.myApps.check);
  const setOn = useMutation(api.myApps.setOn);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function recheck() {
    setChecking(true);
    setError(null);
    try {
      await check({});
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setChecking(false);
    }
  }
  // Recheck quietly on open; the cached statuses show meanwhile.
  useEffect(() => {
    check({}).catch(() => undefined);
  }, [check]);

  if (apps === undefined) return <Spinner />;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground">Switch an app off to hide its tools from your AI clients.</p>
        <Button variant="outline" size="sm" className="ml-auto" disabled={checking} onClick={() => void recheck()}>
          {checking ? <Spinner /> : <RefreshCw />} Refresh
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {apps.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">No apps yet.</div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {apps.map((a) => (
            <li key={a.appId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
              <a href={a.siteUrl} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                {a.name}
              </a>
              {a.status === "ok" ? (
                <>
                  <Badge variant="secondary">Connected</Badge>
                  <span className="text-muted-foreground">
                    {a.toolCount} tool{a.toolCount === 1 ? "" : "s"}
                  </span>
                </>
              ) : a.status === "no_account" ? (
                <>
                  <Badge variant="outline">No account</Badge>
                  <a href={a.siteUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    Sign up at {new URL(a.siteUrl).host} →
                  </a>
                </>
              ) : a.status === "not_allowed" ? (
                <Badge variant="outline">Not allowed</Badge>
              ) : a.status === "error" ? (
                <Badge variant="destructive">Unreachable</Badge>
              ) : (
                <span className="text-muted-foreground">Checking…</span>
              )}
              <Switch className="ml-auto" aria-label={`${a.name} on`} checked={a.on} onCheckedChange={(on) => void setOn({ appId: a.appId, on })} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AppsPage() {
  const me = useQuery(api.users.me);
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Apps</h1>
        <p className="text-muted-foreground">The apps whose tools your AI clients can use.</p>
      </div>
      <Browse />
      {me?.isAdmin && <Registry />}
    </div>
  );
}
