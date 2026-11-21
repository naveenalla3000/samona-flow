# samonaflow

samonaFlow is a financial management SaaS platform for freelancers and independent professionals. The foundation includes the application scaffold, architecture folders, a health-check API, configuration, and Supabase email/password authentication with Prisma profile synchronization. No business features (onboarding, customers, invoices, etc.) are implemented yet.

## Technology stack

- Next.js (App Router) with TypeScript in strict mode
- Tailwind CSS
- ESLint
- Supabase: `@supabase/supabase-js` and `@supabase/ssr`
- Prisma ORM (`prisma`, `@prisma/client`) with PostgreSQL
- Zod for validation
- React Hook Form with `@hookform/resolvers`
- lucide-react for icons

## Installation

```bash
npm install
```

## Development commands

```bash
npm run dev        # start the dev server on http://localhost:3000
npm run build      # production build
npm run lint       # ESLint
npx tsc --noEmit   # TypeScript type check
```

## Database (Supabase PostgreSQL)

The database is PostgreSQL hosted on Supabase, accessed through Prisma 7.10.1 with the `prisma-client` generator.

- Prisma config lives in `prisma.config.ts` at the project root. It loads `.env` via dotenv.
- The generated client is written to `src/generated/prisma`. This folder is git-ignored, so run `npx prisma generate` after a fresh clone.
- The Prisma CLI (migrate, validate, studio) connects using `DIRECT_URL`.
- The runtime app connects using `DATABASE_URL` through the `@prisma/adapter-pg` driver adapter, configured in `src/lib/prisma.ts`.

## Environment variables

Copy the template to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Purpose | Exposure |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Browser-exposed (`NEXT_PUBLIC_` prefix) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key | Browser-exposed (`NEXT_PUBLIC_` prefix) |
| `NEXT_PUBLIC_APP_URL` | Public origin of this app, used for absolute Supabase redirect URLs | Browser-exposed (`NEXT_PUBLIC_` prefix) |
| `DATABASE_URL` | PostgreSQL connection string used by Prisma at runtime | Server-only |
| `DIRECT_URL` | Direct PostgreSQL connection string used by Prisma for migrations | Server-only |

Never add `NEXT_PUBLIC_` to database credentials or to a Supabase service-role key, and never import them into client components. Only `NEXT_PUBLIC_*` values may be exposed to the browser; `DATABASE_URL` and `DIRECT_URL` must never be used in client code. Environment files such as `.env`, `.env.local` and `.env*.local` are git-ignored and must never be committed; only `.env.example` is tracked.

Where to get the connection strings: Supabase Dashboard > Project Settings > Database > Connection string.

- `DATABASE_URL`: choose "Transaction pooler" (port 6543).
- `DIRECT_URL`: choose "Direct connection" (`db.[PROJECT-REF].supabase.co`, port 5432) or "Session pooler".
- Append `?sslmode=require` to both strings.
- Replace the password placeholder with the database password from Project Settings > Database. If the password is lost, reset it there.

Example placeholders (not real values):

```bash
DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require"
DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?sslmode=require"
```

There is deliberately **no** Supabase service-role key. The anon key is public, and all privileged work runs through server-only code.

## Supabase Auth

### Dashboard configuration

1. **Authentication > Providers > Email**: keep the Email provider enabled.
2. **Authentication > Providers > Email > Confirm email**: enable it. Signup then requires the user to click the verification link before a session or `UserProfile` is created.
3. **Authentication > URL Configuration**:
   - **Site URL**: `http://localhost:3000` locally, and the production origin in production.
   - **Redirect URLs** (allow list) — add both local and production forms:
     - `http://localhost:3000/auth/callback`
     - `https://your-domain.example/auth/callback`
   - Supabase only redirects to URLs matching this allow list; `NEXT_PUBLIC_APP_URL` must therefore match one of them.
4. Optionally set the auth email template's confirmation link to point at your domain if you use a custom SMTP setup.

`NEXT_PUBLIC_APP_URL` must be a full origin (scheme + host, no trailing path). It defaults to `http://localhost:3000` when unset.

### Files

```
src/lib/supabase/
  client.ts        browser client (anon key only)
  server.ts        per-request server client using Next.js cookies
  middleware.ts    session refresh + response cookie/cache-header handling
  env.ts           runtime validation of public Supabase env vars
src/proxy.ts                    Next.js 16 proxy (renamed middleware): refresh + route redirects
src/server/auth/
  actions.ts                    signInAction, signUpAction, signOutAction ("use server")
  get-current-user.ts           server-side getUser() verification
  require-auth.ts               redirecting guard for pages
  api-auth.ts                   requireApiUser(): 401 guard for Route Handlers
  verify-token.ts               stateless bearer-token verification
  identity.ts / auth-types.ts / auth-errors.ts / profile-sync.ts
src/lib/auth/safe-redirect.ts   open-redirect protection for `next`
src/lib/validations/auth.ts     shared Zod login/signup schemas
src/app/(auth)/
  login/, signup/               forms (loading, validation, password toggle)
  auth/callback/route.ts        PKCE/email-verification exchange
src/components/auth/            shared form controls
```

### Authentication flow

1. **Signup**: the form is validated with the shared Zod schema on the client and again in the Server Function. Supabase sends a verification email to `NEXT_PUBLIC_APP_URL/auth/callback?next=...`. While verification is pending, **no** `UserProfile` is created and no business records are created.
2. **Callback**: the `code` is exchanged for a session. Only after Supabase confirms the user's email is an idempotent `UserProfile.upsert` performed, using the Supabase Auth UUID as `UserProfile.id`. The user is redirected to a validated local `next` path.
3. **Login**: credentials are verified by Supabase; the session is written to secure cookies, the profile is re-synced (idempotently), and the user is redirected to a validated local path. Invalid credentials and unconfirmed emails produce friendly, generic errors.
4. **Session refresh**: `src/proxy.ts` runs `getUser()` on each matched request, refreshes cookies, and applies the anti-caching headers required by `@supabase/ssr`. It also redirects unauthenticated visitors away from `/dashboard` and authenticated visitors away from `/login` and `/signup`.
5. **Logout**: `supabase.auth.signOut()` clears the session; the user is redirected to `/login`.

Cookies are `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` in production. No token or password is ever logged.

### Protecting APIs

The proxy is **not** an authorization boundary for APIs. Call the guard inside each protected Route Handler:

```ts
import { requireApiUser } from "@/server/auth/api-auth";

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if (!auth.ok) return auth.response; // 401 JSON
  // auth.user.id is the verified Supabase UUID — never read a user id from
  // params/body for identity.
}
```

`requireApiUser` accepts either `Authorization: Bearer <access_token>` (verified with `getUser(token)`) or the SSR session cookie. Business/tenant authorization is intentionally not implemented yet.

### Local testing

```bash
cp .env.example .env      # fill in Supabase URL and anon key
npm run dev
```

1. Visit `http://localhost:3000/signup` and create an account with a real inbox.
2. Confirm the email using the Supabase verification link (it must resolve to `/auth/callback`).
3. You should land on `/dashboard`; verify `UserProfile` has a row with the same UUID as `auth.users`.
4. Reload `/dashboard` to confirm session persistence, then sign out and confirm `/dashboard` redirects to `/login`.
5. Request a protected API without a session to confirm a `401` response.

With Cache Components enabled, the auth pages and `/dashboard` export `instant = false` because the session read happens at request time. Streaming/suspense-based static shells can be adopted later without changing the auth logic.

## Connection pooling

- The transaction pooler (Supavisor, port 6543) multiplexes many short-lived connections and suits the serverless/Next.js runtime. It does not support prepared statements or session-level features, so the app runtime goes through the `@prisma/adapter-pg` adapter.
- Migrations and the Prisma CLI use the direct or session connection (`DIRECT_URL`), because schema changes need a persistent session.

## Prisma commands

```bash
npx prisma validate            # validate the schema
npx prisma generate            # generate the client into src/generated/prisma
npx prisma migrate dev --name <name>   # local development: create and apply a migration
npx prisma migrate deploy      # production/CI: apply committed migrations only
npx prisma migrate status      # show applied and pending migrations
npx prisma studio              # browse the database in a browser
```

## Migration workflow

- Make schema changes in `prisma/schema.prisma`, then run `npx prisma migrate dev --name <name>` locally. Commit the new migration folder under `prisma/migrations/`.
- In production and CI, run `npx prisma migrate deploy`. It applies committed migrations only.
- Never use `prisma db push` as a substitute for migrations.
- Never reset the database or drop tables.
- Keep `prisma/migrations/` in version control.
- Do not modify existing Supabase tables outside a migration.

## Local database verification

1. Start the dev server: `npm run dev`.
2. Call `GET /api/v1/health`.
3. When the database answers `SELECT 1`, the response is HTTP 200 with `{ success, status: "ok", database: "connected", timestamp }`. Otherwise it is HTTP 503 with `database: "unavailable"`.

Server-side logs show `[health] database check failed` with only the error name and code, never the connection string.

## Architecture

Request flow:

```
Route Handler -> Controller -> Service -> Repository -> Prisma -> PostgreSQL
```

- Modular monolith. All REST endpoints live under the `/api/v1` prefix.
- Route Handlers (`src/app/api/v1/...`) only parse the request and delegate. Business logic must not live in route handlers.
- Controllers, services, repositories, middleware and utilities live in `src/server/`.
- Shared validation schemas live in `src/lib/validations/`; configuration in `src/lib/config/`.

Folder map (`src/`):

```
app/
  (auth)/          login, signup, and auth/callback (route group)
  (dashboard)/     authenticated dashboard pages (route group)
  api/v1/          REST API route handlers (health check at api/v1/health)
  layout.tsx
  page.tsx
proxy.ts           Next.js 16 session refresh and route redirects
components/
  auth/            authentication form controls
  ui/              generic UI primitives
  shared/          shared composite components
modules/           feature modules (empty for now)
lib/
  auth/            redirect URL sanitization
  config/          configuration
  supabase/        browser, server, and proxy Supabase clients
  utils/           generic helpers
  validations/     Zod schemas
server/
  auth/            session verification, guards, actions, profile sync
  controllers/     request handling logic called by route handlers
  services/        business logic
  repositories/    data access (Prisma)
  middleware/      server-side middleware helpers
  utils/           server-only helpers
types/             shared TypeScript types
styles/            additional styles
```

## Health check

`GET /api/v1/health` returns `{ success, status, database, timestamp }`. See [Local database verification](#local-database-verification).
