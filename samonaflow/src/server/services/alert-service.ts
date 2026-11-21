// Server-only application service for Smart Alerts and the Action Center.
//
// Authorization is enforced here on every operation from the verified session
// identity. A businessId is never trusted without a matching membership row,
// and every repository call receives that verified businessId. Evaluation loads
// one explicit snapshot, delegates all cash-flow arithmetic to the existing
// forecast engine, and applies the pure alert rules. Nothing is delivered
// automatically: the Action Center links the owner to an existing workflow.
import {
  generateAlerts,
  SHORTAGE_HORIZON_DAYS,
  type AlertInvoiceSnapshot,
  type AlertShortageSnapshot,
} from "@/lib/alert-rules";
import { businessLocalDate } from "@/lib/business-date";
import { calculateForecast } from "@/lib/forecast-math";
import type { ListAlertsQuery } from "@/lib/validations/alert";
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import {
  prismaAlertRepository,
  type AlertRepository,
} from "@/server/repositories/alert-repository";
import {
  prismaBusinessMembershipRepository,
  type BusinessMembershipRepository,
} from "@/server/repositories/business-membership-repository";
import {
  prismaForecastRepository,
  type ForecastBusinessContext,
  type ForecastRepository,
} from "@/server/repositories/forecast-repository";
import { buildForecastInput } from "@/server/services/forecast-service";
import type {
  AlertCounts,
  AlertDetail,
  AlertEvaluationResult,
  AlertListResult,
  AlertRecord,
  AlertRelatedEntity,
} from "@/types/alert";
import type { ForecastInvoiceInput } from "@/types/forecast";

export type AlertServiceErrorCode =
  | "BUSINESS_FORBIDDEN"
  | "ALERT_NOT_FOUND"
  | "INVALID_TRANSITION"
  | "INVALID_REQUEST";

export class AlertServiceError extends Error {
  readonly code: AlertServiceErrorCode;

  constructor(code: AlertServiceErrorCode, message: string) {
    super(message);
    this.name = "AlertServiceError";
    this.code = code;
  }
}

export interface AlertService {
  list(
    user: AuthenticatedUser,
    businessId: string,
    query: ListAlertsQuery,
  ): Promise<AlertListResult>;
  get(user: AuthenticatedUser, businessId: string, alertId: string): Promise<AlertDetail>;
  getCounts(user: AuthenticatedUser, businessId: string): Promise<AlertCounts>;
  getUnreadCount(
    user: AuthenticatedUser,
    businessId: string,
  ): Promise<{ count: number }>;
  evaluate(user: AuthenticatedUser, businessId: string): Promise<AlertEvaluationResult>;
  markRead(
    user: AuthenticatedUser,
    businessId: string,
    alertId: string,
  ): Promise<AlertRecord>;
  markUnread(
    user: AuthenticatedUser,
    businessId: string,
    alertId: string,
  ): Promise<AlertRecord>;
  dismiss(
    user: AuthenticatedUser,
    businessId: string,
    alertId: string,
  ): Promise<AlertRecord>;
}

export interface AlertServiceDependencies {
  alerts: AlertRepository;
  memberships: BusinessMembershipRepository;
  forecast: ForecastRepository;
  /** Injectable clock so timezone-boundary tests are deterministic. */
  now?: () => Date;
}

function toForecastInvoice(invoice: AlertInvoiceSnapshot): ForecastInvoiceInput {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    customerName: invoice.customerName,
    currency: invoice.currency,
    status: invoice.status,
    dueDate: invoice.dueDate,
    expectedPaymentDate: invoice.expectedPaymentDate,
    totalAmount: invoice.totalAmount,
    amountPaid: invoice.amountPaid,
  };
}

export function createAlertService(dependencies: AlertServiceDependencies): AlertService {
  const { alerts, memberships, forecast, now = () => new Date() } = dependencies;

  async function requireMembership(
    user: AuthenticatedUser,
    businessId: string,
  ): Promise<void> {
    const membership = await memberships.findMembership(user.id, businessId);
    if (!membership) {
      throw new AlertServiceError(
        "BUSINESS_FORBIDDEN",
        "You do not have access to this business.",
      );
    }
  }

  async function requireContext(
    user: AuthenticatedUser,
    businessId: string,
  ): Promise<ForecastBusinessContext> {
    await requireMembership(user, businessId);
    const context = await forecast.getBusinessContext(businessId);
    if (!context) {
      throw new AlertServiceError(
        "BUSINESS_FORBIDDEN",
        "You do not have access to this business.",
      );
    }
    return context;
  }

  async function requireAlert(
    user: AuthenticatedUser,
    businessId: string,
    alertId: string,
  ): Promise<AlertRecord> {
    await requireMembership(user, businessId);
    const alert = await alerts.findById(businessId, alertId);
    if (!alert) {
      throw new AlertServiceError("ALERT_NOT_FOUND", "Alert not found.");
    }
    return alert;
  }

  async function relatedEntity(
    businessId: string,
    alert: AlertRecord,
  ): Promise<AlertRelatedEntity | null> {
    if (alert.relatedEntityType === "FORECAST") {
      return {
        type: "FORECAST",
        id: null,
        label: "Cash flow forecast",
        href: "/dashboard/forecast",
        summary: `${SHORTAGE_HORIZON_DAYS}-day projection`,
      };
    }
    if (!alert.relatedEntityId || !alert.relatedEntityType) return null;

    switch (alert.relatedEntityType) {
      case "INVOICE":
        return alerts.findRelatedInvoice(businessId, alert.relatedEntityId);
      case "EXPENSE":
        return alerts.findRelatedExpense(businessId, alert.relatedEntityId);
      case "CUSTOMER":
        return alerts.findRelatedCustomer(businessId, alert.relatedEntityId);
      default:
        return null;
    }
  }

  return {
    async list(user, businessId, query) {
      await requireMembership(user, businessId);
      const [page, counts] = await Promise.all([
        alerts.list(businessId, query),
        alerts.getCounts(businessId),
      ]);
      return {
        items: page.items,
        total: page.total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: page.total === 0 ? 0 : Math.ceil(page.total / query.pageSize),
        counts,
      };
    },

    async get(user, businessId, alertId) {
      const alert = await requireAlert(user, businessId, alertId);
      return { ...alert, relatedEntity: await relatedEntity(businessId, alert) };
    },

    async getCounts(user, businessId) {
      await requireMembership(user, businessId);
      return alerts.getCounts(businessId);
    },

    async getUnreadCount(user, businessId) {
      await requireMembership(user, businessId);
      return { count: await alerts.getUnreadCount(businessId) };
    },

    async evaluate(user, businessId) {
      const context = await requireContext(user, businessId);
      const calculatedAt = now();
      const today = businessLocalDate(context.timezone, calculatedAt);

      const [cash, invoices, expenses] = await Promise.all([
        forecast.getCashSums(
          businessId,
          context.currency,
          context.openingBalanceDate,
          today,
        ),
        alerts.getOpenInvoices(businessId),
        alerts.getOpenExpenses(businessId),
      ]);

      let forecastResult;
      try {
        forecastResult = calculateForecast(
          buildForecastInput(
            {
              context,
              cash,
              invoices: invoices.map(toForecastInvoice),
              expenses,
            },
            SHORTAGE_HORIZON_DAYS,
            calculatedAt,
          ),
        );
      } catch (error) {
        throw new AlertServiceError(
          "INVALID_REQUEST",
          error instanceof Error ? error.message : "Invalid financial data.",
        );
      }

      const shortage: AlertShortageSnapshot = {
        horizonDays: forecastResult.horizonDays,
        becomesNegative: forecastResult.becomesNegative,
        shortageDate: forecastResult.shortageDate,
        lowestProjectedBalance: forecastResult.lowestProjectedBalance,
        lowestProjectedDate: forecastResult.lowestProjectedDate,
        projectedEndingBalance: forecastResult.projectedEndingBalance,
      };

      const candidates = generateAlerts({
        currency: context.currency,
        timezone: context.timezone,
        today,
        invoices,
        expenses,
        shortage,
      });

      const counts = await alerts.applyEvaluation(businessId, candidates, calculatedAt);
      const current = await alerts.getCounts(businessId);

      return {
        evaluatedAt: calculatedAt.toISOString(),
        today,
        ...counts,
        active: current.active,
      };
    },

    async markRead(user, businessId, alertId) {
      const existing = await requireAlert(user, businessId, alertId);
      if (existing.isRead) return existing;
      const updated = await alerts.markRead(businessId, alertId, now());
      if (!updated) {
        throw new AlertServiceError("ALERT_NOT_FOUND", "Alert not found.");
      }
      return updated;
    },

    async markUnread(user, businessId, alertId) {
      const existing = await requireAlert(user, businessId, alertId);
      if (!existing.isRead) return existing;
      const updated = await alerts.markUnread(businessId, alertId);
      if (!updated) {
        throw new AlertServiceError("ALERT_NOT_FOUND", "Alert not found.");
      }
      return updated;
    },

    async dismiss(user, businessId, alertId) {
      const existing = await requireAlert(user, businessId, alertId);
      if (existing.status === "DISMISSED") return existing;
      if (existing.status === "RESOLVED") {
        throw new AlertServiceError(
          "INVALID_TRANSITION",
          "A resolved alert cannot be dismissed.",
        );
      }
      const updated = await alerts.dismiss(businessId, alertId);
      if (!updated) {
        throw new AlertServiceError("ALERT_NOT_FOUND", "Alert not found.");
      }
      return updated;
    },
  };
}

export const alertService: AlertService = createAlertService({
  alerts: prismaAlertRepository,
  memberships: prismaBusinessMembershipRepository,
  forecast: prismaForecastRepository,
});
