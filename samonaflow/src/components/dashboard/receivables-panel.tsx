import Link from "next/link";
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
  "rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800";

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
      action={<InlineLink href="/dashboard/invoices">All invoices</InlineLink>}
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
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <caption className="sr-only">
                Open receivables, overdue first, with amounts, due dates and reminder actions.
              </caption>
              <thead className="border-b border-slate-200 bg-white text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Customer</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Invoice</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Amount</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Paid</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Outstanding</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Due</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Days overdue</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const rowClass = row.isOverdue
                    ? "bg-red-50/60"
                    : row.isPartiallyPaid
                      ? "bg-amber-50/50"
                      : "";
                  return (
                    <tr key={row.id} className={rowClass}>
                      <td className="max-w-[12rem] truncate px-4 py-3 font-medium text-slate-900">
                        <Link
                          href={`/dashboard/customers/${row.customerId}`}
                          className="hover:underline"
                        >
                          {row.customerName}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/invoices/${row.id}`}
                          className="font-medium text-blue-800 hover:underline"
                        >
                          {row.invoiceNumber}
                        </Link>
                        {row.isPartiallyPaid ? (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                            Partial
                          </span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-700">
                        {formatMajor(row.totalAmount, row.currency)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-700">
                        {formatMajor(row.amountPaid, row.currency)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                        {formatMajor(row.outstanding, row.currency)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-700">
                        {row.dueDate}
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3 text-right tabular-nums ${
                          row.isOverdue ? "font-semibold text-red-700" : "text-slate-500"
                        }`}
                      >
                        {row.daysOverdue > 0 ? row.daysOverdue : "—"}
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
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-500">
              {rows.length} open invoice{rows.length === 1 ? "" : "s"} on this page.
              {nextCursor ? " More are available." : ""}
            </p>
            <div className="flex items-center gap-3">
              <InlineLink href="/dashboard/payments">Record a payment</InlineLink>
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
      <span className="sr-only">
        Amounts are shown in {currency}. Outstanding is calculated on the server from invoice
        totals and active payments.
      </span>
    </DashboardSection>
  );
}
