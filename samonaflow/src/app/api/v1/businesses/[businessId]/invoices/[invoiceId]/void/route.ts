import type { NextRequest } from "next/server";
import { invoiceApi } from "@/server/controllers/invoice-api";

type RouteContext = { params: Promise<{ businessId: string; invoiceId: string }> };

/**
 * POST /api/v1/businesses/:businessId/invoices/:invoiceId/void
 * SENT / PARTIALLY_PAID / OVERDUE -> VOID. Financial history is preserved.
 */
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId, invoiceId } = await context.params;
  return invoiceApi.void(request, businessId, invoiceId);
}
