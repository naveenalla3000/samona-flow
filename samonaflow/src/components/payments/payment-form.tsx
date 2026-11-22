"use client";

import { useActionState } from "react";
import { PAYMENT_METHODS } from "@/lib/payment-status";
import { METHOD_LABELS } from "./payment-layout";
import type { PaymentFormState } from "@/types/payment-form";

const INPUT_CLASS =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10";
const LABEL_CLASS = "block text-sm font-medium text-neutral-800";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-sm text-red-600">
      {message}
    </p>
  );
}

export function PaymentForm({
  invoiceNumber,
  currency,
  outstandingAmount,
  defaultDate,
  action,
}: {
  invoiceNumber: string;
  currency: string;
  outstandingAmount: string;
  defaultDate: string;
  action: (state: PaymentFormState, formData: FormData) => Promise<PaymentFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <p className="text-sm text-neutral-500">
          Recording against <span className="font-medium">{invoiceNumber}</span> · outstanding{" "}
          <span className="font-medium tabular-nums">{currency} {outstandingAmount}</span>
        </p>
      </div>

      <div>
        <label htmlFor="amount" className={LABEL_CLASS}>Amount ({currency})</label>
        <input
          id="amount"
          name="amount"
          inputMode="decimal"
          required
          placeholder="0.00"
          aria-describedby={errors.amount ? "amount-error" : undefined}
          className={`${INPUT_CLASS} mt-1`}
        />
        <FieldError id="amount-error" message={errors.amount} />
      </div>

      <div>
        <label htmlFor="paymentDate" className={LABEL_CLASS}>Payment date</label>
        <input
          id="paymentDate"
          name="paymentDate"
          type="date"
          required
          defaultValue={defaultDate}
          aria-describedby={errors.paymentDate ? "paymentDate-error" : undefined}
          className={`${INPUT_CLASS} mt-1`}
        />
        <FieldError id="paymentDate-error" message={errors.paymentDate} />
      </div>

      <div>
        <label htmlFor="method" className={LABEL_CLASS}>Method</label>
        <select id="method" name="method" defaultValue="UPI" className={`${INPUT_CLASS} mt-1`}>
          {PAYMENT_METHODS.map((method) => (
            <option key={method} value={method}>{METHOD_LABELS[method]}</option>
          ))}
        </select>
        <FieldError id="method-error" message={errors.method} />
      </div>

      <div>
        <label htmlFor="transactionReference" className={LABEL_CLASS}>Transaction reference</label>
        <input
          id="transactionReference"
          name="transactionReference"
          maxLength={200}
          placeholder="Optional"
          className={`${INPUT_CLASS} mt-1`}
        />
        <FieldError id="transactionReference-error" message={errors.transactionReference} />
      </div>

      <div className="sm:col-span-2">
        <label htmlFor="notes" className={LABEL_CLASS}>Notes</label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          maxLength={5000}
          className={`${INPUT_CLASS} mt-1`}
        />
        <FieldError id="notes-error" message={errors.notes} />
      </div>

      {state.status === "error" && state.message ? (
        <p role="alert" className="sm:col-span-2 text-sm text-red-600">
          {state.message}
        </p>
      ) : null}

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900 disabled:opacity-60"
        >
          {pending ? "Recording…" : "Record payment"}
        </button>
      </div>
    </form>
  );
}
