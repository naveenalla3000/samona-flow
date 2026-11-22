import Link from "next/link";
import { connection } from "next/server";
import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  ChevronRight,
  CreditCard,
  FileText,
  House,
  Plus,
  Receipt,
  SlidersHorizontal,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { z } from "zod";
import { ActionCenterPanel, type ActionCenterData } from "@/components/dashboard/action-center-panel";
import {
  CashFlowOverview,
  CashFlowUnavailable,
} from "@/components/dashboard/cash-flow-overview";
import {
  DASHBOARD_PERIODS,
  formatMinor,
  isNegativeMinor,
  isPositiveMinor,
  PERIOD_LABELS,
  PeriodSelector,
  QuickLink,
  SummaryCard,
} from "@/components/dashboard/dashboard-ui";
import { PeriodFlow } from "@/components/dashboard/period-flow";
import { ReceivablesPanel } from "@/components/dashboard/receivables-panel";
import { RecentTransactionsPanel } from "@/components/dashboard/recent-transactions-panel";
import { UpcomingExpensesPanel } from "@/components/dashboard/upcoming-expenses-panel";
import { forecastQuerySchema } from "@/lib/validations/forecast";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { requireUser } from "@/server/auth/require-auth";
import { dashboardService } from "@/server/services/dashboard-service";
import type { DashboardPeriod } from "@/types/dashboard";

export const metadata = { title: "Dashboard" };

export const instant = false;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parsePeriod(value: string | undefined): DashboardPeriod {
  return DASHBOARD_PERIODS.includes(value as DashboardPeriod)
    ? (value as DashboardPeriod)
    : "this_month";
}

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  // "Today" is resolved in the business timezone below, so the dashboard must
  // render at request time rather than being prerendered with a frozen clock.
  await connection();

  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  if (!business.ok) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center shadow-sm">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-zinc-100 text-zinc-500">
            <Wallet className="size-5" aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-zinc-900">
            No business is linked yet
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Create a business profile before using the financial dashboard.
          </p>
        </div>
      </main>
    );
  }

  const raw = await searchParams;
  const preset = parsePeriod(first(raw.preset));

  const horizonParsed = forecastQuerySchema.safeParse({
    horizon: first(raw.horizon),
    days: first(raw.days),
  });
  const horizon = horizonParsed.success ? horizonParsed.data.horizon : 30;

  const cursorParsed = z.uuid().safeParse(first(raw.receivablesCursor));
  const receivablesCursor = cursorParsed.success ? cursorParsed.data : undefined;

  // The summary resolves the preset to a concrete range and is required for the
  // six headline cards. Section failures below degrade independently.
  const summary = await dashboardService.getSummary(user, business.businessId, { preset });

  const [receivables, upcomingExpenses, cashFlow, actions, transactions] = await Promise.allSettled([
    dashboardService.getReceivables(user, business.businessId, {
      limit: 10,
      cursor: receivablesCursor,
    }),
    dashboardService.getUpcomingExpenses(user, business.businessId, { limit: 10 }),
    dashboardService.getCashFlow(user, business.businessId, { horizon }),
    dashboardService.getActions(user, business.businessId, { limit: 5 }),
    dashboardService.getTransactions(user, business.businessId, { limit: 10 }),
  ]);

  const currency = summary.currency;
  const totals = summary.totals;
  const overduePositive = isPositiveMinor(totals.overdueReceivables.amount);
  const upcomingPositive = isPositiveMinor(totals.upcomingExpenses.amount);

  const cards = [
    {
      label: "Available cash",
      value: formatMinor(totals.availableCash.amount, currency),
      helper: "Opening balance plus recorded cash movements",
      tone: isNegativeMinor(totals.availableCash.amount) ? ("negative" as const) : ("primary" as const),
      badge: "Liquid",
      badgeTone: "neutral" as const,
      icon: <Wallet className="size-3.5" />,
    },
    {
      label: "Receivables",
      value: formatMinor(totals.totalReceivables.amount, currency),
      helper: `${summary.counts.issuedInvoices} issued invoice${summary.counts.issuedInvoices === 1 ? "" : "s"}`,
      tone: "neutral" as const,
      badge: `${summary.counts.issuedInvoices} issued`,
      badgeTone: "brand" as const,
      icon: <FileText className="size-3.5" />,
    },
    {
      label: "Overdue",
      value: formatMinor(totals.overdueReceivables.amount, currency),
      helper: "Invoices past their due date",
      tone: overduePositive ? ("negative" as const) : ("positive" as const),
      badge: overduePositive ? "Needs attention" : "Clear",
      badgeTone: overduePositive ? ("negative" as const) : ("positive" as const),
      icon: <AlertTriangle className="size-3.5" />,
    },
    {
      label: "Upcoming expenses",
      value: formatMinor(totals.upcomingExpenses.amount, currency),
      helper: `${totals.upcomingExpenses.count} due in the next 30 days`,
      tone: upcomingPositive ? ("warning" as const) : ("positive" as const),
      badge: `${totals.upcomingExpenses.count} due`,
      badgeTone: upcomingPositive ? ("warning" as const) : ("positive" as const),
      icon: <CalendarClock className="size-3.5" />,
    },
  ];

  const actionData: ActionCenterData | null =
    actions.status === "fulfilled" ? actions.value : null;

  return (
    <main className="min-h-full">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-zinc-500 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
            >
              <House className="size-4" aria-hidden="true" />
              Home
            </Link>
            <ChevronRight className="size-3.5 text-zinc-300" aria-hidden="true" />
            <span className="font-medium text-zinc-900">Overview</span>
          </nav>

          <div className="flex flex-wrap items-center gap-2">
            <PeriodSelector preset={preset} horizon={horizon} />
            <Link
              href="/dashboard/invoices/new"
              className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3.5 py-2 text-xs font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              New invoice
            </Link>
          </div>
        </div>

        <header className="mt-5">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-[28px]">
            Financial overview
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Welcome back. {PERIOD_LABELS[preset]} · {summary.range.from} to {summary.range.to} ·{" "}
            <span className="font-medium text-zinc-700">{currency}</span> · business-local dates
          </p>
        </header>

        <section
          aria-labelledby="summary-heading"
          className="mt-5 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgb(24_24_27_/_0.04)]"
        >
          <div className="relative flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
            <div
              className="dither-dots pointer-events-none absolute inset-0 opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent)]"
              aria-hidden="true"
            />
            <div className="relative min-w-0">
              <h2
                id="summary-heading"
                className="text-sm font-semibold tracking-tight text-zinc-900 sm:text-base"
              >
                Performance overview
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Key financial indicators for {PERIOD_LABELS[preset].toLowerCase()} across all
                accounts.
              </p>
            </div>
            <div className="relative flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white/80 px-2.5 py-1 text-[10px] font-medium text-zinc-600 backdrop-blur">
                <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                Live
              </span>
              <span className="rounded-full border border-zinc-200 bg-white/80 px-2.5 py-1 text-[10px] font-medium text-zinc-600 backdrop-blur">
                {currency}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 divide-y divide-zinc-100 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
            {cards.map((card) => (
              <SummaryCard
                key={card.label}
                label={card.label}
                value={card.value}
                helper={card.helper}
                tone={card.tone}
                icon={card.icon}
                badge={card.badge}
                badgeTone={card.badgeTone}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 bg-zinc-50/60 px-5 py-3 text-[11px] text-zinc-500">
            <p>
              {summary.counts.issuedInvoices} issued invoice
              {summary.counts.issuedInvoices === 1 ? "" : "s"} tracked across{" "}
              {summary.counts.customers} customer{summary.counts.customers === 1 ? "" : "s"}.
            </p>
            <Link
              href="/dashboard/forecast"
              className="inline-flex items-center gap-1 font-medium text-zinc-700 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
            >
              Show full analytics
              <TrendingUp className="size-3" aria-hidden="true" />
            </Link>
          </div>
        </section>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
          {cashFlow.status === "fulfilled" ? (
            <div className="xl:col-span-2">
              <CashFlowOverview cashFlow={cashFlow.value} preset={preset} horizon={horizon} />
            </div>
          ) : (
            <div className="xl:col-span-2">
              <CashFlowUnavailable horizon={horizon} />
            </div>
          )}
          <PeriodFlow
            income={totals.incomeInPeriod.amount}
            expenses={totals.expensesInPeriod.amount}
            currency={currency}
            preset={preset}
          />
        </div>

        <div className="mt-4">
          <ReceivablesPanel
            rows={receivables.status === "fulfilled" ? receivables.value.rows : []}
            currency={receivables.status === "fulfilled" ? receivables.value.currency : currency}
            nextCursor={
              receivables.status === "fulfilled" ? receivables.value.nextCursor : null
            }
            currentCursor={receivablesCursor}
            preset={preset}
            horizon={horizon}
            error={receivables.status === "rejected"}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2 xl:items-start">
          <UpcomingExpensesPanel
            rows={upcomingExpenses.status === "fulfilled" ? upcomingExpenses.value.rows : []}
            currency={
              upcomingExpenses.status === "fulfilled"
                ? upcomingExpenses.value.currency
                : currency
            }
            error={upcomingExpenses.status === "rejected"}
          />

          <ActionCenterPanel data={actionData} error={actions.status === "rejected"} />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <RecentTransactionsPanel
              items={transactions.status === "fulfilled" ? transactions.value.items : []}
              currency={
                transactions.status === "fulfilled" ? transactions.value.currency : currency
              }
              error={transactions.status === "rejected"}
            />
          </div>

          <section
            aria-labelledby="shortcuts-heading"
            className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgb(24_24_27_/_0.04)]"
          >
            <header className="border-b border-zinc-100 px-5 py-4">
              <h2
                id="shortcuts-heading"
                className="text-sm font-semibold tracking-tight text-zinc-900 sm:text-base"
              >
                Shortcuts
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500">Jump to another financial section.</p>
            </header>
            <nav
              aria-label="Financial sections"
              className="grid flex-1 grid-cols-2 content-start gap-2 p-3"
            >
              <QuickLink href="/dashboard/customers" icon={<Users className="size-4" />} description="Clients">
                Customers
              </QuickLink>
              <QuickLink href="/dashboard/invoices" icon={<FileText className="size-4" />} description="Billing">
                Invoices
              </QuickLink>
              <QuickLink href="/dashboard/payments" icon={<CreditCard className="size-4" />} description="Incoming">
                Payments
              </QuickLink>
              <QuickLink href="/dashboard/expenses" icon={<Receipt className="size-4" />} description="Outgoing">
                Expenses
              </QuickLink>
              <QuickLink href="/dashboard/reminders" icon={<BellRing className="size-4" />} description="Follow-ups">
                Reminders
              </QuickLink>
              <QuickLink href="/dashboard/forecast" icon={<TrendingUp className="size-4" />} description="Projection">
                Cash flow
              </QuickLink>
              <QuickLink
                href="/dashboard/forecast/simulator"
                icon={<SlidersHorizontal className="size-4" />}
                description="Scenarios"
              >
                What-if
              </QuickLink>
              <QuickLink
                href="/dashboard/alerts"
                icon={<AlertTriangle className="size-4" />}
                description="Risk feed"
              >
                <span className="inline-flex items-center gap-1.5">
                  Alerts
                  {actionData && actionData.counts.unread > 0 ? (
                    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {actionData.counts.unread}
                    </span>
                  ) : null}
                </span>
              </QuickLink>
            </nav>
          </section>
        </div>

        <footer className="py-5 text-[11px] leading-relaxed text-zinc-500">
          <p>
            Read-only overview. Outstanding balances, overdue days and projections are calculated
            on the server from invoices, active payments and expenses. Reversed payments are
            excluded.{" "}
            <Link
              href="/dashboard/forecast"
              className="font-medium text-zinc-700 underline-offset-4 hover:text-zinc-900 hover:underline"
            >
              Review the full forecast
            </Link>{" "}
            before making commitments.
          </p>
        </footer>
      </div>
    </main>
  );
}
