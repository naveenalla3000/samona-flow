import type { NextRequest } from "next/server";
import { expenseApi } from "@/server/controllers/expense-api";

type RouteContext = { params: Promise<{ businessId: string }> };

/** POST /api/v1/businesses/:businessId/expenses — create an expense. */
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId } = await context.params;
  return expenseApi.create(request, businessId);
}

/** GET /api/v1/businesses/:businessId/expenses — searchable, filtered list. */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId } = await context.params;
  return expenseApi.list(request, businessId);
}
