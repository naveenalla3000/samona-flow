import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DashboardLoading from "@/app/(dashboard)/dashboard/loading";
import {
  EmptyState,
  formatMajor,
  formatMinor,
  isNegativeMajor,
  isPositiveMinor,
  SectionError,
  SummaryCard,
} from "@/components/dashboard/dashboard-ui";

// These are the server-rendered dashboard primitives. They perform no money
// math beyond formatting an already-authoritative string.

test("summary cards render the label, value and helper", () => {
  const html = renderToStaticMarkup(
    createElement(SummaryCard, {
      label: "Available cash",
      value: "USD 1,000.00",
      helper: "Opening balance plus recorded cash movements",
      tone: "primary",
    }),
  );
  assert.match(html, /Available cash/);
  assert.match(html, /USD 1,000.00/);
  assert.match(html, /Opening balance plus recorded cash movements/);
});

test("empty states render a title, description and optional action", () => {
  const html = renderToStaticMarkup(
    createElement(EmptyState, {
      title: "No outstanding receivables",
      description: "Every issued invoice is paid.",
      action: createElement("a", { href: "/dashboard/invoices/new" }, "Create an invoice"),
    }),
  );
  assert.match(html, /No outstanding receivables/);
  assert.match(html, /Every issued invoice is paid/);
  assert.match(html, /href="\/dashboard\/invoices\/new"/);
});

test("the loading skeleton is announced as busy", () => {
  const html = renderToStaticMarkup(createElement(DashboardLoading));
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /aria-label="Loading dashboard"/);
});

test("section errors render an accessible alert", () => {
  const html = renderToStaticMarkup(
    createElement(SectionError, { message: "Refresh the page to try again." }),
  );
  assert.match(html, /role="alert"/);
  assert.match(html, /This section could not be loaded/);
  assert.match(html, /Refresh the page to try again/);
});

test("money formatters keep exact strings, currency codes and signs", () => {
  assert.equal(formatMinor("12345", "USD"), "USD 123.45");
  assert.equal(formatMinor("-500", "USD"), "USD -5.00");
  assert.equal(formatMajor("400.00", "USD"), "USD 400.00");
  assert.equal(formatMajor("-400.00", "USD"), "USD -400.00");
  assert.equal(formatMajor("0.00", "USD"), "USD 0.00");
  assert.equal(isNegativeMajor("-0.01"), true);
  assert.equal(isNegativeMajor("0.00"), false);
  assert.equal(isPositiveMinor("0"), false);
  assert.equal(isPositiveMinor("1"), true);
});
