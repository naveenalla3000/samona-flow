import type { NextRequest } from "next/server";
import { reminderApi } from "@/server/controllers/reminder-api";

type RouteContext = { params: Promise<{ businessId: string; reminderId: string }> };

/** GET /api/v1/businesses/:businessId/reminders/:reminderId — reminder detail. */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId, reminderId } = await context.params;
  return reminderApi.get(request, businessId, reminderId);
}

/** PATCH /api/v1/businesses/:businessId/reminders/:reminderId — edit/reschedule. */
export async function PATCH(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId, reminderId } = await context.params;
  return reminderApi.update(request, businessId, reminderId);
}
