import { ExpenseForm } from "@/components/expenses/expense-form";
import { connection } from "next/server";
import { ExpensesHeader, NoBusinessState } from "@/components/expenses/expense-layout";
import { createExpenseAction } from "@/server/actions/expense-actions";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { requireUser } from "@/server/auth/require-auth";
import type { ExpenseFormValues } from "@/types/expense-form";

export const metadata = { title: "New expense" };

export const instant = false;

const EMPTY_VALUES: ExpenseFormValues = {
  title: "",
  category: "OTHER",
  amount: "",
  dueDate: "",
  paymentDate: "",
  status: "UPCOMING",
  notes: "",
};

export default async function NewExpensePage() {
  await connection();
  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  if (!business.ok) return <NoBusinessState />;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <ExpensesHeader
        title="Add expense"
        subtitle="Record a one-time expense. Paid expenses require a payment date."
      />
      <ExpenseForm
        submitLabel="Create expense"
        defaultValues={EMPTY_VALUES}
        action={createExpenseAction}
        cancelHref="/dashboard/expenses"
        showStatus
      />
    </main>
  );
}
