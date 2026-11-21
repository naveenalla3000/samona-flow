import type { NextRequest } from "next/server";
import { forecastApi } from "@/server/controllers/forecast-api";

type RouteContext = { params: Promise<{ businessId: string }> };

/** GET /api/v1/businesses/:businessId/forecast/monthly — calendar-month summaries. */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId } = await context.params;
  return forecastApi.monthly(request, businessId);
}
