// Route-handler-agnostic controller for the Customer REST API.
//
// It owns request parsing/validation and maps service results to consistent
// JSON responses. Dependencies are injected so the whole HTTP surface can be
// exercised with node:test without a database or a Supabase session.
import {
  businessIdSchema,
  createCustomerSchema,
  customerIdSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from "@/lib/validations/customer";
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import {
  CustomerServiceError,
  type CustomerService,
} from "@/server/services/customer-service";
import { apiError, apiSuccess, zodFieldErrors } from "@/server/utils/api-response";

export type AuthResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; response: Response };

export type Authenticate = (request: Request) => Promise<AuthResult>;

export interface CustomerController {
  create(request: Request, businessId: string): Promise<Response>;
  list(request: Request, businessId: string): Promise<Response>;
  get(request: Request, businessId: string, customerId: string): Promise<Response>;
  update(request: Request, businessId: string, customerId: string): Promise<Response>;
  archive(request: Request, businessId: string, customerId: string): Promise<Response>;
}

type Authorization =
  | { ok: false; response: Response }
  | { ok: true; user: AuthenticatedUser; businessId: string };

function handleServiceError(error: unknown): Response {
  if (error instanceof CustomerServiceError) {
    switch (error.code) {
      case "BUSINESS_FORBIDDEN":
        return apiError(403, "business_forbidden", error.message);
      case "CUSTOMER_NOT_FOUND":
        return apiError(404, "customer_not_found", error.message);
    }
  }
  // Never leak internal error details to clients.
  return apiError(500, "internal_error", "An unexpected error occurred.");
}

function invalidId(field: string): Response {
  return apiError(400, "invalid_request", "Invalid identifier.", {
    [field]: "Invalid identifier.",
  });
}

export function createCustomerController(dependencies: {
  authenticate: Authenticate;
  service: CustomerService;
}): CustomerController {
  const { authenticate, service } = dependencies;

  async function authorize(request: Request, rawBusinessId: string): Promise<Authorization> {
    const auth = await authenticate(request);
    if (!auth.ok) return { ok: false, response: auth.response };

    const businessId = businessIdSchema.safeParse(rawBusinessId);
    if (!businessId.success) return { ok: false, response: invalidId("businessId") };

    return { ok: true, user: auth.user, businessId: businessId.data };
  }

  return {
    async create(request, rawBusinessId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return apiError(400, "invalid_request", "Request body must be valid JSON.");
      }

      const parsed = createCustomerSchema.safeParse(body);
      if (!parsed.success) {
        return apiError(
          400,
          "invalid_request",
          "Invalid customer data.",
          zodFieldErrors(parsed.error.issues),
        );
      }

      try {
        const customer = await service.create(authorized.user, authorized.businessId, parsed.data);
        return apiSuccess({ customer }, 201);
      } catch (error) {
        return handleServiceError(error);
      }
    },

    async list(request, rawBusinessId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      const params = Object.fromEntries(new URL(request.url).searchParams.entries());
      const parsed = listCustomersQuerySchema.safeParse(params);
      if (!parsed.success) {
        return apiError(
          400,
          "invalid_request",
          "Invalid list query.",
          zodFieldErrors(parsed.error.issues),
        );
      }

      try {
        const result = await service.list(authorized.user, authorized.businessId, parsed.data);
        return apiSuccess(result);
      } catch (error) {
        return handleServiceError(error);
      }
    },

    async get(request, rawBusinessId, rawCustomerId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      const customerId = customerIdSchema.safeParse(rawCustomerId);
      if (!customerId.success) return invalidId("customerId");

      try {
        const customer = await service.get(authorized.user, authorized.businessId, customerId.data);
        return apiSuccess({ customer });
      } catch (error) {
        return handleServiceError(error);
      }
    },

    async update(request, rawBusinessId, rawCustomerId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      const customerId = customerIdSchema.safeParse(rawCustomerId);
      if (!customerId.success) return invalidId("customerId");

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return apiError(400, "invalid_request", "Request body must be valid JSON.");
      }

      const parsed = updateCustomerSchema.safeParse(body);
      if (!parsed.success) {
        return apiError(
          400,
          "invalid_request",
          "Invalid customer data.",
          zodFieldErrors(parsed.error.issues),
        );
      }

      try {
        const customer = await service.update(
          authorized.user,
          authorized.businessId,
          customerId.data,
          parsed.data,
        );
        return apiSuccess({ customer });
      } catch (error) {
        return handleServiceError(error);
      }
    },

    async archive(request, rawBusinessId, rawCustomerId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      const customerId = customerIdSchema.safeParse(rawCustomerId);
      if (!customerId.success) return invalidId("customerId");

      try {
        const customer = await service.archive(
          authorized.user,
          authorized.businessId,
          customerId.data,
        );
        return apiSuccess({ customer });
      } catch (error) {
        return handleServiceError(error);
      }
    },
  };
}
