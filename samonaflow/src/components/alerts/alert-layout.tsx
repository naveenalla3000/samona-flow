import Link from "next/link";
import type { ReactNode } from "react";
import type { AlertSeverityValue, AlertStatusValue } from "@/types/alert";

export function AlertsHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>
      </div>
      {action}
    </header>
  );
}

export function NoBusinessState() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="text-2xl font-semibold">Smart alerts</h1>
      <div className="mt-6 rounded-lg border border-dashed border-neutral-300 p-10 text-center">
        <h2 className="text-lg font-medium">No business set up yet</h2>
        <p className="mt-2 text-sm text-neutral-500">
          Create a business before evaluating alerts.
        </p>
        <Link href="/onboarding" className="mt-4 inline-flex rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">Set up business</Link>
      </div>
    </main>
  );
}

export function AlertLoadError() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="text-2xl font-semibold">Smart alerts</h1>
      <div
        role="alert"
        className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        We couldn&apos;t load alerts right now. Please try again.
      </div>
    </main>
  );
}

const SEVERITY_STYLES: Record<AlertSeverityValue, string> = {
  INFO: "bg-sky-100 text-sky-800",
  WARNING: "bg-amber-100 text-amber-800",
  CRITICAL: "bg-red-100 text-red-800",
};

export const SEVERITY_BORDER: Record<AlertSeverityValue, string> = {
  INFO: "border-l-sky-400",
  WARNING: "border-l-amber-400",
  CRITICAL: "border-l-red-500",
};

const SEVERITY_LABELS: Record<AlertSeverityValue, string> = {
  INFO: "Info",
  WARNING: "Warning",
  CRITICAL: "Critical",
};

export function AlertSeverityBadge({ severity }: { severity: AlertSeverityValue }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[severity]}`}
    >
      {SEVERITY_LABELS[severity]}
    </span>
  );
}

const STATUS_STYLES: Record<AlertStatusValue, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800",
  RESOLVED: "bg-neutral-100 text-neutral-600",
  DISMISSED: "bg-neutral-100 text-neutral-500 line-through",
};

const STATUS_LABELS: Record<AlertStatusValue, string> = {
  ACTIVE: "Active",
  RESOLVED: "Resolved",
  DISMISSED: "Dismissed",
};

export function AlertStatusBadge({ status }: { status: AlertStatusValue }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function UnreadIndicator({ isRead }: { isRead: boolean }) {
  if (isRead) return null;
  return (
    <span
      className="inline-block h-2 w-2 rounded-full bg-sky-500"
      title="Unread"
      aria-label="Unread"
    />
  );
}

export function formatAlertTimestamp(iso: string): string {
  return `${iso.slice(0, 16).replace("T", " ")} UTC`;
}
