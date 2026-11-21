import Link from "next/link";
import { notFound } from "next/navigation";
import { CancelExpenseButton, MarkPaidForm } from "@/components/expenses/expense-actions";
import {
  ExpenseStatusBadge,
  ExpensesHeader,
  NoBusinessState,
} from "@/components/expenses/expense-layout";
import { businessLocalDate } from "@/lib/business-date";
import { EXPENSE_CATEGORY_LABELS, canCancelExpense, canEditExpense, canPayExpense } from "@/lib/expense-status";
import { expenseIdSchema } from "@/lib/validations/expense";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { requireUser } from "@/server/auth/require-auth";
import { ExpenseServiceError, expenseService } from "@/server/services/expense-service";
import type { ExpenseDetail } from "@/types/expense";

export const metadata = { title: "Expense" };

export const instant = false;

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ expenseId: string }>;
}) {
  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  if (!business.ok) return <NoBusinessState />;

  const { expenseId: rawId } = await params;
  const parsedId = expenseIdSchema.safeParse(rawId);
  if (!parsedId.success) notFound();

  let expense: ExpenseDetail;
  try {
    expense = await expenseService.get(user, business.businessId, parsedId.data);
  } catch (error) {
    if (error instanceof ExpenseServiceError && error.code === "EXPENSE_NOT_FOUND") notFound();
    throw error;
  }

  const editable = canEditExpense(expense.status);
  const payable = canPayExpense(expense.status);
  const cancellable = canCancelExpense(expense.status);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <ExpensesHeader
        title={expense.title}
        subtitle={`${EXPENSE_CATEGORY_LABELS[expense.category]} · recorded ${expense.createdAt}`}
        action={
          <Link
            href="/dashboard/expenses"
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            All expenses
          </Link>
        }
      />

      <section aria-labelledby="expense-summary" className="mt-6 grid gap-3 sm:grid-cols-2">
        <h2 id="expense-summary" className="sr-only">Expense summary</h2>
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Amount</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{expense.currency} {expense.amount}</p>
          <p className="mt-2"><ExpenseStatusBadge status={expense.displayStatus} /></p>
          {expense.displayStatus === "OVERDUE" ? (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              Past due as of the business-local date.
            </p>
          ) : null}
        </div>
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Details</p>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-neutral-500">Due date</dt><dd>{expense.dueDate}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-neutral-500">Payment date</dt><dd>{expense.paymentDate ?? "—"}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-neutral-500">Category</dt><dd>{EXPENSE_CATEGORY_LABELS[expense.category]}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-neutral-500">Status</dt><dd>{expense.status}</dd></div>
          </dl>
        </div>
      </section>

      {expense.notes ? (
        <section aria-labelledby="expense-notes" className="mt-6">
          <h2 id="expense-notes" className="text-sm font-semibold">Notes</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-600 dark:text-neutral-400">{expense.notes}</p>
        </section>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-3">
        {editable ? (
          <Link
            href={`/dashboard/expenses/${expense.id}/edit`}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Edit expense
          </Link>
        ) : null}
        {cancellable ? <CancelExpenseButton expenseId={expense.id} /> : null}
      </div>

      {payable ? (
        <div className="mt-6">
          <MarkPaidForm expenseId={expense.id} defaultDate={businessLocalDate(expense.timezone)} />
        </div>
      ) : (
        <p className="mt-6 text-sm text-neutral-500">
          {expense.status === "PAID"
            ? "This expense is paid and kept as a historical record."
            : "Cancelled expenses are kept as history and cannot be changed."}
        </p>
      )}
    </main>
  );
}
