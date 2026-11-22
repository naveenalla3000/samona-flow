import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { AlertLifecycleActions } from "@/components/alerts/alert-actions";
import {
  AlertLoadError,
  AlertSeverityBadge,
  AlertStatusBadge,
  AlertsHeader,
  formatAlertTimestamp,
  NoBusinessState,
  UnreadIndicator,
} from "@/components/alerts/alert-layout";
import { ALERT_TYPE_LABELS } from "@/lib/alert-rules";
import { alertIdSchema } from "@/lib/validations/alert";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { requireUser } from "@/server/auth/require-auth";
import { AlertServiceError, alertService } from "@/server/services/alert-service";
import type { AlertDetail } from "@/types/alert";

export const metadata = { title: "Alert" };

export const instant = false;

const ACTION_LINK_CLASS =
  "rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:border-neutral-700 dark:hover:bg-neutral-800";

export default async function AlertDetailPage({
  params,
}: {
  params: Promise<{ alertId: string }>;
}) {
  await connection();
  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  if (!business.ok) return <NoBusinessState />;

  const { alertId: rawId } = await params;
  const parsedId = alertIdSchema.safeParse(rawId);
  if (!parsedId.success) notFound();

  let alert: AlertDetail;
  try {
    alert = await alertService.get(user, business.businessId, parsedId.data);
  } catch (error) {
    if (error instanceof AlertServiceError && error.code === "ALERT_NOT_FOUND") notFound();
    return <AlertLoadError />;
  }

  const related = alert.relatedEntity;
  const invoiceId = related?.type === "INVOICE" ? related.id : null;
  const expenseId = related?.type === "EXPENSE" ? related.id : null;
  const customerId = related?.type === "CUSTOMER" ? related.id : null;

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <AlertsHeader
        title={alert.title}
        subtitle={`${ALERT_TYPE_LABELS[alert.type]} · created ${formatAlertTimestamp(
          alert.createdAt,
        )}`}
        action={
          <Link href="/dashboard/alerts" className={ACTION_LINK_CLASS}>
            All alerts
          </Link>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <AlertSeverityBadge severity={alert.severity} />
        <AlertStatusBadge status={alert.status} />
        <UnreadIndicator isRead={alert.isRead} />
        <span className="text-sm text-neutral-500">
          {alert.isRead ? "Read" : "Unread"}
        </span>
      </div>

      <section
        aria-labelledby="alert-description"
        className="mt-6 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
      >
        <h2 id="alert-description" className="text-sm font-semibold">
          What happened
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          {alert.description}
        </p>
      </section>

      <section
        aria-labelledby="alert-recommendation"
        className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <h2 id="alert-recommendation" className="text-sm font-semibold">
          Recommended action
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          {alert.recommendedAction}
        </p>
      </section>

      {related ? (
        <section
          aria-labelledby="alert-related"
          className="mt-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
        >
          <h2 id="alert-related" className="text-sm font-semibold">
            Related record
          </h2>
          <Link href={related.href} className="mt-2 inline-block text-sm font-medium underline">
            {related.label}
          </Link>
          {related.summary ? (
            <p className="mt-1 text-sm text-neutral-500">{related.summary}</p>
          ) : null}
        </section>
      ) : (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          The related record is no longer available in this business. The alert is
          kept as history; the recommended action may no longer apply.
        </p>
      )}

      <section aria-labelledby="alert-next-actions" className="mt-6">
        <h2 id="alert-next-actions" className="text-sm font-semibold">
          Next actions
        </h2>
        <div className="mt-3 flex flex-wrap gap-3">
          {invoiceId ? (
            <>
              <Link href={`/dashboard/invoices/${invoiceId}`} className={ACTION_LINK_CLASS}>
                View invoice
              </Link>
              <Link
                href={`/dashboard/reminders/new?invoiceId=${encodeURIComponent(invoiceId)}`}
                className={ACTION_LINK_CLASS}
              >
                Send reminder
              </Link>
              {alert.type === "OVERDUE_PAYMENT" ? (
                <Link
                  href={`/dashboard/reminders?invoiceId=${encodeURIComponent(invoiceId)}`}
                  className={ACTION_LINK_CLASS}
                >
                  Prepare follow-up
                </Link>
              ) : null}
            </>
          ) : null}
          {expenseId ? (
            <Link href={`/dashboard/expenses/${expenseId}`} className={ACTION_LINK_CLASS}>
              View expense
            </Link>
          ) : null}
          {customerId ? (
            <Link href={`/dashboard/customers/${customerId}`} className={ACTION_LINK_CLASS}>
              Review customer exposure
            </Link>
          ) : null}
          {related?.type === "FORECAST" ? (
            <Link href="/dashboard/forecast" className={ACTION_LINK_CLASS}>
              Open forecast
            </Link>
          ) : null}
          {!invoiceId && !expenseId && !customerId && related?.type !== "FORECAST" ? (
            <p className="text-sm text-neutral-500">
              No contextual action is available for this alert.
            </p>
          ) : null}
        </div>
      </section>

      <div className="mt-6">
        <AlertLifecycleActions alert={alert} />
      </div>

      <p className="mt-6 text-xs text-neutral-500">
        Alerts are deterministic and recalculated only when you run an
        evaluation. They are not financial predictions or automatic
        notifications.
      </p>
    </main>
  );
}
