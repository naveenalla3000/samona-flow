import type { NextRequest } from "next/server";
import { paymentApi } from "@/server/controllers/payment-api";

type RouteContext = { params: Promise<{ businessId: string }> };

/** POST /api/v1/businesses/:businessId/payments — record a payment. */
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId } = await context.params;
  return paymentApi.create(request, businessId);
}

/** GET /api/v1/businesses/:businessId/payments — business-level payment history. */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId } = await context.params;
  return paymentApi.list(request, businessId);
}
