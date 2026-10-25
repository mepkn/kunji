# kunji: spec

kunji ("key") is the one place where a person connects their accounts in my apps to AI. They save
their own AI keys once, create one MCP token, and Claude, Siri or any other AI client can then
use every app they have an account in. The apps hold no AI keys and have no AI settings or
"Connect AI" buttons: they serve plain HTTP endpoints for their tools, and kunji does the rest.

Not a showcase: dash lists every project for visitors; kunji lists only apps that have tools,
for the people who use them. The two lists are separate on purpose.

## Why it exists

- Apps that use AI each keep their own keys and key settings (karya today: Gemini/Groq,
  per user, encrypted). Every new AI feature would repeat that.
- Each app with MCP would need its own server, tokens and setup snippet, and users would add
  15 servers to Claude.
- Voice (Siri Shortcuts, Android) needs one plain HTTP endpoint, not one per app.

## Stack and layout

Follows `../CLAUDE.md`: `backend/` (Convex + Convex Auth) and `web/` (Vite + React 19 + TS +
Tailwind v4 + shadcn/ui on Base UI + React Router), `scripts/check.sh`, `scripts/deploy.sh`.
Copy the structure from **picki**; copy key encryption and the AI provider clients from
**karya** (`backend/convex/aiKeys.ts`, `lib/gemini.ts`, `lib/groq.ts`). Deployed at
`https://kunji.pknspace.com`. Everything runs on Convex (HTTP actions); the VPS serves `web/dist` only.

## Accounts

- Convex Auth Password provider with **email verification at sign-up** (6-digit code via Resend,
  `RESEND_API_KEY`, from `Kunji <noreply@send.pknspace.com>`), password sign-in, code-based password reset. See `../CLAUDE.md` → Convex.
  This matters more here than anywhere: the email is what links a person across all apps.
- `ALLOWED_EMAILS` like every app, checked in `profile()` and on every request.
- Admin: the emails in `ADMIN_EMAILS` (just me) can manage the app registry.

## 1. AI keys (per user)

- A person saves their own key per provider: Anthropic, OpenAI, Gemini, Groq, and **Custom**
  (any OpenAI-compatible API: name + base URL + key, e.g. OpenRouter, Mistral, DeepSeek, a
  local Ollama behind a tunnel). Keys are encrypted with AES-GCM using `ENCRYPTION_KEY`
  (Convex env only), decrypted only inside actions, never returned: the UI shows
  `sk-ant-…F3x9`, a **Test** button and **Remove**.
- Optional preferred provider and fallback order (karya's behaviour).
- **No fallback to my key**: a person with no key saved gets "no key", and the app shows
  "Add your AI key at kunji.pknspace.com". Can be added later as a small daily allowance.
- Usage page: calls and tokens per app per day (`aiCalls` table), from their own key.

### Gateway

Apps call kunji server to server, never from the browser:

```
POST https://<kunji>.convex.site/ai/v1/generate
Authorization: Bearer <app secret>
{ "userEmail": "friend@gmail.com", "provider": "auto", "model": "…", "messages": [...], ... }
```

- kunji checks the app secret, finds the user by email, checks the user allows that app, picks
  their key (preferred provider, then fallback), calls the provider and returns the reply.
- Provider errors pass through as typed errors: `no_key`, `key_refused`, `rate_limited`,
  `provider_error`, so apps can show a clear message.
- Per-user, per-app rate limit (like karya's `aiCalls`).
- **One common shape for every provider**, kunji's own, so apps never change when a person
  switches provider:

  ```
  request:  { userEmail, provider?: "auto" | "<id>", model?: "fast" | "smart" | "<exact id>",
              system?, messages: [{ role: "user" | "assistant", content }],
              tools?, json?: <JSON Schema>, maxTokens?, temperature? }
  response: { text, json?, toolCalls?, provider, model, usage: { inputTokens, outputTokens } }
  ```

  `model: "fast" | "smart"` maps to a sensible model per provider (kept in kunji, updated
  without touching apps); an exact id is passed through.
- Two adapters behind it, since providers speak one of two dialects:
  - **OpenAI-compatible** (Chat Completions): OpenAI, Groq, Gemini (its OpenAI-compatible
    endpoint), and every Custom provider. One client, different base URL and key.
  - **Anthropic** (native Messages API). Anthropic also offers an OpenAI-compatible layer, but
    it is meant for testing and drops features, so use the native API.
- Streaming later, same shape as server-sent events. Apps use a small copied client
  (`kunjiAi.generate(...)`).

## 2. MCP and voice (per user)

- A person creates a **token** (`kj_…`, shown once, stored hashed) and can revoke it. One token is
  enough; allow several, named ("laptop", "phone"). Tokens **never expire**; they are revoked by
  hand. The token list shows "last used" so unused ones are easy to spot.
- **Connect page** with tabs and copyable snippets:
  - Claude Code: `claude mcp add --transport http kunji https://<kunji>/mcp --header "Authorization: Bearer kj_…"`
  - Claude Desktop / claude.ai: connector URL + token
  - Cursor / other: JSON config
  - Siri: a downloadable Shortcut (dictate → `POST /ask` → speak reply)
- Per-app switch: which apps' tools the person's AI clients can see.

### `/mcp`

- kunji is the only real MCP server (streamable HTTP). It lists tools from the person's enabled
  apps that have a ✔ account, prefixed by app: `picki.pick_random`, `yaad-dila.add_reminder`.
- A tool call goes to that app's `/tools/call` with the person's email (below).
- The tool list per app is cached (refreshed on admin **Refresh** and every few hours).

### `/ask` (voice and anything that can send one request)

```
POST https://<kunji>/ask
Authorization: Bearer kj_…
{ "text": "remind me to pay rent on the 1st" }
→ { "reply": "Reminder set: pay rent, 1st of every month." }
```

kunji sends the text with the person's enabled tools to their AI key, runs the tool calls the
model asks for (at most a few rounds), and returns a short spoken-style reply. Needs both an AI
key and at least one connected app. Android: a small Expo app (voice button, widget) on the same
endpoint, later; Google Assistant has no open third-party path today.

## 3. Apps

### Browse (everyone)

Every registered app with the person's status, from each app's `/tools/access`:

```
✔ Karya      connected      4 tools   [on]
✖ Note-shote no account     Sign up at note-shote.pknspace.com →
✖ Alp        not allowed
```

kunji never creates accounts in apps. Signing up stays inside each app, under its own rules.

### Registry (admin)

An app entry: name, slug (tool prefix), icon, site URL, backend URL (`https://<deployment>.convex.site`),
secret (generated by kunji, shown once, set by me as `KUNJI_SECRET` on that app's Convex
deployment). Stored in kunji's database, so adding an app needs no kunji redeploy. **Rotate
secret** and **Disable** per app.

## App contract

Each app with tools adds routes to its own `backend/convex/http.ts`. No MCP library, no new
server. All three require `Authorization: Bearer <KUNJI_SECRET>` (constant-time compare).

| Route | Body | Returns |
|---|---|---|
| `GET /kunji/tools` | | `[{ name, description, inputSchema }]` (JSON Schema) |
| `POST /kunji/access` | `{ userEmail }` | `{ status: "ok" \| "no_account" \| "not_allowed" }` |
| `POST /kunji/call` | `{ tool, input, userEmail }` | `{ ok: true, result }` or `{ ok: false, error }` |

- The app finds the user by email in its own users table and runs the tool **as that user**,
  through internal queries/mutations it already has. Its `ALLOWED_EMAILS` check still applies.
- Results are small JSON; kunji turns them into MCP content.
- A shared helper (`convex/lib/kunji.ts`: auth check, route wiring, tool registry) is copied
  between apps, like the shadcn setup. The first app (karya) is its reference; karya's
  `lib/kunji.ts` already holds the gateway client, so the tool helpers join it there.
- Apps that use AI call the kunji gateway with the same secret instead of holding keys.

## Which apps get tools

Rule: a cloud backend, a server that can read the data (not end-to-end encrypted), and
something worth asking for.

| App | Tools | First tools |
|---|---|---|
| yaad-dila | ✔ later | `add_reminder`, `list_upcoming`, `snooze_reminder` |
| note-shote | ✔ later | `create_note`, `search_notes`, `append_to_note` |
| picki | ✔ later | `list_lists`, `pick_random`, `add_item` |
| suchi | ✔ | `list_lists`, `add_to_list`, `get_top` |
| panna | ✔ | `read_pad`, `append_to_pad` |
| alp | ✔ | `shorten_url`, `list_links` |
| learn | ✔ | `search_notes`, `add_note` |
| drop | ✔ | `send_text` (to my devices) |
| setu | ✔ | its existing MCP tools moved behind the contract |
| karya | ✔ **first app (reference)**, first gateway user | proposed from its code at step 3; read-only first, writes / Jira / AI need my OK |
| niji, pralekh | ✖ | end-to-end encrypted: the server cannot read the data, by design |
| dash, class, syntax-party | ✖ | showcase / live classroom / reference content |
| Desktop apps, static apps | ✖ | no cloud backend |

## Security

- kunji is the master key to every connected account, so: email verification at sign-up,
  tokens and app secrets stored hashed (app secrets kunji must send are encrypted instead),
  AI keys encrypted, nothing secret ever returned to the browser.
- A token acts only as its owner, only on that person's enabled, connected apps.
- Each app trusts kunji only through its own `KUNJI_SECRET`; rotating one app's secret
  doesn't touch the others.
- Log every tool call (person, app, tool, time, ok/error) for a per-person **Activity** page.

## Data model (Convex)

| Table | Fields |
|---|---|
| `users` (+ auth tables) | email |
| `aiKeys` | userId, provider, name? + baseUrl? (Custom), encryptedKey, last4, createdAt |
| `aiPrefs` | userId, preferred, fallback |
| `aiCalls` | userId, appId, provider, model, inputTokens, outputTokens, at |
| `mcpTokens` | userId, name, tokenHash, last4, createdAt, lastUsedAt |
| `apps` | slug, name, icon, siteUrl, backendUrl, encryptedSecret, secretHash, enabled |
| `appTools` | appId, tools (cached JSON), fetchedAt |
| `userApps` | userId, appId, enabled, status, checkedAt |
| `toolCalls` | userId, appId, tool, ok, error, at |

## Build order

1. ✔ Scaffold (picki layout), auth with email verification, `ALLOWED_EMAILS`, deploy.
   Done 2026-10-25, live at https://kunji.pknspace.com (prod Convex `exciting-echidna-830`). Notes:
   - picki has no email verification, so `backend/convex/otp.ts` (`ResendOTP`, `ResendOTPReset`)
     is new here and calls Resend's API with `fetch` (no `resend` package). Without
     `RESEND_API_KEY` the code is logged instead, so local dev needs no Resend key.
   - `ADMIN_EMAILS` gates `requireAdmin` (`lib/access.ts`); `users.me` returns `{ email, isAdmin }`.
     An admin must also be in `ALLOWED_EMAILS`.
   - Shell routes: `/keys`, `/connect`, `/apps` (empty pages); sign-in is shown when signed out.
2. ✔ AI keys page (port karya's encryption and providers) + gateway; move karya onto it.
   Done 2026-10-25, live: the gateway is `https://exciting-echidna-830.convex.site/ai/v1/generate`
   and karya (prod `avid-dove-133`) runs on it. Notes:
   - Providers and the `fast` / `smart` models live in `backend/convex/lib/providers.ts`
     (Anthropic `claude-haiku-5-5` / `claude-sonnet-5-5`, OpenAI `gpt-5-mini` / `gpt-5`, Gemini
     `gemini-3.1-flash-lite` / `gemini-3-flash-preview`, Groq `openai/gpt-oss-20b` / `-120b`).
     OpenAI's ids are untested: no OpenAI key was available locally.
   - Both adapters use `fetch`, no SDKs (`lib/gateway.ts`). Anthropic: native Messages API,
     `anthropic-version: 2026-10-21` (so `temperature` is dropped), `json` via structured outputs.
     OpenAI-compatible: `json` via `json_schema`, except Groq and Custom, which get `json_object`
     plus the schema in the system prompt (karya's proven Groq path).
   - A Custom key also stores the **model** to use (one model for both aliases); its id is
     `custom:<slug of name>`, so several Custom providers can coexist.
   - The `aiKeys` rows are the try order's source; `aiPrefs` holds the order (first = preferred).
     The page orders keys with up/down arrows rather than separate preferred/fallback fields.
   - Errors: also `unauthorized` (bad app secret, 401) and `bad_request` (400). `no_key` (403) covers
     no kunji account, no key saved, or the requested provider not saved. All saved keys are
     tried in order; the first failure's code is returned with every message joined. A busy
     (5xx / timeout) `fast` model is retried once on `smart`, since Gemini Flash-Lite often 503s.
   - Rate limit: 20 calls a minute per person per app. `aiCalls` rows are kept for Usage
     (UTC days, last 30), with `error` set on failed calls.
   - App registry: `apps` table and an admin-only form on **Apps**; the secret (`kjs_…`) is shown
     once, stored as SHA-256 hash (lookup) + ciphertext (for step 3). No rotate/disable UI yet.
   - Not yet: the per-user "allows this app" check (needs `userApps`, steps 3–4), streaming.
   - The gateway accepts only a user whose email is verified, and only if exactly one such row
     exists (Convex Auth's own linking rule): an unverified sign-up leaves a second `users` row
     with the same email.
   - karya: `lib/kunji.ts` client (`KUNJI_URL`, `KUNJI_SECRET`), AI keys gone from Settings.
     A one-off `clearAiKeys` migration removed the old keys and `aiCalls` rows on prod
     (2026-10-25); the fields, the table and the migration were then removed from karya.
3. App registry + app contract + `convex/lib/kunji.ts`; **karya** as the first app (already
   registered, reuses its `KUNJI_SECRET`; add email verification to karya first if missing).
   No other app in this step.
4. Browse page, tokens, `/mcp`, Connect page; test with Claude Code.
5. Other apps, later and one at a time (picki, yaad-dila, note-shote, ...), each copying
   karya's `lib/kunji.ts` and getting email verification first.
6. `/ask` + Siri Shortcut.
7. Android voice app later.

## Decided

- Providers: Anthropic, OpenAI, Gemini, Groq and Custom OpenAI-compatible, all in the first version.
- Gateway: one common shape for all providers (above).
- Tokens never expire; revoked by hand.
