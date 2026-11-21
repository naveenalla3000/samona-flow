import type { NextRequest } from "next/server";
import { paymentApi } from "@/server/controllers/payment-api";

type RouteContext = { params: Promise<{ businessId: string; paymentId: string }> };

/** GET /api/v1/businesses/:businessId/payments/:paymentId — payment detail. */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId, paymentId } = await context.params;
  return paymentApi.get(request, businessId, paymentId);
}
