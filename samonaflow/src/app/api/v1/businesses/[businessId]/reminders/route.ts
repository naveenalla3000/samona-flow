import type { NextRequest } from "next/server";
import { reminderApi } from "@/server/controllers/reminder-api";

type RouteContext = { params: Promise<{ businessId: string }> };

/** POST /api/v1/businesses/:businessId/reminders — generate a reminder (201). */
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId } = await context.params;
  return reminderApi.create(request, businessId);
}

/** GET /api/v1/businesses/:businessId/reminders — searchable, filtered list. */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId } = await context.params;
  return reminderApi.list(request, businessId);
}
