"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useActionState } from "react";
import { type Resolver, useFieldArray, useForm, useWatch } from "react-hook-form";
import { calculateInvoiceTotals } from "@/lib/invoice-math";
import { createInvoiceSchema } from "@/lib/validations/invoice";
import type { InvoiceFormState, InvoiceFormValues } from "@/types/invoice-form";

type InvoiceFormProps = {
  customers: { id: string; name: string; companyName: string | null }[];
  defaultValues: InvoiceFormValues;
  action: (state: InvoiceFormState, formData: FormData) => Promise<InvoiceFormState>;
  cancelHref: string;
  submitLabel: string;
};

const FIELD_CLASS =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";
const LABEL_CLASS = "block text-sm font-medium text-neutral-800 dark:text-neutral-200";
const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">
      {message}
    </p>
  );
}

function safeMoney(value: unknown): string {
  return typeof value === "string" && MONEY_PATTERN.test(value.trim()) ? value.trim() : "0";
}

export function InvoiceForm({
  customers,
  defaultValues,
  action,
  cancelHref,
  submitLabel,
}: InvoiceFormProps) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<InvoiceFormValues>({
    // zodResolver validates the transformed output; the form holds raw strings.
    resolver: zodResolver(createInvoiceSchema) as Resolver<InvoiceFormValues>,
    defaultValues,
  });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const values = useWatch({ control });

  // A live estimate only. The server recalculates and stores every money field;
  // nothing here is submitted as an authoritative total.
  const estimate = calculateInvoiceTotals(
    (values.items ?? []).map((item: { quantity?: string; unitPrice?: string } | undefined) => ({
      quantity: safeMoney(item?.quantity),
      unitPrice: safeMoney(item?.unitPrice),
    })),
    safeMoney(values.discount),
    safeMoney(values.tax),
  );

  const onSubmit = handleSubmit((submitted) => {
    const formData = new FormData();
    formData.set("customerId", submitted.customerId ?? "");
    formData.set("issueDate", submitted.issueDate ?? "");
    formData.set("dueDate", submitted.dueDate ?? "");
    formData.set("currency", String(submitted.currency ?? ""));
    formData.set("notes", String(submitted.notes ?? ""));
    formData.set("discount", submitted.discount ?? "0.00");
    formData.set("tax", submitted.tax ?? "0.00");
    submitted.items.forEach((item, index) => {
      formData.set(`items.${index}.description`, item.description ?? "");
      formData.set(`items.${index}.quantity`, item.quantity ?? "");
      formData.set(`items.${index}.unitPrice`, item.unitPrice ?? "");
    });
    startTransition(() => {
      formAction(formData);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="mt-8 space-y-8">
      {state.status === "error" && state.message ? (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          {state.message}
        </div>
      ) : null}

      <section aria-labelledby="invoice-details-heading">
        <h2 id="invoice-details-heading" className="text-lg font-semibold">
          Invoice details
        </h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="customerId" className={LABEL_CLASS}>
              Customer <span className="text-red-600">*</span>
            </label>
            <select
              id="customerId"
              aria-invalid={Boolean(errors.customerId ?? state.fieldErrors?.customerId)}
              className={`${FIELD_CLASS} mt-1`}
              {...register("customerId")}
            >
              <option value="">Select a customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                  {customer.companyName ? ` — ${customer.companyName}` : ""}
                </option>
              ))}
            </select>
            <FieldError
              id="customerId-error"
              message={errors.customerId?.message ?? state.fieldErrors?.customerId}
            />
          </div>

          <div>
            <label htmlFor="issueDate" className={LABEL_CLASS}>
              Issue date <span className="text-red-600">*</span>
            </label>
            <input
              id="issueDate"
              type="date"
              aria-invalid={Boolean(errors.issueDate ?? state.fieldErrors?.issueDate)}
              className={`${FIELD_CLASS} mt-1`}
              {...register("issueDate")}
            />
            <FieldError
              id="issueDate-error"
              message={errors.issueDate?.message ?? state.fieldErrors?.issueDate}
            />
          </div>

          <div>
            <label htmlFor="dueDate" className={LABEL_CLASS}>
              Due date <span className="text-red-600">*</span>
            </label>
            <input
              id="dueDate"
              type="date"
              aria-invalid={Boolean(errors.dueDate ?? state.fieldErrors?.dueDate)}
              className={`${FIELD_CLASS} mt-1`}
              {...register("dueDate")}
            />
            <FieldError
              id="dueDate-error"
              message={errors.dueDate?.message ?? state.fieldErrors?.dueDate}
            />
          </div>

          <div>
            <label htmlFor="currency" className={LABEL_CLASS}>
              Currency (ISO 4217)
            </label>
            <input
              id="currency"
              type="text"
              maxLength={3}
              placeholder="INR"
              aria-invalid={Boolean(errors.currency ?? state.fieldErrors?.currency)}
              className={`${FIELD_CLASS} mt-1 uppercase`}
              {...register("currency")}
            />
            <FieldError
              id="currency-error"
              message={errors.currency?.message ?? state.fieldErrors?.currency}
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="line-items-heading">
        <div className="flex items-center justify-between">
          <h2 id="line-items-heading" className="text-lg font-semibold">
            Line items
          </h2>
          <button
            type="button"
            onClick={() => append({ description: "", quantity: "1", unitPrice: "0.00" })}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Add item
          </button>
        </div>
        <FieldError id="items-error" message={errors.items?.message ?? state.fieldErrors?.items} />

        <ul className="mt-4 space-y-4">
          {fields.map((field, index) => {
            const descriptionError =
              errors.items?.[index]?.description?.message ??
              state.fieldErrors?.[`items.${index}.description`];
            const quantityError =
              errors.items?.[index]?.quantity?.message ??
              state.fieldErrors?.[`items.${index}.quantity`];
            const priceError =
              errors.items?.[index]?.unitPrice?.message ??
              state.fieldErrors?.[`items.${index}.unitPrice`];
            return (
              <li
                key={field.id}
                className="grid gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800 sm:grid-cols-[2fr_1fr_1fr_auto]"
              >
                <div>
                  <label htmlFor={`items.${index}.description`} className={LABEL_CLASS}>
                    Description <span className="text-red-600">*</span>
                  </label>
                  <input
                    id={`items.${index}.description`}
                    type="text"
                    aria-invalid={Boolean(descriptionError)}
                    aria-describedby={descriptionError ? `item-${index}-description-error` : undefined}
                    className={`${FIELD_CLASS} mt-1`}
                    {...register(`items.${index}.description`)}
                  />
                  <FieldError id={`item-${index}-description-error`} message={descriptionError} />
                </div>
                <div>
                  <label htmlFor={`items.${index}.quantity`} className={LABEL_CLASS}>
                    Quantity
                  </label>
                  <input
                    id={`items.${index}.quantity`}
                    type="text"
                    inputMode="decimal"
                    aria-invalid={Boolean(quantityError)}
                    aria-describedby={quantityError ? `item-${index}-quantity-error` : undefined}
                    className={`${FIELD_CLASS} mt-1`}
                    {...register(`items.${index}.quantity`)}
                  />
                  <FieldError id={`item-${index}-quantity-error`} message={quantityError} />
                </div>
                <div>
                  <label htmlFor={`items.${index}.unitPrice`} className={LABEL_CLASS}>
                    Unit price
                  </label>
                  <input
                    id={`items.${index}.unitPrice`}
                    type="text"
                    inputMode="decimal"
                    aria-invalid={Boolean(priceError)}
                    aria-describedby={priceError ? `item-${index}-price-error` : undefined}
                    className={`${FIELD_CLASS} mt-1`}
                    {...register(`items.${index}.unitPrice`)}
                  />
                  <FieldError id={`item-${index}-price-error`} message={priceError} />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    disabled={fields.length === 1}
                    className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                    aria-label={`Remove item ${index + 1}`}
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="adjustments-heading" className="grid gap-5 sm:grid-cols-2">
        <div>
          <h2 id="adjustments-heading" className="text-lg font-semibold">
            Adjustments
          </h2>
          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="discount" className={LABEL_CLASS}>
                Discount
              </label>
              <input
                id="discount"
                type="text"
                inputMode="decimal"
                aria-invalid={Boolean(errors.discount ?? state.fieldErrors?.discount)}
                className={`${FIELD_CLASS} mt-1`}
                {...register("discount")}
              />
              <FieldError
                id="discount-error"
                message={errors.discount?.message ?? state.fieldErrors?.discount}
              />
            </div>
            <div>
              <label htmlFor="tax" className={LABEL_CLASS}>
                Tax
              </label>
              <input
                id="tax"
                type="text"
                inputMode="decimal"
                aria-invalid={Boolean(errors.tax ?? state.fieldErrors?.tax)}
                className={`${FIELD_CLASS} mt-1`}
                {...register("tax")}
              />
              <FieldError id="tax-error" message={errors.tax?.message ?? state.fieldErrors?.tax} />
            </div>
          </div>
        </div>
        <div>
          <label htmlFor="notes" className={LABEL_CLASS}>
            Notes
          </label>
          <textarea
            id="notes"
            rows={5}
            aria-invalid={Boolean(errors.notes ?? state.fieldErrors?.notes)}
            className={`${FIELD_CLASS} mt-1`}
            {...register("notes")}
          />
          <FieldError id="notes-error" message={errors.notes?.message ?? state.fieldErrors?.notes} />
        </div>
      </section>

      <section aria-labelledby="estimate-heading" className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 id="estimate-heading" className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Live estimate (server recalculates on save)
        </h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{estimate.subtotal}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Discount</dt>
            <dd className="tabular-nums">−{estimate.discount}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Tax</dt>
            <dd className="tabular-nums">+{estimate.tax}</dd>
          </div>
          <div className="flex justify-between border-t border-neutral-200 pt-2 text-base font-semibold dark:border-neutral-800">
            <dt>Estimated total</dt>
            <dd className="tabular-nums">{estimate.totalAmount}</dd>
          </div>
        </dl>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900 disabled:opacity-60 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500"
        >
          {pending ? "Saving..." : submitLabel}
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
