// Shared, serializable shapes for Smart Alerts and the Action Center.
// Money is a canonical 2dp decimal string so JSON never loses precision.
// Business dates are YYYY-MM-DD calendar strings in the business timezone;
// timestamps are ISO strings.
//
// The database uses `alertType`; the API and UI use `type`. The mapping lives in
// the repository so every layer above it speaks the same vocabulary.

export const ALERT_TYPES = [
  "OVERDUE_PAYMENT",
  "PAYMENT_APPROACHING",
  "POTENTIAL_SHORTAGE",
  "UPCOMING_EXPENSE",
  "PARTIAL_PAYMENT_DUE",
  "CUSTOMER_CONCENTRATION",
] as const;

export type AlertTypeValue = (typeof ALERT_TYPES)[number];

export const ALERT_SEVERITIES = ["INFO", "WARNING", "CRITICAL"] as const;

export type AlertSeverityValue = (typeof ALERT_SEVERITIES)[number];

export const ALERT_STATUSES = ["ACTIVE", "RESOLVED", "DISMISSED"] as const;

export type AlertStatusValue = (typeof ALERT_STATUSES)[number];

export const ALERT_RELATED_ENTITY_TYPES = [
  "INVOICE",
  "EXPENSE",
  "CUSTOMER",
  "FORECAST",
] as const;

export type AlertRelatedEntityType = (typeof ALERT_RELATED_ENTITY_TYPES)[number];

export type AlertRecord = {
  id: string;
  businessId: string;
  type: AlertTypeValue;
  severity: AlertSeverityValue;
  title: string;
  description: string;
  recommendedAction: string;
  relatedEntityType: AlertRelatedEntityType | null;
  relatedEntityId: string | null;
  status: AlertStatusValue;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

/**
 * A business-verified reference to the record an alert is about. The repository
 * checks that the referenced row belongs to the authenticated business; a
 * missing row becomes null rather than leaking another tenant's data.
 */
export type AlertRelatedEntity = {
  type: AlertRelatedEntityType;
  id: string | null;
  label: string;
  href: string;
  summary: string | null;
};

export type AlertDetail = AlertRecord & {
  relatedEntity: AlertRelatedEntity | null;
};

/** Business-wide counts used by the dashboard and the list header. */
export type AlertCounts = {
  active: number;
  unread: number;
  critical: number;
  warning: number;
  info: number;
};

export type AlertListResult = {
  items: AlertRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  counts: AlertCounts;
};

export type AlertEvaluationResult = {
  evaluatedAt: string;
  today: string;
  created: number;
  updated: number;
  resolved: number;
  unchanged: number;
  dismissed: number;
  active: number;
};
