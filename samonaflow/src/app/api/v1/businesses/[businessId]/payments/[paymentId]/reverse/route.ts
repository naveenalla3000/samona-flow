import type { NextRequest } from "next/server";
import { paymentApi } from "@/server/controllers/payment-api";

type RouteContext = { params: Promise<{ businessId: string; paymentId: string }> };

/** POST /api/v1/businesses/:businessId/payments/:paymentId/reverse — append a reversal. */
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId, paymentId } = await context.params;
  return paymentApi.reverse(request, businessId, paymentId);
}
