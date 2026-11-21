// Server-only data access for Expense Management. Every method requires an
// explicit businessId: there is intentionally no way to address an expense by
// id alone. Stored statuses are UPCOMING/PAID/CANCELLED; OVERDUE and the display
// currency are derived on the server from the business settings, never accepted
// from a client. PAID/CANCELLED rows are preserved as history and never deleted.
import { Prisma } from "@/generated/prisma/client";
import { businessLocalDate } from "@/lib/business-date";
import {
  deriveDisplayStatus,
  type ExpenseCategoryValue,
} from "@/lib/expense-status";
import type {
  CreateExpenseInput,
  ListExpensesQuery,
  UpdateExpenseInput,
} from "@/lib/validations/expense";
import { moneyDecimal } from "@/server/utils/invoice-decimal";
import { prisma } from "@/server/database/connection";
import type {
  ExpenseDetail,
  ExpenseListResult,
  ExpenseRecord,
  ExpenseStatusValue,
} from "@/types/expense";

const EXPENSE_SELECT = {
  id: true,
  businessId: true,
  title: true,
  category: true,
  amount: true,
  dueDate: true,
  paymentDate: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ExpenseSelect;

type ExpenseRow = Prisma.ExpenseGetPayload<{ select: typeof EXPENSE_SELECT }>;

export type CreateExpenseRecord = CreateExpenseInput & { businessId: string };

export interface ExpenseRepository {
  create(input: CreateExpenseRecord): Promise<ExpenseRecord>;
  findMany(businessId: string, query: ListExpensesQuery): Promise<ExpenseListResult>;
  findById(businessId: string, expenseId: string): Promise<ExpenseDetail | null>;
  update(
    businessId: string,
    expenseId: string,
    input: UpdateExpenseInput,
  ): Promise<ExpenseRecord | null>;
  markPaid(
    businessId: string,
    expenseId: string,
    paymentDate: string | null,
  ): Promise<ExpenseRecord | null>;
  cancel(businessId: string, expenseId: string): Promise<ExpenseRecord | null>;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function asDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Business config is read with the already-verified businessId, never a guess. */
async function businessSettings(
  businessId: string,
): Promise<{ timezone: string; currency: string }> {
  const row = await prisma.business.findFirst({
    where: { id: businessId },
    select: { timezone: true, currency: true },
  });
  return {
    timezone: row?.timezone || "Asia/Kolkata",
    currency: row?.currency || "INR",
  };
}

function toRecord(
  row: ExpenseRow,
  today: string,
  currency: string,
  timezone: string,
): ExpenseRecord {
  const dueDate = dateOnly(row.dueDate);
  return {
    id: row.id,
    businessId: row.businessId,
    title: row.title,
    category: row.category as ExpenseCategoryValue,
    amount: row.amount.toFixed(2),
    dueDate,
    paymentDate: row.paymentDate ? dateOnly(row.paymentDate) : null,
    status: row.status as ExpenseStatusValue,
    displayStatus: deriveDisplayStatus(row.status as ExpenseStatusValue, dueDate, today),
    currency,
    timezone,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function toRecordAsync(businessId: string, row: ExpenseRow): Promise<ExpenseRecord> {
  const { timezone, currency } = await businessSettings(businessId);
  return toRecord(row, businessLocalDate(timezone), currency, timezone);
}

async function findRow(
  businessId: string,
  expenseId: string,
): Promise<ExpenseRow | null> {
  return prisma.expense.findFirst({
    where: { id: expenseId, businessId },
    select: EXPENSE_SELECT,
  });
}

export const prismaExpenseRepository: ExpenseRepository = {
  async create(input) {
    const row = await prisma.expense.create({
      data: {
        businessId: input.businessId,
        title: input.title,
        category: input.category,
        amount: moneyDecimal(input.amount),
        dueDate: asDate(input.dueDate),
        // A payment date is meaningful only for a PAID expense; the DB CHECK
        // guarantees PAID always has one.
        paymentDate: input.status === "PAID" && input.paymentDate ? asDate(input.paymentDate) : null,
        status: input.status,
        notes: input.notes,
      },
      select: EXPENSE_SELECT,
    });
    return toRecordAsync(input.businessId, row);
  },

  async findMany(businessId, query) {
    const { timezone, currency } = await businessSettings(businessId);
    const today = businessLocalDate(timezone);

    const due: Prisma.DateTimeFilter<"Expense"> = {};
    if (query.status === "UPCOMING") due.gte = asDate(today);
    if (query.status === "OVERDUE") due.lt = asDate(today);
    // Merge the explicit date-range filter with any status-derived boundary.
    if (query.fromDate && (!due.gte || asDate(query.fromDate) > due.gte)) {
      due.gte = asDate(query.fromDate);
    }
    if (query.toDate) due.lte = asDate(query.toDate);

    const where: Prisma.ExpenseWhereInput = { businessId };
    if (query.category) where.category = query.category;
    if (query.status === "PAID" || query.status === "CANCELLED") {
      where.status = query.status;
    } else if (query.status === "UPCOMING" || query.status === "OVERDUE") {
      where.status = "UPCOMING";
    }
    if (Object.keys(due).length > 0) where.dueDate = due;
    if (query.search) {
      const contains = { contains: query.search, mode: "insensitive" as const };
      where.OR = [{ title: contains }, { notes: contains }];
    }

    const orderBy: Prisma.ExpenseOrderByWithRelationInput = {
      [query.sort]: query.direction,
    };

    const [rows, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: EXPENSE_SELECT,
      }),
      prisma.expense.count({ where }),
    ]);

    return {
      items: rows.map((row) => toRecord(row, today, currency, timezone)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  },

  async findById(businessId, expenseId) {
    const row = await findRow(businessId, expenseId);
    return row ? toRecordAsync(businessId, row) : null;
  },

  async update(businessId, expenseId, input) {
    // The status predicate makes the service's editability check atomic: a row
    // that became paid/cancelled cannot be edited by a stale request.
    const result = await prisma.expense.updateMany({
      where: { id: expenseId, businessId, status: "UPCOMING" },
      data: {
        ...input,
        amount: input.amount === undefined ? undefined : moneyDecimal(input.amount),
        dueDate: input.dueDate === undefined ? undefined : asDate(input.dueDate),
      },
    });
    if (result.count === 0) return null;
    const row = await findRow(businessId, expenseId);
    return row ? toRecordAsync(businessId, row) : null;
  },

  async markPaid(businessId, expenseId, paymentDate) {
    const { timezone } = await businessSettings(businessId);
    const effectiveDate = paymentDate ?? businessLocalDate(timezone);
    const result = await prisma.expense.updateMany({
      where: { id: expenseId, businessId, status: "UPCOMING" },
      data: { status: "PAID", paymentDate: asDate(effectiveDate) },
    });
    if (result.count === 0) return null;
    const row = await findRow(businessId, expenseId);
    return row ? toRecordAsync(businessId, row) : null;
  },

  async cancel(businessId, expenseId) {
    const result = await prisma.expense.updateMany({
      where: { id: expenseId, businessId, status: "UPCOMING" },
      data: { status: "CANCELLED" },
    });
    if (result.count === 0) return null;
    const row = await findRow(businessId, expenseId);
    return row ? toRecordAsync(businessId, row) : null;
  },
};

export const expenseRepository = prismaExpenseRepository;
