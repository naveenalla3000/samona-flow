// Server-only application service for Cash Flow Forecasting.
//
// Authorization is enforced here on every operation from the verified session
// identity. A businessId is never trusted without a matching membership row, and
// every repository call receives that verified businessId. The service resolves
// the business-local "today" from the stored IANA timezone, loads only the
// records that can affect the requested horizon, and delegates all arithmetic to
// the pure engine in src/lib/forecast-math.ts.
import { businessLocalDate } from "@/lib/business-date";
import { addDays } from "@/lib/dashboard-metrics";
import { calculateForecast } from "@/lib/forecast-math";
import type { ForecastQuery } from "@/lib/validations/forecast";
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import {
  prismaBusinessMembershipRepository,
  type BusinessMembershipRepository,
} from "@/server/repositories/business-membership-repository";
import {
  prismaForecastRepository,
  type ForecastBusinessContext,
  type ForecastCashSums,
  type ForecastRepository,
} from "@/server/repositories/forecast-repository";
import type {
  ForecastExpenseInput,
  ForecastHorizon,
  ForecastInput,
  ForecastInvoiceInput,
  ForecastResult,
} from "@/types/forecast";

export type ForecastServiceErrorCode = "BUSINESS_FORBIDDEN" | "INVALID_REQUEST";

export class ForecastServiceError extends Error {
  readonly code: ForecastServiceErrorCode;

  constructor(code: ForecastServiceErrorCode, message: string) {
    super(message);
    this.name = "ForecastServiceError";
    this.code = code;
  }
}

export interface ForecastServiceDependencies {
  repository: ForecastRepository;
  memberships: BusinessMembershipRepository;
  /** Injectable clock so timezone-boundary tests are deterministic. */
  now?: () => Date;
}

export interface ForecastService {
  getForecast(
    user: AuthenticatedUser,
    businessId: string,
    query: ForecastQuery,
  ): Promise<ForecastResult>;
  getDaily(
    user: AuthenticatedUser,
    businessId: string,
    query: ForecastQuery,
  ): Promise<{
    currency: string;
    horizonDays: ForecastHorizon;
    startDate: string;
    endDate: string;
    calculatedAt: string;
    days: ForecastResult["daily"];
  }>;
  getMonthly(
    user: AuthenticatedUser,
    businessId: string,
    query: ForecastQuery,
  ): Promise<{
    currency: string;
    horizonDays: ForecastHorizon;
    startDate: string;
    endDate: string;
    calculatedAt: string;
    months: ForecastResult["monthly"];
  }>;
}

/**
 * The authorized data snapshot needed to build a forecast input. Exported so
 * the alert evaluator can reuse the exact same assembly rules when it loads
 * open invoices and expenses for other alert conditions.
 */
export interface ForecastSnapshot {
  context: ForecastBusinessContext;
  cash: ForecastCashSums;
  invoices: ForecastInvoiceInput[];
  expenses: ForecastExpenseInput[];
}

/**
 * Builds the pure engine input from an already-authorized snapshot. The
 * business-local "today" is derived here so every caller uses the same rule.
 */
export function buildForecastInput(
  snapshot: ForecastSnapshot,
  horizon: ForecastHorizon,
  calculatedAt: Date,
): ForecastInput {
  return {
    currency: snapshot.context.currency,
    timezone: snapshot.context.timezone,
    today: businessLocalDate(snapshot.context.timezone, calculatedAt),
    horizonDays: horizon,
    openingBalance: snapshot.context.openingBalance,
    openingBalanceDate: snapshot.context.openingBalanceDate,
    cashInSinceOpening: snapshot.cash.cashIn,
    cashOutSinceOpening: snapshot.cash.cashOut,
    calculatedAt: calculatedAt.toISOString(),
    invoices: snapshot.invoices,
    expenses: snapshot.expenses,
  };
}

/**
 * Loads the explicit, authorized input used by the forecasting engine.
 *
 * Authorization is enforced before any repository read: a membership for the
 * verified user and business is required, and every subsequent query receives
 * that same verified businessId. Exported so the What-If simulator recalculates
 * its baseline from exactly the same snapshot and rules without duplicating
 * authorization or data-loading logic.
 */
export async function loadForecastInput(
  dependencies: ForecastServiceDependencies,
  user: AuthenticatedUser,
  businessId: string,
  horizon: ForecastHorizon,
): Promise<ForecastInput> {
  const { repository, memberships, now = () => new Date() } = dependencies;

  const membership = await memberships.findMembership(user.id, businessId);
  if (!membership) {
    throw new ForecastServiceError(
      "BUSINESS_FORBIDDEN",
      "You do not have access to this business.",
    );
  }
  const context = await repository.getBusinessContext(businessId);
  if (!context) {
    throw new ForecastServiceError(
      "BUSINESS_FORBIDDEN",
      "You do not have access to this business.",
    );
  }

  const calculatedAt = now();
  const today = businessLocalDate(context.timezone, calculatedAt);
  const endDate = addDays(today, horizon - 1);

  const [cash, invoices, expenses] = await Promise.all([
    repository.getCashSums(
      businessId,
      context.currency,
      context.openingBalanceDate,
      today,
    ),
    repository.getEligibleInvoices(businessId, endDate),
    repository.getEligibleExpenses(businessId, endDate),
  ]);

  return buildForecastInput(
    { context, cash, invoices, expenses },
    horizon,
    calculatedAt,
  );
}

export function createForecastService(dependencies: ForecastServiceDependencies): ForecastService {
  async function build(
    user: AuthenticatedUser,
    businessId: string,
    horizon: ForecastHorizon,
  ): Promise<ForecastResult> {
    const input = await loadForecastInput(dependencies, user, businessId, horizon);

    try {
      return calculateForecast(input);
    } catch (error) {
      throw new ForecastServiceError(
        "INVALID_REQUEST",
        error instanceof Error ? error.message : "Invalid forecast data.",
      );
    }
  }

  return {
    getForecast(user, businessId, query) {
      return build(user, businessId, query.horizon);
    },

    async getDaily(user, businessId, query) {
      const result = await build(user, businessId, query.horizon);
      return {
        currency: result.currency,
        horizonDays: result.horizonDays,
        startDate: result.startDate,
        endDate: result.endDate,
        calculatedAt: result.calculatedAt,
        days: result.daily,
      };
    },

    async getMonthly(user, businessId, query) {
      const result = await build(user, businessId, query.horizon);
      return {
        currency: result.currency,
        horizonDays: result.horizonDays,
        startDate: result.startDate,
        endDate: result.endDate,
        calculatedAt: result.calculatedAt,
        months: result.monthly,
      };
    },
  };
}

export const forecastService: ForecastService = createForecastService({
  repository: prismaForecastRepository,
  memberships: prismaBusinessMembershipRepository,
});
