// Idempotent demo dataset for SamonaFlow.
//
// Run with an existing signed-up account:
//   DEMO_USER_EMAIL=you@example.com npm run db:seed-demo
//
// The seed creates (or updates) one clearly labelled business named
// "[DEMO] SamonaFlow Studio" with fixed UUIDs. It never deletes a record and
// never touches another business. Re-running it updates the same demo rows.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/database/connection";
import { businessLocalDate, dateAfter } from "@/lib/business-date";
import {
  calculateInvoiceTotals,
  formatMoney,
  lineTotalCents,
} from "@/lib/invoice-math";
import { generateReminderMessage } from "@/lib/reminder-message";
import { moneyDecimal } from "@/server/utils/invoice-decimal";
import { alertService } from "@/server/services/alert-service";

const DEMO_BUSINESS_ID = "d0000000-0000-4000-8000-000000000001";
const DEMO_MEMBERSHIP_ID = "d0000000-0000-4000-8000-000000000002";
const DEMO_BUSINESS_NAME = "[DEMO] SamonaFlow Studio";
const DEMO_MARKER = "Sample data — safe to delete. Not a real customer or financial record.";

const CUSTOMERS = {
  aarti: "d0000000-0000-4000-8000-000000000101",
  bluepeak: "d0000000-0000-4000-8000-000000000102",
  copperline: "d0000000-0000-4000-8000-000000000103",
  devan: "d0000000-0000-4000-8000-000000000104",
} as const;

const INVOICES = {
  aartiOverdue: "d0000000-0000-4000-8000-000000000201",
  bluepeakApproaching: "d0000000-0000-4000-8000-000000000202",
  copperlinePartial: "d0000000-0000-4000-8000-000000000203",
  devanPaid: "d0000000-0000-4000-8000-000000000204",
  aartiDraft: "d0000000-0000-4000-8000-000000000205",
  bluepeakVoid: "d0000000-0000-4000-8000-000000000206",
  devanReversed: "d0000000-0000-4000-8000-000000000207",
  aartiSecondPartial: "d0000000-0000-4000-8000-000000000208",
} as const;

const PAYMENTS = {
  aartiPartial: "d0000000-0000-4000-8000-000000000401",
  copperlinePartial: "d0000000-0000-4000-8000-000000000402",
  devanPaid: "d0000000-0000-4000-8000-000000000403",
  devanReversed: "d0000000-0000-4000-8000-000000000404",
  aartiSecondPartialA: "d0000000-0000-4000-8000-000000000405",
  aartiSecondPartialB: "d0000000-0000-4000-8000-000000000406",
} as const;

const REVERSAL_ID = "d0000000-0000-4000-8000-000000000501";

const EXPENSES = {
  rent: "d0000000-0000-4000-8000-000000000601",
  subscriptions: "d0000000-0000-4000-8000-000000000602",
  internet: "d0000000-0000-4000-8000-000000000603",
  contractor: "d0000000-0000-4000-8000-000000000604",
  coworking: "d0000000-0000-4000-8000-000000000605",
  lens: "d0000000-0000-4000-8000-000000000606",
  workstation: "d0000000-0000-4000-8000-000000000607",
  tax: "d0000000-0000-4000-8000-000000000608",
  cancelled: "d0000000-0000-4000-8000-000000000609",
} as const;

const REMINDERS = {
  aartiOverdue: "d0000000-0000-4000-8000-000000000701",
  bluepeakSent: "d0000000-0000-4000-8000-000000000702",
} as const;

type DemoInvoiceItem = { description: string; quantity: string; unitPrice: string };

type DemoInvoice = {
  id: string;
  customerId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  status: "DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "VOID";
  items: DemoInvoiceItem[];
  discount?: string;
  notes?: string;
};

function date(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function lineItems(items: DemoInvoiceItem[]) {
  // Items are deleted and recreated on every run, so fresh UUIDs keep the seed
  // idempotent without risking collisions between invoices.
  return items.map((item, index) => ({
    id: randomUUID(),
    description: item.description,
    quantity: moneyDecimal(item.quantity),
    unitPrice: moneyDecimal(item.unitPrice),
    lineTotal: moneyDecimal(formatMoney(lineTotalCents(item.quantity, item.unitPrice))),
    position: index + 1,
  }));
}

async function upsertInvoice(invoice: DemoInvoice): Promise<{ totalAmount: string }> {
  const totals = calculateInvoiceTotals(
    invoice.items,
    invoice.discount ?? "0.00",
    "0.00",
  );

  await prisma.$transaction(async (tx) => {
    await tx.invoice.upsert({
      where: { id: invoice.id },
      create: {
        id: invoice.id,
        businessId: DEMO_BUSINESS_ID,
        customerId: invoice.customerId,
        invoiceNumber: invoice.invoiceNumber,
        issueDate: date(invoice.issueDate),
        dueDate: date(invoice.dueDate),
        status: invoice.status,
        subtotal: moneyDecimal(totals.subtotal),
        discount: moneyDecimal(totals.discount),
        tax: moneyDecimal(totals.tax),
        totalAmount: moneyDecimal(totals.totalAmount),
        currency: "INR",
        notes: invoice.notes ?? DEMO_MARKER,
      },
      update: {
        customerId: invoice.customerId,
        invoiceNumber: invoice.invoiceNumber,
        issueDate: date(invoice.issueDate),
        dueDate: date(invoice.dueDate),
        status: invoice.status,
        subtotal: moneyDecimal(totals.subtotal),
        discount: moneyDecimal(totals.discount),
        tax: moneyDecimal(totals.tax),
        totalAmount: moneyDecimal(totals.totalAmount),
        currency: "INR",
        notes: invoice.notes ?? DEMO_MARKER,
      },
    });

    // Only this demo invoice's items are replaced. The invoice row itself is
    // never deleted, so financial history is preserved.
    await tx.invoiceItem.deleteMany({
      where: { invoiceId: invoice.id, businessId: DEMO_BUSINESS_ID },
    });
    await tx.invoiceItem.createMany({
      data: lineItems(invoice.items).map((item) => ({
        ...item,
        businessId: DEMO_BUSINESS_ID,
        invoiceId: invoice.id,
      })),
    });
  });

  return { totalAmount: totals.totalAmount };
}

async function main(): Promise<void> {
  const email = process.env.DEMO_USER_EMAIL?.trim();
  if (!email) {
    throw new Error(
      "DEMO_USER_EMAIL is required. Sign up first, then run: DEMO_USER_EMAIL=you@example.com npm run db:seed-demo",
    );
  }

  const user = await prisma.userProfile.findUnique({ where: { email } });
  if (!user) {
    throw new Error(
      `No UserProfile found for ${email}. Sign up or sign in once so Supabase creates the profile, then rerun the seed.`,
    );
  }

  const today = businessLocalDate("Asia/Kolkata");

  const existing = await prisma.business.findUnique({
    where: { id: DEMO_BUSINESS_ID },
    select: { ownerId: true },
  });
  if (existing && existing.ownerId !== user.id) {
    throw new Error(
      "The demo business already belongs to a different user. Remove it manually or use a different database.",
    );
  }

  await prisma.business.upsert({
    where: { id: DEMO_BUSINESS_ID },
    create: {
      id: DEMO_BUSINESS_ID,
      ownerId: user.id,
      name: DEMO_BUSINESS_NAME,
      ownerName: "Demo Owner",
      email: "demo@samonaflow.example",
      phone: "+91 90000 00000",
      businessType: "Design studio",
      currency: "INR",
      timezone: "Asia/Kolkata",
      openingBalance: moneyDecimal("150000.00"),
      openingBalanceDate: date(dateAfter(today, -90)),
    },
    update: {
      ownerId: user.id,
      name: DEMO_BUSINESS_NAME,
      ownerName: "Demo Owner",
      email: "demo@samonaflow.example",
      phone: "+91 90000 00000",
      businessType: "Design studio",
      currency: "INR",
      timezone: "Asia/Kolkata",
      openingBalance: moneyDecimal("150000.00"),
      openingBalanceDate: date(dateAfter(today, -90)),
    },
  });

  await prisma.businessMembership.upsert({
    where: { userId_businessId: { userId: user.id, businessId: DEMO_BUSINESS_ID } },
    create: {
      id: DEMO_MEMBERSHIP_ID,
      userId: user.id,
      businessId: DEMO_BUSINESS_ID,
      role: "OWNER",
    },
    update: { role: "OWNER" },
  });

  const customers = [
    {
      id: CUSTOMERS.aarti,
      name: "[DEMO] Aarti Designs",
      email: "aarti@example.com",
      phone: "+91 98765 43210",
      companyName: "Aarti Designs",
      address: "Pune, Maharashtra",
      notes: DEMO_MARKER,
    },
    {
      id: CUSTOMERS.bluepeak,
      name: "[DEMO] Bluepeak Media",
      email: "rohan@example.com",
      phone: "+91 98123 45678",
      companyName: "Bluepeak Media",
      address: "Bengaluru, Karnataka",
      notes: DEMO_MARKER,
    },
    {
      id: CUSTOMERS.copperline,
      name: "[DEMO] Copperline Cafe",
      email: "meera@example.com",
      phone: "+91 99001 12233",
      companyName: "Copperline Cafe",
      address: "Mumbai, Maharashtra",
      notes: DEMO_MARKER,
    },
    {
      id: CUSTOMERS.devan,
      name: "[DEMO] Devan Robotics",
      email: "devan@example.com",
      phone: "+91 97654 32109",
      companyName: "Devan Robotics",
      address: "Hyderabad, Telangana",
      notes: DEMO_MARKER,
    },
  ];

  for (const customer of customers) {
    await prisma.customer.upsert({
      where: { id: customer.id },
      create: { ...customer, businessId: DEMO_BUSINESS_ID },
      update: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        companyName: customer.companyName,
        address: customer.address,
        notes: customer.notes,
        archivedAt: null,
      },
    });
  }

  const invoices: DemoInvoice[] = [
    {
      id: INVOICES.aartiOverdue,
      customerId: CUSTOMERS.aarti,
      invoiceNumber: "DEMO-0001",
      issueDate: dateAfter(today, -40),
      dueDate: dateAfter(today, -12),
      status: "PARTIALLY_PAID",
      items: [
        { description: "Brand identity system", quantity: "1.00", unitPrice: "60000.00" },
        { description: "Social launch kit", quantity: "1.00", unitPrice: "25000.00" },
      ],
    },
    {
      id: INVOICES.bluepeakApproaching,
      customerId: CUSTOMERS.bluepeak,
      invoiceNumber: "DEMO-0002",
      issueDate: dateAfter(today, -10),
      dueDate: dateAfter(today, 2),
      status: "SENT",
      items: [
        { description: "Campaign landing page", quantity: "1.00", unitPrice: "45000.00" },
      ],
    },
    {
      id: INVOICES.copperlinePartial,
      customerId: CUSTOMERS.copperline,
      invoiceNumber: "DEMO-0003",
      issueDate: dateAfter(today, -25),
      dueDate: dateAfter(today, 20),
      status: "PARTIALLY_PAID",
      items: [
        { description: "Menu photography", quantity: "1.00", unitPrice: "40000.00" },
        { description: "Packaging design", quantity: "1.00", unitPrice: "30000.00" },
      ],
    },
    {
      id: INVOICES.devanPaid,
      customerId: CUSTOMERS.devan,
      invoiceNumber: "DEMO-0004",
      issueDate: dateAfter(today, -60),
      dueDate: dateAfter(today, -30),
      status: "PAID",
      items: [
        { description: "Product launch deck", quantity: "1.00", unitPrice: "30000.00" },
      ],
    },
    {
      id: INVOICES.aartiDraft,
      customerId: CUSTOMERS.aarti,
      invoiceNumber: "DEMO-0005",
      issueDate: dateAfter(today, -3),
      dueDate: dateAfter(today, 27),
      status: "DRAFT",
      items: [
        { description: "Monthly retainer (draft)", quantity: "1.00", unitPrice: "18000.00" },
      ],
      notes: `${DEMO_MARKER} Draft invoices are excluded from receivables.`,
    },
    {
      id: INVOICES.bluepeakVoid,
      customerId: CUSTOMERS.bluepeak,
      invoiceNumber: "DEMO-0006",
      issueDate: dateAfter(today, -50),
      dueDate: dateAfter(today, -20),
      status: "VOID",
      items: [
        { description: "Voided concept work", quantity: "1.00", unitPrice: "22000.00" },
      ],
      notes: `${DEMO_MARKER} Void invoices are excluded from receivables and cash flow.`,
    },
    {
      id: INVOICES.devanReversed,
      customerId: CUSTOMERS.devan,
      invoiceNumber: "DEMO-0007",
      issueDate: dateAfter(today, -80),
      dueDate: dateAfter(today, -50),
      status: "SENT",
      items: [
        { description: "Legacy site maintenance", quantity: "1.00", unitPrice: "15000.00" },
      ],
      notes: `${DEMO_MARKER} Its payment was reversed; the invoice is outstanding again.`,
    },
    {
      id: INVOICES.aartiSecondPartial,
      customerId: CUSTOMERS.aarti,
      invoiceNumber: "DEMO-0008",
      issueDate: dateAfter(today, -15),
      dueDate: dateAfter(today, 15),
      status: "PARTIALLY_PAID",
      items: [
        { description: "Website redesign", quantity: "1.00", unitPrice: "40000.00" },
        { description: "Copywriting", quantity: "1.00", unitPrice: "25000.00" },
      ],
      discount: "5000.00",
      notes: `${DEMO_MARKER} Shows a discount and two partial payments.`,
    },
  ];

  const totals = new Map<string, string>();
  for (const invoice of invoices) {
    const result = await upsertInvoice(invoice);
    totals.set(invoice.id, result.totalAmount);
  }

  const payments = [
    {
      id: PAYMENTS.aartiPartial,
      invoiceId: INVOICES.aartiOverdue,
      amount: "25000.00",
      paymentDate: dateAfter(today, -20),
      method: "BANK_TRANSFER" as const,
      transactionReference: "DEMO-PAY-001",
      notes: DEMO_MARKER,
    },
    {
      id: PAYMENTS.copperlinePartial,
      invoiceId: INVOICES.copperlinePartial,
      amount: "50000.00",
      paymentDate: dateAfter(today, -5),
      method: "UPI" as const,
      transactionReference: "DEMO-PAY-002",
      notes: DEMO_MARKER,
    },
    {
      id: PAYMENTS.devanPaid,
      invoiceId: INVOICES.devanPaid,
      amount: "30000.00",
      paymentDate: dateAfter(today, -35),
      method: "BANK_TRANSFER" as const,
      transactionReference: "DEMO-PAY-003",
      notes: DEMO_MARKER,
    },
    {
      id: PAYMENTS.devanReversed,
      invoiceId: INVOICES.devanReversed,
      amount: "15000.00",
      paymentDate: dateAfter(today, -55),
      method: "UPI" as const,
      transactionReference: "DEMO-PAY-004",
      notes: `${DEMO_MARKER} Reversed payment — excluded from cash and balances.`,
    },
    {
      id: PAYMENTS.aartiSecondPartialA,
      invoiceId: INVOICES.aartiSecondPartial,
      amount: "20000.00",
      paymentDate: dateAfter(today, -12),
      method: "UPI" as const,
      transactionReference: "DEMO-PAY-005",
      notes: DEMO_MARKER,
    },
    {
      id: PAYMENTS.aartiSecondPartialB,
      invoiceId: INVOICES.aartiSecondPartial,
      amount: "10000.00",
      paymentDate: dateAfter(today, -2),
      method: "CASH" as const,
      transactionReference: null,
      notes: DEMO_MARKER,
    },
  ];

  for (const payment of payments) {
    await prisma.payment.upsert({
      where: { id: payment.id },
      create: {
        id: payment.id,
        businessId: DEMO_BUSINESS_ID,
        invoiceId: payment.invoiceId,
        amount: moneyDecimal(payment.amount),
        paymentDate: date(payment.paymentDate),
        method: payment.method,
        transactionReference: payment.transactionReference,
        notes: payment.notes,
      },
      update: {
        invoiceId: payment.invoiceId,
        amount: moneyDecimal(payment.amount),
        paymentDate: date(payment.paymentDate),
        method: payment.method,
        transactionReference: payment.transactionReference,
        notes: payment.notes,
      },
    });
  }

  await prisma.paymentReversal.upsert({
    where: { paymentId: PAYMENTS.devanReversed },
    create: {
      id: REVERSAL_ID,
      businessId: DEMO_BUSINESS_ID,
      paymentId: PAYMENTS.devanReversed,
      reversedById: user.id,
      reason: "Demo scenario: the client's cheque was returned by the bank.",
      reversedAt: date(dateAfter(today, -45)),
    },
    update: {
      businessId: DEMO_BUSINESS_ID,
      reversedById: user.id,
      reason: "Demo scenario: the client's cheque was returned by the bank.",
      reversedAt: date(dateAfter(today, -45)),
    },
  });

  const expenses = [
    {
      id: EXPENSES.rent,
      title: "[DEMO] Studio rent",
      category: "RENT" as const,
      amount: "18000.00",
      dueDate: dateAfter(today, -5),
      paymentDate: null,
      status: "UPCOMING" as const,
      notes: `${DEMO_MARKER} Overdue expense.`,
    },
    {
      id: EXPENSES.subscriptions,
      title: "[DEMO] Adobe + Figma subscriptions",
      category: "SOFTWARE_SUBSCRIPTIONS" as const,
      amount: "4500.00",
      dueDate: dateAfter(today, 3),
      paymentDate: null,
      status: "UPCOMING" as const,
      notes: DEMO_MARKER,
    },
    {
      id: EXPENSES.internet,
      title: "[DEMO] Internet bill",
      category: "INTERNET" as const,
      amount: "2000.00",
      dueDate: dateAfter(today, 10),
      paymentDate: null,
      status: "UPCOMING" as const,
      notes: DEMO_MARKER,
    },
    {
      id: EXPENSES.contractor,
      title: "[DEMO] Contractor payment",
      category: "SALARIES" as const,
      amount: "40000.00",
      dueDate: dateAfter(today, -10),
      paymentDate: dateAfter(today, -10),
      status: "PAID" as const,
      notes: DEMO_MARKER,
    },
    {
      id: EXPENSES.coworking,
      title: "[DEMO] Coworking membership",
      category: "RENT" as const,
      amount: "8000.00",
      dueDate: dateAfter(today, -30),
      paymentDate: dateAfter(today, -30),
      status: "PAID" as const,
      notes: DEMO_MARKER,
    },
    {
      id: EXPENSES.lens,
      title: "[DEMO] Camera lens",
      category: "EQUIPMENT" as const,
      amount: "55000.00",
      dueDate: dateAfter(today, 25),
      paymentDate: null,
      status: "UPCOMING" as const,
      notes: DEMO_MARKER,
    },
    {
      id: EXPENSES.workstation,
      title: "[DEMO] New production workstation",
      category: "EQUIPMENT" as const,
      amount: "220000.00",
      dueDate: dateAfter(today, 12),
      paymentDate: null,
      status: "UPCOMING" as const,
      notes: `${DEMO_MARKER} Large planned purchase that drives the forecast shortage.`,
    },
    {
      id: EXPENSES.tax,
      title: "[DEMO] Quarterly tax set-aside",
      category: "OTHER" as const,
      amount: "120000.00",
      dueDate: dateAfter(today, 20),
      paymentDate: null,
      status: "UPCOMING" as const,
      notes: DEMO_MARKER,
    },
    {
      id: EXPENSES.cancelled,
      title: "[DEMO] Cancelled conference",
      category: "MARKETING" as const,
      amount: "12000.00",
      dueDate: dateAfter(today, 15),
      paymentDate: null,
      status: "CANCELLED" as const,
      notes: `${DEMO_MARKER} Cancelled expenses are excluded from cash flow.`,
    },
  ];

  for (const expense of expenses) {
    await prisma.expense.upsert({
      where: { id: expense.id },
      create: {
        id: expense.id,
        businessId: DEMO_BUSINESS_ID,
        title: expense.title,
        category: expense.category,
        amount: moneyDecimal(expense.amount),
        dueDate: date(expense.dueDate),
        paymentDate: expense.paymentDate ? date(expense.paymentDate) : null,
        status: expense.status,
        notes: expense.notes,
      },
      update: {
        title: expense.title,
        category: expense.category,
        amount: moneyDecimal(expense.amount),
        dueDate: date(expense.dueDate),
        paymentDate: expense.paymentDate ? date(expense.paymentDate) : null,
        status: expense.status,
        notes: expense.notes,
      },
    });
  }

  const aartiContext = {
    customer: { id: CUSTOMERS.aarti, name: "[DEMO] Aarti Designs", phone: "+91 98765 43210" },
    invoice: {
      id: INVOICES.aartiOverdue,
      invoiceNumber: "DEMO-0001",
      dueDate: dateAfter(today, -12),
      outstandingAmount: "60000.00",
      currency: "INR",
      status: "PARTIALLY_PAID",
      displayStatus: "OVERDUE",
    },
    timezone: "Asia/Kolkata",
  };
  const bluepeakContext = {
    customer: { id: CUSTOMERS.bluepeak, name: "[DEMO] Bluepeak Media", phone: "+91 98123 45678" },
    invoice: {
      id: INVOICES.bluepeakApproaching,
      invoiceNumber: "DEMO-0002",
      dueDate: dateAfter(today, 2),
      outstandingAmount: "45000.00",
      currency: "INR",
      status: "SENT",
      displayStatus: "SENT",
    },
    timezone: "Asia/Kolkata",
  };

  await prisma.reminder.upsert({
    where: { id: REMINDERS.aartiOverdue },
    create: {
      id: REMINDERS.aartiOverdue,
      businessId: DEMO_BUSINESS_ID,
      customerId: CUSTOMERS.aarti,
      invoiceId: INVOICES.aartiOverdue,
      reminderType: "OVERDUE_PAYMENT",
      status: "DRAFTED",
      message: generateReminderMessage("OVERDUE_PAYMENT", aartiContext),
      followUpDate: date(dateAfter(today, -2)),
    },
    update: {
      customerId: CUSTOMERS.aarti,
      invoiceId: INVOICES.aartiOverdue,
      reminderType: "OVERDUE_PAYMENT",
      status: "DRAFTED",
      message: generateReminderMessage("OVERDUE_PAYMENT", aartiContext),
      followUpDate: date(dateAfter(today, -2)),
    },
  });

  await prisma.reminder.upsert({
    where: { id: REMINDERS.bluepeakSent },
    create: {
      id: REMINDERS.bluepeakSent,
      businessId: DEMO_BUSINESS_ID,
      customerId: CUSTOMERS.bluepeak,
      invoiceId: INVOICES.bluepeakApproaching,
      reminderType: "UPCOMING_PAYMENT",
      status: "MARKED_SENT",
      message: generateReminderMessage("UPCOMING_PAYMENT", bluepeakContext),
      followUpDate: date(dateAfter(today, 1)),
    },
    update: {
      customerId: CUSTOMERS.bluepeak,
      invoiceId: INVOICES.bluepeakApproaching,
      reminderType: "UPCOMING_PAYMENT",
      status: "MARKED_SENT",
      message: generateReminderMessage("UPCOMING_PAYMENT", bluepeakContext),
      followUpDate: date(dateAfter(today, 1)),
    },
  });

  // Alerts are generated by the existing deterministic engine, not hand-written.
  const evaluation = await alertService.evaluate(
    { id: user.id, email: user.email },
    DEMO_BUSINESS_ID,
  );

  console.log("");
  console.log("SamonaFlow demo dataset ready.");
  console.log(`  Business: ${DEMO_BUSINESS_NAME}`);
  console.log(`  Business id: ${DEMO_BUSINESS_ID}`);
  console.log(`  Owner: ${user.email}`);
  console.log(`  Business-local today: ${today}`);
  console.log(`  4 customers, 8 invoices, 6 payments (1 reversed), 9 expenses, 2 reminders`);
  console.log(`  Alerts evaluated: ${evaluation.created} created, ${evaluation.updated} updated, ${evaluation.resolved} resolved`);
  console.log("");
  console.log("Next: open /dashboard and switch to the [DEMO] business.");
  console.log("This business is sample data. Do not enter real customer data into it.");
  console.log("");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
