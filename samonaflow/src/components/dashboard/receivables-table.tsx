import Link from "next/link";
import { parseSignedMoney } from "@/lib/invoice-math";
import type { InvoiceStatusValue } from "@/types/invoice";
import type { DashboardReceivableRow } from "@/types/dashboard";
import { CursorPaginator } from "./dashboard-controls";
import { DashboardCard, DashboardEmpty, formatDashboardMoney, StatusBadge, type Tone } from "./dashboard-ui";

const STATUS: Record<InvoiceStatusValue, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SENT: { label: "Sent", tone: "brand" },
  PARTIALLY_PAID: { label: "Partially paid", tone: "warning" },
  PAID: { label: "Paid", tone: "positive" },
  OVERDUE: { label: "Overdue", tone: "negative" },
  VOID: { label: "Void", tone: "neutral" },
};

function money(value: string, currency: string): string {
  return formatDashboardMoney(parseSignedMoney(value), currency);
}

export function ReceivablesTable({
  rows,
  nextCursor,
}: {
  rows: DashboardReceivableRow[];
  nextCursor: string | null;
}) {
  return (
    <DashboardCard
      title="Outstanding receivables"
      subtitle="Issued invoices with a balance still to collect"
      action={
        <Link href="/dashboard/invoices" className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-200">
          All invoices →
        </Link>
      }
    >
      {rows.length === 0 ? (
        <DashboardEmpty
          title="Nothing outstanding"
          message="Every issued invoice has been paid in full. New receivables will appear here once an invoice is sent."
          href="/dashboard/invoices/new"
          linkLabel="Create an invoice"
        />
      ) : (
        <div className="-mx-2 overflow-x-auto px-2">
          <table className="min-w-[960px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <th className="py-2 pr-4 font-medium">Customer</th>
                <th className="py-2 pr-4 font-medium">Invoice</th>
                <th className="py-2 pr-4 text-right font-medium">Invoice amount</th>
                <th className="py-2 pr-4 text-right font-medium">Amount paid</th>
                <th className="py-2 pr-4 text-right font-medium">Outstanding</th>
                <th className="py-2 pr-4 font-medium">Due date</th>
                <th className="py-2 pr-4 text-right font-medium">Days overdue</th>
                <th className="py-2 pr-4 font-medium">Payment status</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((row) => {
                const status = STATUS[row.displayStatus];
                return (
                  <tr
                    key={row.id}
                    className={row.isOverdue ? "bg-red-50/60 dark:bg-red-950/20" : undefined}
                  >
                    <td className="py-3 pr-4 font-medium text-slate-800 dark:text-slate-100">{row.customerName}</td>
                    <td className="py-3 pr-4">
                      <Link href={`/dashboard/invoices/${row.id}`} className="text-brand-700 hover:underline dark:text-brand-200">
                        {row.invoiceNumber}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-slate-600 dark:text-slate-300">{money(row.totalAmount, row.currency)}</td>
                    <td className="py-3 pr-4 text-right tabular-nums text-slate-600 dark:text-slate-300">
                      {money(row.amountPaid, row.currency)}
                      {row.isPartiallyPaid ? (
                        <span className="mt-1 block text-[11px] font-medium text-warning dark:text-amber-300">Partial payment</span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-50">{money(row.outstanding, row.currency)}</td>
                    <td className="py-3 pr-4 tabular-nums text-slate-600 dark:text-slate-300">{row.dueDate}</td>
                    <td className={`py-3 pr-4 text-right tabular-nums ${row.isOverdue ? "font-semibold text-negative dark:text-red-300" : "text-slate-500"}`}>
                      {row.isOverdue ? row.daysOverdue : "—"}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                        {row.isPartiallyPaid ? <StatusBadge tone="warning">Partly paid</StatusBadge> : null}
                      </div>
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-3 text-xs font-medium">
                        <Link href={`/dashboard/invoices/${row.id}`} className="text-brand-700 hover:underline dark:text-brand-200">View</Link>
                        <Link href={`/dashboard/reminders/new?invoiceId=${row.id}`} className="text-slate-600 hover:underline dark:text-slate-300">Remind</Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4">
        <CursorPaginator pathParam="recvPath" nextCursor={nextCursor} label="receivables" />
      </div>
    </DashboardCard>
  );
}
