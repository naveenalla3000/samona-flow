"use client";

import { useActionState } from "react";
import type { PaymentFormState } from "@/types/payment-form";

const INPUT_CLASS =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10";

export function ReversalForm({
  amount,
  currency,
  action,
}: {
  amount: string;
  currency: string;
  action: (state: PaymentFormState, formData: FormData) => Promise<PaymentFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(`Reverse this ${currency} ${amount} payment? The original record will be kept in history and cannot be reversed again.`)) {
          event.preventDefault();
        }
      }}
      className="mt-6 rounded-lg border border-amber-200 bg-amber-50/60 p-4"
    >
      <h2 className="text-sm font-semibold text-amber-900">Reverse this payment</h2>
      <p className="mt-1 text-xs text-amber-800">
        Reversals are permanent corrections. There is no undo; record a new payment if you need to correct the balance.
      </p>
      <label htmlFor="reason" className="mt-3 block text-sm font-medium">Reason</label>
      <textarea
        id="reason"
        name="reason"
        rows={3}
        required
        minLength={3}
        maxLength={1000}
        placeholder="e.g. Duplicate bank entry"
        aria-describedby={state.fieldErrors?.reason ? "reason-error" : undefined}
        className={`${INPUT_CLASS} mt-1`}
      />
      {state.fieldErrors?.reason ? (
        <p id="reason-error" role="alert" className="mt-1 text-sm text-red-600">
          {state.fieldErrors.reason}
        </p>
      ) : null}
      {state.status === "error" && state.message ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-3 rounded-md border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:opacity-60"
      >
        {pending ? "Reversing…" : "Reverse payment"}
      </button>
    </form>
  );
}
