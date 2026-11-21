// Server-only application service for the Financial Dashboard. Authorization is
// enforced here on every operation from the verified session identity. A
// businessId is never trusted without a matching membership row, and every
// repository call receives that verified businessId. Money is computed in
// BIGINT minor units via dashboard-metrics helpers and serialized as decimal
// strings for JSON transport.
//
// The cash-flow overview and the Action Center deliberately delegate to the
// existing forecasting and alert services. Their rules (eligibility, overdue
// scheduling, dedupe, severity) live in one place and are never reimplemented
// here.
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
import { deriveDisplayStatus } from "@/lib/expense-status";
import { parseMoney } from "@/lib/invoice-math";
import { listAlertsQuerySchema } from "@/lib/validations/alert";
import type {
  ActionsQuery,
  CashFlowQuery,
  ReceivablesQuery,
  RecentActivityQuery,
  SummaryQuery,
  TransactionsQuery,
  TrendsQuery,
  UpcomingExpensesQuery,
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
import type { AlertRecord, AlertRelatedEntityType } from "@/types/alert";
import type {
  DashboardAction,
  DashboardCashFlow,
  DashboardTransaction,
  DashboardUpcomingExpense,
} from "@/types/dashboard";
import type { ExpenseStatusValue } from "@/types/expense";
import { alertService, type AlertService } from "./alert-service";
import { forecastService, type ForecastService } from "./forecast-service";

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

/**
 * Links an alert to the record it refers to. Alert creation already validates
 * that the referenced row belongs to the same business; the target page also
 * re-checks membership and business scope on every request.
 */
function recordHref(type: AlertRelatedEntityType, id: string | null): string | null {
  switch (type) {
    case "INVOICE":
      return id ? `/dashboard/invoices/${id}` : null;
    case "EXPENSE":
      return id ? `/dashboard/expenses/${id}` : null;
    case "CUSTOMER":
      return id ? `/dashboard/customers/${id}` : null;
    case "FORECAST":
      return "/dashboard/forecast";
    default:
      return null;
  }
}

function toDashboardAction(alert: AlertRecord): DashboardAction {
  const href =
    alert.relatedEntityType !== null
      ? recordHref(alert.relatedEntityType, alert.relatedEntityId)
      : null;

  return {
    id: alert.id,
    type: alert.type,
    severity: alert.severity,
    title: alert.title,
    description: alert.description,
    recommendedAction: alert.recommendedAction,
    isRead: alert.isRead,
    createdAt: alert.createdAt,
    alertHref: `/dashboard/alerts/${alert.id}`,
    record:
      alert.relatedEntityType !== null && href !== null
        ? {
            type: alert.relatedEntityType,
            id: alert.relatedEntityType === "FORECAST" ? null : alert.relatedEntityId,
            href,
          }
        : null,
  };
}

export interface DashboardServiceDependencies {
  repository: DashboardRepository;
  memberships: BusinessMembershipRepository;
  /** Existing forecast service; the dashboard never reimplements its rules. */
  forecast: Pick<ForecastService, "getForecast">;
  /** Existing alert service; the dashboard never creates or duplicates alerts. */
  alerts: Pick<AlertService, "list">;
}

export function createDashboardService(dependencies: DashboardServiceDependencies) {
  const { repository, memberships, forecast, alerts } = dependencies;

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

    async getUpcomingExpenses(
      user: AuthenticatedUser,
      businessId: string,
      query: UpcomingExpensesQuery,
    ) {
      const ctx = await authorize(user, businessId);
      const rows = await repository.getUpcomingExpenseRows(
        ctx.businessId,
        ctx.today,
        query.limit,
      );

      const items: DashboardUpcomingExpense[] = rows.map((row) => ({
        id: row.id,
        title: row.title,
        category: row.category,
        amount: row.amount,
        dueDate: row.dueDate,
        status: row.status,
        displayStatus: deriveDisplayStatus(
          row.status as ExpenseStatusValue,
          row.dueDate,
          ctx.today,
        ),
        isOverdue: row.isOverdue,
        currency: ctx.currency,
      }));

      return { currency: ctx.currency, today: ctx.today, rows: items };
    },

    async getCashFlow(user: AuthenticatedUser, businessId: string, query: CashFlowQuery) {
      // Authorize the dashboard request first so a non-member is rejected
      // before the forecast service runs. The forecast service repeats the
      // check and owns every projection rule.
      await authorize(user, businessId);
      const result = await forecast.getForecast(user, businessId, {
        horizon: query.horizon,
      });

      const cashFlow: DashboardCashFlow = {
        currency: result.currency,
        horizonDays: result.horizonDays,
        today: result.today,
        startDate: result.startDate,
        endDate: result.endDate,
        calculatedAt: result.calculatedAt,
        currentCash: result.openingBalance,
        expectedIncoming: result.expectedIncoming,
        expectedOutgoing: result.expectedOutgoing,
        netCashFlow: result.netCashFlow,
        projectedClosing: result.projectedEndingBalance,
        lowestProjectedBalance: result.lowestProjectedBalance,
        lowestProjectedDate: result.lowestProjectedDate,
        shortageDate: result.shortageDate,
        becomesNegative: result.becomesNegative,
        series: result.daily.map((day) => ({
          date: day.date,
          incoming: day.incoming,
          outgoing: day.outgoing,
          balance: day.projectedBalance,
        })),
      };

      return cashFlow;
    },

    async getActions(user: AuthenticatedUser, businessId: string, query: ActionsQuery) {
      await authorize(user, businessId);
      const result = await alerts.list(
        user,
        businessId,
        listAlertsQuerySchema.parse({
          pageSize: query.limit,
          sort: "severity",
          direction: "desc",
          status: "active",
        }),
      );

      return {
        counts: result.counts,
        total: result.total,
        items: result.items.map(toDashboardAction),
      };
    },

    async getTransactions(
      user: AuthenticatedUser,
      businessId: string,
      query: TransactionsQuery,
    ) {
      const ctx = await authorize(user, businessId);
      const [payments, expenses] = await Promise.all([
        repository.getPaymentTransactionRows(ctx.businessId, query.limit),
        repository.getPaidExpenseTransactionRows(ctx.businessId, query.limit),
      ]);

      const items: DashboardTransaction[] = [
        ...payments.map((row) => ({
          id: row.id,
          kind: "PAYMENT" as const,
          date: row.paymentDate,
          description: `Payment from ${row.customerName}`,
          reference: row.invoiceNumber,
          amount: row.amount,
          direction: "in" as const,
          currency: row.currency,
          href: `/dashboard/payments/${row.id}`,
        })),
        ...expenses.map((row) => ({
          id: row.id,
          kind: "EXPENSE" as const,
          date: row.paymentDate,
          description: row.title,
          reference: null,
          amount: row.amount,
          direction: "out" as const,
          currency: ctx.currency,
          href: `/dashboard/expenses/${row.id}`,
        })),
      ]
        .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : b.date.localeCompare(a.date)))
        .slice(0, query.limit);

      return { currency: ctx.currency, items };
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
  forecast: forecastService,
  alerts: alertService,
});
