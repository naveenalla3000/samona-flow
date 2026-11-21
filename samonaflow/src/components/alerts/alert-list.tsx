import Link from "next/link";
import { ALERT_TYPE_LABELS } from "@/lib/alert-rules";
import type { AlertRecord } from "@/types/alert";
import {
  AlertSeverityBadge,
  AlertStatusBadge,
  formatAlertTimestamp,
  SEVERITY_BORDER,
  UnreadIndicator,
} from "./alert-layout";

export function AlertList({
  alerts,
  emptyMessage = "No alerts match these filters.",
}: {
  alerts: AlertRecord[];
  emptyMessage?: string;
}) {
  if (alerts.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {alerts.map((alert) => (
        <li
          key={alert.id}
          className={`rounded-lg border border-l-4 border-neutral-200 p-4 dark:border-neutral-800 ${SEVERITY_BORDER[alert.severity]} ${
            alert.isRead
              ? "bg-white dark:bg-neutral-900"
              : "bg-sky-50/60 dark:bg-sky-950/20"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <AlertSeverityBadge severity={alert.severity} />
                <span className="text-xs text-neutral-500">
                  {ALERT_TYPE_LABELS[alert.type]}
                </span>
                <UnreadIndicator isRead={alert.isRead} />
                {alert.status !== "ACTIVE" ? (
                  <AlertStatusBadge status={alert.status} />
                ) : null}
              </div>
              <h2 className={`mt-2 text-base ${alert.isRead ? "font-medium" : "font-semibold"}`}>
                <Link href={`/dashboard/alerts/${alert.id}`} className="hover:underline">
                  {alert.title}
                </Link>
              </h2>
              <p className="mt-1 line-clamp-2 text-sm text-neutral-600 dark:text-neutral-400">
                {alert.description}
              </p>
            </div>
            <Link
              href={`/dashboard/alerts/${alert.id}`}
              className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              View
            </Link>
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            Created {formatAlertTimestamp(alert.createdAt)}
            {alert.resolvedAt ? ` · Resolved ${formatAlertTimestamp(alert.resolvedAt)}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}
