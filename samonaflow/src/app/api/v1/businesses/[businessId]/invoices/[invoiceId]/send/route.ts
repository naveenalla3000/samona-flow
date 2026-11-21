import type { NextRequest } from "next/server";
import { invoiceApi } from "@/server/controllers/invoice-api";

type RouteContext = { params: Promise<{ businessId: string; invoiceId: string }> };

/** POST /api/v1/businesses/:businessId/invoices/:invoiceId/send — DRAFT -> SENT. */
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId, invoiceId } = await context.params;
  return invoiceApi.send(request, businessId, invoiceId);
}
