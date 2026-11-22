import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { ExpensesHeader, NoBusinessState } from "@/components/expenses/expense-layout";
import { expenseIdSchema } from "@/lib/validations/expense";
import { updateExpenseAction } from "@/server/actions/expense-actions";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { requireUser } from "@/server/auth/require-auth";
import { ExpenseServiceError, expenseService } from "@/server/services/expense-service";
import type { ExpenseDetail } from "@/types/expense";

export const metadata = { title: "Edit expense" };

export const instant = false;

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ expenseId: string }>;
}) {
  await connection();
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

  const updateAction = updateExpenseAction.bind(null, expense.id);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <ExpensesHeader title="Edit expense" subtitle={expense.title} />
      <ExpenseForm
        submitLabel="Save changes"
        defaultValues={{
          title: expense.title,
          category: expense.category,
          amount: expense.amount,
          dueDate: expense.dueDate,
          paymentDate: expense.paymentDate ?? "",
          status: expense.status === "PAID" ? "PAID" : "UPCOMING",
          notes: expense.notes ?? "",
        }}
        action={updateAction}
        cancelHref={`/dashboard/expenses/${expense.id}`}
      />
    </main>
  );
}
