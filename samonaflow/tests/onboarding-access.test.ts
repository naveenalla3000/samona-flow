import assert from "node:assert/strict";
import test from "node:test";
import { canAccessOnboarding } from "@/lib/auth/onboarding-access";

test("first-time users can always reach onboarding", () => {
  assert.equal(canAccessOnboarding(false, null), true);
  assert.equal(canAccessOnboarding(false, undefined), true);
  assert.equal(canAccessOnboarding(false, "1"), true);
});

test("existing members are sent to the dashboard unless they are adding a business", () => {
  assert.equal(canAccessOnboarding(true, null), false);
  assert.equal(canAccessOnboarding(true, undefined), false);
  assert.equal(canAccessOnboarding(true, "0"), false);
  assert.equal(canAccessOnboarding(true, "1"), true);
});
