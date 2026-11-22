import assert from "node:assert/strict";
import test from "node:test";
import {
  addDays,
  assertSpan,
  availableCash,
  bucketStart,
  buildBuckets,
  classifyReminder,
  daysBetween,
  groupByCurrency,
  headlineTotals,
  isInRange,
  isOverdueDisplay,
  isUpcomingExpenseWindow,
  netCashMovement,
  resolvePreset,
  sumMinor,
} from "@/lib/dashboard-metrics";

// BigInt literals (1n) need ES2020; the project targets ES2017, so use BigInt().

test("addDays and daysBetween cross month and year boundaries", () => {
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
  assert.equal(addDays("2024-12-31", 1), "2025-01-01");
  assert.equal(addDays("2024-03-01", -1), "2024-02-29");
  assert.equal(daysBetween("2024-02-28", "2024-03-01"), 2);
  assert.equal(daysBetween("2024-12-31", "2025-01-01"), 1);
  assert.equal(daysBetween("2025-01-01", "2024-12-31"), -1);
});

test("bucketStart week maps a Tuesday to the preceding Monday", () => {
  // 2024-12-31 is a Tuesday.
  assert.equal(bucketStart("2024-12-31", "week"), "2024-12-30");
});

test("bucketStart week maps a Monday to itself", () => {
  assert.equal(bucketStart("2024-12-30", "week"), "2024-12-30");
});

test("bucketStart month maps to the first of the month and day to itself", () => {
  assert.equal(bucketStart("2024-03-10", "month"), "2024-03-01");
  assert.equal(bucketStart("2024-03-10", "day"), "2024-03-10");
});

test("week buckets across a month boundary are gap-free Mondays covering the range", () => {
  const buckets = buildBuckets("2024-03-27", "2024-04-10", "week");
  assert.deepEqual(buckets, ["2024-03-25", "2024-04-01", "2024-04-08"]);
  for (const bucket of buckets) {
    assert.equal(bucketStart(bucket, "week"), bucket, `${bucket} should be a Monday`);
  }
  for (let i = 1; i < buckets.length; i++) {
    assert.equal(daysBetween(buckets[i - 1], buckets[i]), 7);
  }
  assert.ok(buckets[0] <= "2024-03-27");
  assert.ok(addDays(buckets[buckets.length - 1], 6) >= "2024-04-10");
});

test("month buckets across a year boundary are consecutive months", () => {
  assert.deepEqual(buildBuckets("2024-11-15", "2025-02-03", "month"), [
    "2024-11-01",
    "2024-12-01",
    "2025-01-01",
    "2025-02-01",
  ]);
});

test("day bucket count equals the inclusive day count", () => {
  const from = "2024-02-28";
  const to = "2024-03-01";
  const buckets = buildBuckets(from, to, "day");
  assert.equal(buckets.length, daysBetween(from, to) + 1);
  assert.deepEqual(buckets, ["2024-02-28", "2024-02-29", "2024-03-01"]);
  assert.deepEqual(buildBuckets("2024-03-02", "2024-03-01", "day"), []);
});

test("isInRange is inclusive on both ends and false one day outside", () => {
  assert.equal(isInRange("2024-03-01", "2024-03-01", "2024-03-31"), true);
  assert.equal(isInRange("2024-03-31", "2024-03-01", "2024-03-31"), true);
  assert.equal(isInRange("2024-02-29", "2024-03-01", "2024-03-31"), false);
  assert.equal(isInRange("2024-04-01", "2024-03-01", "2024-03-31"), false);
});

test("resolvePreset last_30_days spans 30 inclusive days ending today", () => {
  // 2024-03-10 minus 29 days = 2024-02-10 (Feb 10-29 is 20 days, Mar 1-10 is 10).
  assert.deepEqual(resolvePreset("last_30_days", "2024-03-10"), {
    from: "2024-02-10",
    to: "2024-03-10",
  });
});

test("resolvePreset last_90_days spans 90 inclusive days ending today", () => {
  // 2024-03-31 is day 91 of the leap year, so 89 days earlier is 2024-01-02.
  const range = resolvePreset("last_90_days", "2024-03-31");
  assert.deepEqual(range, { from: "2024-01-02", to: "2024-03-31" });
  assert.equal(daysBetween(range.from, range.to) + 1, 90);
});

test("resolvePreset this_month runs from the 1st to today", () => {
  assert.deepEqual(resolvePreset("this_month", "2024-03-10"), {
    from: "2024-03-01",
    to: "2024-03-10",
  });
});

test("resolvePreset last_month crosses the year boundary from January", () => {
  assert.deepEqual(resolvePreset("last_month", "2024-01-15"), {
    from: "2023-12-01",
    to: "2023-12-31",
  });
});

test("resolvePreset year_to_date runs from January 1 to today", () => {
  assert.deepEqual(resolvePreset("year_to_date", "2024-03-10"), {
    from: "2024-01-01",
    to: "2024-03-10",
  });
});

test("assertSpan accepts exactly 366 inclusive days in a leap year", () => {
  assert.doesNotThrow(() => assertSpan("2024-01-01", "2024-12-31"));
});

test("assertSpan rejects 367 inclusive days with invalid_request", () => {
  assert.throws(() => assertSpan("2024-01-01", "2025-01-01"), {
    code: "invalid_request",
  });
});

test("assertSpan rejects from after to", () => {
  assert.throws(() => assertSpan("2024-03-02", "2024-03-01"), {
    code: "invalid_request",
  });
});

test("classifyReminder boundaries around today 2024-03-10", () => {
  const today = "2024-03-10";
  assert.equal(classifyReminder("2024-03-09", today), "overdue");
  assert.equal(classifyReminder("2024-03-10", today), "upcoming");
  assert.equal(classifyReminder("2024-03-16", today), "upcoming");
  assert.equal(classifyReminder("2024-03-17", today), "later");
});

test("isUpcomingExpenseWindow covers today through today+30 only", () => {
  const today = "2024-03-10";
  assert.equal(isUpcomingExpenseWindow("2024-03-10", today), true);
  // Mar 10 + 30 days = Apr 9.
  assert.equal(isUpcomingExpenseWindow("2024-04-09", today), true);
  assert.equal(isUpcomingExpenseWindow("2024-04-10", today), false);
  assert.equal(isUpcomingExpenseWindow("2024-03-09", today), false);
});

test("sumMinor is exact above Number.MAX_SAFE_INTEGER", () => {
  assert.equal(
    sumMinor([BigInt("9007199254740993"), BigInt("2")]),
    BigInt("9007199254740995"),
  );
  assert.equal(sumMinor([]), BigInt("0"));
});

test("groupByCurrency and headlineTotals exclude non-business currency from headline", () => {
  const rows = [
    { currency: "INR", amount: BigInt("1000") },
    { currency: "USD", amount: BigInt("500") },
    { currency: "INR", amount: BigInt("250") },
  ];
  assert.deepEqual(groupByCurrency(rows), {
    INR: BigInt("1250"),
    USD: BigInt("500"),
  });
  assert.deepEqual(headlineTotals(rows, "INR"), {
    headline: BigInt("1250"),
    byCurrency: { INR: BigInt("1250"), USD: BigInt("500") },
    excludedCount: 1,
  });
});

test("netCashMovement is income minus expenses and can be negative", () => {
  assert.equal(netCashMovement(BigInt("500"), BigInt("800")), BigInt("-300"));
  assert.equal(netCashMovement(BigInt("800"), BigInt("500")), BigInt("300"));
});

test("availableCash is opening plus income minus expenses", () => {
  assert.equal(
    availableCash(BigInt("1000"), BigInt("500"), BigInt("1300")),
    BigInt("200"),
  );
  assert.equal(
    availableCash(BigInt("0"), BigInt("0"), BigInt("100")),
    BigInt("-100"),
  );
});

test("isOverdueDisplay for SENT and PARTIALLY_PAID requires past due and outstanding > 0", () => {
  const today = "2024-03-10";
  assert.equal(isOverdueDisplay("SENT", "2024-03-09", BigInt("100"), today), true);
  assert.equal(isOverdueDisplay("SENT", today, BigInt("100"), today), false);
  assert.equal(
    isOverdueDisplay("PARTIALLY_PAID", "2024-03-09", BigInt("0"), today),
    false,
  );
  assert.equal(
    isOverdueDisplay("PARTIALLY_PAID", "2024-03-09", BigInt("50"), today),
    true,
  );
});

test("isOverdueDisplay is false for PAID, VOID and DRAFT", () => {
  const today = "2024-03-10";
  assert.equal(isOverdueDisplay("PAID", "2024-03-01", BigInt("0"), today), false);
  assert.equal(isOverdueDisplay("VOID", "2024-03-01", BigInt("100"), today), false);
  assert.equal(isOverdueDisplay("DRAFT", "2024-03-01", BigInt("100"), today), false);
});

test("isOverdueDisplay passes a stored OVERDUE status through as overdue", () => {
  // Per the module comment: a stored OVERDUE returns true unconditionally,
  // even when the due date is in the future or outstanding is zero.
  const today = "2024-03-10";
  assert.equal(isOverdueDisplay("OVERDUE", "2024-03-01", BigInt("100"), today), true);
  assert.equal(isOverdueDisplay("OVERDUE", "2024-04-01", BigInt("0"), today), true);
});
