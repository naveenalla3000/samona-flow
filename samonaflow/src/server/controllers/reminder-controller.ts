// Route-handler-agnostic controller for the Reminder REST API. It owns request
// parsing/validation and maps service results to consistent JSON responses.
// Dependencies are injected so the whole HTTP surface can be tested with
// node:test without a database or a Supabase session.
import {
  businessIdSchema,
  createReminderSchema,
  listRemindersQuerySchema,
  reminderIdSchema,
  updateReminderSchema,
} from "@/lib/validations/reminder";
import type { ListRemindersQuery } from "@/lib/validations/reminder";
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import {
  ReminderServiceError,
  type ReminderService,
} from "@/server/services/reminder-service";
import { apiError, apiSuccess, zodFieldErrors } from "@/server/utils/api-response";

export type AuthResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; response: Response };

export type Authenticate = (request: Request) => Promise<AuthResult>;

export interface ReminderController {
  create(request: Request, businessId: string): Promise<Response>;
  list(request: Request, businessId: string): Promise<Response>;
  get(request: Request, businessId: string, reminderId: string): Promise<Response>;
  update(request: Request, businessId: string, reminderId: string): Promise<Response>;
  markWhatsappOpened(request: Request, businessId: string, reminderId: string): Promise<Response>;
  markSent(request: Request, businessId: string, reminderId: string): Promise<Response>;
}

type Authorization =
  | { ok: false; response: Response }
  | { ok: true; user: AuthenticatedUser; businessId: string };

function handleServiceError(error: unknown): Response {
  if (error instanceof ReminderServiceError) {
    switch (error.code) {
      case "BUSINESS_FORBIDDEN":
        return apiError(403, "business_forbidden", error.message);
      case "REMINDER_CONTEXT_NOT_FOUND":
        return apiError(404, "invalid_reminder_context", error.message);
      case "REMINDER_NOT_FOUND":
        return apiError(404, "reminder_not_found", error.message);
      case "INVALID_TRANSITION":
        return apiError(422, "invalid_transition", error.message);
    }
  }
  // Never leak internal database details to clients.
  return apiError(500, "internal_error", "An unexpected error occurred.");
}

function invalidId(field: string): Response {
  return apiError(400, "invalid_request", "Invalid identifier.", {
    [field]: "Invalid identifier.",
  });
}

async function readJson(request: Request): Promise<unknown | Response> {
  try {
    return await request.json();
  } catch {
    return apiError(400, "invalid_request", "Request body must be valid JSON.");
  }
}

function parseQuery(request: Request):
  | { ok: true; value: ListRemindersQuery }
  | { ok: false; response: Response } {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = listRemindersQuerySchema.safeParse(params);
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

export function createReminderController(dependencies: {
  authenticate: Authenticate;
  service: ReminderService;
}): ReminderController {
  const { authenticate, service } = dependencies;

  async function authorize(request: Request, rawBusinessId: string): Promise<Authorization> {
    const auth = await authenticate(request);
    if (!auth.ok) return { ok: false, response: auth.response };

    const businessId = businessIdSchema.safeParse(rawBusinessId);
    if (!businessId.success) return { ok: false, response: invalidId("businessId") };

    return { ok: true, user: auth.user, businessId: businessId.data };
  }

  function parseId(raw: string): Response | string {
    const parsed = reminderIdSchema.safeParse(raw);
    return parsed.success ? parsed.data : invalidId("reminderId");
  }

  return {
    async create(request, rawBusinessId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      const body = await readJson(request);
      if (body instanceof Response) return body;

      const parsed = createReminderSchema.safeParse(body);
      if (!parsed.success) {
        return apiError(
          400,
          "invalid_request",
          "Invalid reminder data.",
          zodFieldErrors(parsed.error.issues),
        );
      }

      try {
        const reminder = await service.create(authorized.user, authorized.businessId, parsed.data);
        return apiSuccess({ reminder }, 201);
      } catch (error) {
        return handleServiceError(error);
      }
    },

    async list(request, rawBusinessId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      const query = parseQuery(request);
      if (!query.ok) return query.response;

      try {
        const result = await service.list(authorized.user, authorized.businessId, query.value);
        return apiSuccess(result);
      } catch (error) {
        return handleServiceError(error);
      }
    },

    async get(request, rawBusinessId, rawReminderId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      const reminderId = parseId(rawReminderId);
      if (reminderId instanceof Response) return reminderId;

      try {
        const reminder = await service.get(authorized.user, authorized.businessId, reminderId);
        return apiSuccess({ reminder });
      } catch (error) {
        return handleServiceError(error);
      }
    },

    async update(request, rawBusinessId, rawReminderId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      const reminderId = parseId(rawReminderId);
      if (reminderId instanceof Response) return reminderId;

      const body = await readJson(request);
      if (body instanceof Response) return body;

      const parsed = updateReminderSchema.safeParse(body);
      if (!parsed.success) {
        return apiError(
          400,
          "invalid_request",
          "Invalid reminder update.",
          zodFieldErrors(parsed.error.issues),
        );
      }

      try {
        const reminder = await service.update(
          authorized.user,
          authorized.businessId,
          reminderId,
          parsed.data,
        );
        return apiSuccess({ reminder });
      } catch (error) {
        return handleServiceError(error);
      }
    },

    async markWhatsappOpened(request, rawBusinessId, rawReminderId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      const reminderId = parseId(rawReminderId);
      if (reminderId instanceof Response) return reminderId;

      try {
        const reminder = await service.markWhatsappOpened(
          authorized.user,
          authorized.businessId,
          reminderId,
        );
        return apiSuccess({ reminder });
      } catch (error) {
        return handleServiceError(error);
      }
    },

    async markSent(request, rawBusinessId, rawReminderId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      const reminderId = parseId(rawReminderId);
      if (reminderId instanceof Response) return reminderId;

      try {
        const reminder = await service.markSent(authorized.user, authorized.businessId, reminderId);
        return apiSuccess({ reminder });
      } catch (error) {
        return handleServiceError(error);
      }
    },
  };
}
