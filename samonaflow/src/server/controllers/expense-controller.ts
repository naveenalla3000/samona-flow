// Route-handler-agnostic controller for the Expense REST API. It owns request
// parsing/validation and maps service results to consistent JSON responses.
// Dependencies are injected so the whole HTTP surface can be tested with
// node:test without a database or a Supabase session.
import {
  businessIdSchema,
  createExpenseSchema,
  expenseIdSchema,
  listExpensesQuerySchema,
  payExpenseSchema,
  updateExpenseSchema,
} from "@/lib/validations/expense";
import type { ListExpensesQuery } from "@/lib/validations/expense";
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import {
  ExpenseServiceError,
  type ExpenseService,
} from "@/server/services/expense-service";
import { apiError, apiSuccess, zodFieldErrors } from "@/server/utils/api-response";

export type AuthResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; response: Response };

export type Authenticate = (request: Request) => Promise<AuthResult>;

export interface ExpenseController {
  create(request: Request, businessId: string): Promise<Response>;
  list(request: Request, businessId: string): Promise<Response>;
  get(request: Request, businessId: string, expenseId: string): Promise<Response>;
  update(request: Request, businessId: string, expenseId: string): Promise<Response>;
  markPaid(request: Request, businessId: string, expenseId: string): Promise<Response>;
  cancel(request: Request, businessId: string, expenseId: string): Promise<Response>;
}

type Authorization =
  | { ok: false; response: Response }
  | { ok: true; user: AuthenticatedUser; businessId: string };

function handleServiceError(error: unknown): Response {
  if (error instanceof ExpenseServiceError) {
    switch (error.code) {
      case "BUSINESS_FORBIDDEN":
        return apiError(403, "business_forbidden", error.message);
      case "EXPENSE_NOT_FOUND":
        return apiError(404, "expense_not_found", error.message);
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
  | { ok: true; value: ListExpensesQuery }
  | { ok: false; response: Response } {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = listExpensesQuerySchema.safeParse(params);
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

export function createExpenseController(dependencies: {
  authenticate: Authenticate;
  service: ExpenseService;
}): ExpenseController {
  const { authenticate, service } = dependencies;

  async function authorize(request: Request, rawBusinessId: string): Promise<Authorization> {
    const auth = await authenticate(request);
    if (!auth.ok) return { ok: false, response: auth.response };

    const businessId = businessIdSchema.safeParse(rawBusinessId);
    if (!businessId.success) return { ok: false, response: invalidId("businessId") };

    return { ok: true, user: auth.user, businessId: businessId.data };
  }

  function parseId(raw: string): Response | string {
    const parsed = expenseIdSchema.safeParse(raw);
    return parsed.success ? parsed.data : invalidId("expenseId");
  }

  return {
    async create(request, rawBusinessId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      const body = await readJson(request);
      if (body instanceof Response) return body;

      const parsed = createExpenseSchema.safeParse(body);
      if (!parsed.success) {
        return apiError(
          400,
          "invalid_request",
          "Invalid expense data.",
          zodFieldErrors(parsed.error.issues),
        );
      }

      try {
        const expense = await service.create(authorized.user, authorized.businessId, parsed.data);
        return apiSuccess({ expense }, 201);
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

    async get(request, rawBusinessId, rawExpenseId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      const expenseId = parseId(rawExpenseId);
      if (expenseId instanceof Response) return expenseId;

      try {
        const expense = await service.get(authorized.user, authorized.businessId, expenseId);
        return apiSuccess({ expense });
      } catch (error) {
        return handleServiceError(error);
      }
    },

    async update(request, rawBusinessId, rawExpenseId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      const expenseId = parseId(rawExpenseId);
      if (expenseId instanceof Response) return expenseId;

      const body = await readJson(request);
      if (body instanceof Response) return body;

      const parsed = updateExpenseSchema.safeParse(body);
      if (!parsed.success) {
        return apiError(
          400,
          "invalid_request",
          "Invalid expense data.",
          zodFieldErrors(parsed.error.issues),
        );
      }

      try {
        const expense = await service.update(
          authorized.user,
          authorized.businessId,
          expenseId,
          parsed.data,
        );
        return apiSuccess({ expense });
      } catch (error) {
        return handleServiceError(error);
      }
    },

    async markPaid(request, rawBusinessId, rawExpenseId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      const expenseId = parseId(rawExpenseId);
      if (expenseId instanceof Response) return expenseId;

      const body = await readJson(request);
      if (body instanceof Response) return body;

      const parsed = payExpenseSchema.safeParse(body);
      if (!parsed.success) {
        return apiError(
          400,
          "invalid_request",
          "Invalid payment date.",
          zodFieldErrors(parsed.error.issues),
        );
      }

      try {
        const expense = await service.markPaid(
          authorized.user,
          authorized.businessId,
          expenseId,
          parsed.data,
        );
        return apiSuccess({ expense });
      } catch (error) {
        return handleServiceError(error);
      }
    },

    async cancel(request, rawBusinessId, rawExpenseId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      const expenseId = parseId(rawExpenseId);
      if (expenseId instanceof Response) return expenseId;

      try {
        const expense = await service.cancel(authorized.user, authorized.businessId, expenseId);
        return apiSuccess({ expense });
      } catch (error) {
        return handleServiceError(error);
      }
    },
  };
}
