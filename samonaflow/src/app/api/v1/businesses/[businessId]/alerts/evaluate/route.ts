import type { NextRequest } from "next/server";
import { alertApi } from "@/server/controllers/alert-api";

type RouteContext = { params: Promise<{ businessId: string }> };

/**
 * POST /api/v1/businesses/:businessId/alerts/evaluate — run deterministic
 * evaluation now. No background job and no client-supplied rule input.
 */
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId } = await context.params;
  return alertApi.evaluate(request, businessId);
}
