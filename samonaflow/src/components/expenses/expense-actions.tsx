"use client";

import { useActionState } from "react";
import { cancelExpenseAction, markExpensePaidAction } from "@/server/actions/expense-actions";
import type { ExpenseFormState } from "@/types/expense-form";

const INPUT_CLASS =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10";

export function MarkPaidForm({
  expenseId,
  defaultDate,
}: {
  expenseId: string;
  defaultDate: string;
}) {
  const [state, formAction, pending] = useActionState<ExpenseFormState, FormData>(
    markExpensePaidAction.bind(null, expenseId),
    { status: "idle" },
  );

  return (
    <form action={formAction} className="rounded-lg border border-neutral-200 p-4">
      <h2 className="text-sm font-semibold">Mark as paid</h2>
      <label htmlFor="paymentDate" className="mt-3 block text-sm font-medium">Payment date</label>
      <input
        id="paymentDate"
        name="paymentDate"
        type="date"
        required
        defaultValue={defaultDate}
        className={`${INPUT_CLASS} mt-1 max-w-xs`}
      />
      {state.status === "error" && state.message ? (
        <p role="alert" className="mt-2 text-sm text-red-600">{state.message}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-3 rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Mark as paid"}
      </button>
    </form>
  );
}

export function CancelExpenseButton({ expenseId }: { expenseId: string }) {
  return (
    <form
      action={cancelExpenseAction}
      onSubmit={(event) => {
        if (!window.confirm("Cancel this expense? It will be kept in history but excluded from future outlooks.")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="expenseId" value={expenseId} />
      <button
        type="submit"
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
      >
        Cancel expense
      </button>
    </form>
  );
}
