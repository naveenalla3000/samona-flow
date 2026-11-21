import assert from "node:assert/strict";
import test from "node:test";
import {
  ALERT_SEVERITY_RANK,
  CONCENTRATION_CRITICAL_BPS,
  CONCENTRATION_THRESHOLD_BPS,
  generateAlerts,
  PAYMENT_APPROACHING_DAYS,
  UPCOMING_EXPENSE_DAYS,
  type AlertEvaluationInput,
} from "@/lib/alert-rules";
import { CUSTOMER_A, CUSTOMER_B } from "./helpers/fakes";
import {
  EXPENSE_A,
  INVOICE_A,
  INVOICE_B,
  makeAlertExpense,
  makeAlertInvoice,
  makeShortage,
} from "./helpers/alert-fakes";

const TODAY = "2026-01-15";

function input(overrides: Partial<AlertEvaluationInput> = {}): AlertEvaluationInput {
  return {
    currency: "USD",
    timezone: "UTC",
    today: TODAY,
    invoices: [],
    expenses: [],
    shortage: makeShortage(),
    ...overrides,
  };
}

test("an issued invoice past its due date creates an overdue alert", () => {
  const alerts = generateAlerts(
    input({ invoices: [makeAlertInvoice({ dueDate: "2026-01-10", status: "SENT" })] }),
  );

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, "OVERDUE_PAYMENT");
  assert.equal(alerts[0].severity, "WARNING");
  assert.equal(alerts[0].relatedEntityType, "INVOICE");
  assert.equal(alerts[0].relatedEntityId, INVOICE_A);
  assert.equal(alerts[0].dedupeKey, `OVERDUE_PAYMENT:${INVOICE_A}`);
  assert.match(alerts[0].description, /USD 100\.00/);
  assert.match(alerts[0].description, /5 days overdue/);
});

test("an invoice overdue by 30 days or more is critical", () => {
  const alerts = generateAlerts(
    input({ invoices: [makeAlertInvoice({ dueDate: "2025-12-01", status: "OVERDUE" })] }),
  );

  assert.equal(alerts[0].type, "OVERDUE_PAYMENT");
  assert.equal(alerts[0].severity, "CRITICAL");
});

test("the overdue critical boundary is exactly 30 days", () => {
  const atBoundary = generateAlerts(
    input({ invoices: [makeAlertInvoice({ dueDate: "2025-12-16", status: "OVERDUE" })] }),
  );
  assert.equal(atBoundary[0].severity, "CRITICAL");

  const justBelow = generateAlerts(
    input({ invoices: [makeAlertInvoice({ dueDate: "2025-12-17", status: "OVERDUE" })] }),
  );
  assert.equal(justBelow[0].severity, "WARNING");
});

test("an invoice due within the approaching window creates a warning", () => {
  for (const dueDate of ["2026-01-15", "2026-01-16", "2026-01-18"]) {
    const alerts = generateAlerts(input({ invoices: [makeAlertInvoice({ dueDate })] }));
    assert.equal(alerts.length, 1, dueDate);
    assert.equal(alerts[0].type, "PAYMENT_APPROACHING", dueDate);
    assert.equal(alerts[0].severity, "WARNING", dueDate);
    assert.equal(alerts[0].dedupeKey, `PAYMENT_APPROACHING:${INVOICE_A}`, dueDate);
  }
});

test("an invoice beyond the approaching window does not alert", () => {
  const dueDate = `2026-01-${String(15 + PAYMENT_APPROACHING_DAYS + 1).padStart(2, "0")}`;
  const alerts = generateAlerts(input({ invoices: [makeAlertInvoice({ dueDate })] }));
  assert.equal(alerts.length, 0);
});

test("a partially paid invoice further out creates an info alert with paid and outstanding amounts", () => {
  const alerts = generateAlerts(
    input({
      invoices: [
        makeAlertInvoice({
          status: "PARTIALLY_PAID",
          totalAmount: "100.00",
          amountPaid: "40.00",
          dueDate: "2026-01-25",
        }),
      ],
    }),
  );

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, "PARTIAL_PAYMENT_DUE");
  assert.equal(alerts[0].severity, "INFO");
  assert.match(alerts[0].description, /USD 40\.00/);
  assert.match(alerts[0].description, /USD 100\.00/);
  assert.match(alerts[0].description, /USD 60\.00/);
  assert.match(alerts[0].description, /remains outstanding/);
});

test("a partially paid invoice due soon is an approaching alert, not a duplicate partial alert", () => {
  const alerts = generateAlerts(
    input({
      invoices: [
        makeAlertInvoice({
          status: "PARTIALLY_PAID",
          totalAmount: "100.00",
          amountPaid: "40.00",
          dueDate: "2026-01-17",
        }),
      ],
    }),
  );

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, "PAYMENT_APPROACHING");
});

test("a fully paid, overpaid or zero-value invoice never alerts", () => {
  const invoices = [
    makeAlertInvoice({ totalAmount: "100.00", amountPaid: "100.00", dueDate: "2026-01-10" }),
    makeAlertInvoice({ totalAmount: "100.00", amountPaid: "120.00", dueDate: "2026-01-10" }),
    makeAlertInvoice({ totalAmount: "0.00", amountPaid: "0.00", dueDate: "2026-01-10" }),
  ];

  assert.equal(generateAlerts(input({ invoices })).length, 0);
});

test("a reversed payment is excluded from amountPaid, so the full balance still alerts", () => {
  // The repository's active-payment sum is 0 after the only payment is reversed.
  const alerts = generateAlerts(
    input({
      invoices: [
        makeAlertInvoice({
          totalAmount: "250.00",
          amountPaid: "0.00",
          dueDate: "2026-01-05",
        }),
      ],
    }),
  );

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, "OVERDUE_PAYMENT");
  assert.match(alerts[0].description, /USD 250\.00/);
});

test("draft, paid and void invoices never alert", () => {
  const invoices = (["DRAFT", "PAID", "VOID"] as const).map((status) =>
    makeAlertInvoice({ status, dueDate: "2026-01-10" }),
  );
  assert.equal(generateAlerts(input({ invoices })).length, 0);
});

test("invoices in another currency are excluded from invoice alerts and concentration", () => {
  const invoices = [
    makeAlertInvoice({
      id: INVOICE_A,
      customerId: CUSTOMER_A,
      currency: "EUR",
      dueDate: "2026-01-10",
    }),
    makeAlertInvoice({
      id: INVOICE_B,
      customerId: CUSTOMER_B,
      currency: "EUR",
      totalAmount: "500.00",
      dueDate: "2026-01-25",
      status: "PARTIALLY_PAID",
      amountPaid: "100.00",
    }),
  ];

  assert.equal(generateAlerts(input({ invoices })).length, 0);
});

test("an upcoming expense due within three days creates a warning", () => {
  for (const dueDate of ["2026-01-15", "2026-01-16", "2026-01-18"]) {
    const alerts = generateAlerts(input({ expenses: [makeAlertExpense({ dueDate })] }));
    assert.equal(alerts.length, 1, dueDate);
    assert.equal(alerts[0].type, "UPCOMING_EXPENSE", dueDate);
    assert.equal(alerts[0].severity, "WARNING", dueDate);
    assert.equal(alerts[0].relatedEntityId, EXPENSE_A, dueDate);
    assert.match(alerts[0].description, /USD 50\.00/, dueDate);
  }
});

test("expenses beyond three days, already overdue, paid, cancelled or zero-value do not alert", () => {
  const dueDate = `2026-01-${String(15 + UPCOMING_EXPENSE_DAYS + 1).padStart(2, "0")}`;
  const expenses = [
    makeAlertExpense({ dueDate }),
    makeAlertExpense({ dueDate: "2026-01-10", status: "OVERDUE" }),
    makeAlertExpense({ dueDate: "2026-01-18", status: "PAID" }),
    makeAlertExpense({ dueDate: "2026-01-18", status: "CANCELLED" }),
    makeAlertExpense({ dueDate: "2026-01-18", amount: "0.00" }),
  ];

  assert.equal(generateAlerts(input({ expenses })).length, 0);
});

test("a projected negative balance creates a shortage alert from the forecast snapshot", () => {
  const critical = generateAlerts(
    input({
      shortage: makeShortage({
        becomesNegative: true,
        shortageDate: "2026-01-20",
        lowestProjectedBalance: "-500.00",
        lowestProjectedDate: "2026-01-25",
      }),
    }),
  );

  assert.equal(critical.length, 1);
  assert.equal(critical[0].type, "POTENTIAL_SHORTAGE");
  assert.equal(critical[0].severity, "CRITICAL");
  assert.equal(critical[0].relatedEntityType, "FORECAST");
  assert.equal(critical[0].relatedEntityId, null);
  assert.equal(critical[0].dedupeKey, "POTENTIAL_SHORTAGE");
  assert.match(critical[0].description, /USD -500\.00/);
  assert.match(critical[0].description, /2026-01-20/);
});

test("a shortage further than seven days out is a warning, and no shortage creates no alert", () => {
  const warning = generateAlerts(
    input({
      shortage: makeShortage({
        becomesNegative: true,
        shortageDate: "2026-02-01",
        lowestProjectedBalance: "-10.00",
        lowestProjectedDate: "2026-02-02",
      }),
    }),
  );
  assert.equal(warning[0].severity, "WARNING");

  const atBoundary = generateAlerts(
    input({
      shortage: makeShortage({
        becomesNegative: true,
        shortageDate: "2026-01-22",
        lowestProjectedBalance: "-10.00",
        lowestProjectedDate: "2026-01-22",
      }),
    }),
  );
  assert.equal(atBoundary[0].severity, "CRITICAL");

  const justBeyond = generateAlerts(
    input({
      shortage: makeShortage({
        becomesNegative: true,
        shortageDate: "2026-01-23",
        lowestProjectedBalance: "-10.00",
        lowestProjectedDate: "2026-01-23",
      }),
    }),
  );
  assert.equal(justBeyond[0].severity, "WARNING");

  assert.equal(generateAlerts(input()).length, 0);
});

test("the largest customer at or above the concentration threshold creates an alert", () => {
  const invoices = [
    makeAlertInvoice({
      id: INVOICE_A,
      customerId: CUSTOMER_A,
      customerName: "Acme Studio",
      totalAmount: "80.00",
      dueDate: "2026-02-15",
    }),
    makeAlertInvoice({
      id: INVOICE_B,
      customerId: CUSTOMER_B,
      customerName: "Beta Traders",
      totalAmount: "20.00",
      dueDate: "2026-02-15",
    }),
  ];

  const alerts = generateAlerts(input({ invoices }));
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, "CUSTOMER_CONCENTRATION");
  assert.equal(alerts[0].severity, "CRITICAL");
  assert.equal(alerts[0].relatedEntityType, "CUSTOMER");
  assert.equal(alerts[0].relatedEntityId, CUSTOMER_A);
  assert.match(alerts[0].description, /80%/);
  assert.match(alerts[0].description, /USD 80\.00/);
});

test("a customer between 50% and 75% is a warning; exactly 50% alerts", () => {
  const warning = generateAlerts(
    input({
      invoices: [
        makeAlertInvoice({
          id: INVOICE_A,
          customerId: CUSTOMER_A,
          totalAmount: "60.00",
          dueDate: "2026-02-15",
        }),
        makeAlertInvoice({
          id: INVOICE_B,
          customerId: CUSTOMER_B,
          totalAmount: "40.00",
          dueDate: "2026-02-15",
        }),
      ],
    }),
  );
  assert.equal(warning[0].severity, "WARNING");

  const exact = generateAlerts(
    input({
      invoices: [
        makeAlertInvoice({
          id: INVOICE_A,
          customerId: CUSTOMER_A,
          totalAmount: "50.00",
          dueDate: "2026-02-15",
        }),
        makeAlertInvoice({
          id: INVOICE_B,
          customerId: CUSTOMER_B,
          totalAmount: "50.00",
          dueDate: "2026-02-15",
        }),
      ],
    }),
  );
  assert.equal(exact.length, 1);
  assert.equal(exact[0].relatedEntityId, CUSTOMER_A, "ties break on customer id");
});

test("the concentration critical boundary is exactly 75%", () => {
  const critical = generateAlerts(
    input({
      invoices: [
        makeAlertInvoice({
          id: INVOICE_A,
          customerId: CUSTOMER_A,
          totalAmount: "75.00",
          dueDate: "2026-02-15",
        }),
        makeAlertInvoice({
          id: INVOICE_B,
          customerId: CUSTOMER_B,
          totalAmount: "25.00",
          dueDate: "2026-02-15",
        }),
      ],
    }),
  );
  assert.equal(critical[0].severity, "CRITICAL");

  const warning = generateAlerts(
    input({
      invoices: [
        makeAlertInvoice({
          id: INVOICE_A,
          customerId: CUSTOMER_A,
          totalAmount: "74.99",
          dueDate: "2026-02-15",
        }),
        makeAlertInvoice({
          id: INVOICE_B,
          customerId: CUSTOMER_B,
          totalAmount: "25.01",
          dueDate: "2026-02-15",
        }),
      ],
    }),
  );
  assert.equal(warning[0].severity, "WARNING");
});

test("concentration below the threshold, or with only one customer, does not alert", () => {
  const below = generateAlerts(
    input({
      invoices: [
        makeAlertInvoice({
          id: INVOICE_A,
          customerId: CUSTOMER_A,
          totalAmount: "40.00",
          dueDate: "2026-02-15",
        }),
        makeAlertInvoice({
          id: INVOICE_B,
          customerId: CUSTOMER_B,
          totalAmount: "35.00",
          dueDate: "2026-02-15",
        }),
        makeAlertInvoice({
          id: "70000000-0000-4000-8000-000000000003",
          customerId: "30000000-0000-4000-8000-000000000003",
          customerName: "Gamma Co",
          totalAmount: "25.00",
          dueDate: "2026-02-15",
        }),
      ],
    }),
  );
  assert.equal(below.length, 0);

  const single = generateAlerts(
    input({
      invoices: [
        makeAlertInvoice({
          customerId: CUSTOMER_A,
          totalAmount: "100.00",
          dueDate: "2026-02-15",
        }),
      ],
    }),
  );
  assert.equal(single.length, 0);
});

test("concentration counts only business-currency receivables", () => {
  const invoices = [
    makeAlertInvoice({
      id: INVOICE_A,
      customerId: CUSTOMER_A,
      currency: "USD",
      totalAmount: "10.00",
      dueDate: "2026-02-15",
    }),
    makeAlertInvoice({
      id: INVOICE_B,
      customerId: CUSTOMER_B,
      currency: "EUR",
      totalAmount: "1000.00",
      dueDate: "2026-02-15",
    }),
  ];

  assert.equal(generateAlerts(input({ invoices })).length, 0);
});

test("generated alerts are deterministic, severity-ordered and have unique dedupe keys", () => {
  const invoices = [
    makeAlertInvoice({
      id: INVOICE_A,
      dueDate: "2025-12-01",
      status: "OVERDUE",
      totalAmount: "100.00",
    }),
    makeAlertInvoice({
      id: INVOICE_B,
      customerId: CUSTOMER_B,
      customerName: "Beta Traders",
      dueDate: "2026-01-17",
      totalAmount: "60.00",
    }),
  ];

  const first = generateAlerts(input({ invoices }));
  const second = generateAlerts(input({ invoices }));
  assert.deepEqual(first, second);

  const keys = first.map((alert) => alert.dedupeKey);
  assert.equal(new Set(keys).size, keys.length);

  for (let index = 1; index < first.length; index += 1) {
    assert.ok(
      ALERT_SEVERITY_RANK[first[index - 1].severity] >=
        ALERT_SEVERITY_RANK[first[index].severity],
    );
  }
});

test("the documented thresholds are the values the rules use", () => {
  assert.equal(CONCENTRATION_THRESHOLD_BPS, BigInt(5000));
  assert.equal(CONCENTRATION_CRITICAL_BPS, BigInt(7500));
  assert.equal(PAYMENT_APPROACHING_DAYS, 3);
  assert.equal(UPCOMING_EXPENSE_DAYS, 3);
});
