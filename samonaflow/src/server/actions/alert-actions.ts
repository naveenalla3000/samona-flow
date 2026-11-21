"use server";

// Server Actions backing the Smart Alerts UI. Identity and businessId are always
// resolved server-side; the same authorization service used by the REST API
// guards every mutation. Evaluation is an explicit user action, never a
// background job.
import { revalidatePath } from "next/cache";
import { alertIdSchema } from "@/lib/validations/alert";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { requireUser } from "@/server/auth/require-auth";
import { AlertServiceError, alertService } from "@/server/services/alert-service";

export type AlertActionState = {
  ok: boolean;
  message: string;
};

const NO_BUSINESS: AlertActionState = {
  ok: false,
  message: "No business is associated with your account yet.",
};

function actionError(error: unknown): AlertActionState {
  if (error instanceof AlertServiceError) {
    return { ok: false, message: error.message };
  }
  return { ok: false, message: "Something went wrong. Please try again." };
}

function revalidateAlert(alertId?: string): void {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/alerts");
  if (alertId) revalidatePath(`/dashboard/alerts/${alertId}`);
}

export async function evaluateAlertsAction(): Promise<AlertActionState> {
  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  if (!business.ok) return NO_BUSINESS;

  try {
    const result = await alertService.evaluate(user, business.businessId);
    revalidateAlert();
    const changes = result.created + result.updated + result.resolved;
    return {
      ok: true,
      message:
        changes === 0
          ? `No alert changes. ${result.unchanged} active alert${
              result.unchanged === 1 ? "" : "s"
            } unchanged.`
          : `Evaluation complete: ${result.created} new, ${result.updated} updated, ${result.resolved} resolved.`,
    };
  } catch (error) {
    return actionError(error);
  }
}

async function requireAlertId(
  alertId: string,
): Promise<{ ok: true; alertId: string } | { ok: false; state: AlertActionState }> {
  const parsed = alertIdSchema.safeParse(alertId);
  if (!parsed.success) {
    return { ok: false, state: { ok: false, message: "Invalid alert." } };
  }
  return { ok: true, alertId: parsed.data };
}

export async function markAlertReadAction(alertId: string): Promise<AlertActionState> {
  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  if (!business.ok) return NO_BUSINESS;

  const id = await requireAlertId(alertId);
  if (!id.ok) return id.state;

  try {
    await alertService.markRead(user, business.businessId, id.alertId);
    revalidateAlert(id.alertId);
    return { ok: true, message: "Alert marked as read." };
  } catch (error) {
    return actionError(error);
  }
}

export async function markAlertUnreadAction(alertId: string): Promise<AlertActionState> {
  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  if (!business.ok) return NO_BUSINESS;

  const id = await requireAlertId(alertId);
  if (!id.ok) return id.state;

  try {
    await alertService.markUnread(user, business.businessId, id.alertId);
    revalidateAlert(id.alertId);
    return { ok: true, message: "Alert marked as unread." };
  } catch (error) {
    return actionError(error);
  }
}

export async function dismissAlertAction(alertId: string): Promise<AlertActionState> {
  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  if (!business.ok) return NO_BUSINESS;

  const id = await requireAlertId(alertId);
  if (!id.ok) return id.state;

  try {
    await alertService.dismiss(user, business.businessId, id.alertId);
    revalidateAlert(id.alertId);
    return { ok: true, message: "Alert dismissed." };
  } catch (error) {
    return actionError(error);
  }
}
