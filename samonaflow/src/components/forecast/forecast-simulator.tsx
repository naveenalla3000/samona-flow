"use client";

import { useState } from "react";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type ExpenseCategoryValue,
} from "@/lib/expense-status";
import type {
  ForecastHorizon,
  ForecastIncomingItem,
  ForecastOutgoingItem,
} from "@/types/forecast";
import type {
  ForecastAdjustment,
  ForecastAdjustmentType,
  ForecastSimulationResult,
} from "@/types/forecast-simulation";
import { ForecastSection } from "./forecast-layout";
import { ForecastSimulationResults } from "./forecast-simulation-results";
import {
  ADJUSTMENT_TYPE_LABELS,
  INCOMING_ADJUSTMENT_TYPES,
  OUTGOING_ADJUSTMENT_TYPES,
} from "./forecast-simulation-labels";

const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";
const LABEL_CLASS = "block text-sm font-medium text-neutral-800 dark:text-neutral-200";
const PRIMARY_BUTTON_CLASS =
  "rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-600 dark:text-white dark:hover:bg-neutral-300";
const SECONDARY_BUTTON_CLASS =
  "rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800";
const REMOVE_BUTTON_CLASS =
  "rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40";

const AMOUNT_TYPES = new Set<ForecastAdjustmentType>([
  "change_amount",
  "add_expense",
  "increase_expense",
  "reduce_expense",
]);

const DATE_TYPES = new Set<ForecastAdjustmentType>([
  "delay_payment",
  "receive_earlier",
  "add_expense",
  "delay_expense",
]);

function targetKind(type: ForecastAdjustmentType): "invoice" | "expense" | "new-expense" {
  if (type === "add_expense") return "new-expense";
  if ((INCOMING_ADJUSTMENT_TYPES as readonly string[]).includes(type)) return "invoice";
  return "expense";
}

function amountLabel(type: ForecastAdjustmentType): string {
  switch (type) {
    case "change_amount":
      return "New expected amount";
    case "add_expense":
      return "Expense amount";
    case "increase_expense":
      return "Increase by";
    case "reduce_expense":
      return "Reduce by";
    default:
      return "Amount";
  }
}

function dateLabel(type: ForecastAdjustmentType): string {
  switch (type) {
    case "add_expense":
      return "Hypothetical due date";
    case "delay_expense":
      return "New expense due date";
    default:
      return "New expected payment date";
  }
}

function draftLabel(
  adjustment: ForecastAdjustment,
  invoices: ForecastIncomingItem[],
  expenses: ForecastOutgoingItem[],
  currency: string,
): string {
  switch (adjustment.type) {
    case "delay_payment":
    case "receive_earlier":
    case "change_amount": {
      const invoice = invoices.find((item) => item.invoiceId === adjustment.invoiceId);
      const name = invoice ? `${invoice.invoiceNumber} (${invoice.customerName})` : "Invoice";
      if (adjustment.type === "change_amount") {
        return `${name} → ${currency} ${adjustment.amount}`;
      }
      return `${name} → ${adjustment.date}`;
    }
    case "add_expense":
      return `${adjustment.title} → ${currency} ${adjustment.amount} due ${adjustment.date}`;
    case "increase_expense":
    case "reduce_expense": {
      const expense = expenses.find((item) => item.expenseId === adjustment.expenseId);
      return `${expense?.title ?? "Expense"} → ${currency} ${adjustment.amount}`;
    }
    case "delay_expense": {
      const expense = expenses.find((item) => item.expenseId === adjustment.expenseId);
      return `${expense?.title ?? "Expense"} → ${adjustment.date}`;
    }
  }
}

type ApiErrorBody = {
  success: false;
  error: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string>;
  };
};

type ApiSuccessBody = {
  success: true;
  data: ForecastSimulationResult;
};

type ApiBody = ApiSuccessBody | ApiErrorBody;

export function ForecastSimulator({
  businessId,
  horizon,
  currency,
  invoices,
  expenses,
}: {
  businessId: string;
  horizon: ForecastHorizon;
  currency: string;
  invoices: ForecastIncomingItem[];
  expenses: ForecastOutgoingItem[];
}) {
  const [type, setType] = useState<ForecastAdjustmentType>("delay_payment");
  const [invoiceId, setInvoiceId] = useState("");
  const [expenseId, setExpenseId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ExpenseCategoryValue>("OTHER");

  const [adjustments, setAdjustments] = useState<ForecastAdjustment[]>([]);
  const [result, setResult] = useState<ForecastSimulationResult | null>(null);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const kind = targetKind(type);
  const usedInvoiceDateIds = new Set<string>();
  const usedInvoiceAmountIds = new Set<string>();
  const usedExpenseDateIds = new Set<string>();
  const usedExpenseAmountIds = new Set<string>();
  for (const adjustment of adjustments) {
    if ("invoiceId" in adjustment) {
      if (adjustment.type === "change_amount") {
        usedInvoiceAmountIds.add(adjustment.invoiceId);
      } else {
        usedInvoiceDateIds.add(adjustment.invoiceId);
      }
    }
    if ("expenseId" in adjustment) {
      if (adjustment.type === "delay_expense") {
        usedExpenseDateIds.add(adjustment.expenseId);
      } else {
        usedExpenseAmountIds.add(adjustment.expenseId);
      }
    }
  }

  const availableInvoices = invoices.filter((item) =>
    type === "change_amount"
      ? !usedInvoiceAmountIds.has(item.invoiceId)
      : !usedInvoiceDateIds.has(item.invoiceId),
  );
  const availableExpenses = expenses.filter((item) =>
    type === "delay_expense"
      ? !usedExpenseDateIds.has(item.expenseId)
      : !usedExpenseAmountIds.has(item.expenseId),
  );

  function resetForm() {
    setInvoiceId("");
    setExpenseId("");
    setAmount("");
    setDate("");
    setTitle("");
    setCategory("OTHER");
    setFormError(null);
  }

  function changeType(next: ForecastAdjustmentType) {
    setType(next);
    resetForm();
  }

  function addAdjustment() {
    setFormError(null);
    if (kind === "invoice" && !invoiceId) {
      setFormError("Choose an invoice for this hypothetical change.");
      return;
    }
    if (kind === "expense" && !expenseId) {
      setFormError("Choose an expense for this hypothetical change.");
      return;
    }
    if (kind === "new-expense" && !title.trim()) {
      setFormError("Enter a title for the hypothetical expense.");
      return;
    }
    if (AMOUNT_TYPES.has(type) && !amount.trim()) {
      setFormError("Enter an amount greater than zero.");
      return;
    }
    if (DATE_TYPES.has(type) && !date) {
      setFormError("Choose a date inside the selected horizon.");
      return;
    }

    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `adjustment-${adjustments.length}-${Math.random().toString(36).slice(2, 10)}`;

    let adjustment: ForecastAdjustment;
    switch (type) {
      case "delay_payment":
      case "receive_earlier":
        adjustment = { id, type, invoiceId, date };
        break;
      case "change_amount":
        adjustment = { id, type, invoiceId, amount: amount.trim() };
        break;
      case "add_expense":
        adjustment = {
          id,
          type,
          title: title.trim(),
          category,
          amount: amount.trim(),
          date,
        };
        break;
      case "increase_expense":
      case "reduce_expense":
        adjustment = { id, type, expenseId, amount: amount.trim() };
        break;
      case "delay_expense":
        adjustment = { id, type, expenseId, date };
        break;
    }

    setAdjustments((previous) => [...previous, adjustment]);
    setResult(null);
    setRequestError(null);
    setFieldErrors({});
    resetForm();
  }

  function removeAdjustment(id: string) {
    setAdjustments((previous) => previous.filter((adjustment) => adjustment.id !== id));
    setResult(null);
    setRequestError(null);
    setFieldErrors({});
  }

  function resetScenario() {
    setAdjustments([]);
    setResult(null);
    setRequestError(null);
    setFieldErrors({});
    resetForm();
  }

  async function runSimulation() {
    setPending(true);
    setRequestError(null);
    setFieldErrors({});

    try {
      const response = await fetch(
        `/api/v1/businesses/${businessId}/forecast/simulations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ horizon, adjustments }),
        },
      );

      let payload: ApiBody | null = null;
      try {
        payload = (await response.json()) as ApiBody;
      } catch {
        payload = null;
      }

      if (!response.ok || !payload || !payload.success) {
        if (response.status === 401) {
          setRequestError("Your session has expired. Sign in again to run a simulation.");
        } else {
          setRequestError(
            payload && !payload.success
              ? payload.error.message
              : "The simulation could not be calculated. Please try again.",
          );
          if (payload && !payload.success && payload.error.fieldErrors) {
            setFieldErrors(payload.error.fieldErrors);
          }
        }
        setResult(null);
        return;
      }

      setResult(payload.data);
    } catch {
      setRequestError(
        "The simulation could not be calculated. Check your connection and try again.",
      );
      setResult(null);
    } finally {
      setPending(false);
    }
  }

  const fieldErrorMessages = Object.values(fieldErrors);

  return (
    <div className="space-y-6">
      <ForecastSection
        title="Scenario builder"
        description="Add hypothetical changes, then run the simulation. Every change is temporary and is never written to the database."
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            addAdjustment();
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="adjustment-type" className={LABEL_CLASS}>
              Hypothetical change
            </label>
            <select
              id="adjustment-type"
              value={type}
              onChange={(event) => changeType(event.target.value as ForecastAdjustmentType)}
              className={FIELD_CLASS}
            >
              <optgroup label="Incoming payments">
                {INCOMING_ADJUSTMENT_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {ADJUSTMENT_TYPE_LABELS[option]}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Outgoing expenses">
                {OUTGOING_ADJUSTMENT_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {ADJUSTMENT_TYPE_LABELS[option]}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {kind === "invoice" ? (
            <div>
              <label htmlFor="adjustment-invoice" className={LABEL_CLASS}>
                Invoice <span className="text-red-600">*</span>
              </label>
              <select
                id="adjustment-invoice"
                value={invoiceId}
                onChange={(event) => setInvoiceId(event.target.value)}
                className={FIELD_CLASS}
                required
              >
                <option value="">Choose an eligible invoice</option>
                {availableInvoices.map((invoice) => (
                  <option key={invoice.invoiceId} value={invoice.invoiceId}>
                    {invoice.invoiceNumber} · {invoice.customerName} · {currency}{" "}
                    {invoice.amount} · scheduled {invoice.scheduledDate}
                  </option>
                ))}
              </select>
              {availableInvoices.length === 0 ? (
                <p className="mt-1 text-xs text-neutral-500">
                  Every eligible invoice already has this kind of adjustment. Add the other kind
                  (date or amount) instead.
                </p>
              ) : null}
            </div>
          ) : null}

          {kind === "expense" ? (
            <div>
              <label htmlFor="adjustment-expense" className={LABEL_CLASS}>
                Expense <span className="text-red-600">*</span>
              </label>
              <select
                id="adjustment-expense"
                value={expenseId}
                onChange={(event) => setExpenseId(event.target.value)}
                className={FIELD_CLASS}
                required
              >
                <option value="">Choose an eligible expense</option>
                {availableExpenses.map((expense) => (
                  <option key={expense.expenseId} value={expense.expenseId}>
                    {expense.title} · {currency} {expense.amount} · scheduled{" "}
                    {expense.scheduledDate}
                  </option>
                ))}
              </select>
              {availableExpenses.length === 0 ? (
                <p className="mt-1 text-xs text-neutral-500">
                  Every eligible expense already has this kind of adjustment. Add the other kind
                  (date or amount) instead.
                </p>
              ) : null}
            </div>
          ) : null}

          {kind === "new-expense" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="adjustment-title" className={LABEL_CLASS}>
                  Title <span className="text-red-600">*</span>
                </label>
                <input
                  id="adjustment-title"
                  type="text"
                  maxLength={200}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className={FIELD_CLASS}
                  placeholder="For example, new equipment"
                  required
                />
              </div>
              <div>
                <label htmlFor="adjustment-category" className={LABEL_CLASS}>
                  Category
                </label>
                <select
                  id="adjustment-category"
                  value={category}
                  onChange={(event) =>
                    setCategory(event.target.value as ExpenseCategoryValue)
                  }
                  className={FIELD_CLASS}
                >
                  {EXPENSE_CATEGORIES.map((option) => (
                    <option key={option} value={option}>
                      {EXPENSE_CATEGORY_LABELS[option]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {AMOUNT_TYPES.has(type) ? (
              <div>
                <label htmlFor="adjustment-amount" className={LABEL_CLASS}>
                  {amountLabel(type)} ({currency}) <span className="text-red-600">*</span>
                </label>
                <input
                  id="adjustment-amount"
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className={FIELD_CLASS}
                  placeholder="0.00"
                  required
                />
              </div>
            ) : null}

            {DATE_TYPES.has(type) ? (
              <div>
                <label htmlFor="adjustment-date" className={LABEL_CLASS}>
                  {dateLabel(type)} <span className="text-red-600">*</span>
                </label>
                <input
                  id="adjustment-date"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className={FIELD_CLASS}
                  required
                />
              </div>
            ) : null}
          </div>

          {formError ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {formError}
            </p>
          ) : null}

          <button type="submit" className={SECONDARY_BUTTON_CLASS}>
            Add adjustment
          </button>
        </form>

        <div className="mt-6 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <h3 className="text-sm font-semibold">
            Scenario adjustments ({adjustments.length})
          </h3>
          {adjustments.length === 0 ? (
            <p className="mt-2 rounded-lg border border-dashed border-neutral-300 p-4 text-sm text-neutral-500 dark:border-neutral-700">
              No hypothetical changes yet. Running with an empty scenario reproduces the baseline.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-neutral-200 dark:divide-neutral-800">
              {adjustments.map((adjustment) => (
                <li
                  key={adjustment.id}
                  className="flex items-start justify-between gap-3 py-3"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {ADJUSTMENT_TYPE_LABELS[adjustment.type]}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {draftLabel(adjustment, invoices, expenses, currency)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAdjustment(adjustment.id)}
                    className={REMOVE_BUTTON_CLASS}
                    aria-label={`Remove ${ADJUSTMENT_TYPE_LABELS[adjustment.type]} adjustment`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={runSimulation}
              disabled={pending}
              className={PRIMARY_BUTTON_CLASS}
            >
              {pending ? "Calculating…" : "Run simulation"}
            </button>
            <button
              type="button"
              onClick={resetScenario}
              disabled={pending || (adjustments.length === 0 && !result)}
              className={SECONDARY_BUTTON_CLASS}
            >
              Reset to baseline
            </button>
          </div>
        </div>

        {requestError ? (
          <div
            role="alert"
            className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          >
            <p>{requestError}</p>
            {fieldErrorMessages.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {fieldErrorMessages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </ForecastSection>

      {result ? (
        <ForecastSimulationResults result={result} />
      ) : (
        <ForecastSection
          title="Simulation results"
          description="Run the scenario to compare the simulated cash position with the unchanged baseline."
        >
          <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
            No simulation has been run yet.
          </p>
        </ForecastSection>
      )}
    </div>
  );
}
