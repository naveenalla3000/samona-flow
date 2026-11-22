import { z } from "zod";
import { formatMoney, MAX_MONEY_CENTS, parseSignedMoney } from "@/lib/invoice-math";
import { emailSchema } from "./auth";
import { isoDateSchema } from "./invoice";

/**
 * Business profile/settings validation.
 *
 * The `Business` row is the tenant and also holds its settings (currency,
 * timezone, opening balance), matching PRD table 8.1. Server-owned fields
 * (`id`, `ownerId`, timestamps) are absent so Zod strips them if a client
 * supplies them.
 */
export const businessIdSchema = z.uuid("Invalid business id");

const nameSchema = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(200, `${label} must be at most 200 characters`);

const optionalTextSchema = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters`)
    .nullable()
    .optional()
    .transform((value) => value || null);

const businessTypeSchema = z
  .string()
  .trim()
  .min(1, "Business type is required")
  .max(100, "Business type must be at most 100 characters");

const currencySchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z]{3}$/.test(value), "Currency must be a 3-letter ISO 4217 code");

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const timezoneSchema = z
  .string()
  .trim()
  .min(1, "Timezone is required")
  .max(100, "Timezone must be at most 100 characters")
  .refine(isValidTimeZone, "Enter a valid IANA timezone such as Asia/Kolkata");

const SIGNED_MONEY_PATTERN = /^-?\d{1,10}(\.\d{1,2})?$/;

/**
 * The opening balance is a manual cash position and may be negative. It is
 * accepted only as a decimal string, never a JS number, and normalized to
 * exactly two decimal places using the shared fixed-point helpers.
 */
const openingBalanceSchema = z
  .string()
  .trim()
  .regex(
    SIGNED_MONEY_PATTERN,
    "Opening balance must be a number with at most 2 decimals",
  )
  .refine((value) => {
    try {
      const cents = parseSignedMoney(value);
      const magnitude = cents < BigInt(0) ? -cents : cents;
      return magnitude <= MAX_MONEY_CENTS;
    } catch {
      return false;
    }
  }, "Opening balance exceeds the maximum supported amount")
  .transform((value) => formatMoney(parseSignedMoney(value)));

const businessFields = z.object({
  name: nameSchema("Business name"),
  ownerName: nameSchema("Owner name"),
  email: emailSchema,
  phone: optionalTextSchema(50, "Phone"),
  businessType: businessTypeSchema,
  currency: currencySchema,
  timezone: timezoneSchema,
  openingBalance: openingBalanceSchema,
  openingBalanceDate: isoDateSchema,
});

/** Onboarding form/API input. Defaults mirror the applied schema defaults. */
export const createBusinessSchema = businessFields.extend({
  currency: currencySchema.default("INR"),
  timezone: timezoneSchema.default("Asia/Kolkata"),
  openingBalance: openingBalanceSchema.default("0.00"),
});

/** Settings form input: at least one field, all optional. */
export const updateBusinessSchema = businessFields
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;
export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;

/** Currencies offered by the UI. The database accepts any ISO 4217 code. */
export const BUSINESS_CURRENCIES = [
  "INR",
  "USD",
  "EUR",
  "GBP",
  "AED",
  "AUD",
  "CAD",
  "SGD",
] as const;

/** Timezones offered by the UI. Any valid IANA timezone is accepted. */
export const BUSINESS_TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
] as const;

export const BUSINESS_TYPES = [
  "Freelancer",
  "Sole proprietor",
  "Agency",
  "Studio",
  "Consultancy",
  "Other",
] as const;
