import type { NextRequest } from "next/server";
import { alertApi } from "@/server/controllers/alert-api";

type RouteContext = { params: Promise<{ businessId: string; alertId: string }> };

/** GET /api/v1/businesses/:businessId/alerts/:alertId — detail and safe reference. */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId, alertId } = await context.params;
  return alertApi.get(request, businessId, alertId);
}
