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
  - Claude Desktop: `claude_desktop_config.json` with `mcp-remote` passing the Bearer header
  - Cursor / other: JSON config (`url` + `headers`)
  - claude.ai and Claude Desktop **custom connectors**: need OAuth (or no auth); there is no
    field for a Bearer header. Later step (below).
  - Siri: a downloadable Shortcut (dictate → `POST /ask` → speak reply)
- Per-app switch: which apps' tools the person's AI clients can see.

### `/mcp`

- kunji is the only real MCP server (streamable HTTP). It lists tools from the person's enabled
  apps that have a ✔ account, prefixed by app: `picki__pick_random`, `yaad-dila__add_reminder` (MCP allows dots, but
  Claude's API only `[a-zA-Z0-9_-]`; slugs have no `_`, so the first `__` splits).
- A tool call goes to that app's `/kunji/call` with the person's email (App contract).
- The tool list per app is cached (refreshed on admin **Refresh** and every 6 hours by a cron, `backend/convex/crons.ts`).

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

Every enabled app with the person's status, from each app's `/kunji/access`:

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
| `POST /kunji/call` | `{ tool, input, userEmail }` | `{ ok: true, result }` or `{ ok: false, error: { code, message } }` |

- The app finds the user by email in its own users table and runs the tool **as that user**,
  through internal queries/mutations it already has. Its `ALLOWED_EMAILS` check still applies.
- A wrong or missing secret is `401`; a body without `userEmail` (or `tool`) is `400`. Everything
  else is `200`: `error.code` is `no_account`, `not_allowed`, `unknown_tool`, `bad_input` (checked
  against the tool's `inputSchema`) or `tool_error` (a `ConvexError`'s message, else "The tool failed.").
- "The user" is the single **verified** `users` row with that email (none or several → `no_account`),
  and `not_allowed` when that email has left the app's `ALLOWED_EMAILS`. Same rule as kunji's gateway.
- Tool names are snake_case (`^[a-z][a-z0-9_]{0,63}$`); kunji refuses a list that breaks this.
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
| picki | ✔ | `list_lists`, `get_list`, `pick_random`, `add_item` |
| suchi | ✔ | `list_lists`, `add_to_list`, `get_top` |
| panna | ✔ | `read_pad`, `append_to_pad` |
| alp | ✔ | `shorten_url`, `list_links` |
| learn | ✔ | `search_notes`, `get_note`, `add_note`, `append_to_note` |
| drop | ✔ | `send_text` (to my devices), `list_drops`, `get_drop`, `set_drop_pinned` |
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
3. ✔ App registry + app contract + `convex/lib/kunji.ts`; **karya** as the first app (already
   registered, reuses its `KUNJI_SECRET`; add email verification to karya first if missing).
   No other app in this step. Done 2026-10-26, live: kunji prod lists karya's 4 tools and Try a tool
   returns real data. Notes:
   - Registry: each app has an admin page `/apps/:slug` (edit, Disable, Rotate secret, Refresh,
     cached tools, **Try a tool**). Disabling refuses the app's secret at the gateway and stops
     kunji calling it. Renaming the slug renames the tool prefix.
   - kunji's client is `backend/convex/lib/appClient.ts` (typed `AppError`: `unreachable`,
     `timeout`, `unauthorized`, `bad_response`; 10 s, 30 s for calls). `appTools` caches each
     app's list; `toolCalls` logs every call (Try a tool today, `/mcp` later).
   - App side: karya's `backend/convex/lib/kunji.ts` holds `addKunjiRoutes`, `secretMatches`
     (SHA-256 both, then XOR compare), `checkInput` (object, required, primitive types, enums)
     and `findKunjiUser`; the app adds an `access` internalQuery wrapping `findKunjiUser` and a
     `tools` list in `convex/kunji.ts`. Tested with convex-test (`kunji.test.ts`).
   - karya tools (read-only): `list_tickets`, `get_ticket`, `current_focus`, `calibration_summary`,
     built on the helpers the app's own queries use.
   - karya got email verification (`otp.ts`, from `Karya <noreply@send.pknspace.com>`) and a one-off
     `migrations:markUsersVerified` (ran on prod 2026-10-26, 1 user; then removed from the repo).
4. ✔ Browse page, tokens, `/mcp`, Connect page; test with Claude Code.
   Done locally 2026-10-26 (real Claude Code listed karya's tools and called `current_focus` and
   `list_tickets`); live on prod 2026-10-31 (`/mcp` at `https://exciting-echidna-830.convex.site/mcp`). Notes:
   - `/mcp` (`backend/convex/mcp.ts`) follows setu's server: stateless JSON-RPC over POST,
     `initialize`, `ping`, `tools/list`, `tools/call`, batches, notifications → 202, CORS, 401 with
     `WWW-Authenticate: Bearer`. Pure routing/filtering is in `lib/mcp.ts`.
   - Tool names are `<slug>__<tool>`, descriptions prefixed `<App name>: `.
   - Tokens (`tokens.ts`): `kj_` + 32 random bytes, SHA-256 hash + last 4 stored; revoking deletes
     the row; `lastUsedAt` set on every request. A token stops working if its owner leaves
     `ALLOWED_EMAILS`.
   - `userApps` (`myApps.ts`): no row means on and unchecked. Statuses are `ok`, `no_account`,
     `not_allowed` or `error` (app unreachable). Rechecked when Apps opens, on Refresh, and by
     `tools/list` when older than an hour. A `/kunji/call` answering `no_account` / `not_allowed`
     updates the cache.
   - Switched off: hidden from `tools/list`; `tools/call` returns a tool error saying so; the gateway
     answers `app_off` (403).
   - Every `tools/call` that names a known app is logged in `toolCalls` (refused ones as `refused`);
     **Activity** shows the last 100 with their source (`mcp` = AI client, `try` = Try a tool;
     rows before 2026-10-31 have none).
   - `/mcp` allows 30 tool calls a minute per person (all apps, all tokens; every logged call,
     Try a tool included, counts); over it, a tool error.
   - Connect page derives the MCP URL from `VITE_CONVEX_URL` (`.convex.cloud` → `.convex.site`,
     locally port + 1).
   - Backend tests now use convex-test (`backend/vitest.config.mts`, `edge-runtime`), `tests/mcp.test.ts`.
4b. OAuth for `/mcp` (later), so claude.ai and Claude Desktop custom connectors work: they
   support only OAuth (Dynamic Client Registration or Client ID Metadata Documents) or no auth.
   kunji would serve the protected-resource / authorization-server metadata and a consent page
   that issues a token per client.
5. ✔ Other apps, one at a time, each in its own session: email verification + reset by code first
   (`../CLAUDE.md` → Convex, rolled out to every app with accounts, tools or not), then copy
   karya's `lib/kunji.ts`, add the tools from "Which apps get tools" (read-only first; writes
   need my OK), register in kunji locally and on prod, test with Claude Code.
   Order: picki, yaad-dila, note-shote, suchi, panna, alp, learn, drop, setu (its own MCP
   tools move behind the contract; decide whether setu's own `/mcp` stays).
   - picki ✔ (2026-10-31): verification + reset by code; tools `list_lists`, `get_list` (read-only),
     `pick_random` (records the pick, shares `pickFrom` with the Pick button) and `add_item`; a list
     is named by name or slug. Registered locally (`http://127.0.0.1:3215`) and on prod
     (`https://quaint-magpie-360.convex.site`). Notes: the app had no backend tests, so `vitest`,
     `convex-test` and `vitest.config.mts` came from karya; pick errors became `ConvexError`s so
     both kunji and the web UI show their message. Don't read a deployment URL by grepping
     `dist/` for `convex.cloud`: a library holds a `happy-otter-123` placeholder. Use the
     `convex env set --prod` output (it names the deployment) instead.
   - yaad-dila ✔ (2026-10-31): verification + reset by code (mobile sign-in screen, English and Hindi);
     tools `list_upcoming`, `search_reminders` (read-only; the latter added so a model can find a
     reminder's id), `add_reminder`, `snooze_reminder` and `set_reminder_active` (pause/resume, also
     added). Writes share `insertReminder` / `setReminderActive` with the app's own mutations; the
     app's i18n error codes are turned into sentences for the model. Snooze sets the next fire to
     now + N minutes and the fire after it returns to the regular times; it is refused before the
     first notification (a real Claude Code run showed it would pull a future start earlier).
     Registered locally (`http://127.0.0.1:3211`) and on prod (`https://formal-setter-463.convex.site`).
     Notes: the app has no Node types, so `lib/env.ts` reads `process.env` for `otp.ts` and
     `lib/kunji.ts`. `SITE_URL=yaaddila://` broke code emails (Convex Auth strips the trailing `/`
     and can't build the link): now `yaaddila://auth`. Its local backend is anonymous and the CLI
     isn't linked to the project, so `--prod` silently targets local: use the deploy key from
     `backend/.env.prod.local` with `CONVEX_DEPLOYMENT=` empty. `find` in Chrome echoes shown-once
     secrets; copy them with the page's copy button and `pbpaste` instead (prod secret rotated once
     for this). kunji's Rotate / Revoke use `window.confirm`, which freezes Claude in Chrome.
     Voice moved onto the gateway the same day: `voice.parse` (backend) replaces the on-device Gemini
     call and its key in Settings; kunji errors map to app messages (`noAiKey` → "add your key at
     kunji"). The second app on the gateway after karya.
   - note-shote ✔ (2026-10-31): verification + reset by code (web sign-in page and mobile auth form);
     tools `search_notes`, `get_note` (read-only; the latter added so a model can read a note it found),
     `create_note` and `append_to_note`. Writes share `insertNote` / `appendToNote` with `notes.ts`; nothing
     deletes, archives or rewrites text; append refuses trashed notes. `create_note` takes `tags` as a
     comma-separated string of existing tag names (`checkInput` has no arrays) and refuses unknown ones with
     the user's tag list. Registered locally (`http://127.0.0.1:3217`) and on prod
     (`https://decisive-mockingbird-534.convex.site`); real Claude Code ran all four tools locally.
     Notes: with `verify` on, Convex Auth passes the raw `params.email` to the verify provider, which
     stored it untrimmed/uppercase on the user (an existing test caught it): `profile()` now writes the
     normalised email back into `params`. Other apps whose clients don't lowercase should do the same.
     Prod `SITE_URL` was `noteshote://` and became `noteshote://auth` (same as yaad-dila). The app has
     `@types/node` but the mobile typecheck has none, so `lib/env.ts` came along too. Only the app-contract
     half of `lib/kunji.ts` was copied (no gateway client: note-shote has no AI).
   - suchi ✔ (2026-10-31): verification + reset by code (web sign-in page); tools `list_lists`,
     `get_top` (read-only; a list is named by name, ignoring case, or id; follows the list's mode:
     rank, tier then unplaced, or newest first; `include_done`) and `add_to_list` (shares `insertItem`
     with `items.create`: bottom of the ranking / unplaced pile, duplicate titles refused; nothing
     deletes, reorders or edits). Registered locally (`http://127.0.0.1:3217`) and on prod
     (`https://sensible-mosquito-333.convex.site`); real Claude Code ran all three tools locally and the read-only ones on prod.
     Notes: `lib/kunji.ts` and `otp.ts` read `process.env` directly (the web typecheck has Node
     types), so no `lib/env.ts`. Local site ports move with whichever backends are running: suchi
     took 3217, which note-shote's local registration also points at. A `!` command with a `re_...`
     placeholder set note-shote's prod `RESEND_API_KEY` to junk (reset emails failed): give the user
     a script that reads the key from the clipboard, refuses non-`re_` values and never echoes it, and
     check every app's key by length/prefix only.
   - panna ✔ (2026-10-31): verification + reset by code (web sign-in page and mobile auth form, both
     copied from note-shote, whose screens had the same shape); tools `read_pad` (read-only: text, bytes,
     limit, version, last saved) and `append_to_pad` (adds the text on a new line at the end, creating the
     pad if needed; shares `writePad` with `pad.save`, so the version bump and 100 KB limit match the app;
     refuses empty text and anything over the limit; never replaces or clears). Registered locally
     (`http://127.0.0.1:3211`) and on prod (`https://insightful-chickadee-479.convex.site`); real Claude
     Code ran both tools locally, `read_pad` via Try a tool on prod. Notes: the pad is last-write-wins, so an
     append made while the user is typing (within the 500 ms before their save) can be overwritten; the
     tool description says so. The mobile typecheck has no Node types: `lib/env.ts` came from note-shote and
     `allowlist.ts` now uses it too. Prod `SITE_URL` was already `https://panna.pknspace.com`.
   - alp ✔ (2026-10-31): verification + reset by code (web sign-in page and mobile auth form, copied from
     panna: alp's screens matched panna's pre-change files exactly); tools `list_links` (read-only: optional
     `query` on the search index, else newest first; `limit` 1–100, default 20; `more`), `shorten_url`
     (shares `insertLink` with `links.create`: given slug or a random 6-character one; slug/URL error codes
     become sentences) and `set_link_enabled` (by slug, case-sensitive, own links only; returns `changed`).
     Nothing edits a target or deletes a link. Registered locally (`http://127.0.0.1:3213`) and on prod
     (`https://honorable-sparrow-754.convex.site`); real Claude Code ran all three tools locally, `list_links`
     via Try a tool on prod. Notes: Convex search ORs words, so a test expecting only exact matches failed.
     `find` in Chrome echoed the prod secret again: rotated at once and set from the clipboard after
     locating the copy button with `getBoundingClientRect` (JS-clicking it wouldn't reach the clipboard).
     Never use `find`/`read_page` on a page showing a secret. Prod `SITE_URL` was already `https://alp.pknspace.com`.
   - learn ✔ (2026-10-31): verification + reset by code (web sign-in page, learn's own look with suchi's steps);
     tools `search_notes`, `get_note` (read-only), `add_note` and `append_to_note`. The notes are one shared tree
     (public reads), so the tools see every page; kunji still needs a verified, allowlisted user. Search uses two
     new search indexes (page titles, then page text) and returns each page's path, a snippet and its link;
     `get_note` cuts at 100,000 characters. `add_note` creates a page in an existing topic/section named by path
     (`React / Hooks`, never creates sections); `append_to_note` adds after a blank line. Writes share
     `insertNode` / `writePage` with `nodes.create` / `nodes.save`; nothing renames, moves or deletes, and an
     append is lost if the page is open with unsaved edits (description says so). Registered locally
     (`http://127.0.0.1:3213`) and on prod (`https://usable-orca-255.convex.site`); real Claude Code ran all four
     tools locally, `search_notes` and `get_note` via Try a tool on prod. Notes: learn's local backend was still
     *linked*; converted to `anonymous-learn` first. It had no backend tests: vitest, convex-test and
     `test.helpers.ts` came from suchi. Claude in Chrome's screenshot frame isn't always CSS pixels (locally
     ×1.097, so clicks at `getBoundingClientRect` coordinates missed the copy button): calibrate with a capture-phase
     click listener that logs `clientX/Y`, and wrap `navigator.clipboard.writeText` to record only whether it was
     called with a `kjs_` value, before reading the clipboard. Prod `SITE_URL` was already `https://learn.pknspace.com`.
   - drop ✔ (2026-10-31): verification + reset by code (web sign-in page, drop's own card with learn's steps);
     tools `list_drops` (read-only: ready drops newest first, optional `kind`, `limit` 1–50; text preview or file
     name/size/type), `get_drop` (read-only: a whole text, or a file's 24-hour download link signed with the existing
     `lib/tickets.ts`; `blobstore/` untouched, the file itself is never returned), `send_text` (shares `insertText`
     with `drops.addText`, device "AI (kunji)", same empty / 100,000-character limits) and `set_drop_pinned` (shares
     `setDropPinned` with `drops.setPinned`, so unpinning restarts the 7-day clock; returns `changed`). Nothing
     deletes drops or uploads files; other users' drops and unfinished uploads look like missing ids. Registered
     locally (`http://127.0.0.1:3213`) and on prod (`https://wary-mule-895.convex.site`); real Claude Code ran all
     four tools locally, `list_drops` and `get_drop` via Try a tool on prod. Notes: drop's local backend was still
     *linked*; converted to `anonymous-drop` first (it was empty). Backend tests already used vitest; convex-test was
     added. Screenshot frame was again ×1.097 locally and 1:1 on prod. Prod `SITE_URL` was already
     `https://drop.pknspace.com`.
   - setu ✔ (2026-10-31, the last app in the order): verification + reset by code (web sign-in page in setu's
     own look); its own MCP tools moved behind the contract with the same names and results: `list_projects`,
     `list_folders`, `search_endpoints`, `get_endpoint`, `list_changes`, all read-only (queries moved from `mcp.ts`
     into `lib/tools.ts`). A call runs as the verified user's `members` rows, with their role per project; only
     owners may pass `include_hidden`. **setu's own `/mcp` was removed**, with personal `setu_pat_…` tokens (the
     `/account` page and `tokens` table) and guest `setu_guest_…` MCP keys (`guests.mcpTokenHash`); guests keep
     their docs link but get no AI access, since kunji needs a verified account. Prod rows cleared first by a
     one-off migration (2 tokens, 4 guest keys), then the table and field dropped. Registered locally
     (`http://127.0.0.1:3213`) and on prod (`https://dependable-dachshund-59.convex.site`); real Claude Code ran all
     five tools locally, all five via Try a tool on prod. Notes: setu's local backend was still *linked*;
     converted to `anonymous-setu` (data kept). Screenshot frame ×1.057 locally this time, 1:1 on prod. Prod
     `SITE_URL` was already `https://setu.pknspace.com`.
   - Not yet: tools in the gateway's `tools` field are passed to the model, but kunji doesn't
     run them; `/ask` (step 6) is the first place kunji runs tools for a model.

Also left (small, any time):
- Activity: no paging past the last 100.
- Usage: no per-day view of tool calls (only AI calls).
- Gateway streaming (Server-Sent Events).
- Claude Desktop `mcp-remote` snippet is untested.
6. `/ask` + Siri Shortcut.
7. Android voice app later.

## Decided

- Providers: Anthropic, OpenAI, Gemini, Groq and Custom OpenAI-compatible, all in the first version.
- Gateway: one common shape for all providers (above).
- Tokens never expire; revoked by hand.
