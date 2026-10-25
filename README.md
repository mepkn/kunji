# Kunji

One place to connect your accounts in my apps to AI: save your own AI keys once, create one MCP
token, and Claude, Siri or any other AI client can use every app you have an account in.
See [SPEC.md](SPEC.md) for the full design and build order.

## Features

- Sign-in with email + password; sign-up needs a 6-digit code sent by email, and "Forgot
  password?" resets it with a code too. Only emails in `ALLOWED_EMAILS` can sign up or sign in.
- **AI keys**: save your own key for Anthropic, OpenAI, Gemini, Groq or any OpenAI-compatible API
  (name + base URL + model). Each key is tested before it is saved, stored encrypted and shown
  only as `sk-ant-…F3x9`; reorder them to set the preferred provider and fallback order.
- **AI gateway**: apps call `POST /ai/v1/generate` server to server with their secret and the
  person's email, and kunji answers with that person's own key in one common shape for every
  provider. Karya is the first app on it.
- **Usage**: calls and tokens per app per day.
- **Apps**: admins (`ADMIN_EMAILS`) register an app and get its secret, shown once; each app's
  page edits it, disables it, rotates its secret, refreshes its cached tools and has a **Try a
  tool** box that runs a tool as you. **Connect** is still empty.

## Stack

React 19 · TypeScript · Vite · Tailwind CSS v4 · shadcn/ui (Base UI) · React Router · Convex · Convex Auth · Resend · Vitest.

## Development

Requires Node 22.18+ (`.nvmrc` pins 22). Dev runs on a local Convex backend
(`local-praveen_nirmalkar-kunji`), never a cloud dev deployment. Without `RESEND_API_KEY` the
email codes are only logged in the `npm run dev` output.

```bash
cd backend
npm install
npm run dev                  # starts the local backend and pushes convex/ (keep it running)
npm run setup:auth           # first time only: auth signing keys
npx convex env set SITE_URL http://localhost:5173
npx convex env set ALLOWED_EMAILS you@example.com
npx convex env set ADMIN_EMAILS you@example.com
openssl rand -base64 32 | xargs npx convex env set ENCRYPTION_KEY   # encrypts AI keys and app secrets

cd ../web
npm install
npm run dev                  # web app at http://localhost:5173
```

## Scripts

| Command | What it does |
|---|---|
| `backend/`: `npm run dev` | Local Convex backend; pushes `convex/` on every change |
| `backend/`: `npm run deploy` | Push the functions to production (`scripts/deploy.sh` does this for you) |
| `backend/`: `npm run setup:auth` | Auth signing keys (`node scripts/setup-auth-keys.ts --apply --prod` for production) |
| `backend/`: `npm run test` | Vitest: encryption, the gateway's request/response mapping and errors |
| `backend/`: `npm run check` | Typecheck, lint and tests |
| `web/`: `npm run dev` | Dev server at http://localhost:5173 |
| `web/`: `npm run build` | Typecheck and production build into `web/dist/` |
| `web/`: `npm run check` | Typecheck, lint and tests (Vitest: sign-in error messages, key masking) |
| `scripts/check.sh` | Both checks; run before committing |
| `scripts/deploy.sh` | Checks, deploys Convex to production, builds and uploads to the VPS |
| `DRY_RUN=1 scripts/deploy.sh` | Same, but only previews: nothing is deployed or uploaded |

## Deployment

`scripts/deploy.sh` deploys `backend/convex/` to the production deployment, builds the site with
that deployment's URL, and syncs `web/dist/` to `/var/www/kunji` on the VPS. Settings live in each
part's `.env.prod.local` (git-ignored, see the `.env.example` next to each): `backend/.env.prod.local`
has `CONVEX_DEPLOY_KEY`, and `web/.env.prod.local` has `DEPLOY_HOST` / `DEPLOY_PORT` / `DEPLOY_DIR`.
Create the deploy key in `backend/`:

```bash
npx convex deployment token create kunji-deploy --deployment praveen-nirmalkar:kunji:production --save-env .env.prod.local
```

Routes like `/apps` are client-side, so Caddy needs an SPA fallback:

```
try_files {path} /index.html
```

## How it works

- Auth is Convex Auth (Password) with `verify: ResendOTP` and `reset: ResendOTPReset`
  (`backend/convex/otp.ts`), sending codes from `Kunji <noreply@send.pknspace.com>`. The email
  is what links a person across all apps, so it must be verified.
- `ALLOWED_EMAILS` is checked in `profile()` at sign-up/sign-in and again on every request
  (`backend/convex/lib/access.ts`), so removing an email cuts off existing sessions.
  `requireAdmin` also checks `ADMIN_EMAILS`.
- Production env vars: `JWT_PRIVATE_KEY`/`JWKS` (`node scripts/setup-auth-keys.ts --apply --prod`
  in `backend/`), `SITE_URL=https://kunji.pknspace.com`, `ALLOWED_EMAILS`, `ADMIN_EMAILS`,
  `RESEND_API_KEY` and `ENCRYPTION_KEY` (32 random bytes, base64; changing it makes saved keys
  and app secrets unreadable).

### AI keys and the gateway

- Keys are AES-GCM encrypted with `ENCRYPTION_KEY` (`lib/crypto.ts`, ported from karya) and
  decrypted only inside actions; queries return the provider and last 4 characters.
- `POST https://<deployment>.convex.site/ai/v1/generate` with `Authorization: Bearer <app secret>`:

  ```
  request:  { userEmail, provider?: "auto" | "<id>", model?: "fast" | "smart" | "<exact id>",
              system?, messages: [{ role: "user" | "assistant", content }],
              tools?, json?: <JSON Schema>, maxTokens?, temperature? }
  response: { text, json?, toolCalls?, provider, model, usage: { inputTokens, outputTokens } }
  error:    { error: { code, message } }   code: unauthorized | bad_request | no_key |
                                           key_refused | rate_limited | provider_error
  ```

  The secret is looked up by its SHA-256 hash, the person by email (and `ALLOWED_EMAILS`). Their
  keys are tried in their order; any failure moves to the next key, and when all fail the first
  error's code is returned. A busy (5xx or timeout) `fast` model is retried once on `smart`.
  No key saved, or no kunji account, is `no_key`: "Add your AI key at kunji.pknspace.com".
- 20 calls a minute per person per app; every call is a row in `aiCalls` (the Usage page).
- `lib/providers.ts` names every provider and the `fast` / `smart` models; change models there.
  `lib/gateway.ts` has the two adapters: OpenAI-compatible Chat Completions (OpenAI, Groq,
  Gemini's OpenAI endpoint, Custom) and Anthropic's native Messages API (structured outputs for
  `json`, `anthropic-version: 2026-10-21`, so `temperature` is not sent).
- An app's secret (`kjs_…`) comes from the admin form on **Apps**; set it on the app's Convex
  deployment as `KUNJI_SECRET`, with `KUNJI_URL` = kunji's `.convex.site` URL.

### Calling apps

- `lib/appClient.ts` calls an app's `GET /kunji/tools`, `POST /kunji/access` and
  `POST /kunji/call` with the decrypted secret (10 s timeout, 30 s for calls). Transport
  failures are `AppError`s: `unreachable`, `timeout`, `unauthorized` (the app refused the
  secret), `bad_response`. A tool's own failure comes back as `{ ok: false, error: { code, message } }`.
- **Refresh** stores the tool list in `appTools` (a failed refresh keeps the old list and shows
  the error). **Try a tool** runs as the admin's own email and logs a `toolCalls` row.

### Code map

- `backend/convex/`: `auth.ts` + `otp.ts` (sign-in, email codes), `users.ts` (`me`: email and
  admin flag), `lib/allowlist.ts`, `lib/access.ts` and `lib/actionAuth.ts`, `schema.ts`.
  `aiKeys.ts` (list/test/save/remove keys, order), `gateway.ts` (the HTTP action, rate limit),
  `apps.ts` (registry, refresh, try a tool), `usage.ts`; `lib/appClient.ts`, `lib/crypto.ts` + `lib/secrets.ts`, `lib/providers.ts`,
  `lib/gateway.ts`. Tests in `backend/tests/`.
- `web/` is the Vite app; it imports the backend as `@convex/...` and reads `backend/.env.local`.
  `src/pages/SignInPage.tsx` runs the sign-in / sign-up / code / reset steps;
  `src/components/Shell.tsx` is the signed-in layout with `/keys` (`KeysPage`), `/usage`,
  `/connect`, `/apps` (`AppsPage`, with the admin registry) and `/apps/:slug` (`AppPage`, admin).
