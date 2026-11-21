// Route-handler-agnostic controller for the Invoice REST API. It owns request
// parsing/validation and maps service results to consistent JSON responses.
// Dependencies are injected so the HTTP surface can be tested with node:test
// without a database or a Supabase session.
import {
  businessIdSchema,
  createInvoiceSchema,
  invoiceIdSchema,
  listInvoicesQuerySchema,
  updateInvoiceSchema,
} from "@/lib/validations/invoice";
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import {
  InvoiceServiceError,
  type InvoiceService,
} from "@/server/services/invoice-service";
import { apiError, apiSuccess, zodFieldErrors } from "@/server/utils/api-response";

export type AuthResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; response: Response };

export type Authenticate = (request: Request) => Promise<AuthResult>;

export interface InvoiceController {
  create(request: Request, businessId: string): Promise<Response>;
  list(request: Request, businessId: string): Promise<Response>;
  get(request: Request, businessId: string, invoiceId: string): Promise<Response>;
  update(request: Request, businessId: string, invoiceId: string): Promise<Response>;
  send(request: Request, businessId: string, invoiceId: string): Promise<Response>;
  void(request: Request, businessId: string, invoiceId: string): Promise<Response>;
}

type Authorization =
  | { ok: false; response: Response }
  | { ok: true; user: AuthenticatedUser; businessId: string };

function handleServiceError(error: unknown): Response {
  if (error instanceof InvoiceServiceError) {
    switch (error.code) {
      case "BUSINESS_FORBIDDEN":
        return apiError(403, "business_forbidden", error.message);
      case "CUSTOMER_NOT_FOUND":
        return apiError(404, "customer_not_found", error.message);
      case "INVOICE_NOT_FOUND":
        return apiError(404, "invoice_not_found", error.message);
      case "INVALID_INPUT":
      case "INVALID_AMOUNTS":
        return apiError(400, "invalid_request", error.message);
      case "INVOICE_LOCKED":
        return apiError(422, "invoice_locked", error.message);
      case "INVALID_TRANSITION":
        return apiError(422, "invalid_transition", error.message);
      case "CONFLICT":
        return apiError(409, "conflict", error.message);
    }
  }
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

export function createInvoiceController(dependencies: {
  authenticate: Authenticate;
  service: InvoiceService;
}): InvoiceController {
  const { authenticate, service } = dependencies;

  async function authorize(request: Request, rawBusinessId: string): Promise<Authorization> {
    const auth = await authenticate(request);
    if (!auth.ok) return { ok: false, response: auth.response };

    const businessId = businessIdSchema.safeParse(rawBusinessId);
    if (!businessId.success) return { ok: false, response: invalidId("businessId") };

    return { ok: true, user: auth.user, businessId: businessId.data };
  }

  function parseInvoiceId(rawInvoiceId: string): Response | string {
    const parsed = invoiceIdSchema.safeParse(rawInvoiceId);
    return parsed.success ? parsed.data : invalidId("invoiceId");
  }

  return {
    async create(request, rawBusinessId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      const body = await readJson(request);
      if (body instanceof Response) return body;

      const parsed = createInvoiceSchema.safeParse(body);
      if (!parsed.success) {
        return apiError(
          400,
          "invalid_request",
          "Invalid invoice data.",
          zodFieldErrors(parsed.error.issues),
        );
      }

      try {
        const invoice = await service.create(authorized.user, authorized.businessId, parsed.data);
        return apiSuccess({ invoice }, 201);
      } catch (error) {
        return handleServiceError(error);
      }
    },

    async list(request, rawBusinessId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      const params = Object.fromEntries(new URL(request.url).searchParams.entries());
      const parsed = listInvoicesQuerySchema.safeParse(params);
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

    async get(request, rawBusinessId, rawInvoiceId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      const invoiceId = parseInvoiceId(rawInvoiceId);
      if (invoiceId instanceof Response) return invoiceId;

      try {
        const invoice = await service.get(authorized.user, authorized.businessId, invoiceId);
        return apiSuccess({ invoice });
      } catch (error) {
        return handleServiceError(error);
      }
    },

    async update(request, rawBusinessId, rawInvoiceId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      const invoiceId = parseInvoiceId(rawInvoiceId);
      if (invoiceId instanceof Response) return invoiceId;

      const body = await readJson(request);
      if (body instanceof Response) return body;

      const parsed = updateInvoiceSchema.safeParse(body);
      if (!parsed.success) {
        return apiError(
          400,
          "invalid_request",
          "Invalid invoice data.",
          zodFieldErrors(parsed.error.issues),
        );
      }

      try {
        const invoice = await service.update(
          authorized.user,
          authorized.businessId,
          invoiceId,
          parsed.data,
        );
        return apiSuccess({ invoice });
      } catch (error) {
        return handleServiceError(error);
      }
    },

    async send(request, rawBusinessId, rawInvoiceId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      const invoiceId = parseInvoiceId(rawInvoiceId);
      if (invoiceId instanceof Response) return invoiceId;

      try {
        const invoice = await service.send(authorized.user, authorized.businessId, invoiceId);
        return apiSuccess({ invoice });
      } catch (error) {
        return handleServiceError(error);
      }
    },

    async void(request, rawBusinessId, rawInvoiceId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      const invoiceId = parseInvoiceId(rawInvoiceId);
      if (invoiceId instanceof Response) return invoiceId;

      try {
        const invoice = await service.void(authorized.user, authorized.businessId, invoiceId);
        return apiSuccess({ invoice });
      } catch (error) {
        return handleServiceError(error);
      }
    },
  };
}
