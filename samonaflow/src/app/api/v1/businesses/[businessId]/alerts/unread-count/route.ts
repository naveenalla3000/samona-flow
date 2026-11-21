import type { NextRequest } from "next/server";
import { alertApi } from "@/server/controllers/alert-api";

type RouteContext = { params: Promise<{ businessId: string }> };

/** GET /api/v1/businesses/:businessId/alerts/unread-count — active unread count. */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId } = await context.params;
  return alertApi.unreadCount(request, businessId);
}
