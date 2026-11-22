import Link from "next/link";
import { Plus, Receipt } from "lucide-react";
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

const PRIMARY_LINK =
  "inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900";

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
      action={
        <div className="flex flex-wrap items-center gap-2">
          <InlineLink href="/dashboard/expenses">All expenses</InlineLink>
          <Link href="/dashboard/expenses/new" className={PRIMARY_LINK}>
            <Plus className="size-3" aria-hidden="true" />
            New expense
          </Link>
        </div>
      }
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
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-4 py-2.5">
            <div className="flex items-center gap-2 text-[11px] text-zinc-500">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-2 py-1 font-medium text-zinc-700">
                <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                Due soon
              </span>
              <span>
                {rows.length} unpaid expense{rows.length === 1 ? "" : "s"}
                <span className="hidden sm:inline"> · Amounts in {currency}</span>
              </span>
            </div>
            <InlineLink href="/dashboard/expenses?status=UPCOMING">View all unpaid</InlineLink>
          </div>

          <ul aria-label="Unpaid expenses, overdue first" className="divide-y divide-zinc-100">
            {rows.map((row) => (
              <li
                key={row.id}
                className={`flex flex-wrap items-center gap-3 px-4 py-3 transition-colors ${
                  row.isOverdue ? "bg-rose-50/50 hover:bg-rose-50" : "hover:bg-zinc-50/70"
                }`}
              >
                <span
                  className={`grid size-8 shrink-0 place-items-center rounded-lg ${
                    row.isOverdue
                      ? "bg-rose-100 text-rose-600"
                      : "bg-zinc-100 text-zinc-500"
                  }`}
                  aria-hidden="true"
                >
                  <Receipt className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/dashboard/expenses/${row.id}`}
                    className="block truncate text-sm font-medium text-zinc-900 hover:underline"
                  >
                    {row.title}
                  </Link>
                  <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                    {EXPENSE_CATEGORY_LABELS[row.category]} · Due{" "}
                    <span
                      className={
                        row.isOverdue ? "font-semibold text-rose-600" : "tabular-nums text-zinc-600"
                      }
                    >
                      {row.dueDate}
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <p className="text-sm font-semibold tabular-nums text-zinc-900">
                    {formatMajor(row.amount, row.currency)}
                  </p>
                  <ExpenseStatusBadge status={row.displayStatus} />
                </div>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 px-4 py-3">
            <p className="text-[11px] text-zinc-500">
              {rows.length} unpaid expense{rows.length === 1 ? "" : "s"} on this page. Overdue items
              are highlighted first.
            </p>
            <InlineLink href="/dashboard/expenses">Manage expenses</InlineLink>
          </div>
        </>
      )}
    </DashboardSection>
  );
}
