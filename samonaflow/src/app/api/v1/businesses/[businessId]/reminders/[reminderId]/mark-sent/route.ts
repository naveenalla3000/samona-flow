import type { NextRequest } from "next/server";
import { reminderApi } from "@/server/controllers/reminder-api";

type RouteContext = { params: Promise<{ businessId: string; reminderId: string }> };

/**
 * POST /api/v1/businesses/:businessId/reminders/:reminderId/mark-sent
 * Owner manually confirms the reminder was sent. Idempotent.
 */
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId, reminderId } = await context.params;
  return reminderApi.markSent(request, businessId, reminderId);
}
