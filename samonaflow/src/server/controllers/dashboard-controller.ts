// Route-handler-agnostic controller for the Financial Dashboard REST API. It owns
// request parsing/validation and maps service results to consistent JSON
// responses. Dependencies are injected so the HTTP surface can be tested without
// a database or a Supabase session.
import type { z } from "zod";
import {
  actionsQuerySchema,
  businessIdSchema,
  cashFlowQuerySchema,
  receivablesQuerySchema,
  recentActivityQuerySchema,
  remindersQuerySchema,
  summaryQuerySchema,
  transactionsQuerySchema,
  trendsQuerySchema,
  upcomingExpensesQuerySchema,
} from "@/lib/validations/dashboard";
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import { DashboardServiceError, type DashboardService } from "@/server/services/dashboard-service";
import { apiError, apiSuccess, zodFieldErrors } from "@/server/utils/api-response";

export type AuthResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; response: Response };

export type Authenticate = (request: Request) => Promise<AuthResult>;

export interface DashboardController {
  summary(request: Request, businessId: string): Promise<Response>;
  trends(request: Request, businessId: string): Promise<Response>;
  receivables(request: Request, businessId: string): Promise<Response>;
  upcomingExpenses(request: Request, businessId: string): Promise<Response>;
  cashFlow(request: Request, businessId: string): Promise<Response>;
  actions(request: Request, businessId: string): Promise<Response>;
  transactions(request: Request, businessId: string): Promise<Response>;
  recentActivity(request: Request, businessId: string): Promise<Response>;
  reminders(request: Request, businessId: string): Promise<Response>;
}

type Authorization =
  | { ok: true; user: AuthenticatedUser; businessId: string }
  | { ok: false; response: Response };

function handleServiceError(error: unknown): Response {
  if (error instanceof DashboardServiceError) {
    if (error.code === "BUSINESS_FORBIDDEN") {
      return apiError(403, "business_forbidden", error.message);
    }
    return apiError(400, "invalid_request", error.message);
  }
  return apiError(500, "internal_error", "An unexpected error occurred.");
}

function parseQuery<S extends z.ZodType>(
  request: Request,
  schema: S,
): { ok: true; value: z.output<S> } | { ok: false; response: Response } {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    return {
      ok: false,
      response: apiError(
        400,
        "invalid_request",
        "Invalid query parameters.",
        zodFieldErrors(parsed.error.issues),
      ),
    };
  }
  return { ok: true, value: parsed.data as z.output<S> };
}

export function createDashboardController(dependencies: {
  authenticate: Authenticate;
  service: DashboardService;
}): DashboardController {
  const { authenticate, service } = dependencies;

  async function authorize(request: Request, rawBusinessId: string): Promise<Authorization> {
    const auth = await authenticate(request);
    if (!auth.ok) return { ok: false, response: auth.response };

    const businessId = businessIdSchema.safeParse(rawBusinessId);
    if (!businessId.success) {
      return {
        ok: false,
        response: apiError(
          400,
          "invalid_request",
          "Invalid identifier.",
          zodFieldErrors(businessId.error.issues),
        ),
      };
    }
    return { ok: true, user: auth.user, businessId: businessId.data };
  }

  /** Authorize, validate the query, then call the service; all errors become responses. */
  async function run<S extends z.ZodType, T>(
    request: Request,
    rawBusinessId: string,
    schema: S,
    call: (user: AuthenticatedUser, businessId: string, query: z.output<S>) => Promise<T>,
  ): Promise<Response> {
    const authorized = await authorize(request, rawBusinessId);
    if (!authorized.ok) return authorized.response;

    const query = parseQuery(request, schema);
    if (!query.ok) return query.response;

    try {
      const data = await call(authorized.user, authorized.businessId, query.value);
      return apiSuccess(data);
    } catch (error) {
      return handleServiceError(error);
    }
  }

  return {
    summary(request, rawBusinessId) {
      return run(request, rawBusinessId, summaryQuerySchema, (user, businessId, query) =>
        service.getSummary(user, businessId, query),
      );
    },
    trends(request, rawBusinessId) {
      return run(request, rawBusinessId, trendsQuerySchema, (user, businessId, query) =>
        service.getTrends(user, businessId, query),
      );
    },
    receivables(request, rawBusinessId) {
      return run(request, rawBusinessId, receivablesQuerySchema, (user, businessId, query) =>
        service.getReceivables(user, businessId, query),
      );
    },
    upcomingExpenses(request, rawBusinessId) {
      return run(request, rawBusinessId, upcomingExpensesQuerySchema, (user, businessId, query) =>
        service.getUpcomingExpenses(user, businessId, query),
      );
    },
    cashFlow(request, rawBusinessId) {
      return run(request, rawBusinessId, cashFlowQuerySchema, (user, businessId, query) =>
        service.getCashFlow(user, businessId, query),
      );
    },
    actions(request, rawBusinessId) {
      return run(request, rawBusinessId, actionsQuerySchema, (user, businessId, query) =>
        service.getActions(user, businessId, query),
      );
    },
    transactions(request, rawBusinessId) {
      return run(request, rawBusinessId, transactionsQuerySchema, (user, businessId, query) =>
        service.getTransactions(user, businessId, query),
      );
    },
    recentActivity(request, rawBusinessId) {
      return run(request, rawBusinessId, recentActivityQuerySchema, (user, businessId, query) =>
        service.getRecentActivity(user, businessId, query),
      );
    },
    reminders(request, rawBusinessId) {
      return run(request, rawBusinessId, remindersQuerySchema, (user, businessId) =>
        service.getReminders(user, businessId),
      );
    },
  };
}
