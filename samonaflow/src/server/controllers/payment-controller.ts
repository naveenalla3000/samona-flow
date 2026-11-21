// Route-handler-agnostic controller for the Payment REST API. It owns request
// parsing/validation and maps service results to consistent JSON responses.
// Dependencies are injected so the HTTP surface can be tested with node:test
// without a database or a Supabase session.
import {
  businessIdSchema,
  createPaymentSchema,
  invoiceIdSchema,
  listPaymentsQuerySchema,
  paymentIdSchema,
  reversePaymentSchema,
} from "@/lib/validations/payment";
import type { ListPaymentsQuery } from "@/lib/validations/payment";
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import {
  PaymentServiceError,
  type PaymentService,
} from "@/server/services/payment-service";
import { apiError, apiSuccess, zodFieldErrors } from "@/server/utils/api-response";

export type AuthResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; response: Response };

export type Authenticate = (request: Request) => Promise<AuthResult>;

export interface PaymentController {
  create(request: Request, businessId: string): Promise<Response>;
  list(request: Request, businessId: string): Promise<Response>;
  listForInvoice(request: Request, businessId: string, invoiceId: string): Promise<Response>;
  get(request: Request, businessId: string, paymentId: string): Promise<Response>;
  reverse(request: Request, businessId: string, paymentId: string): Promise<Response>;
}

type Authorization =
  | { ok: false; response: Response }
  | { ok: true; user: AuthenticatedUser; businessId: string };

function handleServiceError(error: unknown): Response {
  if (error instanceof PaymentServiceError) {
    switch (error.code) {
      case "BUSINESS_FORBIDDEN":
        return apiError(403, "business_forbidden", error.message);
      case "INVOICE_NOT_FOUND":
        return apiError(404, "invoice_not_found", error.message);
      case "PAYMENT_NOT_FOUND":
        return apiError(404, "payment_not_found", error.message);
      case "PAYMENT_EXCEEDS_OUTSTANDING":
        return apiError(422, "payment_exceeds_outstanding", error.message);
      case "PAYMENT_ALREADY_REVERSED":
        return apiError(409, "payment_already_reversed", error.message);
      case "INVOICE_LOCKED":
        return apiError(422, "invoice_locked", error.message);
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

function parseQuery(request: Request):
  | { ok: true; value: ListPaymentsQuery }
  | { ok: false; response: Response } {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = listPaymentsQuerySchema.safeParse(params);
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

export function createPaymentController(dependencies: {
  authenticate: Authenticate;
  service: PaymentService;
}): PaymentController {
  const { authenticate, service } = dependencies;

  async function authorize(request: Request, rawBusinessId: string): Promise<Authorization> {
    const auth = await authenticate(request);
    if (!auth.ok) return { ok: false, response: auth.response };

    const businessId = businessIdSchema.safeParse(rawBusinessId);
    if (!businessId.success) return { ok: false, response: invalidId("businessId") };

    return { ok: true, user: auth.user, businessId: businessId.data };
  }

  function parseId(raw: string, field: "invoiceId" | "paymentId"): Response | string {
    const schema = field === "invoiceId" ? invoiceIdSchema : paymentIdSchema;
    const parsed = schema.safeParse(raw);
    return parsed.success ? parsed.data : invalidId(field);
  }

  return {
    async create(request, rawBusinessId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      const body = await readJson(request);
      if (body instanceof Response) return body;

      const parsed = createPaymentSchema.safeParse(body);
      if (!parsed.success) {
        return apiError(
          400,
          "invalid_request",
          "Invalid payment data.",
          zodFieldErrors(parsed.error.issues),
        );
      }

      try {
        const payment = await service.create(authorized.user, authorized.businessId, parsed.data);
        return apiSuccess({ payment }, 201);
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

    async listForInvoice(request, rawBusinessId, rawInvoiceId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      const invoiceId = parseId(rawInvoiceId, "invoiceId");
      if (invoiceId instanceof Response) return invoiceId;

      const query = parseQuery(request);
      if (!query.ok) return query.response;

      try {
        const result = await service.listForInvoice(
          authorized.user,
          authorized.businessId,
          invoiceId,
          query.value,
        );
        return apiSuccess(result);
      } catch (error) {
        return handleServiceError(error);
      }
    },

    async get(request, rawBusinessId, rawPaymentId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      const paymentId = parseId(rawPaymentId, "paymentId");
      if (paymentId instanceof Response) return paymentId;

      try {
        const payment = await service.get(authorized.user, authorized.businessId, paymentId);
        return apiSuccess({ payment });
      } catch (error) {
        return handleServiceError(error);
      }
    },

    async reverse(request, rawBusinessId, rawPaymentId) {
      const authorized = await authorize(request, rawBusinessId);
      if (!authorized.ok) return authorized.response;

      const paymentId = parseId(rawPaymentId, "paymentId");
      if (paymentId instanceof Response) return paymentId;

      const body = await readJson(request);
      if (body instanceof Response) return body;

      const parsed = reversePaymentSchema.safeParse(body);
      if (!parsed.success) {
        return apiError(
          400,
          "invalid_request",
          "A reversal reason is required.",
          zodFieldErrors(parsed.error.issues),
        );
      }

      try {
        const payment = await service.reverse(
          authorized.user,
          authorized.businessId,
          paymentId,
          parsed.data,
        );
        return apiSuccess({ payment });
      } catch (error) {
        return handleServiceError(error);
      }
    },
  };
}
