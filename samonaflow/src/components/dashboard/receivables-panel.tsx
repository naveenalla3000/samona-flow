import Link from "next/link";
import { Plus } from "lucide-react";
import { StatusBadge } from "@/components/invoices/invoice-layout";
import type { DashboardPeriod, DashboardReceivable } from "@/types/dashboard";
import {
  DashboardSection,
  EmptyState,
  formatMajor,
  InlineLink,
  SectionError,
} from "./dashboard-ui";

const ACTION_LINK =
  "inline-flex items-center rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900";

const PRIMARY_LINK =
  "inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900";

export function ReceivablesPanel({
  rows,
  currency,
  nextCursor,
  currentCursor,
  preset,
  horizon,
  error = false,
}: {
  rows: DashboardReceivable[];
  currency: string;
  nextCursor: string | null;
  currentCursor?: string;
  preset: DashboardPeriod;
  horizon: number;
  error?: boolean;
}) {
  const nextHref = nextCursor
    ? `/dashboard?preset=${preset}&horizon=${horizon}&receivablesCursor=${nextCursor}`
    : null;

  return (
    <DashboardSection
      id="receivables"
      title="Receivables"
      description="Open invoices with a positive outstanding balance. Overdue invoices are listed first."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <InlineLink href="/dashboard/invoices">All invoices</InlineLink>
          <Link href="/dashboard/invoices/new" className={PRIMARY_LINK}>
            <Plus className="size-3" aria-hidden="true" />
            New invoice
          </Link>
        </div>
      }
      bodyClassName="p-0"
    >
      {error ? (
        <div className="p-5">
          <SectionError message="Outstanding invoices could not be loaded. Refresh the page to try again." />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-5">
          <EmptyState
            title="No outstanding receivables"
            description="Every issued invoice is paid, or no invoices have been issued yet."
            action={<InlineLink href="/dashboard/invoices/new">Create an invoice</InlineLink>}
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-4 py-2.5">
            <div className="flex items-center gap-2 text-[11px] text-zinc-500">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-2 py-1 font-medium text-zinc-700">
                <span className="size-1.5 rounded-full bg-rose-500" aria-hidden="true" />
                Overdue first
              </span>
              <span>
                {rows.length} open invoice{rows.length === 1 ? "" : "s"}
                <span className="hidden sm:inline"> · Amounts in {currency}</span>
              </span>
            </div>
            <InlineLink href="/dashboard/payments">Record a payment</InlineLink>
          </div>

          <div className="relative min-w-0 overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <caption className="sr-only">
                Open receivables, overdue first, with totals, outstanding balances, due dates and
                reminder actions.
              </caption>
              <thead className="border-b border-zinc-100 bg-zinc-50/80 text-[11px] uppercase tracking-[0.08em] text-zinc-500">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Customer</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Invoice</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Total</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Outstanding</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Due</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((row) => {
                  const rowClass = row.isOverdue
                    ? "bg-rose-50/50 hover:bg-rose-50"
                    : row.isPartiallyPaid
                      ? "bg-amber-50/40 hover:bg-amber-50/70"
                      : "hover:bg-zinc-50/70";
                  return (
                    <tr key={row.id} className={`transition-colors ${rowClass}`}>
                      <td className="max-w-[12rem] truncate px-4 py-3 font-medium text-zinc-900">
                        <Link
                          href={`/dashboard/customers/${row.customerId}`}
                          className="hover:underline"
                        >
                          {row.customerName}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Link
                          href={`/dashboard/invoices/${row.id}`}
                          className="font-medium text-blue-700 hover:underline"
                        >
                          {row.invoiceNumber}
                        </Link>
                        {row.isPartiallyPaid ? (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                            Partial
                          </span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-zinc-600">
                        <span className="block">{formatMajor(row.totalAmount, row.currency)}</span>
                        <span className="block text-[10px] text-zinc-400">
                          Paid {formatMajor(row.amountPaid, row.currency)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-zinc-900">
                        {formatMajor(row.outstanding, row.currency)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-zinc-600">
                        <span className="block">{row.dueDate}</span>
                        {row.daysOverdue > 0 ? (
                          <span className="block text-[10px] font-semibold text-rose-600">
                            {row.daysOverdue} day{row.daysOverdue === 1 ? "" : "s"} overdue
                          </span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <StatusBadge status={row.displayStatus} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <Link
                          href={`/dashboard/reminders/new?invoiceId=${encodeURIComponent(row.id)}`}
                          className={ACTION_LINK}
                        >
                          Remind
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 px-4 py-3">
            <p className="text-[11px] text-zinc-500">
              {rows.length} open invoice{rows.length === 1 ? "" : "s"} on this page.
              {nextCursor ? " More are available." : ""}
            </p>
            <div className="flex items-center gap-3">
              {currentCursor ? (
                <InlineLink href={`/dashboard?preset=${preset}&horizon=${horizon}`}>
                  First page
                </InlineLink>
              ) : null}
              {nextHref ? <InlineLink href={nextHref}>Next page</InlineLink> : null}
            </div>
          </div>
        </>
      )}
    </DashboardSection>
  );
}
