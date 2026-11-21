// Pure What-If Cash Flow Simulator.
//
// The simulator is deliberately a thin transformation layer over the existing
// forecasting engine:
//   1. Validate the hypothetical adjustments against an already-authorized,
//      explicit ForecastInput.
//   2. Clone the input's invoices and expenses and apply the adjustments to the
//      clones only.
//   3. Calculate the baseline with the untouched input and the simulated
//      forecast with the cloned input, using the same `calculateForecast`
//      function and therefore the same financial rules.
//
// No Prisma, Next.js or browser API is imported here. Money is integer minor
// units (BigInt) and every returned amount is a canonical 2dp string. For a
// fixed input and adjustment list the result is deterministic.
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategoryValue,
} from "@/lib/expense-status";
import { addDays } from "@/lib/dashboard-metrics";
import {
  calculateForecast,
  isForecastableExpenseStatus,
  isForecastableInvoiceStatus,
} from "@/lib/forecast-math";
import { formatMoney, parseMoney, parseSignedMoney } from "@/lib/invoice-math";
import { outstandingCents } from "@/lib/payment-math";
import type {
  ForecastExpenseInput,
  ForecastInput,
  ForecastInvoiceInput,
  ForecastResult,
} from "@/types/forecast";
import type {
  AppliedForecastAdjustment,
  ForecastAdjustment,
  ForecastSimulationAmountComparison,
  ForecastSimulationDayComparison,
  ForecastSimulationResult,
} from "@/types/forecast-simulation";
import { FORECAST_ADJUSTMENT_TYPES } from "@/types/forecast-simulation";

const ZERO = BigInt(0);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

const DATE_ADJUSTMENT_TYPES = new Set(["delay_payment", "receive_earlier", "delay_expense"]);
const AMOUNT_ADJUSTMENT_TYPES = new Set([
  "change_amount",
  "increase_expense",
  "reduce_expense",
]);

export class ForecastSimulationValidationError extends Error {
  /** Field-keyed messages suitable for the API error envelope. */
  readonly fieldErrors: Record<string, string>;

  constructor(message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "ForecastSimulationValidationError";
    this.fieldErrors = fieldErrors;
  }
}

function invalid(path: string, message: string): never {
  throw new ForecastSimulationValidationError(message, { [path]: message });
}

function readDate(value: unknown, path: string): string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    invalid(path, "Enter a valid YYYY-MM-DD date.");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    invalid(path, "Enter a valid calendar date.");
  }
  return value;
}

function readPositiveAmount(value: unknown, path: string): bigint {
  if (typeof value !== "string" || !MONEY_PATTERN.test(value)) {
    invalid(path, "Amount must be a positive decimal with at most 2 decimal places.");
  }
  const amount = parseMoney(value);
  if (amount <= ZERO) {
    invalid(path, "Amount must be greater than zero.");
  }
  return amount;
}

function invoiceOutstanding(invoice: ForecastInvoiceInput): bigint {
  return outstandingCents(invoice.totalAmount, [
    { amount: invoice.amountPaid, reversed: false },
  ]);
}

function invoiceScheduledDate(invoice: ForecastInvoiceInput, today: string): string {
  const contractDate = invoice.expectedPaymentDate ?? invoice.dueDate;
  return contractDate < today ? today : contractDate;
}

function expenseScheduledDate(expense: ForecastExpenseInput, today: string): string {
  return expense.dueDate < today ? today : expense.dueDate;
}

function compareAmounts(
  baseline: string,
  simulated: string,
): ForecastSimulationAmountComparison {
  return {
    baseline,
    simulated,
    delta: formatMoney(parseSignedMoney(simulated) - parseSignedMoney(baseline)),
  };
}

function dailyComparison(
  baseline: ForecastResult,
  simulated: ForecastResult,
): ForecastSimulationDayComparison[] {
  return baseline.daily.map((day, index) => {
    const simulatedDay = simulated.daily[index];
    if (!simulatedDay) {
      throw new Error("Simulation produced a daily series with a different length.");
    }
    return {
      date: day.date,
      baselineIncoming: day.incoming,
      simulatedIncoming: simulatedDay.incoming,
      baselineOutgoing: day.outgoing,
      simulatedOutgoing: simulatedDay.outgoing,
      baselineBalance: day.projectedBalance,
      simulatedBalance: simulatedDay.projectedBalance,
      balanceDelta: formatMoney(
        parseSignedMoney(simulatedDay.projectedBalance) -
          parseSignedMoney(day.projectedBalance),
      ),
    };
  });
}

/**
 * Apply hypothetical adjustments to a copy of the authorized forecast input and
 * return the unchanged baseline, the recalculated forecast and their deltas.
 *
 * The caller must pass an input that was already scoped to one verified
 * business. Referenced ids are resolved only inside that input, so a foreign
 * record can never be simulated.
 */
export function simulateForecast(
  input: ForecastInput,
  adjustments: readonly ForecastAdjustment[],
): ForecastSimulationResult {
  const today = input.today;
  const endDate = addDays(today, input.horizonDays - 1);

  const invoices = input.invoices.map((invoice) => ({ ...invoice }));
  const expenses = input.expenses.map((expense) => ({ ...expense }));
  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const expenseById = new Map(expenses.map((expense) => [expense.id, expense]));

  const seenIds = new Set<string>();
  const seenAdjustmentKinds = new Set<string>();
  for (const [index, adjustment] of adjustments.entries()) {
    if (!adjustment || typeof adjustment !== "object") {
      invalid(`adjustments.${index}`, "Adjustment must be an object.");
    }
    if (!(FORECAST_ADJUSTMENT_TYPES as readonly string[]).includes(adjustment.type)) {
      invalid(`adjustments.${index}.type`, "Unsupported adjustment type.");
    }

    const id = typeof adjustment.id === "string" ? adjustment.id.trim() : "";
    if (!id) {
      invalid(`adjustments.${index}.id`, "Adjustment id is required.");
    }
    if (seenIds.has(id)) {
      invalid(`adjustments.${index}.id`, "Duplicate adjustment id.");
    }
    seenIds.add(id);

    // A target may have one date change and one amount change. Two date
    // changes or two amount changes against the same record are ambiguous.
    const kind = DATE_ADJUSTMENT_TYPES.has(adjustment.type)
      ? "date"
      : AMOUNT_ADJUSTMENT_TYPES.has(adjustment.type)
        ? "amount"
        : null;

    if (kind && "invoiceId" in adjustment) {
      if (typeof adjustment.invoiceId !== "string" || !adjustment.invoiceId) {
        invalid(`adjustments.${index}.invoiceId`, "Invoice id is required.");
      }
      const key = `invoice:${adjustment.invoiceId}:${kind}`;
      if (seenAdjustmentKinds.has(key)) {
        invalid(
          `adjustments.${index}`,
          `Only one ${kind} adjustment per invoice is allowed.`,
        );
      }
      seenAdjustmentKinds.add(key);
    }

    if (kind && "expenseId" in adjustment) {
      if (typeof adjustment.expenseId !== "string" || !adjustment.expenseId) {
        invalid(`adjustments.${index}.expenseId`, "Expense id is required.");
      }
      const key = `expense:${adjustment.expenseId}:${kind}`;
      if (seenAdjustmentKinds.has(key)) {
        invalid(
          `adjustments.${index}`,
          `Only one ${kind} adjustment per expense is allowed.`,
        );
      }
      seenAdjustmentKinds.add(key);
    }
  }

  const applied: AppliedForecastAdjustment[] = [];

  function requireInvoice(
    adjustment: { invoiceId: string },
    index: number,
  ): { invoice: ForecastInvoiceInput; outstanding: bigint } {
    const path = `adjustments.${index}.invoiceId`;
    const invoice = invoiceById.get(adjustment.invoiceId);
    if (!invoice) {
      invalid(
        path,
        "Invoice is not part of this business's forecast window. Use the same horizon as the baseline.",
      );
    }
    if (invoice.currency !== input.currency) {
      invalid(
        path,
        `Only ${input.currency} invoices can be simulated. Foreign-currency invoices are never mixed into a forecast.`,
      );
    }
    if (!isForecastableInvoiceStatus(invoice.status)) {
      invalid(path, "Only issued invoices with an outstanding balance can be simulated.");
    }
    const outstanding = invoiceOutstanding(invoice);
    if (outstanding <= ZERO) {
      invalid(path, "Invoice has no outstanding balance to simulate.");
    }
    return { invoice, outstanding };
  }

  function requireExpense(
    adjustment: { expenseId: string },
    index: number,
  ): ForecastExpenseInput {
    const path = `adjustments.${index}.expenseId`;
    const expense = expenseById.get(adjustment.expenseId);
    if (!expense) {
      invalid(
        path,
        "Expense is not part of this business's forecast window. Use the same horizon as the baseline.",
      );
    }
    if (!isForecastableExpenseStatus(expense.status)) {
      invalid(path, "Only unpaid expenses can be simulated.");
    }
    if (parseMoney(expense.amount) <= ZERO) {
      invalid(path, "Expense has no positive amount to simulate.");
    }
    return expense;
  }

  for (const [index, adjustment] of adjustments.entries()) {
    switch (adjustment.type) {
      case "delay_payment": {
        const { invoice } = requireInvoice(adjustment, index);
        const path = `adjustments.${index}.date`;
        const next = readDate(adjustment.date, path);
        if (next > endDate) {
          invalid(path, `The date must be on or before the horizon end ${endDate}.`);
        }
        if (next < today) {
          invalid(path, `The date must be on or after today ${today}.`);
        }
        const current = invoiceScheduledDate(invoice, today);
        if (next <= current) {
          invalid(path, `The delayed date must be after the current scheduled date ${current}.`);
        }
        invoice.expectedPaymentDate = next;
        applied.push({
          id: adjustment.id,
          type: adjustment.type,
          targetId: invoice.id,
          targetLabel: invoice.invoiceNumber,
          description: `Delay ${invoice.invoiceNumber} payment from ${current} to ${next}.`,
          amountDelta: "0.00",
          dateFrom: current,
          dateTo: next,
        });
        break;
      }

      case "receive_earlier": {
        const { invoice } = requireInvoice(adjustment, index);
        const path = `adjustments.${index}.date`;
        const next = readDate(adjustment.date, path);
        if (next > endDate) {
          invalid(path, `The date must be on or before the horizon end ${endDate}.`);
        }
        if (next < today) {
          invalid(path, `The date must be on or after today ${today}.`);
        }
        const current = invoiceScheduledDate(invoice, today);
        if (next >= current) {
          invalid(path, `The earlier date must be before the current scheduled date ${current}.`);
        }
        invoice.expectedPaymentDate = next;
        applied.push({
          id: adjustment.id,
          type: adjustment.type,
          targetId: invoice.id,
          targetLabel: invoice.invoiceNumber,
          description: `Receive ${invoice.invoiceNumber} earlier, from ${current} to ${next}.`,
          amountDelta: "0.00",
          dateFrom: current,
          dateTo: next,
        });
        break;
      }

      case "change_amount": {
        const { invoice, outstanding } = requireInvoice(adjustment, index);
        const path = `adjustments.${index}.amount`;
        const nextOutstanding = readPositiveAmount(adjustment.amount, path);
        if (nextOutstanding === outstanding) {
          invalid(path, "The new amount must differ from the current expected amount.");
        }
        // The forecast only reads the outstanding balance. Keeping amountPaid
        // unchanged and adjusting the total makes that balance exactly the
        // hypothetical expected amount without touching the real invoice.
        invoice.totalAmount = formatMoney(parseMoney(invoice.amountPaid) + nextOutstanding);
        applied.push({
          id: adjustment.id,
          type: adjustment.type,
          targetId: invoice.id,
          targetLabel: invoice.invoiceNumber,
          description: `Change ${invoice.invoiceNumber} expected amount from ${formatMoney(outstanding)} to ${formatMoney(nextOutstanding)}.`,
          amountDelta: formatMoney(nextOutstanding - outstanding),
          dateFrom: null,
          dateTo: null,
        });
        break;
      }

      case "add_expense": {
        const amountPath = `adjustments.${index}.amount`;
        const datePath = `adjustments.${index}.date`;
        const title = typeof adjustment.title === "string" ? adjustment.title.trim() : "";
        if (!title) {
          invalid(`adjustments.${index}.title`, "Title is required.");
        }
        if (
          !(EXPENSE_CATEGORIES as readonly string[]).includes(adjustment.category)
        ) {
          invalid(`adjustments.${index}.category`, "Unsupported expense category.");
        }
        const amount = readPositiveAmount(adjustment.amount, amountPath);
        const date = readDate(adjustment.date, datePath);
        if (date > endDate) {
          invalid(datePath, `The date must be on or before the horizon end ${endDate}.`);
        }
        if (date < today) {
          invalid(datePath, `The date must be on or after today ${today}.`);
        }

        const id = `simulated-expense-${adjustment.id}`;
        expenses.push({
          id,
          title,
          category: adjustment.category as ExpenseCategoryValue,
          amount: formatMoney(amount),
          dueDate: date,
          status: "UPCOMING",
        });
        applied.push({
          id: adjustment.id,
          type: adjustment.type,
          targetId: id,
          targetLabel: title,
          description: `Add hypothetical expense "${title}" for ${formatMoney(amount)} due ${date}.`,
          amountDelta: formatMoney(amount),
          dateFrom: null,
          dateTo: date,
        });
        break;
      }

      case "increase_expense": {
        const expense = requireExpense(adjustment, index);
        const path = `adjustments.${index}.amount`;
        const increase = readPositiveAmount(adjustment.amount, path);
        expense.amount = formatMoney(parseMoney(expense.amount) + increase);
        applied.push({
          id: adjustment.id,
          type: adjustment.type,
          targetId: expense.id,
          targetLabel: expense.title,
          description: `Increase "${expense.title}" by ${formatMoney(increase)}.`,
          amountDelta: formatMoney(increase),
          dateFrom: null,
          dateTo: null,
        });
        break;
      }

      case "reduce_expense": {
        const expense = requireExpense(adjustment, index);
        const path = `adjustments.${index}.amount`;
        const reduction = readPositiveAmount(adjustment.amount, path);
        const currentAmount = parseMoney(expense.amount);
        if (reduction >= currentAmount) {
          invalid(
            path,
            `The reduction must be less than the current expense amount ${expense.amount}.`,
          );
        }
        expense.amount = formatMoney(currentAmount - reduction);
        applied.push({
          id: adjustment.id,
          type: adjustment.type,
          targetId: expense.id,
          targetLabel: expense.title,
          description: `Reduce "${expense.title}" by ${formatMoney(reduction)}.`,
          amountDelta: formatMoney(-reduction),
          dateFrom: null,
          dateTo: null,
        });
        break;
      }

      case "delay_expense": {
        const expense = requireExpense(adjustment, index);
        const path = `adjustments.${index}.date`;
        const next = readDate(adjustment.date, path);
        if (next > endDate) {
          invalid(path, `The date must be on or before the horizon end ${endDate}.`);
        }
        if (next < today) {
          invalid(path, `The date must be on or after today ${today}.`);
        }
        const current = expenseScheduledDate(expense, today);
        if (next <= current) {
          invalid(path, `The delayed date must be after the current scheduled date ${current}.`);
        }
        expense.dueDate = next;
        applied.push({
          id: adjustment.id,
          type: adjustment.type,
          targetId: expense.id,
          targetLabel: expense.title,
          description: `Delay "${expense.title}" from ${current} to ${next}.`,
          amountDelta: "0.00",
          dateFrom: current,
          dateTo: next,
        });
        break;
      }

      default: {
        // Exhaustiveness check: a new adjustment type must be handled above.
        const exhaustive: never = adjustment;
        throw new Error(`Unhandled adjustment type: ${String(exhaustive)}`);
      }
    }
  }

  // The baseline is calculated from the original input object. The simulated
  // forecast receives the same explicit snapshot plus the adjusted clones, so
  // both runs share every financial rule and every non-adjusted record.
  const baseline = calculateForecast(input);
  const simulated = calculateForecast({ ...input, invoices, expenses });

  return {
    currency: simulated.currency,
    timezone: simulated.timezone,
    horizonDays: simulated.horizonDays,
    startDate: simulated.startDate,
    endDate: simulated.endDate,
    today: simulated.today,
    calculatedAt: simulated.calculatedAt,
    adjustments: applied,
    baseline,
    simulated,
    comparison: {
      expectedIncoming: compareAmounts(baseline.expectedIncoming, simulated.expectedIncoming),
      expectedOutgoing: compareAmounts(baseline.expectedOutgoing, simulated.expectedOutgoing),
      netCashFlow: compareAmounts(baseline.netCashFlow, simulated.netCashFlow),
      projectedEndingBalance: compareAmounts(
        baseline.projectedEndingBalance,
        simulated.projectedEndingBalance,
      ),
      lowestProjectedBalance: compareAmounts(
        baseline.lowestProjectedBalance,
        simulated.lowestProjectedBalance,
      ),
      lowestProjectedDate: {
        baseline: baseline.lowestProjectedDate,
        simulated: simulated.lowestProjectedDate,
      },
      shortageDate: {
        baseline: baseline.shortageDate,
        simulated: simulated.shortageDate,
      },
      becomesNegative: {
        baseline: baseline.becomesNegative,
        simulated: simulated.becomesNegative,
      },
    },
    daily: dailyComparison(baseline, simulated),
  };
}
