import Link from "next/link";
import { ExpenseStatusBadge } from "@/components/expenses/expense-layout";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/expense-status";
import type { DashboardUpcomingExpense } from "@/types/dashboard";
import {
  DashboardSection,
  EmptyState,
  formatMajor,
  InlineLink,
  SectionError,
} from "./dashboard-ui";

const ACTION_LINK =
  "rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800";

export function UpcomingExpensesPanel({
  rows,
  currency,
  error = false,
}: {
  rows: DashboardUpcomingExpense[];
  currency: string;
  error?: boolean;
}) {
  return (
    <DashboardSection
      id="upcoming-expenses"
      title="Upcoming expenses"
      description="Unpaid expenses, overdue first. Paid and cancelled expenses are excluded."
      action={<InlineLink href="/dashboard/expenses">All expenses</InlineLink>}
      bodyClassName="p-0"
    >
      {error ? (
        <div className="p-5">
          <SectionError message="Upcoming expenses could not be loaded. Refresh the page to try again." />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-5">
          <EmptyState
            title="No unpaid expenses"
            description="Paid and cancelled expenses are excluded. Add an expense to plan upcoming cash outflows."
            action={<InlineLink href="/dashboard/expenses/new">Add an expense</InlineLink>}
          />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <caption className="sr-only">
                Unpaid expenses ordered overdue first, then by due date.
              </caption>
              <thead className="border-b border-slate-200 bg-white text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Description</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Category</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Amount</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Due</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className={row.isOverdue ? "bg-red-50/60" : ""}>
                    <td className="max-w-[14rem] px-4 py-3">
                      <Link
                        href={`/dashboard/expenses/${row.id}`}
                        className="block truncate font-medium text-slate-900 hover:underline"
                      >
                        {row.title}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {EXPENSE_CATEGORY_LABELS[row.category]}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                      {formatMajor(row.amount, row.currency)}
                    </td>
                    <td
                      className={`whitespace-nowrap px-4 py-3 tabular-nums ${
                        row.isOverdue ? "font-semibold text-red-700" : "text-slate-700"
                      }`}
                    >
                      {row.dueDate}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <ExpenseStatusBadge status={row.displayStatus} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Link href={`/dashboard/expenses/${row.id}`} className={ACTION_LINK}>
                        {row.displayStatus === "OVERDUE" ? "Resolve" : "Open"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-500">
              {rows.length} unpaid expense{rows.length === 1 ? "" : "s"} on this page.
            </p>
            <InlineLink href="/dashboard/expenses?status=UPCOMING">View all unpaid</InlineLink>
          </div>
        </>
      )}
      <span className="sr-only">Amounts are shown in {currency}.</span>
    </DashboardSection>
  );
}
