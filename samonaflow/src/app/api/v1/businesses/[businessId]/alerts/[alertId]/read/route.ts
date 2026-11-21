import type { NextRequest } from "next/server";
import { alertApi } from "@/server/controllers/alert-api";

type RouteContext = { params: Promise<{ businessId: string; alertId: string }> };

/** PATCH /api/v1/businesses/:businessId/alerts/:alertId/read — mark read (idempotent). */
export async function PATCH(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId, alertId } = await context.params;
  return alertApi.markRead(request, businessId, alertId);
}
