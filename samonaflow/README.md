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

## Environment setup

Copy the template and fill in the values:

```bash
cp .env.example .env.local
```

| Variable | Purpose | Exposure |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Browser-exposed (`NEXT_PUBLIC_` prefix) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key | Browser-exposed (`NEXT_PUBLIC_` prefix) |
| `DATABASE_URL` | PostgreSQL connection string used by Prisma at runtime | Server-only |
| `DIRECT_URL` | Direct PostgreSQL connection string used by Prisma for migrations | Server-only |

Never add `NEXT_PUBLIC_` to database credentials or to a Supabase service-role key, and never import them into client components. Environment files such as `.env`, `.env.local` and `.env*.local` are git-ignored; only `.env.example` is tracked.

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

`GET /api/v1/health` returns `{ success, message, timestamp }`.
