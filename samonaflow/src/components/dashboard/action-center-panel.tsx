import Link from "next/link";
import { EvaluateAlertsButton } from "@/components/alerts/alert-actions";
import { AlertSeverityBadge } from "@/components/alerts/alert-layout";
import { ALERT_TYPE_LABELS } from "@/lib/alert-rules";
import type { AlertCounts, AlertRelatedEntityType } from "@/types/alert";
import type { DashboardAction } from "@/types/dashboard";
import {
  DashboardSection,
  EmptyState,
  InlineLink,
  SectionError,
} from "./dashboard-ui";

const RECORD_LABELS: Record<AlertRelatedEntityType, string> = {
  INVOICE: "View invoice",
  EXPENSE: "View expense",
  CUSTOMER: "View customer",
  FORECAST: "View forecast",
};

const RECORD_LINK =
  "rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800";

export type ActionCenterData = {
  counts: AlertCounts;
  total: number;
  items: DashboardAction[];
};

export function ActionCenterPanel({
  data,
  error = false,
}: {
  data: ActionCenterData | null;
  error?: boolean;
}) {
  return (
    <DashboardSection
      id="action-center"
      title="Financial action center"
      description="Active alerts ordered by severity. Critical items appear first; nothing is sent automatically."
      action={<InlineLink href="/dashboard/alerts">Open action center</InlineLink>}
    >
      {error || data === null ? (
        <SectionError message="Alerts could not be loaded. Open the action center or refresh the page to try again." />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700">
              {data.counts.critical} critical
            </span>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
              {data.counts.warning} warning
            </span>
            <span className="rounded-full bg-sky-50 px-2.5 py-1 font-medium text-sky-700">
              {data.counts.info} info
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
              {data.counts.unread} unread
            </span>
            <span className="text-slate-500">
              {data.total} active alert{data.total === 1 ? "" : "s"}
            </span>
          </div>

          {data.items.length === 0 ? (
            <EmptyState
              title="No active alerts"
              description="Run an evaluation to check overdue invoices, upcoming expenses, partial payments and potential cash shortages."
              action={<EvaluateAlertsButton label="Evaluate now" />}
            />
          ) : (
            <ul aria-label="Active alerts, critical first" className="divide-y divide-slate-100">
              {data.items.map((item) => (
                <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <AlertSeverityBadge severity={item.severity} />
                    {!item.isRead ? (
                      <span
                        className="inline-block h-2 w-2 rounded-full bg-sky-500"
                        aria-label="Unread"
                        title="Unread"
                      />
                    ) : null}
                    <span className="text-xs text-slate-500">{ALERT_TYPE_LABELS[item.type]}</span>
                  </div>
                  <Link
                    href={item.alertHref}
                    className={`mt-1 block text-sm hover:underline ${
                      item.isRead ? "font-medium text-slate-800" : "font-semibold text-slate-900"
                    }`}
                  >
                    {item.title}
                  </Link>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{item.description}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {item.record ? (
                      <Link href={item.record.href} className={RECORD_LINK}>
                        {RECORD_LABELS[item.record.type]}
                      </Link>
                    ) : null}
                    <Link href={item.alertHref} className={RECORD_LINK}>
                      Review alert
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <InlineLink href="/dashboard/alerts">View all alerts and history</InlineLink>
            {data.items.length > 0 ? <EvaluateAlertsButton label="Evaluate now" /> : null}
          </div>
        </div>
      )}
    </DashboardSection>
  );
}
