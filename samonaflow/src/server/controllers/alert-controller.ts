// Route-handler-agnostic controller for the Smart Alerts REST API. It owns
// request parsing/validation and maps service results to the shared JSON
// envelope. Dependencies are injected so the HTTP surface can be tested with
// node:test without a database or a Supabase session.
import {
  alertIdSchema,
  businessIdSchema,
  listAlertsQuerySchema,
} from "@/lib/validations/alert";
import type { ListAlertsQuery } from "@/lib/validations/alert";
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import {
  AlertServiceError,
  type AlertService,
} from "@/server/services/alert-service";
import { apiError, apiSuccess, zodFieldErrors } from "@/server/utils/api-response";

export type AuthResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; response: Response };

export type Authenticate = (request: Request) => Promise<AuthResult>;

export interface AlertController {
  list(request: Request, businessId: string): Promise<Response>;
  get(request: Request, businessId: string, alertId: string): Promise<Response>;
  unreadCount(request: Request, businessId: string): Promise<Response>;
  evaluate(request: Request, businessId: string): Promise<Response>;
  markRead(request: Request, businessId: string, alertId: string): Promise<Response>;
  markUnread(request: Request, businessId: string, alertId: string): Promise<Response>;
  dismiss(request: Request, businessId: string, alertId: string): Promise<Response>;
}

type Authorization =
  | { ok: true; user: AuthenticatedUser; businessId: string }
  | { ok: false; response: Response };

function invalidId(field: string): Response {
  return apiError(400, "invalid_request", "Invalid identifier.", {
    [field]: "Invalid identifier.",
  });
}

function handleServiceError(error: unknown): Response {
  if (error instanceof AlertServiceError) {
    switch (error.code) {
      case "BUSINESS_FORBIDDEN":
        return apiError(403, "business_forbidden", error.message);
      case "ALERT_NOT_FOUND":
        return apiError(404, "alert_not_found", error.message);
      case "INVALID_TRANSITION":
        return apiError(409, "invalid_transition", error.message);
      case "INVALID_REQUEST":
        return apiError(400, "invalid_request", error.message);
    }
  }
  return apiError(500, "internal_error", "An unexpected error occurred.");
}

function parseListQuery(
  request: Request,
):
  | { ok: true; value: ListAlertsQuery }
  | { ok: false; response: Response } {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = listAlertsQuerySchema.safeParse(params);
  if (!parsed.success) {
    return {
      ok: false,
      response: apiError(
        400,
        "invalid_request",
        "Invalid list query.",
        zodFieldErrors(parsed.error.issues),
      ),
    };
  }
  return { ok: true, value: parsed.data };
}

export function createAlertController(dependencies: {
  authenticate: Authenticate;
  service: AlertService;
}): AlertController {
  const { authenticate, service } = dependencies;

  async function authorize(
    request: Request,
    rawBusinessId: string,
  ): Promise<Authorization> {
    const auth = await authenticate(request);
    if (!auth.ok) return { ok: false, response: auth.response };

    const businessId = businessIdSchema.safeParse(rawBusinessId);
    if (!businessId.success) {
      return { ok: false, response: invalidId("businessId") };
    }
    return { ok: true, user: auth.user, businessId: businessId.data };
  }

  function parseAlertId(raw: string): Response | string {
    const parsed = alertIdSchema.safeParse(raw);
    return parsed.success ? parsed.data : invalidId("alertId");
  }

  return {
    async list(request, rawBusinessId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      const query = parseListQuery(request);
      if (!query.ok) return query.response;

      try {
        const result = await service.list(
          authorized.user,
          authorized.businessId,
          query.value,
        );
        return apiSuccess(result);
      } catch (error) {
        return handleServiceError(error);
      }
    },

    async get(request, rawBusinessId, rawAlertId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      const alertId = parseAlertId(rawAlertId);
      if (alertId instanceof Response) return alertId;

      try {
        const alert = await service.get(
          authorized.user,
          authorized.businessId,
          alertId,
        );
        return apiSuccess({ alert });
      } catch (error) {
        return handleServiceError(error);
      }
    },

    async unreadCount(request, rawBusinessId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      try {
        const result = await service.getUnreadCount(
          authorized.user,
          authorized.businessId,
        );
        return apiSuccess(result);
      } catch (error) {
        return handleServiceError(error);
      }
    },

    async evaluate(request, rawBusinessId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      try {
        const result = await service.evaluate(
          authorized.user,
          authorized.businessId,
        );
        return apiSuccess(result);
      } catch (error) {
        return handleServiceError(error);
      }
    },

    async markRead(request, rawBusinessId, rawAlertId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      const alertId = parseAlertId(rawAlertId);
      if (alertId instanceof Response) return alertId;

      try {
        const alert = await service.markRead(
          authorized.user,
          authorized.businessId,
          alertId,
        );
        return apiSuccess({ alert });
      } catch (error) {
        return handleServiceError(error);
      }
    },

    async markUnread(request, rawBusinessId, rawAlertId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      const alertId = parseAlertId(rawAlertId);
      if (alertId instanceof Response) return alertId;

      try {
        const alert = await service.markUnread(
          authorized.user,
          authorized.businessId,
          alertId,
        );
        return apiSuccess({ alert });
      } catch (error) {
        return handleServiceError(error);
      }
    },

    async dismiss(request, rawBusinessId, rawAlertId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      const alertId = parseAlertId(rawAlertId);
      if (alertId instanceof Response) return alertId;

      try {
        const alert = await service.dismiss(
          authorized.user,
          authorized.businessId,
          alertId,
        );
        return apiSuccess({ alert });
      } catch (error) {
        return handleServiceError(error);
      }
    },
  };
}
