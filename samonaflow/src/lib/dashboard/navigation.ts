export type DashboardNavItem = {
  href: string;
  label: string;
  exact?: boolean;
};

/** Primary destinations in the authenticated dashboard shell. */
export const DASHBOARD_NAV_ITEMS: readonly DashboardNavItem[] = [
  { href: "/dashboard", label: "Overview", exact: true },
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/invoices", label: "Invoices" },
  { href: "/dashboard/payments", label: "Payments" },
  { href: "/dashboard/expenses", label: "Expenses" },
  { href: "/dashboard/reminders", label: "Reminders" },
  { href: "/dashboard/forecast", label: "Cash flow" },
  { href: "/dashboard/forecast/simulator", label: "What-if" },
  { href: "/dashboard/alerts", label: "Alerts" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function isDashboardNavItemActive(
  pathname: string,
  item: DashboardNavItem,
): boolean {
  if (item.exact) return pathname === item.href;
  // The simulator is a sibling destination under the forecast path, so the
  // cash-flow item must not also claim it.
  if (item.href === "/dashboard/forecast") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
