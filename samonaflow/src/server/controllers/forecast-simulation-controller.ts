// Route-handler-agnostic controller for the What-If Cash Flow Simulator.
// It owns authentication wiring, body parsing/validation and the shared JSON
// envelope. Dependencies are injected so the HTTP surface can be tested without
// a database or a Supabase session.
import type { z } from "zod";
import { businessIdSchema } from "@/lib/validations/customer";
import { forecastSimulationRequestSchema } from "@/lib/validations/forecast-simulation";
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import {
  ForecastSimulationServiceError,
  type ForecastSimulationService,
} from "@/server/services/forecast-simulation-service";
import { apiError, apiSuccess, zodFieldErrors } from "@/server/utils/api-response";

export type AuthResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; response: Response };

export type Authenticate = (request: Request) => Promise<AuthResult>;

export interface ForecastSimulationController {
  create(request: Request, businessId: string): Promise<Response>;
}

type Authorization =
  | { ok: true; user: AuthenticatedUser; businessId: string }
  | { ok: false; response: Response };

function handleServiceError(error: unknown): Response {
  if (error instanceof ForecastSimulationServiceError) {
    if (error.code === "BUSINESS_FORBIDDEN") {
      return apiError(403, "business_forbidden", error.message);
    }
    return apiError(400, "invalid_request", error.message, error.fieldErrors);
  }
  return apiError(500, "internal_error", "An unexpected error occurred.");
}

async function parseBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<{ ok: true; value: z.output<S> } | { ok: false; response: Response }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      response: apiError(400, "invalid_request", "Request body must be valid JSON."),
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      response: apiError(
        400,
        "invalid_request",
        "Invalid simulation request.",
        zodFieldErrors(parsed.error.issues),
      ),
    };
  }
  return { ok: true, value: parsed.data as z.output<S> };
}

export function createForecastSimulationController(dependencies: {
  authenticate: Authenticate;
  service: ForecastSimulationService;
}): ForecastSimulationController {
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

  return {
    async create(request, rawBusinessId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      const body = await parseBody(request, forecastSimulationRequestSchema);
      if (!body.ok) return body.response;

      try {
        const data = await service.simulate(
          authorized.user,
          authorized.businessId,
          body.value,
        );
        return apiSuccess(data);
      } catch (error) {
        return handleServiceError(error);
      }
    },
  };
}
