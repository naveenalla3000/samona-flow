import type { NextRequest } from "next/server";
import { expenseApi } from "@/server/controllers/expense-api";

type RouteContext = { params: Promise<{ businessId: string; expenseId: string }> };

/** GET /api/v1/businesses/:businessId/expenses/:expenseId — expense detail. */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId, expenseId } = await context.params;
  return expenseApi.get(request, businessId, expenseId);
}

/** PATCH /api/v1/businesses/:businessId/expenses/:expenseId — edit an upcoming expense. */
export async function PATCH(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId, expenseId } = await context.params;
  return expenseApi.update(request, businessId, expenseId);
}
