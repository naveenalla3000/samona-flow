import type { NextRequest } from "next/server";
import { dashboardApi } from "@/server/controllers/dashboard-api";

type RouteContext = { params: Promise<{ businessId: string }> };

/** GET /api/v1/businesses/:businessId/dashboard/recent-activity — latest invoices and payments. */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId } = await context.params;
  return dashboardApi.recentActivity(request, businessId);
}
