// Server-only application service for Expense Management.
//
// Authorization is enforced here, on every operation, from the verified session
// identity passed in by the caller. A businessId is never trusted without a
// matching membership row, and every repository call receives that verified
// businessId so cross-tenant reads/writes are impossible. Status transitions
// are decided here from the stored status; OVERDUE is a display derivation and
// therefore remains editable, payable and cancellable.
import { canCancelExpense, canEditExpense, canPayExpense } from "@/lib/expense-status";
import type {
  CreateExpenseInput,
  ListExpensesQuery,
  PayExpenseInput,
  UpdateExpenseInput,
} from "@/lib/validations/expense";
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import {
  prismaBusinessMembershipRepository,
  type BusinessMembershipRepository,
} from "@/server/repositories/business-membership-repository";
import {
  prismaExpenseRepository,
  type ExpenseRepository,
} from "@/server/repositories/expense-repository";
import type { ExpenseDetail, ExpenseListResult, ExpenseRecord } from "@/types/expense";

export type ExpenseServiceErrorCode =
  | "BUSINESS_FORBIDDEN"
  | "EXPENSE_NOT_FOUND"
  | "INVALID_TRANSITION";

export class ExpenseServiceError extends Error {
  readonly code: ExpenseServiceErrorCode;

  constructor(code: ExpenseServiceErrorCode, message: string) {
    super(message);
    this.name = "ExpenseServiceError";
    this.code = code;
  }
}

export interface ExpenseService {
  create(
    user: AuthenticatedUser,
    businessId: string,
    input: CreateExpenseInput,
  ): Promise<ExpenseRecord>;
  list(
    user: AuthenticatedUser,
    businessId: string,
    query: ListExpensesQuery,
  ): Promise<ExpenseListResult>;
  get(user: AuthenticatedUser, businessId: string, expenseId: string): Promise<ExpenseDetail>;
  update(
    user: AuthenticatedUser,
    businessId: string,
    expenseId: string,
    input: UpdateExpenseInput,
  ): Promise<ExpenseRecord>;
  markPaid(
    user: AuthenticatedUser,
    businessId: string,
    expenseId: string,
    input: PayExpenseInput,
  ): Promise<ExpenseRecord>;
  cancel(user: AuthenticatedUser, businessId: string, expenseId: string): Promise<ExpenseRecord>;
}

export function createExpenseService(dependencies: {
  memberships: BusinessMembershipRepository;
  expenses: ExpenseRepository;
}): ExpenseService {
  const { memberships, expenses } = dependencies;

  async function requireMembership(user: AuthenticatedUser, businessId: string): Promise<void> {
    const membership = await memberships.findMembership(user.id, businessId);
    if (!membership) {
      throw new ExpenseServiceError(
        "BUSINESS_FORBIDDEN",
        "You do not have access to this business.",
      );
    }
  }

  async function requireExpense(
    user: AuthenticatedUser,
    businessId: string,
    expenseId: string,
  ): Promise<ExpenseDetail> {
    await requireMembership(user, businessId);
    const expense = await expenses.findById(businessId, expenseId);
    if (!expense) {
      throw new ExpenseServiceError("EXPENSE_NOT_FOUND", "Expense not found.");
    }
    return expense;
  }

  return {
    async create(user, businessId, input) {
      await requireMembership(user, businessId);
      // The PAID-requires-payment-date rule is mirrored by Zod and the applied
      // database CHECK; businessId comes only from the verified membership.
      return expenses.create({ ...input, businessId });
    },

    async list(user, businessId, query) {
      await requireMembership(user, businessId);
      return expenses.findMany(businessId, query);
    },

    async get(user, businessId, expenseId) {
      return requireExpense(user, businessId, expenseId);
    },

    async update(user, businessId, expenseId, input) {
      const existing = await requireExpense(user, businessId, expenseId);
      if (!canEditExpense(existing.status)) {
        throw new ExpenseServiceError(
          "INVALID_TRANSITION",
          "Only upcoming expenses can be edited.",
        );
      }
      // The repository repeats the status predicate so the write is atomic.
      const updated = await expenses.update(businessId, expenseId, input);
      if (!updated) {
        throw new ExpenseServiceError("EXPENSE_NOT_FOUND", "Expense not found.");
      }
      return updated;
    },

    async markPaid(user, businessId, expenseId, input) {
      const existing = await requireExpense(user, businessId, expenseId);
      if (!canPayExpense(existing.status)) {
        throw new ExpenseServiceError(
          "INVALID_TRANSITION",
          "Only upcoming expenses can be marked as paid.",
        );
      }
      const updated = await expenses.markPaid(businessId, expenseId, input.paymentDate);
      if (!updated) {
        throw new ExpenseServiceError("EXPENSE_NOT_FOUND", "Expense not found.");
      }
      return updated;
    },

    async cancel(user, businessId, expenseId) {
      const existing = await requireExpense(user, businessId, expenseId);
      if (!canCancelExpense(existing.status)) {
        throw new ExpenseServiceError(
          "INVALID_TRANSITION",
          "Only upcoming expenses can be cancelled.",
        );
      }
      const updated = await expenses.cancel(businessId, expenseId);
      if (!updated) {
        throw new ExpenseServiceError("EXPENSE_NOT_FOUND", "Expense not found.");
      }
      return updated;
    },
  };
}

export const expenseService = createExpenseService({
  memberships: prismaBusinessMembershipRepository,
  expenses: prismaExpenseRepository,
});
