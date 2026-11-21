import assert from "node:assert/strict";
import test from "node:test";
import { calculateForecast } from "@/lib/forecast-math";
import {
  ForecastSimulationValidationError,
  simulateForecast,
} from "@/lib/forecast-simulation";
import type { ForecastAdjustment } from "@/types/forecast-simulation";
import {
  FORECAST_TODAY,
  makeExpense,
  makeForecastInput,
  makeInvoice,
} from "./helpers/forecast-fakes";

const INVOICE_B = "70000000-0000-4000-8000-000000000002";
const INVOICE_EUR = "70000000-0000-4000-8000-000000000003";
const EXPENSE_B = "80000000-0000-4000-8000-000000000002";

const MONEY = /^-?\d+\.\d{2}$/;

function adjustmentId(index: number): string {
  return `adjustment-${index}`;
}

function delayPayment(
  invoiceId: string,
  date: string,
  index = 0,
): ForecastAdjustment {
  return { id: adjustmentId(index), type: "delay_payment", invoiceId, date };
}

function receiveEarlier(
  invoiceId: string,
  date: string,
  index = 0,
): ForecastAdjustment {
  return { id: adjustmentId(index), type: "receive_earlier", invoiceId, date };
}

function changeAmount(
  invoiceId: string,
  amount: string,
  index = 0,
): ForecastAdjustment {
  return { id: adjustmentId(index), type: "change_amount", invoiceId, amount };
}

function addExpense(
  amount: string,
  date: string,
  index = 0,
): ForecastAdjustment {
  return {
    id: adjustmentId(index),
    type: "add_expense",
    title: "Hypothetical equipment",
    category: "EQUIPMENT",
    amount,
    date,
  };
}

function increaseExpense(
  expenseId: string,
  amount: string,
  index = 0,
): ForecastAdjustment {
  return { id: adjustmentId(index), type: "increase_expense", expenseId, amount };
}

function reduceExpense(
  expenseId: string,
  amount: string,
  index = 0,
): ForecastAdjustment {
  return { id: adjustmentId(index), type: "reduce_expense", expenseId, amount };
}

function delayExpense(
  expenseId: string,
  date: string,
  index = 0,
): ForecastAdjustment {
  return { id: adjustmentId(index), type: "delay_expense", expenseId, date };
}

function expectInvalid(fn: () => unknown, message: RegExp): ForecastSimulationValidationError {
  let captured: ForecastSimulationValidationError | null = null;
  assert.throws(fn, (error: unknown) => {
    assert.ok(
      error instanceof ForecastSimulationValidationError,
      `expected ForecastSimulationValidationError, received ${String(error)}`,
    );
    assert.match(error.message, message);
    captured = error;
    return true;
  });
  assert.ok(captured);
  return captured;
}

test("an empty simulation reproduces the baseline and leaves the input unchanged", () => {
  const input = makeForecastInput({
    invoices: [makeInvoice({ dueDate: "2026-01-20" })],
    expenses: [makeExpense({ dueDate: "2026-01-18" })],
  });
  const snapshot = JSON.parse(JSON.stringify(input));

  const result = simulateForecast(input, []);

  assert.deepEqual(result.baseline, calculateForecast(input));
  assert.deepEqual(result.simulated, result.baseline);
  assert.deepEqual(input, snapshot);
  assert.equal(result.daily.length, 30);
  assert.deepEqual(result.adjustments, []);
  assert.equal(result.comparison.projectedEndingBalance.delta, "0.00");
  assert.equal(result.comparison.shortageDate.simulated, null);
});

test("delaying a customer payment moves the receipt later without changing the total", () => {
  const input = makeForecastInput({
    invoices: [makeInvoice({ dueDate: "2026-01-20", totalAmount: "100.00" })],
  });

  const result = simulateForecast(input, [delayPayment(makeInvoice().id, "2026-01-25")]);

  assert.equal(result.baseline.expectedIncoming, "100.00");
  assert.equal(result.simulated.expectedIncoming, "100.00");
  assert.equal(result.baseline.daily[5]?.projectedBalance, "1100.00");
  assert.equal(result.simulated.daily[5]?.projectedBalance, "1000.00");
  assert.equal(result.simulated.daily[10]?.projectedBalance, "1100.00");
  assert.equal(result.daily[5]?.balanceDelta, "-100.00");
  assert.equal(result.simulated.incoming[0]?.scheduledDate, "2026-01-25");
  assert.equal(result.adjustments[0]?.dateFrom, "2026-01-20");
  assert.equal(result.adjustments[0]?.dateTo, "2026-01-25");
  assert.match(result.adjustments[0]?.description ?? "", /Delay INV-0001/);
});

test("receiving a payment earlier increases the balance sooner", () => {
  const input = makeForecastInput({
    invoices: [makeInvoice({ dueDate: "2026-01-25", totalAmount: "100.00" })],
  });

  const result = simulateForecast(input, [
    receiveEarlier(makeInvoice().id, "2026-01-18"),
  ]);

  assert.equal(result.baseline.daily[3]?.projectedBalance, "1000.00");
  assert.equal(result.simulated.daily[3]?.projectedBalance, "1100.00");
  assert.equal(result.baseline.daily[10]?.projectedBalance, "1100.00");
  assert.equal(result.simulated.daily[10]?.projectedBalance, "1100.00");
  assert.equal(result.daily[3]?.balanceDelta, "100.00");
  assert.equal(result.adjustments[0]?.dateFrom, "2026-01-25");
  assert.equal(result.adjustments[0]?.dateTo, "2026-01-18");
});

test("changing the expected amount uses the outstanding balance and exact minor units", () => {
  const invoice = makeInvoice({ totalAmount: "100.00", amountPaid: "25.00" });
  const input = makeForecastInput({ invoices: [invoice] });

  const increased = simulateForecast(input, [changeAmount(invoice.id, "150.00")]);
  assert.equal(increased.baseline.expectedIncoming, "75.00");
  assert.equal(increased.simulated.expectedIncoming, "150.00");
  assert.equal(increased.simulated.projectedEndingBalance, "1150.00");
  assert.equal(increased.comparison.expectedIncoming.delta, "75.00");
  assert.equal(increased.adjustments[0]?.amountDelta, "75.00");

  const reduced = simulateForecast(input, [changeAmount(invoice.id, "50.00")]);
  assert.equal(reduced.simulated.expectedIncoming, "50.00");
  assert.equal(reduced.simulated.projectedEndingBalance, "1050.00");
  assert.equal(reduced.comparison.expectedIncoming.delta, "-25.00");
  assert.equal(reduced.adjustments[0]?.amountDelta, "-25.00");

  // The real invoice snapshot is untouched.
  assert.equal(invoice.totalAmount, "100.00");
  assert.equal(invoice.amountPaid, "25.00");
});

test("a hypothetical expense increases outgoing cash and reduces the ending balance", () => {
  const input = makeForecastInput();

  const result = simulateForecast(input, [addExpense("200.00", "2026-01-18")]);

  assert.equal(result.baseline.expectedOutgoing, "0.00");
  assert.equal(result.simulated.expectedOutgoing, "200.00");
  assert.equal(result.simulated.projectedEndingBalance, "800.00");
  assert.equal(result.simulated.daily[3]?.outgoing, "200.00");
  assert.equal(result.daily[3]?.balanceDelta, "-200.00");
  assert.equal(result.adjustments[0]?.amountDelta, "200.00");
  assert.equal(result.adjustments[0]?.dateTo, "2026-01-18");
  assert.match(result.adjustments[0]?.targetId ?? "", /^simulated-expense-/);
  assert.equal(result.adjustments[0]?.targetLabel, "Hypothetical equipment");
});

test("increasing an existing expense increases the outgoing total", () => {
  const expense = makeExpense({ amount: "50.00", dueDate: "2026-01-20" });
  const input = makeForecastInput({ expenses: [expense] });

  const result = simulateForecast(input, [increaseExpense(expense.id, "25.00")]);

  assert.equal(result.baseline.expectedOutgoing, "50.00");
  assert.equal(result.simulated.expectedOutgoing, "75.00");
  assert.equal(result.simulated.projectedEndingBalance, "925.00");
  assert.equal(result.adjustments[0]?.amountDelta, "25.00");
  assert.equal(expense.amount, "50.00");
});

test("reducing an existing expense improves the ending balance but must stay positive", () => {
  const expense = makeExpense({ amount: "50.00", dueDate: "2026-01-20" });
  const input = makeForecastInput({ expenses: [expense] });

  const result = simulateForecast(input, [reduceExpense(expense.id, "20.00")]);

  assert.equal(result.simulated.expectedOutgoing, "30.00");
  assert.equal(result.simulated.projectedEndingBalance, "970.00");
  assert.equal(result.adjustments[0]?.amountDelta, "-20.00");

  expectInvalid(
    () => simulateForecast(input, [reduceExpense(expense.id, "50.00")]),
    /must be less than the current expense amount/,
  );
});

test("delaying an expense keeps cash available until the new due date", () => {
  const expense = makeExpense({ amount: "50.00", dueDate: "2026-01-20" });
  const input = makeForecastInput({ expenses: [expense] });

  const result = simulateForecast(input, [delayExpense(expense.id, "2026-01-27")]);

  assert.equal(result.simulated.daily[5]?.projectedBalance, "1000.00");
  assert.equal(result.simulated.daily[12]?.projectedBalance, "950.00");
  assert.equal(result.simulated.projectedEndingBalance, "950.00");
  assert.equal(result.daily[5]?.balanceDelta, "50.00");
  assert.equal(result.adjustments[0]?.dateFrom, "2026-01-20");
  assert.equal(result.adjustments[0]?.dateTo, "2026-01-27");
});

test("multiple simultaneous adjustments compose deterministically", () => {
  const invoiceA = makeInvoice({
    id: "70000000-0000-4000-8000-000000000010",
    invoiceNumber: "INV-0010",
    dueDate: "2026-01-20",
    totalAmount: "100.00",
  });
  const invoiceB = makeInvoice({
    id: INVOICE_B,
    invoiceNumber: "INV-0002",
    dueDate: "2026-01-25",
    totalAmount: "200.00",
    amountPaid: "50.00",
  });
  const rent = makeExpense({
    id: "80000000-0000-4000-8000-000000000010",
    title: "Rent",
    amount: "50.00",
    dueDate: "2026-01-18",
  });
  const software = makeExpense({
    id: EXPENSE_B,
    title: "Software",
    amount: "100.00",
    dueDate: "2026-01-22",
  });
  const input = makeForecastInput({
    invoices: [invoiceA, invoiceB],
    expenses: [rent, software],
  });

  const result = simulateForecast(input, [
    delayPayment(invoiceA.id, "2026-01-28", 0),
    changeAmount(invoiceB.id, "120.00", 1),
    addExpense("30.00", "2026-01-19", 2),
    increaseExpense(rent.id, "10.00", 3),
    reduceExpense(software.id, "40.00", 4),
    delayExpense(software.id, "2026-01-29", 5),
  ]);

  assert.equal(result.baseline.expectedIncoming, "250.00");
  assert.equal(result.simulated.expectedIncoming, "220.00");
  assert.equal(result.baseline.expectedOutgoing, "150.00");
  assert.equal(result.simulated.expectedOutgoing, "150.00");
  assert.equal(result.baseline.projectedEndingBalance, "1100.00");
  assert.equal(result.simulated.projectedEndingBalance, "1070.00");
  assert.equal(result.comparison.netCashFlow.delta, "-30.00");
  assert.equal(result.adjustments.length, 6);
  assert.deepEqual(
    result.adjustments.map((item) => item.type),
    [
      "delay_payment",
      "change_amount",
      "add_expense",
      "increase_expense",
      "reduce_expense",
      "delay_expense",
    ],
  );
});

test("30, 60 and 90-day horizons all work and enforce their own window", () => {
  const invoice = makeInvoice({ dueDate: "2026-02-10", totalAmount: "100.00" });

  for (const horizon of [30, 60, 90] as const) {
    const input = makeForecastInput({ horizonDays: horizon, invoices: [invoice] });
    const result = simulateForecast(input, [
      delayPayment(invoice.id, "2026-02-12"),
    ]);
    assert.equal(result.daily.length, horizon);
    assert.equal(result.horizonDays, horizon);
    assert.equal(result.simulated.expectedIncoming, "100.00");
    assert.equal(result.simulated.incoming[0]?.scheduledDate, "2026-02-12");
  }

  const thirty = makeForecastInput({ horizonDays: 30, invoices: [invoice] });
  expectInvalid(
    () => simulateForecast(thirty, [delayPayment(invoice.id, "2026-02-20")]),
    /on or before the horizon end 2026-02-13/,
  );

  const atEnd = simulateForecast(thirty, [delayPayment(invoice.id, "2026-02-13")]);
  assert.equal(atEnd.simulated.incoming[0]?.scheduledDate, "2026-02-13");
});

test("negative and zero balances are handled exactly", () => {
  const input = makeForecastInput({
    openingBalance: "50.00",
    invoices: [makeInvoice({ dueDate: "2026-01-20", totalAmount: "100.00" })],
    expenses: [makeExpense({ dueDate: "2026-01-18", amount: "200.00" })],
  });

  const result = simulateForecast(input, [addExpense("25.00", "2026-01-19")]);

  assert.equal(result.baseline.projectedEndingBalance, "-50.00");
  assert.equal(result.simulated.projectedEndingBalance, "-75.00");
  assert.equal(result.simulated.lowestProjectedBalance, "-175.00");
  assert.equal(result.baseline.shortageDate, "2026-01-18");
  assert.equal(result.simulated.shortageDate, "2026-01-18");
  assert.equal(result.comparison.projectedEndingBalance.delta, "-25.00");
  assert.equal(result.comparison.becomesNegative.baseline, true);
  assert.equal(result.comparison.becomesNegative.simulated, true);

  const zeroInput = makeForecastInput({
    openingBalance: "100.00",
    expenses: [makeExpense({ dueDate: "2026-01-15", amount: "100.00" })],
  });
  const zero = simulateForecast(zeroInput, []);
  assert.equal(zero.simulated.projectedEndingBalance, "0.00");
  assert.equal(zero.simulated.lowestProjectedBalance, "0.00");
  assert.equal(zero.simulated.becomesNegative, false);
  assert.equal(zero.simulated.shortageDate, null);

  const oneOver = simulateForecast(zeroInput, [addExpense("0.01", "2026-01-15")]);
  assert.equal(oneOver.simulated.projectedEndingBalance, "-0.01");
  assert.equal(oneOver.simulated.becomesNegative, true);
  assert.equal(oneOver.simulated.shortageDate, "2026-01-15");
});

test("a simulated expense reduction can remove a baseline shortage", () => {
  const expense = makeExpense({ dueDate: "2026-01-18", amount: "200.00" });
  const input = makeForecastInput({
    openingBalance: "50.00",
    expenses: [expense],
  });

  const result = simulateForecast(input, [reduceExpense(expense.id, "150.00")]);

  assert.equal(result.baseline.becomesNegative, true);
  assert.equal(result.simulated.becomesNegative, false);
  assert.equal(result.simulated.shortageDate, null);
  assert.equal(result.simulated.projectedEndingBalance, "0.00");
  assert.equal(result.comparison.shortageDate.baseline, "2026-01-18");
  assert.equal(result.comparison.shortageDate.simulated, null);
});

test("invalid dates are rejected with a field path", () => {
  const invoice = makeInvoice({ dueDate: "2026-01-20", totalAmount: "100.00" });
  const input = makeForecastInput({ invoices: [invoice] });

  const beforeScheduled = expectInvalid(
    () => simulateForecast(input, [delayPayment(invoice.id, "2026-01-19")]),
    /must be after the current scheduled date 2026-01-20/,
  );
  assert.equal(
    beforeScheduled.fieldErrors["adjustments.0.date"],
    "The delayed date must be after the current scheduled date 2026-01-20.",
  );

  expectInvalid(
    () => simulateForecast(input, [receiveEarlier(invoice.id, "2026-01-20")]),
    /must be before the current scheduled date/,
  );
  expectInvalid(
    () => simulateForecast(input, [delayPayment(invoice.id, "2026-01-14")]),
    /on or after today 2026-01-15/,
  );
  expectInvalid(
    () => simulateForecast(input, [delayPayment(invoice.id, "2026-02-30")]),
    /valid calendar date/,
  );

  const expense = makeExpense({ dueDate: "2026-01-20" });
  const expenseInput = makeForecastInput({ expenses: [expense] });
  expectInvalid(
    () => simulateForecast(expenseInput, [delayExpense(expense.id, "2026-01-20")]),
    /must be after the current scheduled date/,
  );
});

test("invalid amounts are rejected", () => {
  const invoice = makeInvoice({ dueDate: "2026-01-20", totalAmount: "100.00" });
  const input = makeForecastInput({ invoices: [invoice] });

  for (const amount of ["0", "0.00", "-1.00", "1.234", "abc", ""]) {
    expectInvalid(
      () => simulateForecast(input, [changeAmount(invoice.id, amount)]),
      /Amount must be/,
    );
  }

  expectInvalid(
    () => simulateForecast(input, [changeAmount(invoice.id, "100.00")]),
    /must differ from the current expected amount/,
  );

  const expense = makeExpense({ amount: "50.00" });
  const expenseInput = makeForecastInput({ expenses: [expense] });
  expectInvalid(
    () => simulateForecast(expenseInput, [increaseExpense(expense.id, "0.00")]),
    /Amount must be/,
  );
});

test("foreign-currency invoices can never be adjusted or mixed into a simulation", () => {
  const usd = makeInvoice({ dueDate: "2026-01-20", totalAmount: "100.00" });
  const eur = makeInvoice({
    id: INVOICE_EUR,
    invoiceNumber: "INV-EUR",
    currency: "EUR",
    dueDate: "2026-01-21",
    totalAmount: "200.00",
  });
  const input = makeForecastInput({ invoices: [usd, eur] });

  const baseline = calculateForecast(input);
  assert.equal(baseline.expectedIncoming, "100.00");
  assert.equal(baseline.excludedInvoices.count, 1);
  assert.deepEqual(baseline.excludedInvoices.byCurrency, { EUR: "200.00" });

  expectInvalid(
    () => simulateForecast(input, [delayPayment(eur.id, "2026-01-25")]),
    /Only USD invoices can be simulated/,
  );

  const result = simulateForecast(input, [delayPayment(usd.id, "2026-01-25")]);
  assert.equal(result.simulated.expectedIncoming, "100.00");
  assert.equal(result.simulated.excludedInvoices.count, 1);
  assert.equal(result.simulated.currency, "USD");
});

test("duplicate ids and multiple adjustments on one target are rejected", () => {
  const invoiceA = makeInvoice({
    id: "70000000-0000-4000-8000-000000000020",
    invoiceNumber: "INV-0020",
    dueDate: "2026-01-20",
  });
  const invoiceB = makeInvoice({
    id: INVOICE_B,
    invoiceNumber: "INV-0021",
    dueDate: "2026-01-21",
  });
  const input = makeForecastInput({ invoices: [invoiceA, invoiceB] });

  expectInvalid(
    () =>
      simulateForecast(input, [
        { id: "same", type: "delay_payment", invoiceId: invoiceA.id, date: "2026-01-25" },
        { id: "same", type: "delay_payment", invoiceId: invoiceB.id, date: "2026-01-26" },
      ]),
    /Duplicate adjustment id/,
  );

  expectInvalid(
    () =>
      simulateForecast(input, [
        delayPayment(invoiceA.id, "2026-01-25", 0),
        delayPayment(invoiceA.id, "2026-01-26", 1),
      ]),
    /Only one date adjustment per invoice/,
  );

  const expense = makeExpense({ dueDate: "2026-01-20", amount: "50.00" });
  const expenseInput = makeForecastInput({ expenses: [expense] });
  expectInvalid(
    () =>
      simulateForecast(expenseInput, [
        increaseExpense(expense.id, "10.00", 0),
        reduceExpense(expense.id, "5.00", 1),
      ]),
    /Only one amount adjustment per expense/,
  );
});

test("a date change and an amount change can be combined on the same record", () => {
  const invoice = makeInvoice({ dueDate: "2026-01-20", totalAmount: "100.00" });
  const expense = makeExpense({ dueDate: "2026-01-18", amount: "50.00" });
  const input = makeForecastInput({ invoices: [invoice], expenses: [expense] });

  const result = simulateForecast(input, [
    delayPayment(invoice.id, "2026-01-28", 0),
    changeAmount(invoice.id, "80.00", 1),
    increaseExpense(expense.id, "10.00", 2),
    delayExpense(expense.id, "2026-01-30", 3),
  ]);

  assert.equal(result.simulated.expectedIncoming, "80.00");
  assert.equal(result.simulated.incoming[0]?.scheduledDate, "2026-01-28");
  assert.equal(result.simulated.expectedOutgoing, "60.00");
  assert.equal(result.simulated.outgoing[0]?.scheduledDate, "2026-01-30");
  assert.equal(result.adjustments.length, 4);
});

test("references outside the authorized input and ineligible records are rejected", () => {
  const input = makeForecastInput();

  expectInvalid(
    () => simulateForecast(input, [delayPayment("70000000-0000-4000-8000-000000000099", "2026-01-20")]),
    /not part of this business's forecast window/,
  );
  expectInvalid(
    () =>
      simulateForecast(input, [
        increaseExpense("80000000-0000-4000-8000-000000000099", "10.00"),
      ]),
    /not part of this business's forecast window/,
  );

  const paidInvoice = makeInvoice({
    status: "PAID",
    totalAmount: "100.00",
    amountPaid: "100.00",
  });
  expectInvalid(
    () =>
      simulateForecast(makeForecastInput({ invoices: [paidInvoice] }), [
        changeAmount(paidInvoice.id, "50.00"),
      ]),
    /Only issued invoices/,
  );

  const fullyPaid = makeInvoice({ status: "SENT", totalAmount: "100.00", amountPaid: "100.00" });
  expectInvalid(
    () =>
      simulateForecast(makeForecastInput({ invoices: [fullyPaid] }), [
        changeAmount(fullyPaid.id, "50.00"),
      ]),
    /no outstanding balance/,
  );

  const paidExpense = makeExpense({ status: "PAID" });
  expectInvalid(
    () =>
      simulateForecast(makeForecastInput({ expenses: [paidExpense] }), [
        increaseExpense(paidExpense.id, "10.00"),
      ]),
    /Only unpaid expenses/,
  );
});

test("out-of-period adjustments are rejected for every date scenario", () => {
  const invoice = makeInvoice({ dueDate: "2026-01-20" });
  const expense = makeExpense({ dueDate: "2026-01-20" });
  const input = makeForecastInput({ invoices: [invoice], expenses: [expense] });

  expectInvalid(
    () => simulateForecast(input, [delayPayment(invoice.id, "2026-02-14")]),
    /on or before the horizon end 2026-02-13/,
  );
  expectInvalid(
    () => simulateForecast(input, [delayExpense(expense.id, "2026-02-14")]),
    /on or before the horizon end 2026-02-13/,
  );
  expectInvalid(
    () => simulateForecast(input, [addExpense("10.00", "2026-02-14")]),
    /on or before the horizon end 2026-02-13/,
  );
});

test("simulation is deterministic and never mutates the baseline forecast", () => {
  const invoice = makeInvoice({ dueDate: "2026-01-20", totalAmount: "100.00" });
  const expense = makeExpense({ dueDate: "2026-01-18", amount: "50.00" });
  const input = makeForecastInput({ invoices: [invoice], expenses: [expense] });
  const snapshot = JSON.parse(JSON.stringify(input));
  const adjustments: ForecastAdjustment[] = [
    delayPayment(invoice.id, "2026-01-27"),
    increaseExpense(expense.id, "25.00", 1),
    addExpense("10.00", "2026-01-22", 2),
  ];

  const first = simulateForecast(input, adjustments);
  const second = simulateForecast(input, adjustments);

  assert.deepEqual(first, second);
  assert.deepEqual(input, snapshot);
  assert.deepEqual(first.baseline, calculateForecast(input));
  assert.equal(first.baseline.incoming[0]?.scheduledDate, "2026-01-20");
  assert.equal(first.simulated.incoming[0]?.scheduledDate, "2026-01-27");
  assert.equal(first.baseline.expectedOutgoing, "50.00");
  assert.equal(first.simulated.expectedOutgoing, "85.00");
});

test("all monetary outputs are canonical 2dp strings", () => {
  const invoice = makeInvoice({ totalAmount: "0.10" });
  const expense = makeExpense({ amount: "0.20" });
  const input = makeForecastInput({
    openingBalance: "0.00",
    invoices: [invoice],
    expenses: [expense],
  });

  const result = simulateForecast(input, [changeAmount(invoice.id, "0.30")]);

  assert.equal(result.simulated.expectedIncoming, "0.30");
  assert.equal(result.simulated.expectedOutgoing, "0.20");
  assert.equal(result.simulated.netCashFlow, "0.10");
  assert.equal(result.comparison.expectedIncoming.delta, "0.20");

  for (const day of result.daily) {
    for (const value of [
      day.baselineIncoming,
      day.simulatedIncoming,
      day.baselineOutgoing,
      day.simulatedOutgoing,
      day.baselineBalance,
      day.simulatedBalance,
      day.balanceDelta,
    ]) {
      assert.match(value, MONEY);
    }
  }
});

test("large amounts keep exact precision without floating point", () => {
  const invoice = makeInvoice({ totalAmount: "9999999999.99" });
  const input = makeForecastInput({ openingBalance: "0.00", invoices: [invoice] });

  const result = simulateForecast(input, [changeAmount(invoice.id, "9999999999.98")]);

  assert.equal(result.baseline.expectedIncoming, "9999999999.99");
  assert.equal(result.simulated.expectedIncoming, "9999999999.98");
  assert.equal(result.comparison.expectedIncoming.delta, "-0.01");
  assert.equal(result.simulated.projectedEndingBalance, "9999999999.98");
});

test("overdue items can be delayed from the first forecast day", () => {
  const invoice = makeInvoice({
    dueDate: "2026-01-01",
    status: "OVERDUE",
    totalAmount: "100.00",
  });
  const input = makeForecastInput({ invoices: [invoice] });

  const result = simulateForecast(input, [delayPayment(invoice.id, "2026-01-20")]);

  assert.equal(result.baseline.incoming[0]?.scheduledDate, FORECAST_TODAY);
  assert.equal(result.simulated.incoming[0]?.scheduledDate, "2026-01-20");
  assert.equal(result.daily[0]?.balanceDelta, "-100.00");
  assert.equal(result.adjustments[0]?.dateFrom, FORECAST_TODAY);
});
