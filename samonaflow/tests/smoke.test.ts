import assert from "node:assert/strict";
import test from "node:test";
import { loginSchema } from "@/lib/validations/auth";

test("test foundation resolves project aliases and TypeScript", () => {
  const parsed = loginSchema.safeParse({ email: " owner@example.com ", password: "secret123" });
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.email, "owner@example.com");
});
