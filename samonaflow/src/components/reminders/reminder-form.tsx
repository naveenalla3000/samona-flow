"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useActionState, useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import {
  REMINDER_TYPES,
  REMINDER_TYPE_LABELS,
  type ReminderTypeValue,
} from "@/lib/reminder-status";
import { createReminderSchema, updateReminderSchema } from "@/lib/validations/reminder";
import type {
  ReminderEditValues,
  ReminderFormState,
  ReminderFormValues,
} from "@/types/reminder-form";
import type { ReminderRecord } from "@/types/reminder";

const FIELD_CLASS =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";
const LABEL_CLASS = "block text-sm font-medium text-neutral-800 dark:text-neutral-200";

export type InvoiceOption = {
  id: string;
  customerId: string;
  customerName: string;
  invoiceNumber: string;
  dueDate: string;
  outstandingAmount: string;
  currency: string;
  statusLabel: string;
  suggestedType: ReminderTypeValue;
};

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">
      {message}
    </p>
  );
}

function FormError({ state }: { state: ReminderFormState }) {
  if (state.status !== "error" || !state.message) return null;
  return (
    <div
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
    >
      {state.message}
    </div>
  );
}

export function ReminderForm({
  invoices,
  action,
  cancelHref,
}: {
  invoices: InvoiceOption[];
  action: (state: ReminderFormState, formData: FormData) => Promise<ReminderFormState>;
  cancelHref: string;
}) {
  const first = invoices[0];
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const [selected, setSelected] = useState<InvoiceOption | undefined>(first);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ReminderFormValues>({
    resolver: zodResolver(createReminderSchema),
    defaultValues: {
      customerId: first?.customerId ?? "",
      invoiceId: first?.id ?? "",
      reminderType: first?.suggestedType ?? "UPCOMING_PAYMENT",
      followUpDate: "",
    },
  });

  const onSubmit = handleSubmit((values) => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(values)) {
      formData.set(key, value ?? "");
    }
    formAction(formData);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="mt-8 space-y-6">
      <FormError state={state} />

      <div>
        <label htmlFor="invoiceId" className={LABEL_CLASS}>
          Invoice <span className="text-red-600">*</span>
        </label>
        <select
          id="invoiceId"
          aria-invalid={Boolean(errors.invoiceId ?? state.fieldErrors?.invoiceId)}
          aria-describedby={errors.invoiceId || state.fieldErrors?.invoiceId ? "invoiceId-error" : undefined}
          className={`${FIELD_CLASS} mt-1`}
          {...register("invoiceId", {
            onChange: (event: ChangeEvent<HTMLSelectElement>) => {
              const option = invoices.find((item) => item.id === event.target.value);
              if (!option) return;
              setSelected(option);
              setValue("customerId", option.customerId);
            },
          })}
        >
          {invoices.map((invoice) => (
            <option key={invoice.id} value={invoice.id}>
              {invoice.invoiceNumber} · {invoice.customerName} · {invoice.currency} {invoice.outstandingAmount}
            </option>
          ))}
        </select>
        <FieldError id="invoiceId-error" message={errors.invoiceId?.message ?? state.fieldErrors?.invoiceId} />
        <input type="hidden" {...register("customerId")} />
        {selected ? (
          <p className="mt-2 text-xs text-neutral-500">
            Due {selected.dueDate} · {selected.statusLabel}. The message is generated from this invoice when saved.
          </p>
        ) : null}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="reminderType" className={LABEL_CLASS}>
            Reminder category <span className="text-red-600">*</span>
          </label>
          <select
            id="reminderType"
            aria-invalid={Boolean(errors.reminderType ?? state.fieldErrors?.reminderType)}
            aria-describedby={errors.reminderType || state.fieldErrors?.reminderType ? "reminderType-error" : undefined}
            className={`${FIELD_CLASS} mt-1`}
            {...register("reminderType")}
          >
            {REMINDER_TYPES.map((type) => (
              <option key={type} value={type}>{REMINDER_TYPE_LABELS[type]}</option>
            ))}
          </select>
          <FieldError id="reminderType-error" message={errors.reminderType?.message ?? state.fieldErrors?.reminderType} />
        </div>

        <div>
          <label htmlFor="followUpDate" className={LABEL_CLASS}>
            Next follow-up date
          </label>
          <input
            id="followUpDate"
            type="date"
            aria-invalid={Boolean(errors.followUpDate ?? state.fieldErrors?.followUpDate)}
            aria-describedby={errors.followUpDate || state.fieldErrors?.followUpDate ? "followUpDate-error" : undefined}
            className={`${FIELD_CLASS} mt-1`}
            {...register("followUpDate")}
          />
          <FieldError id="followUpDate-error" message={errors.followUpDate?.message ?? state.fieldErrors?.followUpDate} />
        </div>
      </div>

      <p className="rounded-md border border-neutral-200 p-3 text-xs text-neutral-500 dark:border-neutral-800">
        Generating a reminder only creates draft text. Opening WhatsApp or marking it sent is recorded by you; no message is delivered automatically.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {pending ? "Generating…" : "Generate reminder"}
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

export function ReminderEditForm({
  reminder,
  allowEditMessage,
  action,
  cancelHref,
}: {
  reminder: ReminderRecord;
  allowEditMessage: boolean;
  action: (state: ReminderFormState, formData: FormData) => Promise<ReminderFormState>;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ReminderEditValues>({
    resolver: zodResolver(updateReminderSchema),
    defaultValues: {
      ...(allowEditMessage
        ? { message: reminder.message, reminderType: reminder.reminderType }
        : {}),
      followUpDate: reminder.followUpDate ?? "",
    },
  });

  const onSubmit = handleSubmit((values) => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(values)) {
      formData.set(key, value ?? "");
    }
    startTransition(() => {
      formAction(formData);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="mt-8 space-y-6">
      <FormError state={state} />

      {allowEditMessage ? (
        <>
          <div>
            <label htmlFor="reminderType" className={LABEL_CLASS}>Reminder category</label>
            <select id="reminderType" className={`${FIELD_CLASS} mt-1`} {...register("reminderType")}>
              {REMINDER_TYPES.map((type) => (
                <option key={type} value={type}>{REMINDER_TYPE_LABELS[type]}</option>
              ))}
            </select>
            <FieldError id="edit-reminderType-error" message={errors.reminderType?.message ?? state.fieldErrors?.reminderType} />
          </div>
          <div>
            <label htmlFor="message" className={LABEL_CLASS}>Message</label>
            <textarea
              id="message"
              rows={10}
              aria-invalid={Boolean(errors.message ?? state.fieldErrors?.message)}
              aria-describedby={errors.message || state.fieldErrors?.message ? "message-error" : undefined}
              className={`${FIELD_CLASS} mt-1`}
              {...register("message")}
            />
            <FieldError id="message-error" message={errors.message?.message ?? state.fieldErrors?.message} />
          </div>
        </>
      ) : (
        <p className="rounded-md border border-neutral-200 p-3 text-sm text-neutral-500 dark:border-neutral-800">
          This reminder is no longer a draft, so its message is kept as history. You can only reschedule the next follow-up date.
        </p>
      )}

      <div>
        <label htmlFor="followUpDate" className={LABEL_CLASS}>Next follow-up date</label>
        <input
          id="followUpDate"
          type="date"
          aria-invalid={Boolean(errors.followUpDate ?? state.fieldErrors?.followUpDate)}
          aria-describedby={errors.followUpDate || state.fieldErrors?.followUpDate ? "followUpDate-error" : undefined}
          className={`${FIELD_CLASS} mt-1`}
          {...register("followUpDate")}
        />
        <FieldError id="followUpDate-error" message={errors.followUpDate?.message ?? state.fieldErrors?.followUpDate} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {pending ? "Saving…" : "Save reminder"}
        </button>
        <a
          href={cancelHref}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
