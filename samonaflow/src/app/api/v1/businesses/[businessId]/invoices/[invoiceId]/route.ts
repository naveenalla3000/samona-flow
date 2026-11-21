import type { NextRequest } from "next/server";
import { invoiceApi } from "@/server/controllers/invoice-api";

type RouteContext = { params: Promise<{ businessId: string; invoiceId: string }> };

/** GET /api/v1/businesses/:businessId/invoices/:invoiceId — detail and items. */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId, invoiceId } = await context.params;
  return invoiceApi.get(request, businessId, invoiceId);
}

/** PATCH /api/v1/businesses/:businessId/invoices/:invoiceId — draft-only edit. */
export async function PATCH(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId, invoiceId } = await context.params;
  return invoiceApi.update(request, businessId, invoiceId);
}
