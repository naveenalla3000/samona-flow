import type { NextRequest } from "next/server";
import { customerApi } from "@/server/controllers/customer-api";

type RouteContext = { params: Promise<{ businessId: string }> };

/** POST /api/v1/businesses/:businessId/customers — create a customer. */
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId } = await context.params;
  return customerApi.create(request, businessId);
}

/** GET /api/v1/businesses/:businessId/customers — paginated, searchable list. */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId } = await context.params;
  return customerApi.list(request, businessId);
}
