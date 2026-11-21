# samonaflow

samonaFlow is a financial management SaaS platform for freelancers and independent professionals. The foundation includes the application scaffold, architecture folders, a health-check API, configuration, and Supabase email/password authentication with Prisma profile synchronization. The Customer, Invoice, Payment and Expense Management modules are implemented, each with a REST API, server-side tenant authorization and dashboard UI.

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
npm test           # node:test unit/integration tests
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

`requireApiUser` accepts either `Authorization: Bearer <access_token>` (verified with `getUser(token)`) or the SSR session cookie.

Business/tenant authorization is performed in the service layer. See [Customer Management](#customer-management) for the pattern: the verified user id is used to look up a `BusinessMembership` for the requested `businessId`, and every repository query is then scoped by that verified `businessId`. A `customerId` is never sufficient on its own.

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
- The detail response derives totals from invoices and their non-reversed payments. VOID invoices are excluded from totals but kept in history. `OVERDUE` counts use the stored status, since the business timezone is not available here.
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
  (dashboard)/     authenticated dashboard + module pages (route group)
  api/v1/          REST API route handlers (health, customers, invoices, payments, expenses, reminders)
  layout.tsx
  page.tsx
proxy.ts           Next.js 16 session refresh and route redirects
components/
  auth/            authentication form controls
  customers/       customer list, filters, forms, pagination
  invoices/        invoice forms, previews and payment links
  payments/        payment and reversal forms
  expenses/        expense list, filters and forms
  reminders/       reminder list, filters, forms, badges and share actions
  ui/              generic UI primitives
  shared/          shared composite components
modules/           feature modules
lib/
  auth/            redirect URL sanitization
  config/          configuration
  supabase/        browser, server, and proxy Supabase clients
  utils/           generic helpers
  validations/     Zod schemas
server/
  auth/            session verification, guards, business resolution, actions
  controllers/     request parsing and response mapping
  services/        business logic and tenant authorization
  repositories/    data access (Prisma, scoped by businessId)
  actions/         Server Actions for customer, invoice, payment, expense and reminder UIs
  utils/           API response helpers
  middleware/      server-side middleware helpers
types/             shared TypeScript types
styles/            additional styles
```

## Health check

`GET /api/v1/health` returns `{ success, status, database, timestamp }`. See [Local database verification](#local-database-verification).
