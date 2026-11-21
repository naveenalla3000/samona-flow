import type { NextRequest } from "next/server";
import { paymentApi } from "@/server/controllers/payment-api";

type RouteContext = { params: Promise<{ businessId: string; invoiceId: string }> };

/** GET /api/v1/businesses/:businessId/invoices/:invoiceId/payments — invoice history. */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId, invoiceId } = await context.params;
  return paymentApi.listForInvoice(request, businessId, invoiceId);
}
