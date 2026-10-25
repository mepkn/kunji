import { useState, type FormEvent } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { ArrowDown, ArrowUp, CheckCircle2, XCircle } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/errors";
import { maskKey, move, PROVIDERS } from "@/lib/keys";

type Status = { ok: true } | { ok: false; error: string } | null;
type SavedKey = NonNullable<ReturnType<typeof useQuery<typeof api.aiKeys.list>>>[number];

function StatusLine({ status }: { status: Status }) {
  if (!status) return null;
  return (
    <p className={`flex items-center gap-1.5 text-sm ${status.ok ? "text-primary" : "text-destructive"}`} role="status">
      {status.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
      {status.ok ? "Key works." : status.error}
    </p>
  );
}

/** Runs one action at a time and keeps its result for the status line. */
function useRunner() {
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  async function run(kind: string, fn: () => Promise<Status | void>): Promise<Status | void> {
    setBusy(kind);
    setStatus(null);
    try {
      const result = await fn();
      if (result) setStatus(result);
      return result;
    } catch (err) {
      setStatus({ ok: false, error: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }
  return { busy, status, setStatus, run };
}

/** A saved key: masked, with Test and Remove. */
function SavedRow({ k, index, count, onMove }: { k: SavedKey; index: number; count: number; onMove: (step: -1 | 1) => void }) {
  const testSaved = useAction(api.aiKeys.testSaved);
  const remove = useMutation(api.aiKeys.remove);
  const { busy, status, run } = useRunner();
  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{k.label}</span>
        {index === 0 ? <Badge>Preferred</Badge> : <Badge variant="secondary">Fallback {index}</Badge>}
        <code className="text-sm text-muted-foreground">{maskKey(k.provider, k.last4)}</code>
        {k.baseUrl && <span className="text-xs text-muted-foreground truncate">{k.baseUrl} · {k.model}</span>}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Move down" disabled={index === count - 1} onClick={() => onMove(1)}>
            <ArrowDown />
          </Button>
          <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void run("test", () => testSaved({ provider: k.provider }))}>
            {busy === "test" && <Spinner />} Test
          </Button>
          <Button variant="destructive" size="sm" disabled={busy !== null} onClick={() => void run("remove", () => remove({ provider: k.provider }))}>
            Remove
          </Button>
        </div>
      </div>
      <StatusLine status={status} />
    </li>
  );
}

/** Paste → Test → Save for one provider. The key goes to Convex once and never comes back. */
function AddKey({ saved }: { saved: SavedKey[] }) {
  const testNew = useAction(api.aiKeys.testNew);
  const save = useAction(api.aiKeys.save);
  const { busy, status, setStatus, run } = useRunner();
  const [provider, setProvider] = useState<string>("anthropic");
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const custom = provider === "custom";
  const info = PROVIDERS.find((p) => p.id === provider);
  const args = { provider, key, ...(custom ? { name, baseUrl, model } : {}) };
  const ready = key.trim() !== "" && (!custom || (name.trim() !== "" && baseUrl.trim() !== "" && model.trim() !== ""));
  const replacing = !custom && saved.some((s) => s.provider === provider);

  function submit(e: FormEvent) {
    e.preventDefault();
    void run("save", async () => {
      const result = await save(args);
      if (result.ok) {
        setKey("");
        setName("");
        setBaseUrl("");
        setModel("");
      }
      return result;
    });
  }

  const select = "h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm";
  return (
    <form onSubmit={submit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="provider">Provider</FieldLabel>
          <select
            id="provider"
            className={select}
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value);
              setStatus(null);
            }}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            <option value="custom">Custom (OpenAI-compatible)</option>
          </select>
        </Field>
        {custom && (
          <>
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input id="name" placeholder="OpenRouter" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="baseUrl">Base URL</FieldLabel>
              <Input id="baseUrl" placeholder="https://openrouter.ai/api/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
              <FieldDescription>The part before /chat/completions.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="model">Model</FieldLabel>
              <Input id="model" placeholder="mistralai/mistral-small" value={model} onChange={(e) => setModel(e.target.value)} />
              <FieldDescription>Used for both "fast" and "smart" requests.</FieldDescription>
            </Field>
          </>
        )}
        <Field>
          <FieldLabel htmlFor="key">API key</FieldLabel>
          <Input
            id="key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={info ? `${info.prefix}…` : ""}
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setStatus(null);
            }}
          />
          <FieldDescription>
            {info && (
              <>
                Get one at{" "}
                <a href={info.url} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                  {new URL(info.url).host}
                </a>
                .{" "}
              </>
            )}
            It is encrypted before it is stored{replacing ? " and replaces the saved one" : ""}.
          </FieldDescription>
        </Field>
        <StatusLine status={status} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={!ready || busy !== null} onClick={() => void run("test", () => testNew(args))}>
            {busy === "test" && <Spinner />} Test key
          </Button>
          <Button type="submit" disabled={!ready || busy !== null}>
            {busy === "save" && <Spinner />} Test &amp; save
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function KeysPage() {
  const keys = useQuery(api.aiKeys.list);
  const setOrder = useMutation(api.aiKeys.setOrder);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">AI keys</h1>
        <p className="text-muted-foreground">
          Your own keys. Apps that use AI call kunji, which uses your preferred key and falls back to the next one if it fails. Keys never leave kunji's
          server.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Saved keys</CardTitle>
          <CardDescription>Tried top to bottom.</CardDescription>
        </CardHeader>
        <CardContent>
          {keys === undefined ? (
            <Spinner />
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No keys yet. Apps will ask you to add one here.</p>
          ) : (
            <ul className="divide-y">
              {keys.map((k, i) => (
                <SavedRow
                  key={k.provider}
                  k={k}
                  index={i}
                  count={keys.length}
                  onMove={(step) => void setOrder({ order: move(keys.map((x) => x.provider), i, step) })}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add a key</CardTitle>
          <CardDescription>Anthropic, OpenAI, Gemini, Groq, or any OpenAI-compatible API.</CardDescription>
        </CardHeader>
        <CardContent>
          <AddKey saved={keys ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
