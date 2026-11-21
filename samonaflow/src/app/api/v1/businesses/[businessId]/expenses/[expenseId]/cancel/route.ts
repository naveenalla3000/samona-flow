import type { NextRequest } from "next/server";
import { expenseApi } from "@/server/controllers/expense-api";

type RouteContext = { params: Promise<{ businessId: string; expenseId: string }> };

/** POST /api/v1/businesses/:businessId/expenses/:expenseId/cancel — cancel an upcoming expense. */
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId, expenseId } = await context.params;
  return expenseApi.cancel(request, businessId, expenseId);
}
