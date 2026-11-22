import Link from "next/link";
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategoryValue } from "@/lib/expense-status";
import { parseSignedMoney } from "@/lib/invoice-math";
import type { ExpenseStatusValue } from "@/types/expense";
import type { DashboardUpcomingExpenseRow } from "@/types/dashboard";
import { CursorPaginator } from "./dashboard-controls";
import { DashboardCard, DashboardEmpty, formatDashboardMoney, StatusBadge, type Tone } from "./dashboard-ui";

const STATUS: Record<ExpenseStatusValue, { label: string; tone: Tone }> = {
  UPCOMING: { label: "Upcoming", tone: "brand" },
  PAID: { label: "Paid", tone: "positive" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  OVERDUE: { label: "Overdue", tone: "negative" },
};

export function UpcomingExpenses({
  rows,
  nextCursor,
}: {
  rows: DashboardUpcomingExpenseRow[];
  nextCursor: string | null;
}) {
  return (
    <DashboardCard
      title="Upcoming expenses"
      subtitle="Unpaid expenses, overdue first · paid and cancelled excluded"
      action={
        <Link href="/dashboard/expenses" className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-200">
          All expenses →
        </Link>
      }
    >
      {rows.length === 0 ? (
        <DashboardEmpty
          title="Nothing due"
          message="You have no unpaid expenses coming up. Paid and cancelled expenses are intentionally excluded."
          href="/dashboard/expenses/new"
          linkLabel="Add an expense"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <th className="py-2 pr-4 font-medium">Description</th>
                <th className="py-2 pr-4 font-medium">Category</th>
                <th className="py-2 pr-4 text-right font-medium">Amount</th>
                <th className="py-2 pr-4 font-medium">Due date</th>
                <th className="py-2 font-medium">Payment status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((row) => {
                const status = STATUS[row.displayStatus];
                const category = EXPENSE_CATEGORY_LABELS[row.category as ExpenseCategoryValue] ?? row.category;
                return (
                  <tr key={row.id} className={row.isOverdue ? "bg-red-50/60 dark:bg-red-950/20" : undefined}>
                    <td className="py-3 pr-4">
                      <Link href={`/dashboard/expenses/${row.id}`} className="font-medium text-slate-800 hover:underline dark:text-slate-100">
                        {row.title}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">{category}</td>
                    <td className="py-3 pr-4 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                      {formatDashboardMoney(parseSignedMoney(row.amount), row.currency)}
                    </td>
                    <td className={`py-3 pr-4 tabular-nums ${row.isOverdue ? "font-semibold text-negative dark:text-red-300" : "text-slate-600 dark:text-slate-300"}`}>
                      {row.dueDate}
                    </td>
                    <td className="py-3">
                      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4">
        <CursorPaginator pathParam="expPath" nextCursor={nextCursor} label="expenses" />
      </div>
    </DashboardCard>
  );
}
