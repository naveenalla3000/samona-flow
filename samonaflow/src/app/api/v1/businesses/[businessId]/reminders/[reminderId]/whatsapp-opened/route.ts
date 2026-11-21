import type { NextRequest } from "next/server";
import { reminderApi } from "@/server/controllers/reminder-api";

type RouteContext = { params: Promise<{ businessId: string; reminderId: string }> };

/**
 * POST /api/v1/businesses/:businessId/reminders/:reminderId/whatsapp-opened
 * Records that the owner opened the click-to-chat link. This is NOT delivery.
 */
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const { businessId, reminderId } = await context.params;
  return reminderApi.markWhatsappOpened(request, businessId, reminderId);
}
