// Shared JSON helpers for API Route Handlers. Uses the platform Response API
// so controllers stay testable with node:test and do not depend on Next.js.

const NO_STORE = { "Cache-Control": "no-store" } as const;

export type ApiErrorCode =
  | "invalid_request"
  | "business_forbidden"
  | "customer_not_found"
  | "expense_not_found"
  | "invoice_not_found"
  | "payment_not_found"
  | "reminder_not_found"
  | "invalid_reminder_context"
  | "payment_exceeds_outstanding"
  | "payment_already_reversed"
  | "invalid_transition"
  | "invoice_locked"
  | "conflict"
  | "unauthenticated"
  | "internal_error";

export type FieldErrors = Record<string, string>;

export function apiSuccess<T>(data: T, status = 200): Response {
  return Response.json({ success: true, data }, { status, headers: NO_STORE });
}

export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  fieldErrors?: FieldErrors,
): Response {
  return Response.json(
    {
      success: false,
      error: {
        code,
        message,
        ...(fieldErrors ? { fieldErrors } : {}),
      },
    },
    { status, headers: NO_STORE },
  );
}

export function zodFieldErrors(issues: { path: PropertyKey[]; message: string }[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}
