import Link from "next/link";
import type { ReactNode } from "react";
import { connection } from "next/server";
import { EvaluateAlertsButton } from "@/components/alerts/alert-actions";
import { AlertSeverityBadge } from "@/components/alerts/alert-layout";
import { ALERT_TYPE_LABELS } from "@/lib/alert-rules";
import { formatMoney, parseMoney } from "@/lib/invoice-math";
import { listAlertsQuerySchema } from "@/lib/validations/alert";
import { dashboardPresetSchema } from "@/lib/validations/dashboard";
import { requireUser } from "@/server/auth/require-auth";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { alertService } from "@/server/services/alert-service";
import { dashboardService } from "@/server/services/dashboard-service";
import { TrendsChart } from "./trends-chart";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const DEFAULT_PRESET = "last_30_days";

const PRESET_LABELS: Record<(typeof dashboardPresetSchema.options)[number], string> = {
  last_30_days: "Last 30 days",
  this_month: "This month",
  last_month: "Last month",
  year_to_date: "Year to date",
};

// Money stays in BIGINT minor units; formatting goes through formatMoney (invoice-math),
// which renders a canonical 2-decimal string. Number() is used only for chart values.
function withCode(minor: bigint, currency: string): string {
  return `${currency} ${formatMoney(minor)}`;
}

function toMajor(minor: bigint): number {
  return Number(formatMoney(minor));
}

function daysOverdue(dueDate: string, today: string): number {
  const days = Math.round((Date.parse(today) - Date.parse(dueDate)) / 86_400_000);
  return Number.isNaN(days) ? 0 : Math.max(0, days);
}

function StatCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-gray-900">{value}</p>
      {helper ? <p className="mt-1 text-xs text-gray-500">{helper}</p> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-base font-semibold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}

const EMPTY_CLASS = "py-6 text-center text-sm text-gray-500";
const NAV_LINK_CLASS = "rounded-md border border-gray-200 bg-white px-3 py-2 text-center hover:bg-gray-50";

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  // The dashboard resolves "today" in the business timezone below, so it must
  // render at request time rather than being prerendered with a frozen clock.
  await connection();

  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  if (!business.ok) {
    return <p className="p-6 text-sm text-gray-600">No business is linked to your account yet.</p>;
  }

  const raw = await searchParams;
  const presetValue = Array.isArray(raw.preset) ? raw.preset[0] : raw.preset;
  const parsed = dashboardPresetSchema.safeParse(presetValue);
  const preset = parsed.success ? parsed.data : DEFAULT_PRESET;
  const granularity = preset === "year_to_date" ? "month" : "day";

  // The summary resolves the preset to a concrete range; trends need that explicit from/to.
  const summary = await dashboardService.getSummary(user, business.businessId, { preset });
  const [trends, receivables, activity, reminders, alerts] = await Promise.all([
    dashboardService.getTrends(user, business.businessId, {
      from: summary.range.from,
      to: summary.range.to,
      granularity,
    }),
    dashboardService.getReceivables(user, business.businessId, { limit: 10 }),
    dashboardService.getRecentActivity(user, business.businessId, { limit: 10 }),
    dashboardService.getReminders(user, business.businessId),
    alertService.list(
      user,
      business.businessId,
      listAlertsQuerySchema.parse({
        pageSize: 5,
        sort: "severity",
        direction: "desc",
      }),
    ),
  ]);

  const currency = receivables.currency;
  const t = summary.totals;
  const cards = [
    { label: "Available cash", value: withCode(BigInt(t.availableCash.amount), currency), helper: "Opening balance plus recorded cash movements" },
    { label: "Total receivables", value: withCode(BigInt(t.totalReceivables.amount), currency) },
    { label: "Overdue receivables", value: withCode(BigInt(t.overdueReceivables.amount), currency) },
    { label: "Income in period (cash)", value: withCode(BigInt(t.incomeInPeriod.amount), currency) },
    { label: "Expenses in period (cash)", value: withCode(BigInt(t.expensesInPeriod.amount), currency) },
    { label: "Net cash movement", value: withCode(BigInt(t.netCashMovementInPeriod.amount), currency) },
    { label: "Invoiced in period (issued value)", value: withCode(BigInt(t.invoicedInPeriod.amount), currency) },
    { label: "Upcoming expenses", value: withCode(BigInt(t.upcomingExpenses.amount), currency), helper: `${t.upcomingExpenses.count} upcoming` },
    { label: "Customers", value: String(summary.counts.customers) },
    { label: "Issued invoices", value: String(summary.counts.issuedInvoices) },
  ];

  const today = reminders.today;
  const activityItems = [
    ...activity.invoices.map((row) => ({
      key: `invoice-${row.id}`,
      type: "Invoice",
      date: row.issueDate,
      reference: row.invoiceNumber,
      customer: row.customerName,
      amount: withCode(parseMoney(row.totalAmount), row.currency),
      href: `/dashboard/invoices/${row.id}`,
    })),
    ...activity.payments.map((row) => ({
      key: `payment-${row.id}`,
      type: "Payment",
      date: row.paymentDate,
      reference: row.invoiceNumber,
      customer: row.customerName,
      amount: withCode(parseMoney(row.amount), row.currency),
      href: `/dashboard/payments/${row.id}`,
    })),
  ]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 15);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Financial dashboard</h1>
        <nav className="flex flex-wrap gap-2" aria-label="Date range">
          {dashboardPresetSchema.options.map((option) => (
            <Link
              key={option}
              href={`/dashboard?preset=${option}`}
              aria-current={option === preset ? "page" : undefined}
              className={`rounded-md border px-3 py-1 text-sm ${
                option === preset
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {PRESET_LABELS[option]}
            </Link>
          ))}
        </nav>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <StatCard key={card.label} label={card.label} value={card.value} helper={card.helper} />
        ))}
      </div>

      <Section title="Smart alerts">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-red-50 px-2 py-1 font-medium text-red-700">
            {alerts.counts.critical} critical
          </span>
          <span className="rounded-full bg-amber-50 px-2 py-1 font-medium text-amber-700">
            {alerts.counts.warning} warning
          </span>
          <span className="rounded-full bg-sky-50 px-2 py-1 font-medium text-sky-700">
            {alerts.counts.info} info
          </span>
          <span className="rounded-full bg-gray-100 px-2 py-1 font-medium text-gray-700">
            {alerts.counts.unread} unread
          </span>
        </div>
        {alerts.items.length === 0 ? (
          <p className={EMPTY_CLASS}>
            No active alerts. Run an evaluation to check the latest conditions.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100 text-sm">
            {alerts.items.map((alert) => (
              <li key={alert.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <AlertSeverityBadge severity={alert.severity} />
                    {!alert.isRead ? (
                      <span
                        className="inline-block h-2 w-2 rounded-full bg-sky-500"
                        aria-label="Unread"
                      />
                    ) : null}
                  </div>
                  <Link
                    href={`/dashboard/alerts/${alert.id}`}
                    className={`mt-1 block truncate hover:underline ${
                      alert.isRead ? "text-gray-700" : "font-medium text-gray-900"
                    }`}
                  >
                    {alert.title}
                  </Link>
                  <p className="truncate text-xs text-gray-500">
                    {ALERT_TYPE_LABELS[alert.type]}
                  </p>
                </div>
                <Link
                  href={`/dashboard/alerts/${alert.id}`}
                  className="shrink-0 text-xs text-gray-600 underline"
                >
                  View
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link href="/dashboard/alerts" className="text-sm font-medium text-gray-900 underline">
            Open action center
          </Link>
          <EvaluateAlertsButton label="Evaluate now" />
        </div>
      </Section>

      <Section title="Trends">
        <TrendsChart
          currency={trends.currency}
          labels={trends.series.map((point) => point.bucketStart)}
          collected={trends.series.map((point) => toMajor(BigInt(point.collected.amount)))}
          invoiced={trends.series.map((point) => toMajor(BigInt(point.invoiced.amount)))}
          expenses={trends.series.map((point) => toMajor(BigInt(point.expenses.amount)))}
        />
      </Section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Receivables">
          {receivables.rows.length === 0 ? (
            <p className={EMPTY_CLASS}>No outstanding receivables.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b text-gray-500">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Customer</th>
                    <th className="py-2 pr-3 font-medium">Invoice</th>
                    <th className="py-2 pr-3 font-medium">Outstanding</th>
                    <th className="py-2 pr-3 font-medium">Due date</th>
                    <th className="py-2 pr-3 font-medium">Days overdue</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {receivables.rows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">{row.customerName}</td>
                      <td className="py-2 pr-3">{row.invoiceNumber}</td>
                      <td className="py-2 pr-3">{withCode(parseMoney(row.outstanding), receivables.currency)}</td>
                      <td className="py-2 pr-3">{row.dueDate}</td>
                      <td className="py-2 pr-3">{daysOverdue(row.dueDate, today)}</td>
                      <td className="py-2">{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Recent activity">
          {activityItems.length === 0 ? (
            <p className={EMPTY_CLASS}>No recent invoice or payment activity.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {activityItems.map((item) => (
                <li key={item.key} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="mr-2 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{item.type}</span>
                    <Link href={item.href} className="font-medium text-gray-900 hover:underline">
                      {item.reference}
                    </Link>
                    <p className="truncate text-xs text-gray-500">
                      {item.customer} · {item.date}
                    </p>
                  </div>
                  <span className="shrink-0 text-gray-900">{item.amount}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Overdue reminders">
          {reminders.overdue.length === 0 ? (
            <p className={EMPTY_CLASS}>No overdue reminders.</p>
          ) : (
            <ul className="divide-y divide-gray-100 text-sm">
              {reminders.overdue.map((row) => (
                <li key={row.id} className="flex justify-between py-2">
                  <Link href={`/dashboard/reminders/${row.id}`} className="text-gray-900 hover:underline">
                    {row.reminderType}
                  </Link>
                  <span className="text-gray-500">{row.followUpDate}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Upcoming reminders">
          {reminders.upcoming.length === 0 ? (
            <p className={EMPTY_CLASS}>No upcoming reminders.</p>
          ) : (
            <ul className="divide-y divide-gray-100 text-sm">
              {reminders.upcoming.map((row) => (
                <li key={row.id} className="flex justify-between py-2">
                  <Link href={`/dashboard/reminders/${row.id}`} className="text-gray-900 hover:underline">
                    {row.reminderType}
                  </Link>
                  <span className="text-gray-500">{row.followUpDate}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <nav
        className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8"
        aria-label="Sections"
      >
        <Link href="/dashboard/customers" className={NAV_LINK_CLASS}>Customers</Link>
        <Link href="/dashboard/invoices" className={NAV_LINK_CLASS}>Invoices</Link>
        <Link href="/dashboard/payments" className={NAV_LINK_CLASS}>Payments</Link>
        <Link href="/dashboard/expenses" className={NAV_LINK_CLASS}>Expenses</Link>
        <Link href="/dashboard/reminders" className={NAV_LINK_CLASS}>Reminders</Link>
        <Link href="/dashboard/forecast" className={NAV_LINK_CLASS}>Cash flow</Link>
        <Link href="/dashboard/forecast/simulator" className={NAV_LINK_CLASS}>What-if</Link>
        <Link href="/dashboard/alerts" className={NAV_LINK_CLASS}>
          Alerts
          {alerts.counts.unread > 0 ? (
            <span className="ml-2 inline-block rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">
              {alerts.counts.unread}
            </span>
          ) : null}
        </Link>
      </nav>
    </div>
  );
}
