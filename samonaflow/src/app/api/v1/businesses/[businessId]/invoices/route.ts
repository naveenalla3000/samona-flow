import type { NextRequest } from "next/server";
import { invoiceApi } from "@/server/controllers/invoice-api";

type RouteContext = { params: Promise<{ businessId: string }> };

/** POST /api/v1/businesses/:businessId/invoices — create a draft invoice. */
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId } = await context.params;
  return invoiceApi.create(request, businessId);
}

/** GET /api/v1/businesses/:businessId/invoices — paginated, searchable list. */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId } = await context.params;
  return invoiceApi.list(request, businessId);
}
