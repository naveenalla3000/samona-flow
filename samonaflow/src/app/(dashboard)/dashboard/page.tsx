import Link from "next/link";
import { connection } from "next/server";
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
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h1 className="text-xl font-semibold text-slate-900">No business is linked yet</h1>
          <p className="mt-2 text-sm text-slate-600">
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

  const cards = [
    {
      label: "Available cash",
      value: formatMinor(totals.availableCash.amount, currency),
      helper: "Opening balance plus recorded cash movements",
      tone: isNegativeMinor(totals.availableCash.amount) ? ("negative" as const) : ("primary" as const),
    },
    {
      label: "Total outstanding receivables",
      value: formatMinor(totals.totalReceivables.amount, currency),
      helper: `${summary.counts.issuedInvoices} issued invoice${summary.counts.issuedInvoices === 1 ? "" : "s"}`,
      tone: "neutral" as const,
    },
    {
      label: "Overdue receivables",
      value: formatMinor(totals.overdueReceivables.amount, currency),
      helper: "Invoices past their due date",
      tone: isPositiveMinor(totals.overdueReceivables.amount)
        ? ("negative" as const)
        : ("positive" as const),
    },
    {
      label: "Total upcoming expenses",
      value: formatMinor(totals.upcomingExpenses.amount, currency),
      helper: `${totals.upcomingExpenses.count} due in the next 30 days`,
      tone: isPositiveMinor(totals.upcomingExpenses.amount)
        ? ("warning" as const)
        : ("positive" as const),
    },
    {
      label: "Total income",
      value: formatMinor(totals.incomeInPeriod.amount, currency),
      helper: `Active payments from ${summary.range.from} to ${summary.range.to}`,
      tone: "positive" as const,
    },
    {
      label: "Total expenses",
      value: formatMinor(totals.expensesInPeriod.amount, currency),
      helper: `Paid expenses from ${summary.range.from} to ${summary.range.to}`,
      tone: isPositiveMinor(totals.expensesInPeriod.amount)
        ? ("negative" as const)
        : ("neutral" as const),
    },
  ];

  const actionData: ActionCenterData | null =
    actions.status === "fulfilled" ? actions.value : null;

  return (
    <main className="min-h-full bg-white">
      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-800">
              SamonaFlow
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900 sm:text-3xl">
              Financial dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Welcome back. Here is your current business position.
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {PERIOD_LABELS[preset]} · {summary.range.from} to {summary.range.to} ·{" "}
              <span className="font-medium text-slate-700">{currency}</span> · business-local dates
            </p>
          </div>
          <PeriodSelector preset={preset} horizon={horizon} />
        </header>

        <section aria-labelledby="summary-heading">
          <h2 id="summary-heading" className="sr-only">
            Financial summary
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card) => (
              <SummaryCard
                key={card.label}
                label={card.label}
                value={card.value}
                helper={card.helper}
                tone={card.tone}
              />
            ))}
          </div>
        </section>

        {cashFlow.status === "fulfilled" ? (
          <CashFlowOverview cashFlow={cashFlow.value} preset={preset} horizon={horizon} />
        ) : (
          <CashFlowUnavailable horizon={horizon} />
        )}

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

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <UpcomingExpensesPanel
            rows={upcomingExpenses.status === "fulfilled" ? upcomingExpenses.value.rows : []}
            currency={
              upcomingExpenses.status === "fulfilled"
                ? upcomingExpenses.value.currency
                : currency
            }
            error={upcomingExpenses.status === "rejected"}
          />

          <ActionCenterPanel
            data={actionData}
            error={actions.status === "rejected"}
          />
        </div>

        <RecentTransactionsPanel
          items={transactions.status === "fulfilled" ? transactions.value.items : []}
          currency={
            transactions.status === "fulfilled" ? transactions.value.currency : currency
          }
          error={transactions.status === "rejected"}
        />

        <nav
          aria-label="Financial sections"
          className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 xl:grid-cols-8"
        >
          <QuickLink href="/dashboard/customers">Customers</QuickLink>
          <QuickLink href="/dashboard/invoices">Invoices</QuickLink>
          <QuickLink href="/dashboard/payments">Payments</QuickLink>
          <QuickLink href="/dashboard/expenses">Expenses</QuickLink>
          <QuickLink href="/dashboard/reminders">Reminders</QuickLink>
          <QuickLink href="/dashboard/forecast">Cash flow</QuickLink>
          <QuickLink href="/dashboard/forecast/simulator">What-if</QuickLink>
          <QuickLink href="/dashboard/alerts">
            <span className="inline-flex items-center gap-2">
              Alerts
              {actionData && actionData.counts.unread > 0 ? (
                <span className="inline-block rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">
                  {actionData.counts.unread}
                </span>
              ) : null}
            </span>
          </QuickLink>
        </nav>

        <footer className="pb-4 text-xs text-slate-500">
          <p>
            Read-only overview. Outstanding balances, overdue days and projections are calculated
            on the server from invoices, active payments and expenses. Reversed payments are
            excluded.{" "}
            <Link href="/dashboard/forecast" className="font-medium text-blue-800 hover:underline">
              Review the full forecast
            </Link>{" "}
            before making commitments.
          </p>
        </footer>
      </div>
    </main>
  );
}
