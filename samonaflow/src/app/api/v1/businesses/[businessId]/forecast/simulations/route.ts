import type { NextRequest } from "next/server";
import { forecastSimulationApi } from "@/server/controllers/forecast-simulation-api";

type RouteContext = { params: Promise<{ businessId: string }> };

/**
 * POST /api/v1/businesses/:businessId/forecast/simulations
 *
 * Calculates a hypothetical 30, 60 or 90-day scenario. Simulations are
 * session-only by design (the PRD and database design describe what-if
 * scenarios as derived/temporary), so there is no persistence endpoint.
 */
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId } = await context.params;
  return forecastSimulationApi.create(request, businessId);
}
