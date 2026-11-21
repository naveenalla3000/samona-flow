import type { NextRequest } from "next/server";
import { customerApi } from "@/server/controllers/customer-api";

type RouteContext = { params: Promise<{ businessId: string; customerId: string }> };

/**
 * PATCH /api/v1/businesses/:businessId/customers/:customerId/archive
 * Sets archivedAt only. Financial history is preserved; there is no delete.
 */
export async function PATCH(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId, customerId } = await context.params;
  return customerApi.archive(request, businessId, customerId);
}
