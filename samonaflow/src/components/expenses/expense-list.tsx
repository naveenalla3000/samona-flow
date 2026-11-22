import Link from "next/link";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/expense-status";
import type { ExpenseRecord } from "@/types/expense";
import { ExpenseStatusBadge } from "./expense-layout";

export function ExpenseList({
  expenses,
  emptyMessage = "No expenses match these filters.",
}: {
  expenses: ExpenseRecord[];
  emptyMessage?: string;
}) {
  if (expenses.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="bg-white text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">Title</th>
            <th scope="col" className="px-4 py-3 font-medium">Category</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Amount</th>
            <th scope="col" className="px-4 py-3 font-medium">Due date</th>
            <th scope="col" className="px-4 py-3 font-medium">Payment date</th>
            <th scope="col" className="px-4 py-3 font-medium">Status</th>
            <th scope="col" className="px-4 py-3"><span className="sr-only">Details</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200">
          {expenses.map((expense) => (
            <tr key={expense.id}>
              <td className="px-4 py-3 font-medium">{expense.title}</td>
              <td className="px-4 py-3 text-neutral-500">{EXPENSE_CATEGORY_LABELS[expense.category]}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                {expense.currency} {expense.amount}
              </td>
              <td className="px-4 py-3 tabular-nums">{expense.dueDate}</td>
              <td className="px-4 py-3 tabular-nums text-neutral-500">{expense.paymentDate ?? "—"}</td>
              <td className="px-4 py-3"><ExpenseStatusBadge status={expense.displayStatus} /></td>
              <td className="px-4 py-3">
                <Link
                  href={`/dashboard/expenses/${expense.id}`}
                  className="text-sm text-neutral-600 underline hover:text-neutral-900"
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
