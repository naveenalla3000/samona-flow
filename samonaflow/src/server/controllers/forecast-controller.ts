// Route-handler-agnostic controller for the Cash Flow Forecasting REST API.
// It owns request parsing/validation and maps service results to the shared JSON
// envelope. Dependencies are injected so the HTTP surface can be tested without
// a database or a Supabase session.
import type { z } from "zod";
import { businessIdSchema } from "@/lib/validations/customer";
import { forecastQuerySchema } from "@/lib/validations/forecast";
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import {
  ForecastServiceError,
  type ForecastService,
} from "@/server/services/forecast-service";
import { apiError, apiSuccess, zodFieldErrors } from "@/server/utils/api-response";

export type AuthResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; response: Response };

export type Authenticate = (request: Request) => Promise<AuthResult>;

export interface ForecastController {
  summary(request: Request, businessId: string): Promise<Response>;
  daily(request: Request, businessId: string): Promise<Response>;
  monthly(request: Request, businessId: string): Promise<Response>;
}

type Authorization =
  | { ok: true; user: AuthenticatedUser; businessId: string }
  | { ok: false; response: Response };

function handleServiceError(error: unknown): Response {
  if (error instanceof ForecastServiceError) {
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

export function createForecastController(dependencies: {
  authenticate: Authenticate;
  service: ForecastService;
}): ForecastController {
  const { authenticate, service } = dependencies;

  async function authorize(
    request: Request,
    rawBusinessId: string,
  ): Promise<Authorization> {
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

  async function run<S extends z.ZodType, T>(
    request: Request,
    rawBusinessId: string,
    schema: S,
    call: (
      user: AuthenticatedUser,
      businessId: string,
      query: z.output<S>,
    ) => Promise<T>,
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
      return run(request, rawBusinessId, forecastQuerySchema, (user, businessId, query) =>
        service.getForecast(user, businessId, query),
      );
    },
    daily(request, rawBusinessId) {
      return run(request, rawBusinessId, forecastQuerySchema, (user, businessId, query) =>
        service.getDaily(user, businessId, query),
      );
    },
    monthly(request, rawBusinessId) {
      return run(request, rawBusinessId, forecastQuerySchema, (user, businessId, query) =>
        service.getMonthly(user, businessId, query),
      );
    },
  };
}
