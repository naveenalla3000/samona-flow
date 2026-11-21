# SamonaFlow — Prompt 19 acceptance report

**Scope:** end-to-end integration, financial/API/security audit, product acceptance, demo dataset, documentation and hackathon readiness.

**Repository:** `samonaflow/` (Next.js app). No deployment or production changes were made.

**Date:** 2026-11-22

## 1. Verification summary

| Check | Command | Result |
| --- | --- | --- |
| Unit/integration tests | `npm test` | **414 passed, 0 failed** |
| Type check | `npx tsc --noEmit` | **Passed (exit 0)** |
| Lint | `npm run lint` | **Passed** |
| Production build | `npm run build` | **Compiled successfully**; all page/API routes generated |
| Prisma schema | `npx prisma validate` | **Valid** |
| Prisma client | `npx prisma generate` | **Generated** into `src/generated/prisma` |
| Applied migrations | `_prisma_migrations` via runtime connection | **Both migrations applied**, none rolled back |
| Demo seed idempotency | `npm run db:seed-demo` twice | Second run: **0 created, 0 updated, 0 resolved** |
| Live authenticated page smoke | HTTP with a real Supabase session | **112 internal links/pages checked, 0 broken** |
| Empty-business UI smoke | Temporary empty business, then deleted | Empty/loading/error states rendered on every module |
| Demo financial smoke | Real services against the demo business | Totals reconcile (see §3) |

The Prisma CLI's `migrate status` could not reach the configured direct/session host from this environment. Migration state was therefore verified through the runtime pooler: `_prisma_migrations` contains `20260101000000_init` and `20261121192335_smart_alerts_action_center`, both applied and not rolled back. No migration files were added or edited.

## 2. Requirement coverage

| Product area | Implementation | Evidence |
| --- | --- | --- |
| Authentication | Supabase email/password, PKCE callback, profile sync, secure cookies, redirect sanitization | `src/server/auth/*`, `src/app/(auth)/*`, auth tests |
| Onboarding | First business creation after signup; add another business later | `src/app/(onboarding)/*`, `business-actions.ts`, `business-service.test.ts` |
| Multiple businesses | Active-business cookie, switcher, per-business isolation | `src/server/auth/active-business.ts`, `require-business.ts`, layout |
| Business settings | Owner-only profile/currency/timezone/opening-balance edits; currency lock | `settings/page.tsx`, `business-service.ts`, schema/service tests |
| Customers | CRUD, search, filters, pagination, archive/restore, financial summary | customer service/repository/controller/UI + tests |
| Invoices | Draft/create/edit, send, void, preview, line items, discount/tax, numbering | invoice service/repository/controller/UI + tests |
| Payments | Full/partial payments, reversal, outstanding balance, concurrency lock | payment service/repository/controller/UI + tests |
| Expenses | Create/edit, pay, cancel, overdue derivation, categories | expense service/repository/controller/UI + tests |
| Reminders | Create from invoice, generated message, copy, WhatsApp link, mark sent | reminder service/repository/controller/UI + tests |
| Dashboard | Summary cards, periods, receivables, expenses, cash flow, action center, transactions | dashboard service/repository/controller/UI + tests |
| Cash-flow forecast | 30/60/90-day deterministic forecast, daily/monthly, breakdowns | `forecast-math.ts`, forecast service/repository/UI + tests |
| What-if simulation | Delay/reduce receivables, add/remove expenses, no persistence | simulation service/math/controller/UI + tests |
| Smart alerts | Shortage, overdue, due-soon, expense alerts; read/dismiss/resolve; dedupe | alert rules/service/repository/controller/UI + tests |
| Tenant security | Membership check on every service operation; repositories scoped by `businessId` | service tests + data-integrity tests |
| Demo data | Labelled, isolated, idempotent seed | `prisma/seed-demo.ts`, live run |

## 3. Financial correctness audit

- **No floating point in money paths.** Invoice totals, payments, expenses, forecasts and simulations use canonical decimal strings and `BigInt` minor units (`src/lib/invoice-math.ts`, `payment-math.ts`, `forecast-math.ts`). Prisma writes `Decimal(12, 2)` through `moneyDecimal`.
- **Invoice totals** are recomputed on the server from line items; client line totals and totals are ignored. Each line is rounded HALF_UP to 2dp before summing, matching the DB check constraint.
- **Payments** are append-only. Reversed payments remain in history but are excluded from paid/outstanding totals through `paymentReversals`. Reversal is transactional and idempotent; a second reversal is rejected.
- **Invoice status** is derived from active receipts (`PAID`, `PARTIALLY_PAID`, else `SENT`/`OVERDUE`). Display status additionally derives `OVERDUE` from the business-local date.
- **Customer summaries** exclude `DRAFT` and `VOID` invoices from totals while keeping them in history. A regression test covers the DRAFT case.
- **Expenses** count as cash only when `PAID` with a `paymentDate`; cancelled expenses are excluded; overdue is derived from the business-local date.
- **Forecast** uses only eligible outstanding invoices and unpaid expenses, projects overdue items on the start date, and never mixes currencies.
- **Simulation** reuses the forecast engine and performs adjustments in memory; it never persists scenario rows.

Live demo reconciliation (INR):

| Metric | Value |
| --- | --- |
| Available cash | 237,000.00 |
| Total receivables | 170,000.00 |
| Overdue receivables | 75,000.00 |
| Upcoming expenses (5) | 401,500.00 |
| Overdue expenses (1) | 18,000.00 |
| 30-day forecast | opening 237,000.00, incoming 170,000.00, outgoing 419,500.00, ending −12,500.00, shortage 2026-12-17 |
| Aarti Designs | invoiced 145,000.00, received 55,000.00, outstanding 90,000.00, 3 invoices |
| Active alerts | 8 (1 critical, 5 warning, 2 info) |

These numbers match the seeded records and the dashboard/forecast/alert engines.

## 4. API audit

All business APIs are under `/api/v1/businesses/:businessId/...` and follow `Route Handler → Controller → Service → Repository`.

| Property | Status |
| --- | --- |
| Authentication | Every controller is wired with `requireApiUser` (bearer token or SSR cookie); only `/api/v1/health` is public |
| Tenant authorization | Services require a `BusinessMembership` for `(verifiedUserId, businessId)`; repositories receive only that verified id |
| Record-level isolation | Guessed ids from another business return 404/forbidden, never data |
| Input validation | Zod validates path ids, bodies and query strings; pagination is bounded (max 100) |
| Error handling | Stable error codes and generic 500 messages; internal details are not returned |
| Status codes | 201 create, 200 read/update, 400 invalid, 401 unauthenticated, 403 forbidden, 404 not found, 500 sanitized |
| Atomicity | Business creation, invoice numbering, payment recording/reversal and expense transitions use transactions/locks |
| Empty states | Lists return empty pages with valid totals; UI renders dedicated empty states |

The proxy is only a session-refresh/UX layer; authorization is enforced inside controllers/services, so direct API calls cannot bypass it.

## 5. Cross-business isolation matrix

Service tests exercise a user from business B attempting to read/write business A's records by swapping ids:

| Record type | Cross-business read | Cross-business write | Test file |
| --- | --- | --- | --- |
| Business | forbidden | forbidden / not owner | `business-service.test.ts` |
| Customer | not found | not found | `customer-service.test.ts` |
| Invoice | not found | not found | `invoice-service.test.ts` |
| Payment | not found | not found | `payment-service.test.ts` |
| Expense | not found | not found | `expense-service.test.ts` |
| Reminder | not found | not found | `reminder-service.test.ts` |
| Dashboard | forbidden | n/a | `dashboard-service.test.ts` |
| Forecast | forbidden | n/a | `forecast-service.test.ts` |
| Simulation | forbidden | n/a | `forecast-simulation-service.test.ts` |
| Alerts | forbidden | forbidden | `alert-service.test.ts` |

Additional guarantees:

- The active-business cookie is re-verified against membership on every resolution; a stale/forged id falls back to the user's first membership.
- The cookie contains no role, owner id or financial data.
- `BusinessRepository.update` is scoped by both `businessId` and `ownerId`.
- Data-integrity tests confirm composite foreign keys pin records to one business.

## 6. UI journeys A–H

Journeys were exercised through the authenticated HTTP-rendered app with the demo business, the empty-business smoke, and the automated service/controller/UI tests. Interactive mutations are covered by the service/controller suites; no browser automation dependency was added.

| Journey | Steps | Result |
| --- | --- | --- |
| **A. Signup → onboarding → dashboard** | Sign up, verify email, land on `/onboarding`, create business, reach dashboard | Pass; onboarding redirects and transactional owner membership verified |
| **B. Add/switch business + settings** | Add a second business, switch from header, edit settings, attempt currency change after activity | Pass; switcher renders, membership is re-verified, currency lock enforced |
| **C. Customers** | Create, search, sort, paginate, edit, archive/restore, view financial summary | Pass; empty and populated states verified; DRAFT/VOID excluded from totals |
| **D. Invoices** | Create draft with items/discount/tax, edit, send, preview, void, view statuses | Pass; server recomputes totals; lifecycle guards enforced |
| **E. Payments** | Record full/partial payment, view history, reverse, retry reversal | Pass; balances and statuses recalculate; reversal kept in history |
| **F. Expenses** | Create, edit, mark paid, cancel, overdue/upcoming views | Pass; cash flow and dashboard reflect paid expenses only |
| **G. Reminders** | Create from overdue/upcoming invoice, copy message, open WhatsApp link, mark sent | Pass; generated text includes customer, invoice, amount and due date |
| **H. Dashboard / forecast / simulation / alerts** | Change periods, review panels, run 30/60/90 forecasts, run what-if, read/dismiss alerts | Pass; all panels render with data and empty states; alert evaluation is deterministic |

Cross-cutting UI checks:

- Shared authenticated shell with skip link, `aria-current` navigation, business switcher and sign-out.
- Responsive header/navigation with horizontal overflow for small screens; tables use overflow containers.
- Loading, empty and error states exist for dashboard, forecast, simulator, alerts, invoices, payments and reminders; customers/expenses render inline load errors.
- Forms use labels, `aria-invalid`, `aria-describedby`, inline errors and pending/disabled submit states.
- Destructive actions (archive, send, void, reverse, cancel, dismiss) require confirmation.
- The authenticated smoke returned HTTP 200 for all 112 reachable internal pages/links, with no error boundary or 500 response.

## 7. Demo dataset

`npm run db:seed-demo` with `DEMO_USER_EMAIL` creates or updates one isolated `[DEMO] SamonaFlow Studio` business:

- 4 customers, 8 invoices (paid, partial, sent, overdue, draft, void, reversed), 6 payments, 9 expenses, 2 reminders.
- Alerts are produced by the real evaluation engine, not hand-written.
- All demo names/notes are prefixed/labelled; the script never writes into another business and never deletes records.
- Re-running is idempotent; the second run reported 0 changes.
- The walkthrough is documented in the README under “Demo dataset and walkthrough”.

## 8. Known limitations

See the README's “Known limitations” section. The main ones are: no background scheduler or automatic delivery, single currency per business, no bank feeds/reconciliation, deterministic rather than predictive forecasting, alerts require explicit evaluation, no member invitation/business transfer UI, and pre-existing `npm audit` dependency findings.

## 9. Sign-off

Prompt 19 is complete for the repository scope. The application builds, type-checks, lints and passes its full test suite; the schema and both migrations are valid/applied; tenant isolation is enforced at the service/repository boundary; and the demo dataset, walkthrough and acceptance evidence are reproducible.

No deployment, production migration, destructive database reset or unrelated feature work was performed.
