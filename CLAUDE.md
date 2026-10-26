# kunji: notes for later sessions

Conventions are in `../CLAUDE.md`; the plan and per-step notes are in `SPEC.md` (read its
Build order first). This file holds what isn't obvious from either.

## Env vars (Convex deployment, `npx convex env set`, add `--prod` for prod)

| Var | What |
|---|---|
| `JWT_PRIVATE_KEY`, `JWKS` | `npm run setup:auth` in `backend/` |
| `SITE_URL` | `http://localhost:5173` dev, `https://kunji.pknspace.com` prod |
| `ALLOWED_EMAILS` | who may use kunji; admins must be in it too |
| `ADMIN_EMAILS` | who manages the app registry |
| `ENCRYPTION_KEY` | 32 bytes base64; AI keys and app secrets. Changing it loses them all |
| `RESEND_API_KEY` | prod only; locally the codes are logged in the `convex dev` output |

An app needs `KUNJI_URL` (kunji's `.convex.site` URL) and `KUNJI_SECRET` on its own deployment.

## Local ports

- kunji's backend normally gets 3210 (API) / 3211 (site, the gateway and HTTP routes). Whichever
  local backend starts second takes 3212/3213, so check `CONVEX_SITE_URL` in each repo's
  `backend/.env.local`. karya currently runs on 3212/3213 and is registered locally with
  backend URL `http://127.0.0.1:3213`; its `KUNJI_URL` is `http://127.0.0.1:3211`.
- Vite takes 5173, or 5174 when another app (e.g. setu) already holds 5173.
- Both backends must be running for the gateway or Try a tool to work locally. `convex dev --once`
  stops its backend when it exits; use a long-running `npm run dev`.

## Registering an app

1. The app implements the App contract (SPEC.md): copy karya's `backend/convex/lib/kunji.ts`,
   add `convex/kunji.ts` with an `access` internalQuery (`findKunjiUser`) and its `tools`, call
   `addKunjiRoutes(http, { tools, access: internal.kunji.access })` in `http.ts`, and copy
   `kunji.test.ts`. The app needs email verification first.
2. In kunji, **Apps** (admin): add name, slug (tool prefix), site URL, backend URL
   (`https://<deployment>.convex.site`, locally `http://127.0.0.1:<site port>`). Copy the
   secret, shown once.
3. On the app's deployment: `npx convex env set KUNJI_SECRET kjs_...` and `KUNJI_URL`.
4. Open the app's page in kunji → **Refresh** → **Try a tool**.

Local and prod registrations are separate rows with separate secrets.

## Gotchas so far

- Find users by email only through the single **verified** row: an unverified sign-up leaves a
  second `users` row with the same email (Convex Auth). kunji's gateway and every app's
  `findKunjiUser` use this rule.
- An app getting email verification needs `migrations:markUsersVerified` run on each deployment,
  or kunji sees its existing users as `no_account`.
- Secrets are stored as a SHA-256 hash (to check calls from apps) plus a ciphertext (to call
  apps); queries never return either. Rotating replaces both, so the app is cut off until its
  `KUNJI_SECRET` is updated.
- Anthropic requests use `anthropic-version: 2026-10-21`, which drops `temperature`.
- OpenAI's `fast`/`smart` model ids are untested (no key locally).
- MCP tool names are `<slug>__<tool>`, not `slug.tool`: Claude's API refuses dots in tool names.
- To test `/mcp` with Claude Code locally without the UI: `npx convex run tokens:insert` with a
  token's SHA-256 (tokens:create needs a signed-in user), then
  `claude mcp add --transport http kunji-local http://127.0.0.1:3211/mcp --header "Authorization: Bearer kj_…"`
  and `claude -p "…" --allowedTools "mcp__kunji-local__*"`.
- Backend tests: convex-test with `fetch` stubbed as the app (`tests/mcp.test.ts`); set
  `ENCRYPTION_KEY` and `ALLOWED_EMAILS` with `vi.stubEnv`.
