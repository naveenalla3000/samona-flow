"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useActionState, useState } from "react";
import { useForm } from "react-hook-form";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from "@/lib/expense-status";
import { createExpenseSchema } from "@/lib/validations/expense";
import type { ExpenseFormState, ExpenseFormValues } from "@/types/expense-form";

const FIELD_CLASS =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";
const LABEL_CLASS = "block text-sm font-medium text-neutral-800 dark:text-neutral-200";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">
      {message}
    </p>
  );
}

export function ExpenseForm({
  submitLabel,
  defaultValues,
  action,
  cancelHref,
  showStatus = false,
}: {
  submitLabel: string;
  defaultValues: ExpenseFormValues;
  action: (state: ExpenseFormState, formData: FormData) => Promise<ExpenseFormState>;
  cancelHref: string;
  /** Only the create form lets a user record an already-paid expense. */
  showStatus?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(createExpenseSchema),
    defaultValues,
  });
  // Local state avoids react-hook-form's `watch`, which React Compiler cannot
  // memoize safely. The field is still registered so its value is submitted.
  const [isPaid, setIsPaid] = useState(defaultValues.status === "PAID");

  const onSubmit = handleSubmit((values) => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(values)) {
      formData.set(key, value ?? "");
    }
    formAction(formData);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="mt-8 space-y-6">
      {state.status === "error" && state.message ? (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          {state.message}
        </div>
      ) : null}

      <div>
        <label htmlFor="title" className={LABEL_CLASS}>
          Title <span className="text-red-600">*</span>
        </label>
        <input
          id="title"
          type="text"
          maxLength={200}
          aria-invalid={Boolean(errors.title ?? state.fieldErrors?.title)}
          aria-describedby={errors.title || state.fieldErrors?.title ? "title-error" : undefined}
          className={`${FIELD_CLASS} mt-1`}
          {...register("title")}
        />
        <FieldError id="title-error" message={errors.title?.message ?? state.fieldErrors?.title} />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="category" className={LABEL_CLASS}>
            Category <span className="text-red-600">*</span>
          </label>
          <select
            id="category"
            aria-invalid={Boolean(errors.category ?? state.fieldErrors?.category)}
            aria-describedby={errors.category || state.fieldErrors?.category ? "category-error" : undefined}
            className={`${FIELD_CLASS} mt-1`}
            {...register("category")}
          >
            {EXPENSE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {EXPENSE_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
          <FieldError id="category-error" message={errors.category?.message ?? state.fieldErrors?.category} />
        </div>

        <div>
          <label htmlFor="amount" className={LABEL_CLASS}>
            Amount <span className="text-red-600">*</span>
          </label>
          <input
            id="amount"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            aria-invalid={Boolean(errors.amount ?? state.fieldErrors?.amount)}
            aria-describedby={errors.amount || state.fieldErrors?.amount ? "amount-error" : undefined}
            className={`${FIELD_CLASS} mt-1`}
            {...register("amount")}
          />
          <FieldError id="amount-error" message={errors.amount?.message ?? state.fieldErrors?.amount} />
        </div>

        <div>
          <label htmlFor="dueDate" className={LABEL_CLASS}>
            Due date <span className="text-red-600">*</span>
          </label>
          <input
            id="dueDate"
            type="date"
            aria-invalid={Boolean(errors.dueDate ?? state.fieldErrors?.dueDate)}
            aria-describedby={errors.dueDate || state.fieldErrors?.dueDate ? "dueDate-error" : undefined}
            className={`${FIELD_CLASS} mt-1`}
            {...register("dueDate")}
          />
          <FieldError id="dueDate-error" message={errors.dueDate?.message ?? state.fieldErrors?.dueDate} />
        </div>

        {showStatus ? (
          <div>
            <label htmlFor="status" className={LABEL_CLASS}>
              Status
            </label>
            <select
              id="status"
              className={`${FIELD_CLASS} mt-1`}
              {...register("status", {
                onChange: (event) => setIsPaid(event.target.value === "PAID"),
              })}
            >
              <option value="UPCOMING">Upcoming</option>
              <option value="PAID">Paid</option>
            </select>
          </div>
        ) : null}

        {showStatus && isPaid ? (
          <div>
            <label htmlFor="paymentDate" className={LABEL_CLASS}>
              Payment date <span className="text-red-600">*</span>
            </label>
            <input
              id="paymentDate"
              type="date"
              aria-invalid={Boolean(errors.paymentDate ?? state.fieldErrors?.paymentDate)}
              aria-describedby={errors.paymentDate || state.fieldErrors?.paymentDate ? "paymentDate-error" : undefined}
              className={`${FIELD_CLASS} mt-1`}
              {...register("paymentDate")}
            />
            <FieldError id="paymentDate-error" message={errors.paymentDate?.message ?? state.fieldErrors?.paymentDate} />
          </div>
        ) : null}
      </div>

      <div>
        <label htmlFor="notes" className={LABEL_CLASS}>
          Notes
        </label>
        <textarea
          id="notes"
          rows={3}
          aria-invalid={Boolean(errors.notes ?? state.fieldErrors?.notes)}
          aria-describedby={errors.notes || state.fieldErrors?.notes ? "notes-error" : undefined}
          className={`${FIELD_CLASS} mt-1`}
          {...register("notes")}
        />
        <FieldError id="notes-error" message={errors.notes?.message ?? state.fieldErrors?.notes} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <a
          href={cancelHref}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
