import type { NextRequest } from "next/server";
import { customerApi } from "@/server/controllers/customer-api";

type RouteContext = { params: Promise<{ businessId: string; customerId: string }> };

/** GET /api/v1/businesses/:businessId/customers/:customerId — full profile. */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId, customerId } = await context.params;
  return customerApi.get(request, businessId, customerId);
}

/** PATCH /api/v1/businesses/:businessId/customers/:customerId — edit details. */
export async function PATCH(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId, customerId } = await context.params;
  return customerApi.update(request, businessId, customerId);
}
