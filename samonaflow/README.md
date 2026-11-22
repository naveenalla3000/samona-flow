# samonaflow

SamonaFlow is a financial management SaaS platform for freelancers and independent professionals. It covers the full money workflow: onboarding and multiple business workspaces, customers, invoices, payments and reversals, expenses, reminders, a financial dashboard, cash-flow forecasting, what-if simulations and smart alerts. Every module has a REST API, server-side tenant authorization, and a server-rendered dashboard UI backed by PostgreSQL.

The product is a modular monolith built on Next.js App Router, TypeScript in strict mode, Prisma and Supabase. Money is stored and calculated as fixed-point decimals (PostgreSQL `Decimal(12, 2)`, JavaScript `BigInt` minor units); no financial calculation uses floating point.

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
npm ci
```

The `postinstall` script runs `npx prisma generate` automatically, so the git-ignored client is generated after a fresh clone or install. Run `npx prisma generate` manually whenever you change `prisma/schema.prisma`.

## Development commands

```bash
npm run dev        # start the dev server on http://localhost:3000
npm run build      # production build
npm run lint       # ESLint
npm test           # node:test unit/integration tests
npx tsc --noEmit   # TypeScript type check
npm run db:seed-demo  # create the labelled demo dataset (see Demo dataset)
```

## Database (Supabase PostgreSQL)

The database is PostgreSQL hosted on Supabase, accessed through Prisma 7.10.1 with the `prisma-client` generator.

- Prisma config lives in `prisma.config.ts` at the project root. It loads `.env` via dotenv.
- The generated client is written to `src/generated/prisma`. This folder is git-ignored; `npm ci` regenerates it via `postinstall`, and `npx prisma generate` regenerates it after schema changes.
- The Prisma CLI (migrate, validate, studio) connects using `DIRECT_URL`.
- The runtime app connects using `DATABASE_URL` through the `@prisma/adapter-pg` driver adapter, configured in `src/lib/prisma.ts`.

## Environment variables

Copy the template to `.env.local` (recommended by Next.js) or `.env`:

```bash
cp .env.example .env.local
```

Next.js loads `.env.local` before `.env`, so either works locally. The demo seed script loads both, preferring `.env.local`. Both files are git-ignored; only `.env.example` is tracked.

| Variable | Purpose | Exposure |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Browser-exposed (`NEXT_PUBLIC_` prefix) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key | Browser-exposed (`NEXT_PUBLIC_` prefix) |
| `NEXT_PUBLIC_APP_URL` | Public origin of this app, used for absolute Supabase redirect URLs | Browser-exposed (`NEXT_PUBLIC_` prefix) |
| `DATABASE_URL` | PostgreSQL connection string used by Prisma at runtime | Server-only |
| `DIRECT_URL` | Direct PostgreSQL connection string used by Prisma for migrations | Server-only |
| `DEMO_USER_EMAIL` | Optional, seed-time only: the already-registered account that should own the demo business | Never read by the app at runtime |

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
4. **Session refresh**: `src/proxy.ts` runs `getUser()` on each matched request, refreshes cookies, and applies the anti-caching headers required by `@supabase/ssr`. It also redirects unauthenticated visitors away from `/dashboard` and `/onboarding`, and authenticated visitors away from `/login` and `/signup`.
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

`requireApiUser` accepts either `Authorization: Bearer <access_token>` (verified with `getUser(token)`) or the SSR session cookie.

Business/tenant authorization is performed in the service layer. See [Customer Management](#customer-management) for the pattern: the verified user id is used to look up a `BusinessMembership` for the requested `businessId`, and every repository query is then scoped by that verified `businessId`. A `customerId` is never sufficient on its own.

### Local testing

```bash
cp .env.example .env.local   # fill in Supabase URL, anon key and database URLs
npm run dev
```

1. Visit `http://localhost:3000/signup` and create an account with a real inbox.
2. Confirm the email using the Supabase verification link (it must resolve to `/auth/callback`).
3. You should land on `/onboarding`; create your first business. Verify `UserProfile` has a row with the same UUID as `auth.users`, and the business has an `OWNER` membership.
4. You should then reach `/dashboard`. Reload it to confirm session persistence, then sign out and confirm `/dashboard` redirects to `/login`.
5. Open `/dashboard/settings`, change a non-financial setting, and confirm the change survives a reload. Add a second business from `/onboarding` and switch between businesses from the header.
6. Request a protected API without a session to confirm a `401` response.

With Cache Components enabled, the auth pages and `/dashboard` export `instant = false` because the session read happens at request time. Streaming/suspense-based static shells can be adopted later without changing the auth logic.

## Businesses, onboarding and settings

A `Business` row is the tenant boundary. A user may own or belong to more than one business; every other record (customers, invoices, payments, expenses, reminders, alerts, forecasts) carries a `businessId` and is only reachable through a verified `BusinessMembership`.

### Routes and flows

| Route | Purpose |
| --- | --- |
| `/onboarding` | Create the first business after signup, or add another business later |
| `/dashboard` | Dashboard for the active business; redirects to `/onboarding` when the user has none |
| `/dashboard/settings` | Profile, currency, timezone and opening-balance settings |

Business management intentionally uses **Server Actions** rather than a REST API. The UI is the only client. The actions resolve the user from the verified session and never accept a user id or owner id from the form.

### Creation and ownership

`businessService.create` calls `businessRepository.createForOwner` inside one database transaction:

1. Upsert the signed-in user's `UserProfile` (resilience if a profile sync was missed).
2. Insert the `Business` with `ownerId` taken from the verified session.
3. Insert the matching `BusinessMembership` with role `OWNER`.

A failure in any step rolls the whole transaction back, so a business can never exist without an owner membership. The new business becomes active immediately.

### Active business switching

The active business is stored in the `samonaflow_active_business` cookie. The cookie contains **only a business id**:

- `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production, one-year expiry.
- On every resolution, `resolveCurrentBusiness` validates the UUID and re-checks a `BusinessMembership` for `(verifiedUserId, businessId)`.
- A forged, stale or removed membership id is ignored; the resolver falls back to the user's first membership.
- Switching re-verifies membership before writing the cookie.
- The cookie is never used as an authorization claim and is never trusted on its own.

### Settings rules

- Only the `OWNER` role (and the matching `Business.ownerId`) may update settings.
- `currency` may be changed only while the business has no invoices, payments or expenses. Existing invoices snapshot their currency, and expenses have no currency column, so changing it later would silently reinterpret historical amounts. The UI states this lock and the service enforces it with `CURRENCY_LOCKED`.
- `timezone` changes are allowed; they affect business-local overdue checks, reminder follow-up dates and forecast dates going forward.
- `openingBalance` is a manual starting cash position and may be negative. It is a decimal string, never a floating-point number.
- Changing `openingBalanceDate` changes which cash movements are included in the forecast. The UI warns that this is a starting position, not a live bank balance.

### Implementation files

```
src/lib/validations/business.ts                     create/update Zod schemas
src/types/business.ts                               BusinessRecord, BusinessSummary
src/types/business-form.ts                          form state
src/server/repositories/business-repository.ts      transactional create, owner-scoped update
src/server/services/business-service.ts             membership/role/currency rules
src/server/auth/active-business.ts                  httpOnly active-business cookie
src/server/auth/require-business.ts                 cookie + membership resolution
src/server/actions/business-actions.ts              create, update, switch Server Actions
src/components/business/business-form.tsx           React Hook Form + useActionState
src/components/business/business-switcher.tsx       active-business selector
src/components/business/dashboard-nav.tsx           shared module navigation
src/app/(onboarding)/onboarding/page.tsx            onboarding UI
src/app/(dashboard)/layout.tsx                      authenticated shell + switcher
src/app/(dashboard)/dashboard/settings/page.tsx     settings UI
```

### PRD/schema notes

- The schema has no separate settings table; currency, timezone and opening balance are fields on `Business`, matching PRD table 8.1.
- Business creation is not exposed as a public API because the product flow is UI-only. If an API is added later, it must reuse `businessService` so the transactional owner membership and currency rules cannot be bypassed.
- Deleting a business is not offered in the UI. Financial child rows use `onDelete: Restrict`, preserving history.

## Customer Management

Implements PRD FR-03 for the current business. Customer fields are exactly the PRD/schema fields: `name` (required, max 200 characters), `email`, `phone`, `companyName`, `address`, `notes` (all optional). `id`, `businessId`, `archivedAt`, `createdAt` and `updatedAt` are server-owned. At least one contact field is recommended in the UI but not mandatory.

### REST API

Base path: `/api/v1/businesses/:businessId/customers`

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/` | Create a customer (201) |
| `GET` | `/` | Paginated customer list |
| `GET` | `/:customerId` | Customer profile with financial summary and invoice history |
| `PATCH` | `/:customerId` | Update customer details |
| `PATCH` | `/:customerId/archive` | Set `archivedAt`; keeps the row and all financial history |

`GET /` query parameters: `page` (default 1), `pageSize` (default 20, max 100), `search` (case-insensitive match on name, email, phone and company name), `status` (`active` | `archived` | `all`, default `active`), `sort` (`name` | `companyName` | `createdAt` | `updatedAt`, default `name`), `direction` (`asc` | `desc`, default `asc`).

Response formats:

```json
{ "success": true, "data": { "customer": { "...": "..." } } }
```

```json
{
  "success": false,
  "error": {
    "code": "invalid_request | unauthenticated | business_forbidden | customer_not_found | internal_error",
    "message": "Human-readable message",
    "fieldErrors": { "name": "Customer name is required" }
  }
}
```

Every endpoint requires a verified session (`Authorization: Bearer <token>` or SSR cookie), then verifies a `BusinessMembership` row for `(verifiedUserId, businessId)`. All reads and writes pass that verified `businessId` to the repository, so a guessed `customerId` from another business returns 404 rather than the record. Path parameters and all request bodies/query strings are validated with Zod.

### Data integrity

- There is no DELETE endpoint. Customers are archived by setting `archivedAt` only.
- `Invoice.customer` and `Reminder.customer` use `onDelete: Restrict`, so hard deletion cannot break financial history.
- The detail response derives totals from issued invoices and their non-reversed payments. `DRAFT` and `VOID` invoices are excluded from totals but kept in the invoice history. `OVERDUE` counts use the stored status, since the business timezone is not available here.
- The PRD specifies no duplicate-customer rule and the schema has no unique constraint on name/email/phone, so duplicate customers are allowed by design.

### UI

| Route | Purpose |
| --- | --- |
| `/dashboard/customers` | Searchable, sortable, paginated list with empty/loading states |
| `/dashboard/customers/new` | Add-customer form (React Hook Form + Zod) |
| `/dashboard/customers/[customerId]` | Profile, derived financial summary, invoice history, archive action |
| `/dashboard/customers/[customerId]/edit` | Edit form |

The UI resolves the business from the signed-in user's membership on the server (`resolveCurrentBusiness`); no client-provided business id is trusted. Server Actions call the same authorization service as the REST API. Pages export `instant = false` because they read request-time session/database data.

### Implementation files

```
src/lib/validations/customer.ts                       request schemas
src/types/customer.ts, customer-form.ts                shared shapes
src/server/repositories/customer-repository.ts         scoped Prisma queries
src/server/repositories/business-membership-repository.ts
src/server/services/customer-service.ts                authorization + business logic
src/server/controllers/customer-controller.ts          parsing + response mapping
src/server/controllers/customer-api.ts                 real auth/service wiring
src/server/actions/customer-actions.ts                 UI Server Actions
src/app/api/v1/businesses/[businessId]/customers/...   REST route handlers
src/app/(dashboard)/dashboard/customers/...            UI pages (/dashboard/customers)
src/components/customers/...                           UI components
tests/                                                 node:test suite (`npm test`)
```

### PRD/schema notes

No schema or migration change was needed. Minor documentation differences were observed and left unchanged: PRD Section 8.1 lists `VARCHAR` and generic `TIMESTAMP` types while the schema (and the data dictionary) uses `TEXT` and `Timestamptz(6)`; FR-03's field list omits the server-owned columns. PRD Section 14 marks "Customer financial summaries" as P1, but FR-03 and the Customer Details screen require them, so they are derived in the detail response without adding schema fields.

## Invoice Management

Implements PRD FR-04 for the current business. Invoices are created as drafts, edited only while drafts, then moved through a conservative lifecycle with explicit `send` and `void` actions. Payment entry, reminders, dashboard analytics, PDF generation and public payment links are intentionally out of scope.

### REST API

Base path: `/api/v1/businesses/:businessId/invoices` (nested under the verified business). The PRD's flat `/api/v1/invoices` is not used because the nested path makes tenant scope explicit at the route boundary.

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/` | Create a draft invoice (201) |
| `GET` | `/` | Paginated, searchable invoice list |
| `GET` | `/:invoiceId` | Invoice detail with items, customer and payment-derived amounts |
| `PATCH` | `/:invoiceId` | Replace draft header fields and the complete item array |
| `POST` | `/:invoiceId/send` | `DRAFT → SENT` |
| `POST` | `/:invoiceId/void` | `SENT` / `PARTIALLY_PAID` / `OVERDUE → VOID` |

`GET /` query parameters: `page` (default 1), `pageSize` (default 20, max 100), `search` (invoice number, customer name/company or notes), `status` (`DRAFT` | `SENT` | `PARTIALLY_PAID` | `PAID` | `OVERDUE` | `VOID` | `all`, default `all`), `customerId`, `fromDate`, `toDate` (both issue dates), `sort` (`issueDate` | `dueDate` | `invoiceNumber` | `totalAmount` | `createdAt` | `status`, default `issueDate`), `direction` (`asc` | `desc`, default `desc`).

Create body fields: `customerId`, `issueDate`, `dueDate`, optional `currency` (defaults to the business currency), optional `notes`, `discount`, `tax`, and at least one `items[]` entry with `description`, `quantity` and `unitPrice`. PATCH accepts those fields except that `items` is always required and represents the complete desired item set. `subtotal`, `lineTotal` and `totalAmount` are never accepted from a client and are stripped by Zod if supplied.

```json
{ "success": true, "data": { "invoice": { "...": "..." } } }
```

```json
{
  "success": false,
  "error": {
    "code": "invalid_request | unauthenticated | business_forbidden | customer_not_found | invoice_not_found | invalid_transition | invoice_locked | conflict | internal_error",
    "message": "Human-readable message",
    "fieldErrors": { "items.0.quantity": "Quantity must be greater than zero" }
  }
}
```

Every endpoint first requires a verified session, then verifies a `BusinessMembership` row for `(verifiedUserId, businessId)`. All queries and mutations pass that verified `businessId` to the repository. A guessed `invoiceId` or a `customerId` from another business returns `404`, never the foreign record. Path ids, request bodies and query strings are validated with Zod.

### Lifecycle

| From | Action | To | Notes |
| --- | --- | --- | --- |
| `DRAFT` | `PATCH` | `DRAFT` | Only editable state; items are replaced atomically |
| `DRAFT` | `send` | `SENT` | The invoice becomes locked |
| `SENT`, `PARTIALLY_PAID`, `OVERDUE` | `void` | `VOID` | Financial history is preserved |
| `PAID` | — | — | Cannot be edited, sent again or voided |
| `VOID` | — | — | Terminal; no un-void path |

`PARTIALLY_PAID` and `PAID` are payment-derived statuses and are never set by this module. `OVERDUE` is a display derivation from the business timezone: a stored `SENT` or `PARTIALLY_PAID` invoice with an outstanding balance and a past-due date is shown as `OVERDUE` without mutating the stored status.

### Calculations and numbering

- Money is accepted as decimal strings (never JS numbers), normalized to exactly two decimal places, and calculated on the server as exact integer minor units. At the persistence boundary every authoritative value is converted to `Prisma.Decimal` with `ROUND_HALF_UP`, matching the applied database CHECKs. Responses return canonical 2dp strings so JSON never loses precision.
- Rounding rule: each line total is rounded to 2dp (`ROUND(qty × unitPrice, 2)`) before it is added to the subtotal. `subtotal = Σ lineTotals`, `total = subtotal − discount + tax`. `discount ≤ subtotal` and all totals must be non-negative. Maximum supported amount is `9999999999.99` (`Decimal(12,2)`).
- `currency` is snapshotted at creation. When omitted, the business currency is used. It can change only while the invoice is `DRAFT`.
- `amountPaid` is the sum of non-reversed payments. `outstandingAmount = total − amountPaid`. Reversed payments are excluded but retained as history.
- Invoice numbers are `INV-<YYYY>-<NNNN>`, scoped per business and issue year. Creation and number generation run in a transaction; a unique-constraint violation triggers a retry so concurrent creates cannot produce duplicate numbers.
- Validation also enforces `dueDate ≥ issueDate` because the applied migration intentionally omits `chk_invoices_due_after_issue`.

### UI

| Route | Purpose |
| --- | --- |
| `/dashboard/invoices` | Searchable, sortable, filterable, paginated list with empty and error states |
| `/dashboard/invoices/new` | Draft form with dynamic line items and a non-authoritative live estimate |
| `/dashboard/invoices/[invoiceId]` | Detail with items, totals, derived status and lifecycle actions |
| `/dashboard/invoices/[invoiceId]/edit` | Draft-only edit form |
| `/dashboard/invoices/[invoiceId]/preview` | Print-optimized document; browser print dialog saves as PDF |

Pages export `instant = false` because they read request-time session/database data. A route-level loading skeleton and error boundary cover pending and unexpected states. The business is resolved server-side from the signed-in user's membership; Server Actions call the same authorization service as the REST API.

### Implementation files

```
src/lib/invoice-math.ts                          fixed-point money helpers
src/lib/invoice-numbering.ts                     per-business number helpers
src/lib/invoice-status.ts                        lifecycle + overdue derivation
src/lib/business-date.ts                         business-local date helpers
src/lib/validations/invoice.ts                   Zod request schemas
src/types/invoice.ts, invoice-form.ts            shared shapes
src/server/repositories/invoice-repository.ts    scoped Prisma queries + transactions
src/server/services/invoice-service.ts           authorization + business rules
src/server/controllers/invoice-controller.ts     parsing + response mapping
src/server/controllers/invoice-api.ts             real auth/service wiring
src/server/actions/invoice-actions.ts            UI Server Actions
src/server/utils/invoice-decimal.ts              Prisma.Decimal persistence bridge
src/app/api/v1/businesses/[businessId]/invoices/... REST route handlers
src/app/(dashboard)/dashboard/invoices/...       UI pages (/dashboard/invoices)
src/components/invoices/...                      UI components
tests/invoice-*.test.ts                          node:test coverage (`npm test`)
```

### PRD/schema notes

No schema or migration change was needed. Documented divergences: the API uses the nested tenant path instead of the PRD's flat route; the outstanding formula follows the schema/customer-module definition (`total − (payments − reversals)`) rather than the PRD's simpler `total − payments`; PDF generation and public payment links are marked P1 in the PRD and are not implemented—the preview page provides print/save-as-PDF only. The schema comment mentions a pending DB trigger for currency immutability after issue; that trigger is not applied, so the rule is enforced in the service. Public token fields remain unused because no public-link endpoints are in scope.

## Payment Management

Implements PRD FR-05 for the current business. Payments are append-only receipts against an issued invoice; corrections are made with an explicit, auditable reversal rather than by editing or deleting the original record. Multiple partial payments are supported. No schema or migration change was needed—the existing `Payment` and `PaymentReversal` models already encode the required composite tenant keys, one-reversal-per-payment uniqueness, reason, actor and timestamp.

### REST API

All paths are nested under the verified business so tenant scope is explicit at the route boundary.

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/v1/businesses/:businessId/payments` | Record a payment (201) |
| `GET` | `/api/v1/businesses/:businessId/payments` | Paginated, filtered business-wide payment history |
| `GET` | `/api/v1/businesses/:businessId/payments/:paymentId` | Payment detail with invoice balance and reversal record |
| `GET` | `/api/v1/businesses/:businessId/invoices/:invoiceId/payments` | Payment history for one invoice |
| `POST` | `/api/v1/businesses/:businessId/payments/:paymentId/reverse` | Append a reversal (200) |

List query parameters: `page` (default 1), `pageSize` (default 20, max 100), `search` (invoice number, customer name/company, reference or notes), `status` (`all` | `RECORDED` | `REVERSED`, default `all`), `method` (`UPI` | `BANK_TRANSFER` | `CASH` | `OTHER`), `invoiceId`, `customerId`, `fromDate`, `toDate` (both payment dates), `sort` (`paymentDate` | `amount` | `createdAt`, default `paymentDate`), `direction` (`asc` | `desc`, default `desc`).

Record body: `invoiceId`, `amount`, `paymentDate`, `method`, optional `transactionReference` and `notes`. Reversal body: `reason` (3–1000 characters). Amounts are decimal strings only; `amountPaid`, `outstandingAmount`, `status`, `currency` and `reversal` are server-derived and stripped from client input. Every endpoint requires a verified session plus a `BusinessMembership` for `(userId, businessId)`; a guessed payment/invoice id from another business returns `404`, never the foreign record. Path ids, bodies and queries are validated with Zod and errors use the standard envelope (`invalid_request`, `unauthenticated`, `business_forbidden`, `invoice_not_found`, `payment_not_found`, `payment_exceeds_outstanding`, `payment_already_reversed`, `invoice_locked`, `conflict`, `internal_error`).

### Payment and reversal rules

- Payments can be recorded only against `SENT`, `PARTIALLY_PAID` or `OVERDUE` invoices. Draft, void and fully paid invoices are locked; overpayment is rejected with `422`.
- `amount` must be positive, at most two decimal places and within `Decimal(12,2)`. Reversals require a reason and are appended with the authenticated session user as actor and a server timestamp.
- One reversal per payment: a second reversal returns `409`. There is no delete, edit, undo or replacement-payment path; a correction is a new payment.
- Reversals are allowed on active and `PAID` invoices but not on void invoices (which would effectively reopen them). Reversing restores the outstanding balance and can move `PAID → PARTIALLY_PAID` or `PARTIALLY_PAID → SENT`.
- Payment date is stored as a date; currency is the invoice's immutable snapshot (the `Payment` model has no currency column). Effective paid totals exclude reversed payments, which remain visible in history marked "Reversed".

### Calculations and concurrency

- All money math reuses the exact integer-minor-unit helpers from `src/lib/payment-math.ts`; inputs/outputs are canonical 2dp strings and amounts are persisted through `Prisma.Decimal`. No JavaScript floating-point operation touches a financial value.
- `amountPaid = Σ active payments`, `outstanding = total − amountPaid`, and the invoice status (`PARTIALLY_PAID`/`PAID`, with `SENT`/`OVERDUE` as fallbacks) is derived from effective receipts. `OVERDUE` remains a display-only derivation from the business timezone.
- Record and reverse run in a transaction that locks the relevant invoice/payment rows (`SELECT … FOR UPDATE`), re-reads balances and re-checks the business rules before writing. Two concurrent payments cannot spend the same balance, and a concurrent reversal cannot be duplicated (the unique index on `PaymentReversal.paymentId` is the final guard). A serialization conflict is surfaced as a retryable error. Client-trusted balances and statuses are never accepted.

### UI

| Route | Purpose |
| --- | --- |
| `/dashboard/payments` | Business-wide payment history with search, status/method/date filters, sorting and pagination |
| `/dashboard/payments/[paymentId]` | Payment detail, invoice balance, reversal record and explicit reversal confirmation with required reason |
| `/dashboard/invoices/[invoiceId]` | Embedded record-payment form and payment history when the invoice is recordable |

Pages export `instant = false` and resolve the business server-side; Server Actions call the same authorization service as the REST API. Loading and error states cover pending/unexpected conditions. Reversal uses a confirmation dialog and clearly warns that the action is permanent.

### Implementation files

```
src/lib/payment-math.ts                            exact active-total/balance/status helpers
src/lib/payment-status.ts                          recordable/reversible status rules + methods
src/lib/validations/payment.ts                     Zod request/query schemas
src/types/payment.ts, payment-form.ts              shared shapes
src/server/repositories/payment-repository.ts      scoped Prisma queries + row-locking transactions
src/server/services/payment-service.ts             authorization + business rules
src/server/controllers/payment-controller.ts       parsing + response mapping (injectable)
src/server/controllers/payment-api.ts               real auth/service wiring
src/server/actions/payment-actions.ts              UI Server Actions
src/app/api/v1/businesses/[businessId]/payments/... REST route handlers
src/app/(dashboard)/dashboard/payments/...         UI pages (/dashboard/payments)
src/components/payments/...                        UI components
tests/payment-*.test.ts                            node:test coverage (`npm test`)
```

### PRD/schema notes

No schema or migration change was needed and applied migrations were not edited. The PRD defines payment fields and supported methods but no reversal workflow or overpayment handling, so this module adds an explicit append-only reversal correction and rejects overpayment. The PRD's `total − Sum(Payments)` formula conflicts with the schema/customer/invoice convention; the consistent `total − active payments (excluding reversals)` definition is used. The nested tenant API path replaces any flat PRD route.

## Expense Management

Implements PRD FR-06 for the current business: record one-time expenses, track upcoming and overdue commitments, mark them paid, and keep paid/cancelled entries as history. No schema or migration change was needed—the existing `Expense` model, enums, indexes and applied CHECK constraints already cover the required fields.

### REST API

All paths are nested under the verified business so tenant scope is explicit at the route boundary.

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/v1/businesses/:businessId/expenses` | Create an expense (201) |
| `GET` | `/api/v1/businesses/:businessId/expenses` | Paginated, searchable, filtered list |
| `GET` | `/api/v1/businesses/:businessId/expenses/:expenseId` | Expense detail |
| `PATCH` | `/api/v1/businesses/:businessId/expenses/:expenseId` | Edit an upcoming expense |
| `POST` | `/api/v1/businesses/:businessId/expenses/:expenseId/pay` | Mark as paid (200) |
| `POST` | `/api/v1/businesses/:businessId/expenses/:expenseId/cancel` | Cancel an upcoming expense (200) |

List query parameters: `page` (default 1), `pageSize` (default 20, max 100), `search` (title or notes), `status` (`all` | `UPCOMING` | `OVERDUE` | `PAID` | `CANCELLED`, default `all`), `category` (one of the PRD categories), `fromDate`/`toDate` (both due dates, inclusive), `sort` (`dueDate` | `amount` | `title` | `createdAt` | `status`, default `dueDate`), `direction` (`asc` | `desc`, default `desc`). The `UPCOMING`/`OVERDUE` filters split stored `UPCOMING` rows by the business-local date.

Create body: `title`, `category`, `amount`, `dueDate`, optional `paymentDate`, optional `notes`, and `status` (`UPCOMING` default, or `PAID`). A `PAID` expense requires `paymentDate`; `OVERDUE` cannot be set by a client. Edit body accepts only `title`, `category`, `amount`, `dueDate` and `notes` (at least one). Pay body accepts an optional `paymentDate`—when omitted, the server defaults to the business-local date. Every endpoint requires a verified session plus a `BusinessMembership` for `(userId, businessId)`; a guessed expense id from another business returns `404`, never the foreign record. Path ids, bodies and queries are validated with Zod and errors use the standard envelope (`invalid_request`, `unauthenticated`, `business_forbidden`, `expense_not_found`, `invalid_transition`, `internal_error`).

### Categories and lifecycle

- Categories (PRD FR-06): `RENT`, `INTERNET`, `SOFTWARE_SUBSCRIPTIONS`, `SALARIES`, `EQUIPMENT`, `MARKETING`, `TRAVEL`, `UTILITIES`, `OTHER`.
- Stored statuses are `UPCOMING`, `PAID` and `CANCELLED`. `OVERDUE` is a display-only derivation for unpaid expenses whose due date has passed in the **business-local** date; it is never stored or manually set, so an overdue expense remains editable/payable/cancellable.
- Create produces `UPCOMING` (or `PAID` with a payment date). `UPCOMING → PAID` via the pay action and `UPCOMING → CANCELLED` via the cancel action. `PAID` and `CANCELLED` are terminal: there is no delete, un-pay or un-cancel path, which preserves history.
- Paid/cancelled expenses are retained in list and detail views; cancelled rows are visually distinguished and excluded from the `UPCOMING`/`OVERDUE` filters.

### Financial handling

- `amount` must be positive, at most two decimal places and within the schema's `Decimal(12,2)`; zero, negative, JS numbers and client-trusted totals are rejected. The applied database checks `chk_expenses_amount_pos` and `chk_expenses_paid_requires_payment_date` are mirrored in validation and enforced by the service.
- Amounts are canonical 2dp decimal strings on the wire and persisted through `Prisma.Decimal`; no JavaScript floating-point operation touches a financial value.
- `Expense` has no currency column. The business `currency` (and `timezone`, used for overdue/default-payment-date derivation) is read server-side from the business config via the verified `businessId` and exposed as display-only data. Client-submitted `currency`, `businessId`, `id`, timestamps and `displayStatus` are stripped by the schemas.
- Every repository method requires an explicit `businessId`; no query addresses an expense by id alone, and status-changing writes repeat the `UPCOMING` predicate so a stale request cannot edit a historical row.

### UI

| Route | Purpose |
| --- | --- |
| `/dashboard/expenses` | Expense list with search, status/category/date filters, sorting and pagination |
| `/dashboard/expenses/new` | Add form with category selection and paid-option payment date |
| `/dashboard/expenses/[expenseId]` | Detail with amount/status, pay and cancel actions, and history notes |
| `/dashboard/expenses/[expenseId]/edit` | Edit an upcoming expense |

Pages export `instant = false` and resolve the business server-side; Server Actions call the same authorization service as the REST API. Loading, empty, validation and error states are covered, and the layout is responsive and accessible.

### Implementation files

```
src/lib/expense-status.ts                         categories, status rules + OVERDUE derivation
src/lib/validations/expense.ts                    Zod create/update/pay/query schemas
src/types/expense.ts, expense-form.ts             shared shapes
src/server/repositories/expense-repository.ts     businessId-scoped Prisma queries and guarded writes
src/server/services/expense-service.ts            authorization + status transitions
src/server/controllers/expense-controller.ts      parsing + response mapping (injectable)
src/server/controllers/expense-api.ts              real auth/service wiring
src/server/actions/expense-actions.ts             UI Server Actions
src/app/api/v1/businesses/[businessId]/expenses/... REST route handlers
src/app/(dashboard)/dashboard/expenses/...        UI pages (/dashboard/expenses)
src/components/expenses/...                       UI components
tests/expense-*.test.ts                           node:test coverage (`npm test`)
```

### PRD/schema notes

No schema or migration change was needed and applied migrations were not edited. The PRD lists `date`, `amount`, `description`/title, category, status and notes but omits currency—the business currency is shown as display-only from `Business.currency` rather than added as a column. The PRD names an `OVERDUE` status but provides no transition matrix; it is implemented as a business-local date derivation (matching the invoice precedent), and only `UPCOMING` expenses may be edited/paid/cancelled. Receipt attachments and recurring expenses are not in the PRD for this MVP and are not implemented. The nested tenant API path replaces any flat PRD route.

## Reminder Management

Implements PRD FR-07 for the current business. A reminder is a **generated draft**: the owner copies the text or opens a `https://wa.me/` click-to-chat link and sends the message manually. No WhatsApp Business API, email/SMS provider, cron job, webhook, delivery status or customer receipt is implemented or claimed. No new environment variables are required.

### REST API

All paths are nested under the verified business so tenant scope is explicit at the route boundary.

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/v1/businesses/:businessId/reminders` | Generate a reminder draft (201) |
| `GET` | `/api/v1/businesses/:businessId/reminders` | Paginated, searchable, filtered list |
| `GET` | `/api/v1/businesses/:businessId/reminders/:reminderId` | Reminder detail |
| `PATCH` | `/api/v1/businesses/:businessId/reminders/:reminderId` | Edit a draft or reschedule the follow-up |
| `POST` | `/api/v1/businesses/:businessId/reminders/:reminderId/whatsapp-opened` | Record that the owner opened the click-to-chat link (200) |
| `POST` | `/api/v1/businesses/:businessId/reminders/:reminderId/mark-sent` | Owner manually confirms the reminder was sent; idempotent (200) |

List query parameters: `page` (default 1), `pageSize` (default 20, max 100), `search` (message, customer or invoice number), `status` (`all` | `DRAFTED` | `WHATSAPP_OPENED` | `MARKED_SENT` | `OVERDUE` | `UPCOMING`, default `all`), `type` (one of the PRD categories), `customerId`, `invoiceId`, `fromDate`/`toDate` (follow-up dates, inclusive), `sort` (`followUpDate` | `createdAt` | `reminderType` | `status` | `customerName`, default `followUpDate`), `direction` (`asc` | `desc`, default `desc`). `OVERDUE`/`UPCOMING` derive from the nullable DATE `followUpDate` and the **business-local** date; sent reminders are excluded.

Create body: `customerId`, `invoiceId`, `reminderType`, optional `followUpDate`. The customer and invoice must both belong to the authenticated business and refer to each other; the invoice must be issued (`SENT`/`PARTIALLY_PAID`/`OVERDUE`) with an outstanding balance. The message, status, WhatsApp URL, currency, identifiers and timestamps are server-owned and stripped if supplied by a client. Update body accepts at least one of `message`, `reminderType`, `followUpDate`. Every endpoint requires a verified session plus a `BusinessMembership` for `(userId, businessId)`; a missing membership returns `403 business_forbidden`, and a guessed reminder id or foreign context from another business returns `404` (`reminder_not_found` / `invalid_reminder_context`), never the foreign record. Path ids, bodies and queries are validated with Zod and errors use the standard envelope (`invalid_request`, `unauthenticated`, `business_forbidden`, `reminder_not_found`, `invalid_reminder_context`, `invalid_transition`, `internal_error`).

### Categories and lifecycle

- Categories (PRD FR-07): `UPCOMING_PAYMENT`, `DUE_TODAY`, `OVERDUE_PAYMENT`, `FINAL_FOLLOW_UP`. The category is a client choice; the form suggests one from the invoice due date but the server never derives or overrides it.
- Stored statuses are only `DRAFTED`, `WHATSAPP_OPENED` and `MARKED_SENT`, matching the applied `reminder_status` enum. `DRAFTED → MARKED_SENT` is also allowed when the owner skips opening WhatsApp. `MARKED_SENT` is terminal: no edit, reschedule, reopen or regression, preserving history.
- Opening the WhatsApp link records `WHATSAPP_OPENED`; it is **not** delivery. `whatsapp-opened` is idempotent after a successful open and `mark-sent` is idempotent, so repeating either request produces no duplicate delivery assertion. Status-changing writes repeat their allowed-status predicates atomically, so a stale request cannot overwrite a concurrent transition.
- A `DRAFTED` reminder may edit its message, category and follow-up date. After `WHATSAPP_OPENED` the message is history and only the follow-up date can be rescheduled. After `MARKED_SENT` nothing can change.
- Follow-up urgency (`NONE`, `OVERDUE`, `DUE_TODAY`, `UPCOMING`) is derived from the business-local date and is never stored. A sent reminder has no active urgency even if its follow-up date has passed.

### Generated message and WhatsApp link

- The message is generated server-side from a business-verified customer/invoice snapshot and includes the customer name, invoice number, amount (`outstandingAmount`, not the original total) and due date. Reversed payments are excluded from the outstanding balance.
- The link is `https://wa.me/<phone digits>?text=<URL-encoded message>`, derived server-side on read. It is `null` when the customer has no usable phone number; the UI then offers copy only. The owner sends the message in WhatsApp; the app never claims it was delivered or read.
- There is no WhatsApp Business API call, provider credential, `.env` variable, cron entry, scheduled timestamp, webhook, retry counter or processing-attempt infrastructure. PRD FR-07 explicitly requires manual click-to-chat sharing and forbids claiming automatic delivery or customer receipt.

### Scheduling and processing limitations

- The schema stores only a nullable DATE `followUpDate`, not a timestamp, so time-of-day scheduling and cron processing are not representable. The date is used for rescheduling and urgency badges/filters only.
- There is no `CANCELLED`, `FAILED` or `DELIVERED` status and no delivery/provider fields. Those concepts are intentionally absent rather than faked; representing them would require a schema and migration change.
- Consequently there is no protected processing endpoint, cron secret or provider setup for reminders. The only state changes are the owner recording a WhatsApp link open or manually marking the reminder sent.

### UI

| Route | Purpose |
| --- | --- |
| `/dashboard/reminders` | List with search, status/category/date filters, sorting, pagination and status/follow-up indicators |
| `/dashboard/reminders/new` | Generate a draft from an issued invoice; customer/invoice detail pages can preselect it |
| `/dashboard/reminders/[reminderId]` | Detail with customer/invoice context, generated message, copy/WhatsApp actions and history status |
| `/dashboard/reminders/[reminderId]/edit` | Edit a draft or reschedule a follow-up |

Pages export `instant = false` and resolve the business server-side; Server Actions call the same authorization service as the REST API. Loading, empty, validation and error states are covered, and the layout is responsive and accessible. The dashboard, customer detail and invoice detail pages link into the reminder flows.

### Implementation files

```
src/lib/reminder-status.ts                       categories, lifecycle + follow-up derivation
src/lib/reminder-message.ts                       generated text + server-side wa.me URL
src/lib/validations/reminder.ts                   Zod create/update/list schemas
src/types/reminder.ts, reminder-form.ts           shared shapes
src/server/repositories/reminder-repository.ts    businessId-scoped Prisma queries and guarded writes
src/server/services/reminder-service.ts           authorization, context checks + transitions
src/server/controllers/reminder-controller.ts     parsing + response mapping (injectable)
src/server/controllers/reminder-api.ts             real auth/service wiring
src/server/actions/reminder-actions.ts            UI Server Actions
src/app/api/v1/businesses/[businessId]/reminders/... REST route handlers
src/app/(dashboard)/dashboard/reminders/...        UI pages (/dashboard/reminders)
src/components/reminders/...                      UI components
tests/reminder-*.test.ts                          node:test coverage (`npm test`)
```

### PRD/schema notes

No schema or migration change was needed and applied migrations were not edited. PRD FR-07 is authoritative where the broader prompt text is more ambitious: the PRD requires manual `https://wa.me/` sharing, explicitly rules out the WhatsApp Business API and forbids claiming automatic delivery/customer receipt, and the applied schema only has the three manual statuses above plus a DATE follow-up field. Cancel/failed/automated-processing/provider behaviour is therefore documented as not representable rather than implemented as a fake state. The nested tenant API path replaces any flat PRD route.

## Financial dashboard

Read-only financial overview of the current business. It composes existing invoice, payment, expense, reminder, forecast and alert data; no schema or migration change was needed and nothing is written. The dashboard never calculates outstanding balances, overdue days or projections in the browser, and it never sends reminders or records payments.

### REST API

All paths are nested under the verified business. Every endpoint is `GET` and requires a verified session plus a `BusinessMembership` for `(userId, businessId)`; a non-member receives `business_forbidden` (403) and no financial data.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/businesses/:businessId/dashboard/summary` | Six headline cards plus counts for a reporting period |
| `GET` | `/api/v1/businesses/:businessId/dashboard/trends` | Zero-filled income, expense and invoicing buckets |
| `GET` | `/api/v1/businesses/:businessId/dashboard/receivables` | Open receivables, overdue first, then by due date (cursor paginated) |
| `GET` | `/api/v1/businesses/:businessId/dashboard/upcoming-expenses` | Unpaid expenses, overdue first, then by due date |
| `GET` | `/api/v1/businesses/:businessId/dashboard/cash-flow` | 30/60/90-day projection delegated to the forecast service |
| `GET` | `/api/v1/businesses/:businessId/dashboard/actions` | Active alerts, severity-descending, linked to their records |
| `GET` | `/api/v1/businesses/:businessId/dashboard/transactions` | Recent active payments and paid expenses, newest first |
| `GET` | `/api/v1/businesses/:businessId/dashboard/recent-activity` | Invoices and active payments merged by timestamp |
| `GET` | `/api/v1/businesses/:businessId/dashboard/reminders` | Overdue and upcoming reminders with counts |

- **Summary** query: either `preset` (`this_month` | `last_month` | `last_30_days` | `last_90_days`, plus `year_to_date` retained for API compatibility) or `from` and `to` (`YYYY-MM-DD`, both inclusive, business timezone, maximum 366 days). Response fields: `availableCash`, `totalReceivables`, `overdueReceivables`, `invoicedInPeriod`, `incomeInPeriod`, `expensesInPeriod`, `netCashMovementInPeriod`, `upcomingExpenses`, `overdueExpenses`, `customerCount`, `issuedInvoiceCount`, reminder counts, `currency` and `range`.
- **Trends** query: `from`, `to`, `granularity` (`day` | `week` | `month`, default `month`). Buckets are zero-filled; weeks start on Monday.
- **Receivables** query: `limit` (1–100, default 25) and `cursor`. Overdue invoices come first, then ordered by due date.
- **Upcoming expenses** query: `limit` (1–50, default 10).
- **Cash flow** query: the forecast contract, `horizon=30|60|90` or the `days` alias, default 30; supplying both is rejected.
- **Actions** query: `limit` (1–20, default 5).
- **Transactions** query: `limit` (1–20, default 10).
- **Recent activity** query: `limit` (1–20, default 10).
- **Reminders** takes no query parameters. It returns overdue reminders and reminders due in the next 7 business days, with counts.

Errors use the standard envelope (`invalid_request`, `unauthenticated`, `business_forbidden`, `internal_error`). Query parameters are validated with Zod.

### Reporting periods

`today` is `businessLocalDate(business.timezone)` (default `Asia/Kolkata`). Ranges are inclusive `YYYY-MM-DD` business-calendar dates, so a UTC timestamp near midnight cannot shift a period boundary.

| Preset | Range |
| --- | --- |
| `this_month` | First day of the current business month through today |
| `last_month` | First through last day of the previous business month |
| `last_30_days` | Today minus 29 days through today (30 inclusive days) |
| `last_90_days` | Today minus 89 days through today (90 inclusive days) |
| `year_to_date` | January 1 through today (API compatibility; not shown in the page selector) |

The page selector shows only the four required periods. Changing the period preserves the selected cash-flow horizon, and changing the horizon preserves the period. The 30/60/90 forecast horizon is separate from the reporting period: the cards and lists use the period, while the cash-flow overview uses the horizon.

### Summary cards

| Card | Formula |
| --- | --- |
| **Available cash** | Opening balance + active payments since `openingBalanceDate` − `PAID` expenses since `openingBalanceDate`, up to the business-local today. This is a manually maintained position, not a bank balance. |
| **Total outstanding receivables** | Sum of `totalAmount − active payments` for `SENT`, `PARTIALLY_PAID` and `OVERDUE` invoices with outstanding > 0. |
| **Overdue receivables** | The same outstanding amount for invoices that are stored `OVERDUE`, or are `SENT`/`PARTIALLY_PAID` past their due date with a positive outstanding. |
| **Total upcoming expenses** | `UPCOMING` expenses due from today through the next 30 days inclusive. |
| **Total income** | Active payments with `paymentDate` in the selected period. Reversed payments are excluded. |
| **Total expenses** | `PAID` expenses with `paymentDate` in the selected period. |

All card amounts are computed in `BIGINT` minor units by `src/lib/dashboard-metrics.ts` and serialized as integer minor-unit strings (`"12345"` = 123.45). `byCurrency` breakdowns accompany receivables, income and expenses. The headline uses the business currency; expenses are treated as business-currency amounts because they have no currency column. Net cash movement (`income − expenses`) is not profit.

### Receivables

- Only issued statuses (`SENT`, `PARTIALLY_PAID`, `OVERDUE`) with a positive outstanding balance are listed.
- `outstanding` is calculated once in SQL as invoice total minus active, non-reversed payments. The frontend formats it and never recalculates it.
- Ordering is overdue first, then due date, then id. The cursor is the composite `(sort_rank, due_date, id)`, so pagination is stable.
- Each row includes customer, invoice number, total, paid, outstanding, due date, `daysOverdue`, stored `status`, date-derived `displayStatus`, `isOverdue` and `isPartiallyPaid`.
- Overdue rows are visually emphasized; partial payments are badged. Invoice, customer and reminder links are provided; the reminder link only opens the existing draft flow and never sends anything.
- The dashboard shows 10 rows per page with next/first-page controls. Loading, empty and section-level error states are rendered independently.

### Upcoming expenses

- Includes only `UPCOMING` and `OVERDUE` expenses; `PAID` and `CANCELLED` rows are excluded.
- Overdue expenses come first (stored `OVERDUE` or due date before the business-local today), then due date, then id.
- Each row includes description, category, amount, due date, stored status and date-derived `displayStatus`.
- Rows link to the existing expense detail, where paying or cancelling remains an explicit user action. The empty state links to the new-expense form.

### Cash-flow overview

The overview delegates to `forecastService.getForecast(user, businessId, { horizon })`; eligibility, overdue scheduling, reversal exclusion, currency handling and projection math are not reimplemented. It exposes:

- current cash, expected incoming and outgoing, net cash flow, projected closing balance, lowest projected balance and its date;
- `shortageDate` and `becomesNegative`, with a prominent warning when the projected balance drops below zero;
- a daily series for the Recharts chart (incoming/outgoing bars, projected balance line and zero reference line);
- a link to `/dashboard/forecast?horizon=…` for the full breakdown.

Forecast-derived money is a canonical 2-decimal major-unit string (for example `"1234.50"`), unlike summary minor-unit strings. The UI converts values to numbers only for chart geometry; every displayed amount comes from the server string. The projection is an estimate and is labelled with its last calculation time.

### Financial Action Center

- Calls the existing `alertService.list` with `status: "active"`, `sort: "severity"`, `direction: "desc"` and the requested limit, so critical alerts appear first and alert rules/dedupe stay in one place.
- Shows severity, unread state, alert type, title, description and the alert's existing recommended action.
- Links to the alert detail (which owns acknowledge/dismiss/resolve controls) and, when applicable, to the verified related invoice, expense, customer or forecast.
- Shows active/unread/critical/warning/info counts and a link to the full alerts page. **Evaluate now** reuses the existing manual evaluation action; the dashboard never creates duplicate alerts automatically.
- Nothing is auto-sent: reminder sending and payment recording remain explicit actions on their existing pages.

### Recent transactions

- Merges real, recorded cash movements only: active (non-reversed) payments and `PAID` expenses.
- No synthetic transactions, drafts, unpaid expenses or reversed payments are shown.
- Rows are sorted by business-local date descending, then id, and trimmed to the requested limit.
- Each row shows payment/expense kind, date, description, invoice reference (payments), signed amount and a link to the existing payment or expense detail.

### Authorization and tenant isolation

- Every route authenticates with `requireUser`-equivalent logic and every service method re-checks `BusinessMembership` for `(user.id, businessId)` before any query.
- The service passes only the verified `businessId` to repositories; query strings cannot override it.
- All SQL and Prisma queries are business-scoped, including joins to invoices, customers and reversals.
- Alert record links are derived deterministically from the alert's `relatedEntityType`/`relatedEntityId`. Alert creation already validates same-business ownership, and each target page repeats membership and business checks.
- A non-member receives `business_forbidden` and no data; invalid identifiers and query parameters return `invalid_request`.
- Section reads run in parallel (`Promise.allSettled` on the page) and aggregate in SQL, avoiding per-row queries and duplicate calculations.

### UI and architecture

`/dashboard` is a server-rendered page. It resolves the business and period on the server, loads sections independently, and renders a responsive professional layout: deep-blue primary actions, light neutral background, white cards, green positive values, amber warnings and red negative values. Accessibility includes semantic headings, table captions, screen-reader labels, visible focus rings and `aria-current` on selectors.

| Area | Files |
| --- | --- |
| Types | `src/types/dashboard.ts` |
| Metrics and period rules | `src/lib/dashboard-metrics.ts` |
| Validation | `src/lib/validations/dashboard.ts` |
| Repository | `src/server/repositories/dashboard-repository.ts` |
| Service (forecast/alert injection) | `src/server/services/dashboard-service.ts` |
| Controller | `src/server/controllers/dashboard-controller.ts` |
| REST routes | `src/app/api/v1/businesses/[businessId]/dashboard/{summary,trends,receivables,upcoming-expenses,cash-flow,actions,transactions,recent-activity,reminders}/route.ts` |
| Page and states | `src/app/(dashboard)/dashboard/{page,loading,error}.tsx` |
| UI components | `src/components/dashboard/{dashboard-ui,cash-flow-overview,receivables-panel,upcoming-expenses-panel,action-center-panel,recent-transactions-panel}.tsx` |
| Tests | `tests/{dashboard-metrics,dashboard-service,dashboard-routes,dashboard-ui}.test.ts` |

### Assumptions and limitations

- Available cash and the forecast depend on the manually maintained opening balance; they are not bank feeds.
- The summary headline is single-currency (business currency). Other invoice currencies appear only in `byCurrency`; no exchange rate is invented.
- The **Total upcoming expenses** card is a 30-day horizon. The upcoming-expenses list shows all unpaid expenses, not only the next 30 days.
- "Overdue" is both a stored state and a date-derived state; stored `OVERDUE` wins, and issued invoices past due with a positive balance are treated as overdue.
- Partial payment highlighting uses the stored `PARTIALLY_PAID` status and the paid amount; outstanding remains the authoritative server value.
- Alerts reflect the most recent evaluation. The dashboard lists them; it does not evaluate on page load, send messages or mutate financial records.
- Receivables are cursor-paginated; the other feeds are capped lists, not full histories.
- The what-if cash flow simulator is documented below.

## Cash flow forecasting

Deterministic 30, 60 or 90-day projection of the business's cash position. It reads the existing opening balance, invoices, active payments and unpaid expenses; it never writes, caches or changes financial records. No schema or migration change was needed.

The forecast is an **estimate**. It does not claim a customer will pay on a particular date; it applies the documented date rules below and labels itself as an estimate with a last-calculation timestamp in the UI.

### REST API

All paths are nested under the verified business and require a verified session plus a `BusinessMembership` for `(userId, businessId)`. A non-member receives `business_forbidden` (403) and no data.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/businesses/:businessId/forecast` | Full forecast: summary, daily, weekly and monthly series plus breakdowns |
| `GET` | `/api/v1/businesses/:businessId/forecast/daily` | Daily projected balances only |
| `GET` | `/api/v1/businesses/:businessId/forecast/monthly` | Calendar-month summaries only |

- **Horizon**: `horizon=30|60|90` or the PRD's `days=30|60|90`, default 30. Supplying both is rejected. Any other value is a `400 invalid_request` with a field error.
- **Money** is a canonical 2-decimal string (for example `"1234.50"`, `"-400.00"`). The engine uses integer minor units (`BigInt`) internally; no floating-point arithmetic touches a financial value. Prisma `Decimal(12,2)` values are converted at the repository boundary.
- **Dates** are `YYYY-MM-DD` business-calendar dates. Timestamps (for example `calculatedAt`) are ISO 8601.
- Errors use the standard envelope: `invalid_request` (400), `unauthenticated` (401), `business_forbidden` (403), `internal_error` (500).

### Formulas

```text
currentCash       = openingBalance
                  + active payments since openingBalanceDate (inclusive)
                  - PAID expenses since openingBalanceDate (inclusive)

day opening       = previous day closing (currentCash on the first day)
day closing       = day opening + expected receipts - expected expenses
netCashFlow       = expected receipts - expected expenses
projectedEnding   = closing balance on the horizon's last day
lowest balance    = min(currentCash, every day closing)
shortageDate      = first date with a negative closing balance
                    (a negative currentCash counts on the start date)
```

Cumulative incoming and outgoing totals are carried per day. Weekly buckets are Monday-based and clipped to the forecast window; monthly buckets are calendar months. Both carry the last closing balance in the bucket.

### Eligibility and date rules

**Incoming receipts**

- Include `SENT`, `PARTIALLY_PAID` and `OVERDUE` invoices.
- Exclude `DRAFT`, `VOID` and `PAID` invoices.
- The amount is the invoice's **outstanding balance**: total minus active, non-reversed payments. A partially paid invoice contributes only its remainder, never the full total.
- Schedule date: `expectedPaymentDate` when present, otherwise `dueDate`. No date is invented.
- An overdue invoice (its effective date is before the business-local today) is projected on the first forecast day. Dropping it would understate receivables; moving it to a future date would invent a payment promise.
- Items whose effective date is after the horizon end are omitted; they appear in a longer horizon.

**Outgoing expenses**

- Include `UPCOMING` and `OVERDUE` expenses due on or before the horizon end.
- Exclude `PAID` and `CANCELLED` expenses.
- Schedule date: `dueDate`. Overdue expenses are projected on the first forecast day for the same reason as overdue invoices.
- Expenses have no currency column, so they are treated as business-currency amounts (consistent with the dashboard).

**Payments and reversals**

- Only active payments reduce the outstanding balance. A payment with a `PaymentReversal` is excluded via `NOT EXISTS`, so a reversed receipt never lowers a forecast.
- Cash received since the opening balance date is added to current cash exactly once. Those same payments are not added again as future receipts because the invoice's outstanding balance already reflects them.

### Opening balance and timezone

- `openingBalance` is the manually maintained business opening cash and may be negative.
- `openingBalanceDate` starts the cash-movement window. If it is in the future, the window is empty and current cash equals the opening balance.
- "Today" is `businessLocalDate(business.timezone)` (default `Asia/Kolkata`), so a UTC timestamp near midnight resolves to the correct business day. All calendar arithmetic uses `YYYY-MM-DD` strings and UTC date math, never local `Date` setters.
- Invoice and expense dates are returned from PostgreSQL with `to_char`, so the driver's timezone cannot shift a business date.

### Currency

- The forecast is single-currency: the business currency.
- Outstanding invoices in another currency are **excluded** from all totals and reported separately in `excludedInvoices` (`count`, `byCurrency`, `currencies`). The engine never mixes currencies or invents an exchange rate.
- Cash sums and expense amounts use the business currency; the repository filters payments by the invoice's currency snapshot.

### Response shape (summary)

`currency`, `timezone`, `horizonDays`, `startDate`, `endDate`, `today`, `calculatedAt`, `openingBalance`, `expectedIncoming`, `expectedOutgoing`, `netCashFlow`, `projectedEndingBalance`, `lowestProjectedBalance`, `lowestProjectedDate`, `shortageDate`, `becomesNegative`, `counts`, `overdue` (amounts and counts), `excludedInvoices`, `incoming[]`, `outgoing[]`, `daily[]`, `weekly[]`, `monthly[]`.

Each daily row has `date`, `openingBalance`, `incoming`, `outgoing`, `net`, `projectedBalance`, `cumulativeIncoming` and `cumulativeOutgoing`. Each incoming item exposes the invoice number, customer, status, due date, expected payment date, scheduled date, outstanding amount and an overdue flag (the invoice is past due or stored as `OVERDUE`); each outgoing item exposes the expense title, category, status, due date, scheduled date, amount and an overdue flag.

### UI

`/dashboard/forecast` (linked as **Cash flow** from the dashboard) is a server-rendered page:

- 30/60/90-day horizon selector.
- Current cash, expected incoming/outgoing, net cash flow, projected closing balance, lowest balance and its date, shortage indicator and overdue receivables.
- Warnings for a potential negative balance, overdue customer payments, expenses exceeding receipts, and excluded foreign-currency invoices.
- Recharts daily chart: incoming/outgoing bars, projected closing-balance line and a zero reference line.
- Weekly balance table, incoming and outgoing breakdown tables.
- Empty states for no eligible records and no business; loading skeleton and error boundary.
- The estimate note shows the last calculation time in the business timezone.

Chart values are converted to major units for display only. Every authoritative amount comes from the server as a decimal string; the frontend performs no financial calculation.

### Implementation files

| Area | Files |
| --- | --- |
| Types | `src/types/forecast.ts` |
| Pure engine | `src/lib/forecast-math.ts` |
| Validation | `src/lib/validations/forecast.ts` |
| Repository | `src/server/repositories/forecast-repository.ts` |
| Service | `src/server/services/forecast-service.ts` |
| Controller / wiring | `src/server/controllers/forecast-controller.ts`, `forecast-api.ts` |
| Routes | `src/app/api/v1/businesses/[businessId]/forecast/{route,daily/route,monthly/route}.ts` |
| Page | `src/app/(dashboard)/dashboard/forecast/{page,loading,error}.tsx` |
| Components | `src/components/forecast/` |
| Tests | `tests/forecast-math.test.ts`, `tests/forecast-service.test.ts`, `tests/forecast-routes.test.ts`, `tests/helpers/forecast-fakes.ts` |

### Performance and determinism

- One aggregated query per concern: invoices with a correlated active-payment sum, expenses, and cash sums. No per-invoice or per-expense query (no N+1).
- Only rows that can fall inside the requested horizon are loaded, and history is limited to the opening-balance window.
- Results are not cached. Every request recalculates from current records, so changes appear immediately.
- For a fixed clock, input and records, the output is byte-for-byte deterministic; tests assert this.

### Assumptions and limitations

- Overdue receivables and expenses are assumed to settle on the first forecast day. This is a conservative scheduling rule, not a prediction.
- Future receipts are assumed to arrive on the expected payment date or, if absent, the due date.
- The what-if simulator is a separate read-only layer documented below. Recurring-expense automation and multi-currency conversion remain out of scope for this module.
- The forecast does not model taxes, fees, payment-gateway delays or partial settlement of an individual future invoice beyond the recorded payments.
- The business's manually maintained opening balance is the source of truth; the forecast is not a live bank balance.


## What-if cash flow simulator

Hypothetical 30, 60 or 90-day scenarios layered over the existing forecast. The simulator is **session-only and read-only**: it never creates, updates or deletes an invoice, payment, reversal or expense, and it does not persist scenarios. The database design describes forecasts and what-if scenarios as derived/temporary, so no schema or migration change was needed.

### REST API

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/v1/businesses/:businessId/forecast/simulations` | Calculate one hypothetical scenario and return the baseline, simulated forecast and deltas |

There are intentionally no `GET` or `DELETE` simulation endpoints because scenarios are not saved. Every request requires a verified session plus a `BusinessMembership` for `(userId, businessId)`; a non-member receives `403 business_forbidden` and no data.

Example request:

```json
{
  "horizon": 30,
  "adjustments": [
    { "id": "a1", "type": "delay_payment", "invoiceId": "…", "date": "2026-02-01" },
    { "id": "a2", "type": "change_amount", "invoiceId": "…", "amount": "800.00" },
    {
      "id": "a3",
      "type": "add_expense",
      "title": "New equipment",
      "category": "EQUIPMENT",
      "amount": "250.00",
      "date": "2026-01-25"
    }
  ]
}
```

`horizon` is `30`, `60` or `90` (default 30). `adjustments` may be empty, in which case the simulated forecast equals the baseline. Money is accepted and returned as canonical 2dp decimal strings; dates are `YYYY-MM-DD`; adjustment ids are client-generated labels for the scenario rows.

Response: `currency`, `timezone`, `horizonDays`, `startDate`, `endDate`, `today`, `calculatedAt`, `adjustments[]`, `baseline`, `simulated`, `comparison` and `daily[]`. `baseline` and `simulated` are full forecast responses with daily, weekly, monthly and breakdown data.

### Supported scenarios

| Type | Target | Fields | Effect |
| --- | --- | --- | --- |
| `delay_payment` | Invoice | `invoiceId`, `date` | Moves the expected receipt to a later date inside the horizon |
| `receive_earlier` | Invoice | `invoiceId`, `date` | Moves the expected receipt to an earlier date inside the horizon |
| `change_amount` | Invoice | `invoiceId`, `amount` | Replaces the outstanding amount expected from the customer |
| `add_expense` | New hypothetical expense | `title`, `category`, `amount`, `date` | Adds an `UPCOMING` expense that exists only in the simulation |
| `increase_expense` | Expense | `expenseId`, `amount` | Adds the amount to an existing unpaid expense |
| `reduce_expense` | Expense | `expenseId`, `amount` | Subtracts the amount while keeping the expense positive |
| `delay_expense` | Expense | `expenseId`, `date` | Moves an expense payment to a later date inside the horizon |

Multiple adjustments are applied in request order. A record may have **one date change and one amount change** in the same scenario (for example, delay an invoice and reduce what the customer will pay). Two date changes or two amount changes against the same record are rejected as ambiguous.

### Validation

Zod validates the request shape and the pure engine validates the scenario against the authorized snapshot:

- Adjustment ids must be non-empty, at most 64 characters and unique.
- Invoice and expense ids must be UUIDs.
- Money must be a positive decimal string with at most two decimals; zero, negative, malformed and more-than-2dp values are rejected.
- Dates must be real `YYYY-MM-DD` calendar dates inside the selected horizon (`today` through `endDate`).
- `delay_payment` must be later than the current scheduled date; `receive_earlier` must be earlier; `delay_expense` must be later than the current scheduled date.
- `change_amount` must differ from the current outstanding amount; `reduce_expense` must be smaller than the current expense amount so the expense stays positive.
- Referenced invoices must be issued and outstanding; referenced expenses must be unpaid. Fully paid records, `DRAFT`/`VOID`/`PAID` invoices and `PAID`/`CANCELLED` expenses cannot be targeted.
- References must exist in the business-scoped forecast snapshot for the same horizon. Guessing an id from another business produces a validation error, never the foreign record.
- Foreign-currency invoices are never adjustable and are never mixed into a simulation.
- More than 50 adjustments in one request is rejected.
- Errors use the standard envelope: `invalid_request` (400, with field errors), `unauthenticated` (401), `business_forbidden` (403), `internal_error` (500).

### Calculation

The simulator is a transformation layer over the existing engine, not a second forecasting implementation:

```text
baseline       = calculateForecast(authorized ForecastInput)
simulatedInput = clone(input) with hypothetical changes applied
simulated      = calculateForecast(simulatedInput)
delta          = simulated - baseline   (BigInt minor units)
```

Transformation rules:

- `delay_payment` / `receive_earlier`: set the hypothetical `expectedPaymentDate`; the engine's existing rule (`expectedPaymentDate ?? dueDate`, overdue clamped to the first day) then schedules it.
- `change_amount`: keep `amountPaid` and set the hypothetical `totalAmount = amountPaid + newOutstanding`, so the engine's existing outstanding formula produces exactly the requested amount.
- `add_expense`: append an `UPCOMING` hypothetical expense with a `simulated-expense-<adjustmentId>` id.
- `increase_expense` / `reduce_expense`: change only the cloned expense amount.
- `delay_expense`: change only the cloned `dueDate`.

All original records are cloned before adjustment, so the baseline input and the actual records remain untouched. `baseline` is calculated from the original input object; `simulated` is calculated from the clones with the same `calculateForecast` function, same business-local `today`, same opening balance and same currency. No floating point touches a financial value.

The response comparison includes baseline, simulated and delta for expected incoming, expected outgoing, net cash flow, projected ending balance and lowest projected balance, plus baseline/simulated shortage dates, lowest-balance dates and negative-balance flags. `daily[]` aligns every day with baseline/simulated incoming, outgoing, closing balances and the balance delta.

### Currency and timezone

- A simulation is single-currency: the business currency. Inputs and outputs never mix currencies.
- Foreign-currency invoices are excluded from the baseline and cannot be targeted by an adjustment; the existing `excludedInvoices` report is preserved.
- Expenses have no currency column, so they are business-currency amounts (consistent with forecasting and the dashboard).
- `today` is the business-local date from `businessLocalDate(timezone)`, and all calendar arithmetic uses `YYYY-MM-DD` strings. The same clock read is used for the baseline and the simulation.

### Persistence decision

Scenarios are **not persisted**. The database design and README describe forecasts and what-if scenarios as derived or temporary, and the prompt permits persistence only when the PRD requires it. There is therefore no simulation table, no migration, no saved-scenario API and no `GET`/`DELETE` endpoint. Each POST recalculates in memory from current records, so a stale saved scenario can never be shown as current.

### UI

`/dashboard/forecast/simulator` (linked from the forecast page) is a server-rendered page with a client-side scenario builder:

- Baseline overview reusing the existing forecast summary cards and warnings.
- 30/60/90-day horizon selector.
- Scenario builder for all seven adjustment types, with candidate invoices/expenses, amount/date/title/category inputs, add/remove and reset.
- Loading, validation, empty, error and pending states; server field errors are shown with the request error.
- Results: baseline-vs-simulated stat cards, shortage comparison, Recharts baseline/simulated balance chart, applied-adjustment table and a scrollable daily balance table.
- Negative balances are highlighted; every authoritative amount is a server-produced decimal string and chart values are converted to major units for display only.
- A clear note states that no financial record was written.

### Implementation files

| Area | Files |
| --- | --- |
| Types | `src/types/forecast-simulation.ts` |
| Pure engine | `src/lib/forecast-simulation.ts` |
| Validation | `src/lib/validations/forecast-simulation.ts` |
| Service | `src/server/services/forecast-simulation-service.ts` |
| Controller / wiring | `src/server/controllers/forecast-simulation-controller.ts`, `forecast-simulation-api.ts` |
| Route | `src/app/api/v1/businesses/[businessId]/forecast/simulations/route.ts` |
| Page | `src/app/(dashboard)/dashboard/forecast/simulator/{page,loading,error}.tsx` |
| Components | `src/components/forecast/forecast-simulator.tsx`, `forecast-simulation-results.tsx`, `forecast-simulation-chart.tsx` |
| Tests | `tests/forecast-simulation-math.test.ts`, `tests/forecast-simulation-service.test.ts`, `tests/forecast-simulation-routes.test.ts` |

### Assumptions and limitations

- Only invoices and expenses that appear in the baseline forecast window can be adjusted. The repository deliberately loads rows up to the horizon end; an item outside the selected horizon is reported as not part of the window. Choose a longer horizon to include it.
- New dates must stay inside the selected horizon. Modelling a receipt after the horizon is not supported; the existing forecast simply omits it.
- One date change and one amount change per record are supported. More granular combinations (for example two separate expense increases) are rejected as ambiguous.
- The simulator does not model taxes, fees, payment-gateway delays, partial settlement of an individual future invoice beyond recorded payments, or new customer invoices. There is no “add hypothetical invoice” scenario because the incoming scenarios are date/amount changes to existing expected payments.
- Scenarios are not saved, shared or versioned. Refreshing the page clears the builder.
- The simulation is an estimate using the same rules and limitations as the forecast; it is not a guarantee and does not execute any transaction.

## Smart alerts and action center

Deterministic alerts derived from invoices, payments, expenses, receivables and the existing cash-flow forecast. Alerts are **not** AI predictions, they do not send anything automatically, and evaluation is an explicit action. The action center links the owner to an existing workflow (invoice, reminder, expense, customer or forecast) and never claims that a reminder or payment happened.

### Alert conditions

| Type | Condition | Default severity | Related entity | Dedupe key |
| --- | --- | --- | --- | --- |
| `OVERDUE_PAYMENT` | An issued (`SENT`, `PARTIALLY_PAID` or `OVERDUE`) business-currency invoice has an outstanding balance and is past its due date | `WARNING`; `CRITICAL` at 30+ days overdue | Invoice | `OVERDUE_PAYMENT:<invoiceId>` |
| `PAYMENT_APPROACHING` | An issued business-currency invoice has an outstanding balance and is due today or within the next 3 days | `WARNING` | Invoice | `PAYMENT_APPROACHING:<invoiceId>` |
| `PARTIAL_PAYMENT_DUE` | A `PARTIALLY_PAID` invoice has an outstanding balance, is not overdue and is due more than 3 days out | `INFO` | Invoice | `PARTIAL_PAYMENT_DUE:<invoiceId>` |
| `UPCOMING_EXPENSE` | An expense whose stored status is `UPCOMING` has a positive amount and is due today or within the next 3 days | `WARNING` | Expense | `UPCOMING_EXPENSE:<expenseId>` |
| `POTENTIAL_SHORTAGE` | The authoritative 30-day forecast engine reports `becomesNegative` | `CRITICAL` when the first negative day is within 7 days, otherwise `WARNING` | Forecast | `POTENTIAL_SHORTAGE` |
| `CUSTOMER_CONCENTRATION` | The largest customer holds at least 50% of business-currency outstanding receivables, with at least two customers holding a balance | `WARNING`; `CRITICAL` at 75% or more | Customer | `CUSTOMER_CONCENTRATION:<customerId>` |

One invoice produces at most one invoice alert. Overdue takes precedence; a partially paid invoice due within 3 days is `PAYMENT_APPROACHING` only; a partially paid invoice further out is `PARTIAL_PAYMENT_DUE`. `DRAFT`, `PAID` and `VOID` invoices never alert. `PAID`, `CANCELLED` and already-overdue expenses never produce `UPCOMING_EXPENSE`.

Outstanding balances use `totalAmount - SUM(active payments)`. A payment with a reversal row is excluded, so a reversed payment restores the full balance. Overpayments are clamped to zero and never alert. Expenses have no currency column and are treated as business-currency amounts.

### Severity rules

| Severity | Overdue invoice | Payment approaching | Partial payment | Upcoming expense | Shortage | Concentration |
| --- | --- | --- | --- | --- | --- | --- |
| `CRITICAL` | 30+ days overdue | — | — | — | Negative within 7 days | Top customer ≥ 75% |
| `WARNING` | 1–29 days overdue | Due in 0–3 days | — | Due in 0–3 days | Negative after 7 days | Top customer 50%–74.99% |
| `INFO` | — | — | Further-out partial balance | — | — | — |

The thresholds are implementation defaults because no PRD or FR-10 source defines them. They live in `src/lib/alert-rules.ts` as `OVERDUE_CRITICAL_DAYS`, `SHORTAGE_CRITICAL_DAYS`, `CONCENTRATION_THRESHOLD_BPS` and `CONCENTRATION_CRITICAL_BPS` so they can be changed in one place.

### Concentration formula

```text
exposure(customer) = SUM(outstanding balance of issued business-currency invoices)
total              = SUM(exposure over all customers with a balance)
share              = floor(exposure(top) * 10000 / total) basis points
alert when total > 0, customers >= 2 and share >= 5000
```

The top customer is the largest exposure; ties are broken by the lower customer id so evaluation is deterministic. Customers with a zero balance are ignored. Only the business currency is counted; multi-currency conversion remains a non-goal. A single-customer book does not alert because there is no comparative concentration and it would otherwise warn on every invoice.

### Lifecycle

| Status | Meaning |
| --- | --- |
| `ACTIVE` | The condition currently exists and the alert is a current warning |
| `RESOLVED` | The condition disappeared; the row is preserved as history and `resolvedAt` is set |
| `DISMISSED` | The owner hid the alert while the condition still exists; it stays hidden until the condition clears, then becomes `RESOLVED` |

Evaluation runs in one transaction:

1. Load the business context and current cash position, open invoices and unpaid expenses.
2. Reuse `buildForecastInput` and `calculateForecast` for the shortage condition. The alert engine never duplicates cash-flow arithmetic.
3. Generate candidates with the pure rules using the business-local date.
4. Insert missing candidates as `ACTIVE` and unread.
5. Update severity, title, description, recommended action and related entity only when they changed; read state and the original `createdAt` are preserved.
6. Resolve every active or dismissed row whose condition no longer exists. Dismissed rows that still match a candidate are counted as `dismissed` and left untouched.
7. Retry once on Prisma `P2002`, then converge on the existing row instead of creating a duplicate.

Read/unread changes are idempotent and only write when the flag changes. Dismissing is idempotent for `DISMISSED` alerts and returns `409 invalid_transition` for `RESOLVED` history. Resolved alerts never reappear; a recurring condition creates a new alert with a new id, preserving the earlier history.

### Dedupe strategy

`dedupeKey` identifies the underlying condition, not the alert instance. The existing partial unique index:

```sql
(alerts.business_id, alerts.dedupe_key) WHERE resolved_at IS NULL AND dedupe_key IS NOT NULL
```

means an `ACTIVE` or `DISMISSED` alert occupies its key while `RESOLVED` rows do not. A resolved condition that returns therefore inserts a fresh alert rather than reopening stale history. A concurrent evaluation that races on the same key is rejected by the index and retried once; the retry sees the winner and updates or leaves it unchanged.

### Evaluation triggers

- `POST /api/v1/businesses/:businessId/alerts/evaluate`
- The **Evaluate alerts** button on `/dashboard/alerts` and the dashboard summary

There is no background job, scheduler, queue or write on a `GET`. The alert list reflects the last explicit evaluation until the owner runs another one.

### REST API

All endpoints require a verified session and a `BusinessMembership` for `(userId, businessId)`. A non-member receives `403 business_forbidden`; every query is scoped by the verified `businessId`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/businesses/:businessId/alerts` | Filtered, paginated alert list plus summary counts |
| `GET` | `/api/v1/businesses/:businessId/alerts/unread-count` | Count of `ACTIVE` unread alerts |
| `POST` | `/api/v1/businesses/:businessId/alerts/evaluate` | Run deterministic evaluation now |
| `GET` | `/api/v1/businesses/:businessId/alerts/:alertId` | Alert detail with a validated related-entity reference |
| `PATCH` | `/api/v1/businesses/:businessId/alerts/:alertId/read` | Mark read (idempotent) |
| `PATCH` | `/api/v1/businesses/:businessId/alerts/:alertId/unread` | Mark unread (idempotent) |
| `PATCH` | `/api/v1/businesses/:businessId/alerts/:alertId/dismiss` | Dismiss until the condition clears |

List query parameters:

| Parameter | Values | Default |
| --- | --- | --- |
| `type` | One of the six alert types | All types |
| `severity` | `INFO`, `WARNING`, `CRITICAL` | All severities |
| `read` | `all`, `read`, `unread` | `all` |
| `status` | `active`, `resolved`, `dismissed`, `all` | `active` |
| `page` | Integer ≥ 1 | `1` |
| `pageSize` | Integer 1–100 | `20` |
| `sort` | `createdAt`, `severity`, `type` | `createdAt` |
| `direction` | `asc`, `desc` | `desc` |

The list response includes `items`, `total`, `page`, `pageSize`, `totalPages` and `counts` (`active`, `unread`, `critical`, `warning`, `info`). Detail adds `relatedEntity` (`type`, `id`, `label`, `href`, `summary`) or `null` when the referenced row no longer exists. A related id is only resolved inside the same business, so another tenant's invoice, expense or customer can never be exposed through an alert.

Errors use the shared envelope: `invalid_request` (400 with field errors), `unauthenticated` (401), `business_forbidden` (403), `alert_not_found` (404), `invalid_transition` (409) and `internal_error` (500).

### UI

- `/dashboard` shows severity and unread counts, the five most severe active alerts, an **Open action center** link, an **Evaluate now** button, and an unread badge on the Alerts nav link.
- `/dashboard/alerts` has the summary tiles, filters for type/severity/read/lifecycle, sorting, pagination, severity indicators, read/unread styling, and empty/error/loading states.
- `/dashboard/alerts/[alertId]` shows what happened, the recommended action, the related record and contextual actions:
  - Invoice alerts: **View invoice**, **Send reminder**; overdue alerts also offer **Prepare follow-up**.
  - Expense alerts: **View expense**.
  - Concentration alerts: **Review customer exposure**.
  - Shortage alerts: **Open forecast**.
- Read/unread and dismiss controls report success only after the server action succeeds. Dismissal asks for confirmation first.
- If a related record was deleted, the detail page keeps the alert as history and states that the recommended action may no longer apply.

### Implementation files

| Area | Files |
| --- | --- |
| Types | `src/types/alert.ts` |
| Rules and thresholds | `src/lib/alert-rules.ts` |
| Validation | `src/lib/validations/alert.ts` |
| Service | `src/server/services/alert-service.ts` |
| Controller / wiring | `src/server/controllers/alert-controller.ts`, `alert-api.ts` |
| Repository | `src/server/repositories/alert-repository.ts` |
| Routes | `src/app/api/v1/businesses/[businessId]/alerts/**` |
| Server actions | `src/server/actions/alert-actions.ts` |
| Pages | `src/app/(dashboard)/dashboard/alerts/{page,loading,error}.tsx`, `[alertId]/page.tsx` |
| Components | `src/components/alerts/*` |
| Migration | `prisma/migrations/20261121192335_smart_alerts_action_center` |
| Tests | `tests/alert-rules.test.ts`, `tests/alert-service.test.ts`, `tests/alert-routes.test.ts` |

### Assumptions and limitations

- Severity thresholds, the 3-day approaching windows, the 7-day critical shortage window and the 50%/75% concentration thresholds are implementation defaults, not PRD requirements. They are documented above and centralized in `alert-rules.ts`.
- Alerts only consider the business currency. Foreign-currency invoices are excluded from invoice alerts and from the concentration denominator; no conversion is attempted.
- `today` is the business-local date from the business timezone, so a UTC timestamp near midnight can belong to a different business day. Evaluation uses one clock read for the date and the forecast.
- The shortage alert is exactly the forecast engine's result for a 30-day horizon. Changing forecast eligibility or formulas changes the alert; the alert layer does not maintain a second cash-flow model.
- Evaluation is explicit. Alerts become stale if financial records change and nobody runs an evaluation. There is no background scheduler, webhook, email, SMS or WhatsApp delivery, and no automatic reminder creation.
- Dismissal is per alert row, not per user. Read state is shared by everyone in the business, so multi-user read receipts are not modelled.
- Resolved rows are retained indefinitely; no retention or archival policy is defined.
- The UI has no bulk read/dismiss, no snooze, and no alert preference/configuration screen.
- `npm audit` reports pre-existing high-severity dependency findings unrelated to this feature.

## Demo dataset and walkthrough

The repository includes an idempotent demo seed for hackathon demos and acceptance testing. It creates a **separate** business named `[DEMO] SamonaFlow Studio`; every demo customer, invoice and expense is prefixed with `[DEMO]`, and demo notes say the record is sample data. It never writes into a real business and never deletes a record.

### Create the demo data

1. Sign up or sign in once so Supabase and the profile sync create a `UserProfile`.
2. Run the seed with that account's email:

```bash
DEMO_USER_EMAIL=you@example.com npm run db:seed-demo
```

The script loads `.env.local` and then `.env`, uses the existing Prisma client, and is safe to re-run: fixed ids are upserted, invoice items are replaced transactionally, and alert evaluation is deterministic. If the demo business already belongs to another user, the seed stops instead of taking it over.

What it creates:

| Record | Count | Purpose |
| --- | --- | --- |
| Business | 1 | `[DEMO] SamonaFlow Studio`, INR, Asia/Kolkata, opening balance `150000.00` |
| Customers | 4 | Active customers with contact details |
| Invoices | 8 | Paid, partially paid, sent, overdue, draft and void examples |
| Payments | 6 | Full, partial, multiple partials, and one reversed payment |
| Expenses | 9 | Paid, upcoming, overdue and cancelled examples |
| Reminders | 2 | One overdue draft and one marked-sent reminder |
| Alerts | generated | Produced by the real alert engine during the seed |

The demo includes a `[DEMO] New production workstation` expense and a quarterly tax set-aside so the 30/60/90-day forecast and shortage alerts have a meaningful story.

### Demo walkthrough

1. Sign in and choose `[DEMO] SamonaFlow Studio` in the header switcher.
2. **Dashboard**: review available cash, outstanding receivables, overdue amount, upcoming expenses, the Action Center and recent transactions. Change the reporting period.
3. **Customers**: open `[DEMO] Aarti Designs` to see the financial summary and invoice history, then edit and archive/restore a demo customer.
4. **Invoices**: open `DEMO-0001` (overdue, partially paid), `DEMO-0002` (due soon), `DEMO-0003` (partial), `DEMO-0004` (paid), `DEMO-0005` (draft), `DEMO-0006` (void), `DEMO-0007` (reversed payment) and `DEMO-0008` (discount plus two partial payments).
5. **Payments**: record a payment against `DEMO-0002`, then reverse it from the payment detail page. Confirm the invoice returns to its prior outstanding balance and that the reversal stays in history.
6. **Expenses**: mark an upcoming expense paid and cancel another. Confirm the cash-flow totals change.
7. **Reminders**: create a reminder from the overdue invoice, copy the generated message and open the WhatsApp click-to-chat link. Mark it sent.
8. **Cash flow**: compare 30/60/90-day forecasts, inspect incoming/outgoing breakdowns, then run a what-if simulation (for example, delay a receivable or add a large expense).
9. **Alerts**: evaluate alerts, then read, dismiss and resolve them. Confirm the Action Center links into the relevant workflow.
10. **Settings**: confirm that currency is locked after activity while timezone and opening balance remain editable, with the documented warnings.

The demo business is isolated by `businessId` like any other tenant. Do not enter real customer data into it. To remove it, delete its dependent records and then the business row; the schema deliberately uses `Restrict` on financial children to prevent accidental cascading deletion.

## Known limitations

- **No background scheduler.** Alerts are evaluated explicitly (UI/API), reminders are never sent automatically, and there is no email/SMS/WhatsApp delivery. WhatsApp is a click-to-chat link only.
- **Single currency per business.** There is no FX conversion or multi-currency reporting. Invoices snapshot their currency; expenses use the business currency.
- **No bank feeds or reconciliation.** Opening balance and recorded payments/expenses are the only cash inputs.
- **Forecast is deterministic, not predictive.** It uses known invoice and expense dates and documented eligibility rules; it does not learn from history.
- **Alerts can be stale.** If financial records change after evaluation, re-run evaluation. Resolved rows are retained; there is no retention policy, snooze or per-user read receipt.
- **No member invitation or business transfer UI.** The schema supports `STAFF` memberships, but the product only creates the owner membership. Business deletion is not exposed.
- **No tax filing, payroll, inventory, or accounting export.** The product is a cash-flow and receivables tool, not a general ledger.
- **Auth basics only.** Email/password signup and login are implemented; password reset and social login are not part of this scope.
- **Pre-existing dependency findings.** `npm audit` reports high-severity findings in the dependency tree; they are not introduced by the application code and are tracked separately.
- **No real payment processing.** The public-token fields exist in the schema, but the product does not charge cards or reconcile a payment gateway.

The detailed acceptance evidence, requirement mapping and verification results are in [`docs/acceptance-report.md`](docs/acceptance-report.md).

## Deployment

The app is a standard Next.js server deployment; no platform-specific configuration is committed. A typical release:

1. Install with `npm ci` (the `postinstall` hook generates the Prisma client).
2. Provide `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`, `DATABASE_URL` and `DIRECT_URL` in the host's environment. Never commit them.
3. Apply committed migrations with `npx prisma migrate deploy` from a release job. Do not run migrations from the app runtime and do not use `db push`.
4. Build with `npm run build` and start with `npm start`.
5. Add the production `/auth/callback` origin to Supabase's redirect allow list and set the Supabase Site URL to the production origin.
6. Verify `GET /api/v1/health` returns 200 and `database: "connected"` after deployment.

The runtime uses the transaction pooler (`DATABASE_URL`); migrations use the direct/session connection (`DIRECT_URL`). No service-role key is required by the application.

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
  (onboarding)/    first-business / add-business setup (route group)
  (dashboard)/     authenticated shell, navigation, business switcher + module pages
  api/v1/          REST API route handlers (health, customers, invoices, payments, expenses, reminders, dashboard, forecast, simulations, alerts)
  layout.tsx
  page.tsx
proxy.ts           Next.js 16 session refresh and route redirects
components/
  auth/            authentication form controls
  business/        business form, switcher and dashboard navigation
  customers/       customer list, filters, forms, pagination
  invoices/        invoice forms, previews and payment links
  payments/        payment and reversal forms
  expenses/        expense list, filters and forms
  reminders/       reminder list, filters, forms, badges and share actions
  dashboard/       dashboard cards, panels, period selector and loading states
  alerts/          alert list, filters and actions
  forecast/        forecast summary, chart, breakdowns, table and simulator
  ui/              generic UI primitives
  shared/          shared composite components
modules/           feature modules
lib/
  auth/            redirect URL sanitization
  config/          configuration
  supabase/        browser, server, and proxy Supabase clients
  utils/           generic helpers
  validations/     Zod schemas (auth, business, customer, invoice, payment, expense, reminder, dashboard, forecast, alert)
server/
  auth/            session verification, guards, active-business resolution, actions
  controllers/     request parsing and response mapping
  services/        business logic and tenant authorization
  repositories/    data access (Prisma, scoped by businessId)
  actions/         Server Actions for business, customer, invoice, payment, expense, reminder and alert UIs
  utils/           API response helpers
  middleware/      server-side middleware helpers
types/             shared TypeScript types
styles/            additional styles
prisma/
  schema.prisma    authoritative data model
  migrations/      applied SQL migrations
  seed-demo.ts     labelled, idempotent demo dataset
```

## Health check

`GET /api/v1/health` returns `{ success, status, database, timestamp }`. See [Local database verification](#local-database-verification).
