import { useState, type FormEvent } from "react";
import { useAction, useQuery } from "convex/react";
import { Copy } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/errors";

/** Admin only: register an app and show its secret once. The full Apps section is build step 3. */
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
                <li key={a._id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="font-medium">{a.name}</span>
                  <code className="text-muted-foreground">{a.slug}</code>
                  {!a.enabled && <Badge variant="secondary">Disabled</Badge>}
                  <a href={a.siteUrl} target="_blank" rel="noreferrer" className="ml-auto text-primary underline-offset-4 hover:underline">
                    {new URL(a.siteUrl).host}
                  </a>
                </li>
              ))}
            </ul>
          )
        )}

        {secret && (
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
        )}

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

export function AppsPage() {
  const me = useQuery(api.users.me);
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Apps</h1>
        <p className="text-muted-foreground">The apps whose tools your AI clients can use.</p>
      </div>
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">Nothing here yet.</div>
      {me?.isAdmin && <Registry />}
    </div>
  );
}
