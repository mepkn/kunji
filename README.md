# Kunji

One place to connect your accounts in my apps to AI: save your own AI keys once, create one MCP
token, and Claude, Siri or any other AI client can use every app you have an account in.
See [SPEC.md](SPEC.md) for the full design and build order.

## Features

- Sign-in with email + password; sign-up needs a 6-digit code sent by email, and "Forgot
  password?" resets it with a code too. Only emails in `ALLOWED_EMAILS` can sign up or sign in.
- Admins (`ADMIN_EMAILS`) will manage the app registry.
- Three sections, still empty: **AI keys**, **Connect** (tokens and client setup) and **Apps**.

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
| `backend/`: `npm run check` | Typecheck and lint `convex/` and `scripts/` |
| `web/`: `npm run dev` | Dev server at http://localhost:5173 |
| `web/`: `npm run build` | Typecheck and production build into `web/dist/` |
| `web/`: `npm run check` | Typecheck, lint and tests (Vitest: sign-in error messages) |
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
  in `backend/`), `SITE_URL=https://kunji.pknspace.com`, `ALLOWED_EMAILS`, `ADMIN_EMAILS` and
  `RESEND_API_KEY`.

- `backend/convex/`: `auth.ts` + `otp.ts` (sign-in, email codes), `users.ts` (`me`: email and
  admin flag), `lib/allowlist.ts` and `lib/access.ts`, `schema.ts` (auth tables only so far).
- `web/` is the Vite app; it imports the backend as `@convex/...` and reads `backend/.env.local`.
  `src/pages/SignInPage.tsx` runs the sign-in / sign-up / code / reset steps;
  `src/components/Shell.tsx` is the signed-in layout with `/keys`, `/connect` and `/apps`.
