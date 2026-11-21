# samonaflow

samonaFlow is a financial management SaaS platform for freelancers and independent professionals. The project is currently only the foundation: the application scaffold, architecture folders, a health-check API, and configuration. No business features are implemented yet.

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
  (auth)/          authentication pages (route group)
  (dashboard)/     authenticated dashboard pages (route group)
  api/v1/          REST API route handlers (health check at api/v1/health)
  layout.tsx
  page.tsx
components/
  ui/              generic UI primitives
  shared/          shared composite components
modules/           feature modules (empty for now)
lib/
  config/          configuration
  utils/           generic helpers
  validations/     Zod schemas
server/
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
