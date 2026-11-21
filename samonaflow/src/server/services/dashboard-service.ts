// Server-only application service for the Financial Dashboard. Authorization is
// enforced here on every operation from the verified session identity. A
// businessId is never trusted without a matching membership row, and every
// repository call receives that verified businessId. Money is computed in
// BIGINT minor units via dashboard-metrics helpers and serialized as decimal
// strings for JSON transport.
import {
  assertSpan,
  availableCash,
  buildBuckets,
  classifyReminder,
  headlineTotals,
  netCashMovement,
  resolvePreset,
  type CurrencyAmount as MinorCurrencyAmount,
  type HeadlineTotals,
} from "@/lib/dashboard-metrics";
import { businessLocalDate } from "@/lib/business-date";
import { parseMoney } from "@/lib/invoice-math";
import type {
  ReceivablesQuery,
  RecentActivityQuery,
  SummaryQuery,
  TrendsQuery,
} from "@/lib/validations/dashboard";
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import {
  prismaBusinessMembershipRepository,
  type BusinessMembershipRepository,
} from "@/server/repositories/business-membership-repository";
import {
  dashboardRepository,
  type DashboardRepository,
} from "@/server/repositories/dashboard-repository";

export type DashboardServiceErrorCode = "BUSINESS_FORBIDDEN" | "INVALID_REQUEST";

export class DashboardServiceError extends Error {
  readonly code: DashboardServiceErrorCode;

  constructor(code: DashboardServiceErrorCode, message: string) {
    super(message);
    this.name = "DashboardServiceError";
    this.code = code;
  }
}

interface VerifiedContext {
  businessId: string;
  currency: string;
  openingBalance: string;
  openingBalanceDate: string;
  today: string;
}

/** Converts a dashboard-metrics throw (invalid date/span/preset) into a 400-class error. */
function asInvalid<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    throw new DashboardServiceError(
      "INVALID_REQUEST",
      error instanceof Error ? error.message : "Invalid request.",
    );
  }
}

function minorRows(rows: { currency: string; amount: string }[]): MinorCurrencyAmount[] {
  return rows.map((row) => ({ currency: row.currency, amount: parseMoney(row.amount) }));
}

function serializeMap(map: Record<string, bigint>): Record<string, string> {
  return Object.fromEntries(Object.entries(map).map(([code, value]) => [code, value.toString()]));
}

function serializeTotals(totals: HeadlineTotals): { amount: string; byCurrency: Record<string, string> } {
  return { amount: totals.headline.toString(), byCurrency: serializeMap(totals.byCurrency) };
}

function resolveRange(query: SummaryQuery, today: string): { from: string; to: string } {
  return asInvalid(() => {
    const range =
      query.from !== undefined && query.to !== undefined
        ? { from: query.from, to: query.to }
        : resolvePreset(query.preset ?? "this_month", today);
    assertSpan(range.from, range.to);
    return range;
  });
}

export function createDashboardService(dependencies: {
  repository: DashboardRepository;
  memberships: BusinessMembershipRepository;
}) {
  const { repository, memberships } = dependencies;

  async function authorize(user: AuthenticatedUser, businessId: string): Promise<VerifiedContext> {
    const membership = await memberships.findMembership(user.id, businessId);
    if (!membership) {
      throw new DashboardServiceError("BUSINESS_FORBIDDEN", "You do not have access to this business.");
    }
    // Currency, timezone and opening balance come from the same business row.
    const profile = await repository.getOpeningBalance(businessId);
    if (!profile) {
      throw new DashboardServiceError("BUSINESS_FORBIDDEN", "You do not have access to this business.");
    }
    return {
      businessId,
      currency: profile.currency,
      openingBalance: profile.openingBalance,
      openingBalanceDate: profile.openingBalanceDate,
      today: businessLocalDate(profile.timezone),
    };
  }

  return {
    async getSummary(user: AuthenticatedUser, businessId: string, query: SummaryQuery) {
      const ctx = await authorize(user, businessId);
      const range = resolveRange(query, ctx.today);
      const scope = ctx.businessId;
      const currency = ctx.currency;

      const [issued, payments, invoiced, paidExpenses, horizon, cash, customerCount, reminders] =
        await Promise.all([
          repository.getIssuedInvoiceTotals(scope, ctx.today),
          repository.getActivePaymentSums(scope, range.from, range.to),
          repository.getIssuedInvoicesInRange(scope, range.from, range.to),
          repository.getPaidExpenseSums(scope, range.from, range.to),
          repository.getUpcomingAndOverdueExpenses(scope, ctx.today),
          repository.getCashWindowSums(scope, ctx.openingBalanceDate, ctx.today),
          repository.getCustomerCount(scope),
          repository.getReminderRows(scope, ctx.today),
        ]);

      const totalReceivables = headlineTotals(
        minorRows(issued.map((row) => ({ currency: row.currency, amount: row.outstanding }))),
        currency,
      );
      const overdueReceivables = headlineTotals(
        minorRows(issued.map((row) => ({ currency: row.currency, amount: row.overdueOutstanding }))),
        currency,
      );
      const invoicedInPeriod = headlineTotals(
        minorRows(invoiced.map((row) => ({ currency: row.currency, amount: row.totalAmount }))),
        currency,
      );
      const incomeInPeriod = headlineTotals(minorRows(payments), currency);
      // Paid expenses come back as one aggregate with no currency, so a row exists only when there are expenses.
      const expensesInPeriod = headlineTotals(
        paidExpenses.count > 0 ? [{ currency, amount: parseMoney(paidExpenses.amount) }] : [],
        currency,
      );
      const netCashMovementInPeriod = netCashMovement(
        incomeInPeriod.headline,
        expensesInPeriod.headline,
      );
      const cashIncome = headlineTotals(minorRows(cash.payments), currency).headline;
      const cashExpenses = parseMoney(cash.expenses.amount);
      const available = availableCash(parseMoney(ctx.openingBalance), cashIncome, cashExpenses);

      const reminderCounts = { overdue: 0, upcoming: 0, later: 0 };
      for (const row of [...reminders.overdue, ...reminders.upcoming]) {
        reminderCounts[classifyReminder(row.followUpDate, ctx.today)] += 1;
      }

      return {
        currency,
        range,
        totals: {
          totalReceivables: serializeTotals(totalReceivables),
          overdueReceivables: serializeTotals(overdueReceivables),
          invoicedInPeriod: serializeTotals(invoicedInPeriod),
          incomeInPeriod: serializeTotals(incomeInPeriod),
          expensesInPeriod: serializeTotals(expensesInPeriod),
          netCashMovementInPeriod: { amount: netCashMovementInPeriod.toString() },
          availableCash: { amount: available.toString() },
          upcomingExpenses: {
            count: horizon.upcoming.count,
            amount: parseMoney(horizon.upcoming.amount).toString(),
          },
          overdueExpenses: {
            count: horizon.overdue.count,
            amount: parseMoney(horizon.overdue.amount).toString(),
          },
        },
        counts: {
          customers: customerCount,
          issuedInvoices: issued.reduce((sum, row) => sum + row.invoiceCount, 0),
          reminders: reminderCounts,
        },
      };
    },

    async getTrends(user: AuthenticatedUser, businessId: string, query: TrendsQuery) {
      const ctx = await authorize(user, businessId);
      const { from, to, granularity } = query;
      const buckets = asInvalid(() => {
        assertSpan(from, to);
        return buildBuckets(from, to, granularity);
      });
      const rows = await repository.getBucketedSeries(ctx.businessId, from, to, granularity);

      const series = buckets.map((bucketStart) => {
        const inBucket = rows.filter((row) => row.bucketStart === bucketStart);
        return {
          bucketStart,
          collected: serializeTotals(
            headlineTotals(
              minorRows(inBucket.map((row) => ({ currency: row.currency, amount: row.collected }))),
              ctx.currency,
            ),
          ),
          invoiced: serializeTotals(
            headlineTotals(
              minorRows(inBucket.map((row) => ({ currency: row.currency, amount: row.invoiced }))),
              ctx.currency,
            ),
          ),
          expenses: serializeTotals(
            headlineTotals(
              minorRows(inBucket.map((row) => ({ currency: row.currency, amount: row.expenses }))),
              ctx.currency,
            ),
          ),
        };
      });

      return { currency: ctx.currency, granularity, range: { from, to }, series };
    },

    async getReceivables(user: AuthenticatedUser, businessId: string, query: ReceivablesQuery) {
      const ctx = await authorize(user, businessId);
      const page = await repository.getReceivableRows(
        ctx.businessId,
        ctx.today,
        query.limit,
        query.cursor ?? null,
      );
      return { currency: ctx.currency, rows: page.rows, nextCursor: page.nextCursor };
    },

    async getRecentActivity(user: AuthenticatedUser, businessId: string, query: RecentActivityQuery) {
      const ctx = await authorize(user, businessId);
      const [invoices, payments] = await Promise.all([
        repository.getRecentInvoices(ctx.businessId, query.limit),
        repository.getRecentActivePayments(ctx.businessId, query.limit),
      ]);
      return { currency: ctx.currency, invoices, payments };
    },

    async getReminders(user: AuthenticatedUser, businessId: string) {
      const ctx = await authorize(user, businessId);
      const rows = await repository.getReminderRows(ctx.businessId, ctx.today);
      return { today: ctx.today, overdue: rows.overdue, upcoming: rows.upcoming };
    },
  };
}

export type DashboardService = ReturnType<typeof createDashboardService>;

export const dashboardService: DashboardService = createDashboardService({
  repository: dashboardRepository,
  memberships: prismaBusinessMembershipRepository,
});
