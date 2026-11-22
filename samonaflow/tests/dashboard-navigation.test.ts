import assert from "node:assert/strict";
import test from "node:test";
import {
  DASHBOARD_NAV_ITEMS,
  isDashboardNavItemActive,
} from "@/lib/dashboard/navigation";

test("the dashboard navigation exposes every core destination, including the simulator", () => {
  const labels = DASHBOARD_NAV_ITEMS.map((item) => item.label);
  assert.ok(labels.includes("Overview"));
  assert.ok(labels.includes("Cash flow"));
  assert.ok(labels.includes("What-if"));
  assert.ok(labels.includes("Settings"));
  assert.equal(
    DASHBOARD_NAV_ITEMS.some((item) => item.href === "/dashboard/forecast/simulator"),
    true,
  );
});

test("cash flow and the simulator are highlighted independently", () => {
  const cashFlow = DASHBOARD_NAV_ITEMS.find((item) => item.label === "Cash flow");
  const simulator = DASHBOARD_NAV_ITEMS.find((item) => item.label === "What-if");
  assert.ok(cashFlow);
  assert.ok(simulator);

  assert.equal(isDashboardNavItemActive("/dashboard/forecast", cashFlow), true);
  assert.equal(isDashboardNavItemActive("/dashboard/forecast/simulator", cashFlow), false);
  assert.equal(isDashboardNavItemActive("/dashboard/forecast/simulator", simulator), true);
});

test("the overview item only matches the dashboard root", () => {
  const overview = DASHBOARD_NAV_ITEMS.find((item) => item.label === "Overview");
  assert.ok(overview);
  assert.equal(isDashboardNavItemActive("/dashboard", overview), true);
  assert.equal(isDashboardNavItemActive("/dashboard/customers", overview), false);
});
