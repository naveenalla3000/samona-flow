import assert from "node:assert/strict";
import test from "node:test";
import { addDays } from "@/lib/dashboard-metrics";
import {
  aggregateMonths,
  aggregateWeeks,
  calculateForecast,
} from "@/lib/forecast-math";
import { parseMoney } from "@/lib/invoice-math";
import type { ForecastHorizon } from "@/types/forecast";
import {
  FORECAST_TODAY,
  makeExpense,
  makeForecastInput,
  makeInvoice,
} from "./helpers/forecast-fakes";

const INVOICE_ID_2 = "70000000-0000-4000-8000-000000000002";
const INVOICE_ID_3 = "70000000-0000-4000-8000-000000000003";

test("30, 60 and 90-day horizons produce one entry per day and the correct end date", () => {
  for (const horizon of [30, 60, 90] as ForecastHorizon[]) {
    const result = calculateForecast(makeForecastInput({ horizonDays: horizon }));
    assert.equal(result.daily.length, horizon, `horizon ${horizon}`);
    assert.equal(result.startDate, FORECAST_TODAY);
    assert.equal(result.endDate, addDays(FORECAST_TODAY, horizon - 1));
    assert.equal(result.daily[0]?.date, FORECAST_TODAY);
    assert.equal(result.daily.at(-1)?.date, result.endDate);
  }
});

test("current cash is the opening balance plus recorded cash in minus recorded cash out", () => {
  const result = calculateForecast(
    makeForecastInput({
      openingBalance: "1000.00",
      cashInSinceOpening: "250.50",
      cashOutSinceOpening: "100.25",
    }),
  );
  assert.equal(result.openingBalance, "1150.25");
  assert.equal(result.daily[0]?.openingBalance, "1150.25");
  assert.equal(result.projectedEndingBalance, "1150.25");
});

test("a partial payment contributes only the outstanding balance", () => {
  const result = calculateForecast(
    makeForecastInput({
      invoices: [makeInvoice({ totalAmount: "200.00", amountPaid: "75.00" })],
    }),
  );
  assert.equal(result.expectedIncoming, "125.00");
  assert.equal(result.incoming[0]?.amount, "125.00");
  assert.equal(result.daily[5]?.incoming, "125.00");
  assert.equal(result.daily[5]?.projectedBalance, "1125.00");
});

test("fully paid invoices are excluded and never double-counted", () => {
  const result = calculateForecast(
    makeForecastInput({
      invoices: [
        makeInvoice({ totalAmount: "100.00", amountPaid: "100.00" }),
        makeInvoice({
          id: INVOICE_ID_2,
          invoiceNumber: "INV-0002",
          totalAmount: "250.00",
          amountPaid: "250.00",
        }),
      ],
    }),
  );
  assert.equal(result.counts.incoming, 0);
  assert.equal(result.expectedIncoming, "0.00");
  assert.equal(result.incoming.length, 0);
});

test("reversed payments are already removed from amountPaid, so only active receipts reduce the forecast", () => {
  // The repository computes amountPaid with NOT EXISTS (payment_reversals).
  // Here the invoice received 40 active and 60 reversed: the forecast must be 60.
  const result = calculateForecast(
    makeForecastInput({
      invoices: [makeInvoice({ totalAmount: "100.00", amountPaid: "40.00" })],
    }),
  );
  assert.equal(result.expectedIncoming, "60.00");
  assert.equal(result.incoming[0]?.amount, "60.00");
});

test("overdue invoices are projected on the first forecast day", () => {
  const result = calculateForecast(
    makeForecastInput({
      invoices: [
        makeInvoice({ dueDate: "2026-01-01", status: "SENT", totalAmount: "100.00" }),
      ],
    }),
  );
  assert.equal(result.incoming[0]?.scheduledDate, FORECAST_TODAY);
  assert.equal(result.incoming[0]?.isOverdue, true);
  assert.equal(result.daily[0]?.incoming, "100.00");
  assert.equal(result.overdue.incoming, "100.00");
  assert.equal(result.overdue.incomingCount, 1);
});

test("a stale expected payment date schedules the receipt today without marking the invoice overdue", () => {
  const result = calculateForecast(
    makeForecastInput({
      invoices: [
        makeInvoice({
          dueDate: "2026-01-30",
          expectedPaymentDate: "2026-01-10",
          status: "SENT",
        }),
      ],
    }),
  );
  assert.equal(result.incoming[0]?.scheduledDate, FORECAST_TODAY);
  assert.equal(result.incoming[0]?.isOverdue, false);
  assert.equal(result.overdue.incoming, "0.00");
  assert.equal(result.overdue.incomingCount, 0);
});

test("expectedPaymentDate takes precedence; dueDate is the fallback", () => {
  const withExpected = calculateForecast(
    makeForecastInput({
      invoices: [
        makeInvoice({
          dueDate: "2026-01-20",
          expectedPaymentDate: "2026-01-25",
        }),
      ],
    }),
  );
  assert.equal(withExpected.incoming[0]?.scheduledDate, "2026-01-25");
  assert.equal(withExpected.daily[10]?.incoming, "100.00");

  const fallback = calculateForecast(
    makeForecastInput({
      invoices: [makeInvoice({ dueDate: "2026-01-20", expectedPaymentDate: null })],
    }),
  );
  assert.equal(fallback.incoming[0]?.scheduledDate, "2026-01-20");
  assert.equal(fallback.daily[5]?.incoming, "100.00");
});

test("invoices beyond the horizon are excluded but reappear in a longer horizon", () => {
  const invoice = makeInvoice({ dueDate: "2026-03-01" });
  const thirty = calculateForecast(makeForecastInput({ invoices: [invoice] }));
  const ninety = calculateForecast(
    makeForecastInput({ horizonDays: 90, invoices: [invoice] }),
  );
  assert.equal(thirty.expectedIncoming, "0.00");
  assert.equal(ninety.expectedIncoming, "100.00");
});

test("DRAFT, VOID and PAID invoices are defensively ignored by the engine", () => {
  const result = calculateForecast(
    makeForecastInput({
      invoices: [
        makeInvoice({ status: "DRAFT" }),
        makeInvoice({ id: INVOICE_ID_2, invoiceNumber: "INV-0002", status: "VOID" }),
        makeInvoice({ id: INVOICE_ID_3, invoiceNumber: "INV-0003", status: "PAID" }),
      ],
    }),
  );
  assert.equal(result.expectedIncoming, "0.00");
  assert.equal(result.counts.incoming, 0);
});

test("upcoming expenses are included and PAID/CANCELLED expenses are excluded", () => {
  const result = calculateForecast(
    makeForecastInput({
      expenses: [
        makeExpense({ dueDate: "2026-01-18", amount: "100.00", status: "UPCOMING" }),
        makeExpense({
          id: "80000000-0000-4000-8000-000000000002",
          title: "Paid software",
          dueDate: "2026-01-18",
          amount: "50.00",
          status: "PAID",
        }),
        makeExpense({
          id: "80000000-0000-4000-8000-000000000003",
          title: "Cancelled travel",
          dueDate: "2026-01-19",
          amount: "25.00",
          status: "CANCELLED",
        }),
      ],
    }),
  );
  assert.equal(result.expectedOutgoing, "100.00");
  assert.equal(result.outgoing.length, 1);
  assert.equal(result.daily[3]?.outgoing, "100.00");
});

test("overdue expenses are projected on the first forecast day", () => {
  const result = calculateForecast(
    makeForecastInput({
      expenses: [makeExpense({ dueDate: "2026-01-10", amount: "40.00" })],
    }),
  );
  assert.equal(result.outgoing[0]?.scheduledDate, FORECAST_TODAY);
  assert.equal(result.outgoing[0]?.isOverdue, true);
  assert.equal(result.daily[0]?.outgoing, "40.00");
  assert.equal(result.overdue.outgoing, "40.00");
});

test("a negative projected balance reports the lowest point and the first shortage date", () => {
  const result = calculateForecast(
    makeForecastInput({
      openingBalance: "100.00",
      expenses: [makeExpense({ dueDate: "2026-01-20", amount: "500.00" })],
    }),
  );
  assert.equal(result.becomesNegative, true);
  assert.equal(result.lowestProjectedBalance, "-400.00");
  assert.equal(result.lowestProjectedDate, "2026-01-20");
  assert.equal(result.shortageDate, "2026-01-20");
  assert.equal(result.daily[5]?.projectedBalance, "-400.00");
});

test("zero cash with no movements stays at zero and is not a shortfall", () => {
  const result = calculateForecast(makeForecastInput({ openingBalance: "0.00" }));
  assert.equal(result.openingBalance, "0.00");
  assert.equal(result.lowestProjectedBalance, "0.00");
  assert.equal(result.shortageDate, null);
  assert.equal(result.becomesNegative, false);
  assert.ok(result.daily.every((day) => day.projectedBalance === "0.00"));
});

test("a negative opening balance is a shortage on the start date", () => {
  const result = calculateForecast(makeForecastInput({ openingBalance: "-50.00" }));
  assert.equal(result.openingBalance, "-50.00");
  assert.equal(result.lowestProjectedBalance, "-50.00");
  assert.equal(result.lowestProjectedDate, FORECAST_TODAY);
  assert.equal(result.shortageDate, FORECAST_TODAY);
  assert.equal(result.becomesNegative, true);
});

test("currency isolation excludes foreign invoices without mixing totals", () => {
  const result = calculateForecast(
    makeForecastInput({
      currency: "USD",
      invoices: [
        makeInvoice({ totalAmount: "100.00", dueDate: "2026-01-20" }),
        makeInvoice({
          id: INVOICE_ID_2,
          invoiceNumber: "INV-EUR",
          currency: "EUR",
          totalAmount: "200.00",
          dueDate: "2026-01-20",
        }),
      ],
    }),
  );
  assert.equal(result.expectedIncoming, "100.00");
  assert.equal(result.counts.incoming, 1);
  assert.equal(result.counts.excludedInvoices, 1);
  assert.deepEqual(result.excludedInvoices.byCurrency, { EUR: "200.00" });
  assert.deepEqual(result.excludedInvoices.currencies, ["EUR"]);
});

test("empty datasets produce a flat forecast", () => {
  const result = calculateForecast(makeForecastInput({ openingBalance: "500.00" }));
  assert.equal(result.expectedIncoming, "0.00");
  assert.equal(result.expectedOutgoing, "0.00");
  assert.equal(result.netCashFlow, "0.00");
  assert.equal(result.projectedEndingBalance, "500.00");
  assert.equal(result.incoming.length, 0);
  assert.equal(result.outgoing.length, 0);
  assert.ok(result.daily.every((day) => day.projectedBalance === "500.00"));
});

test("the engine is deterministic for identical input", () => {
  const input = makeForecastInput({
    invoices: [
      makeInvoice({ dueDate: "2026-01-20" }),
      makeInvoice({
        id: INVOICE_ID_2,
        invoiceNumber: "INV-0002",
        dueDate: "2026-01-20",
        totalAmount: "75.50",
        amountPaid: "0.50",
      }),
    ],
    expenses: [makeExpense({ dueDate: "2026-01-22", amount: "60.00" })],
  });
  assert.deepEqual(calculateForecast(input), calculateForecast(input));
});

test("per-day opening balances, cumulative totals and closing balances are consistent", () => {
  const result = calculateForecast(
    makeForecastInput({
      openingBalance: "1000.00",
      invoices: [
        makeInvoice({ dueDate: "2026-01-18", totalAmount: "200.00", amountPaid: "50.00" }),
      ],
      expenses: [makeExpense({ dueDate: "2026-01-22", amount: "80.00" })],
    }),
  );

  let balance = parseMoney(result.openingBalance);
  let incoming = BigInt(0);
  let outgoing = BigInt(0);

  for (const day of result.daily) {
    assert.equal(parseMoney(day.openingBalance), balance, day.date);
    incoming += parseMoney(day.incoming);
    outgoing += parseMoney(day.outgoing);
    balance = balance + parseMoney(day.incoming) - parseMoney(day.outgoing);
    assert.equal(parseMoney(day.projectedBalance), balance, day.date);
    assert.equal(parseMoney(day.cumulativeIncoming), incoming, day.date);
    assert.equal(parseMoney(day.cumulativeOutgoing), outgoing, day.date);
  }

  assert.equal(parseMoney(result.expectedIncoming), incoming);
  assert.equal(parseMoney(result.expectedOutgoing), outgoing);
});

test("monthly aggregation sums movements and carries the closing balance", () => {
  const result = calculateForecast(
    makeForecastInput({
      openingBalance: "1000.00",
      invoices: [makeInvoice({ dueDate: "2026-01-20", totalAmount: "100.00" })],
      expenses: [makeExpense({ dueDate: "2026-01-25", amount: "50.00" })],
    }),
  );
  assert.equal(result.monthly.length, 2);
  assert.deepEqual(result.monthly[0], {
    month: "2026-01",
    incoming: "100.00",
    outgoing: "50.00",
    net: "50.00",
    closingBalance: "1050.00",
    cumulativeIncoming: "100.00",
    cumulativeOutgoing: "50.00",
  });
  assert.equal(result.monthly[1]?.month, "2026-02");
  assert.equal(result.monthly[1]?.incoming, "0.00");
  assert.equal(result.monthly[1]?.closingBalance, "1050.00");
});

test("weekly aggregation covers the window and ends on the final projected balance", () => {
  const result = calculateForecast(makeForecastInput({ openingBalance: "1000.00" }));
  const weeks = aggregateWeeks(result.daily, result.startDate, result.endDate);
  assert.equal(weeks[0]?.weekStart, FORECAST_TODAY);
  assert.equal(weeks.at(-1)?.weekEnd, result.endDate);
  assert.equal(weeks.at(-1)?.closingBalance, result.projectedEndingBalance);
  assert.equal(
    weeks.reduce((sum, week) => sum + parseMoney(week.incoming), BigInt(0)),
    parseMoney(result.expectedIncoming),
  );
});

test("monthly aggregation helper matches the engine result", () => {
  const result = calculateForecast(
    makeForecastInput({ invoices: [makeInvoice({ dueDate: "2026-02-01" })] }),
  );
  assert.deepEqual(aggregateMonths(result.daily), result.monthly);
});

test("invalid horizons and malformed dates are rejected", () => {
  assert.throws(
    () => calculateForecast(makeForecastInput({ horizonDays: 45 as ForecastHorizon })),
    /horizonDays must be 30, 60 or 90/,
  );
  assert.throws(
    () => calculateForecast(makeForecastInput({ today: "15-01-2026" })),
    /today must be a YYYY-MM-DD date/,
  );
});
