import { z } from "zod";
import { emailSchema } from "./auth";

// Reuses the project's email schema rather than defining a second one.
const optionalEmailSchema = z
  .union([z.literal(""), z.null(), emailSchema])
  .optional()
  .transform((value) => value || null);

const optionalTextSchema = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters`)
    .nullable()
    .optional()
    .transform((value) => value || null);

const customerNameSchema = z
  .string()
  .trim()
  .min(1, "Customer name is required")
  .max(200, "Customer name must be at most 200 characters");

/**
 * PRD FR-03 fields. businessId, id, archivedAt and timestamps are owned by the
 * server and deliberately absent from client input.
 */
export const createCustomerSchema = z.object({
  name: customerNameSchema,
  email: optionalEmailSchema,
  phone: optionalTextSchema(50, "Phone"),
  companyName: optionalTextSchema(200, "Company name"),
  address: optionalTextSchema(5000, "Address"),
  notes: optionalTextSchema(5000, "Notes"),
});

export const updateCustomerSchema = createCustomerSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "Provide at least one field to update" },
);

// Path parameters are validated too: every input crossing the boundary is
// checked, and malformed identifiers never reach the data layer.
export const businessIdSchema = z.uuid("Invalid business id");
export const customerIdSchema = z.uuid("Invalid customer id");

export const customerStatusSchema = z.enum(["active", "archived", "all"]);
export const customerSortSchema = z.enum(["name", "companyName", "createdAt", "updatedAt"]);
export const customerSortDirectionSchema = z.enum(["asc", "desc"]);

export const listCustomersQuerySchema = z.object({
  page: z.coerce.number().int().min(1, "Page must be at least 1").default(1),
  pageSize: z.coerce.number().int().min(1).max(100, "Page size must be at most 100").default(20),
  search: z.string().trim().max(200, "Search is too long").optional(),
  status: customerStatusSchema.default("active"),
  sort: customerSortSchema.default("name"),
  direction: customerSortDirectionSchema.default("asc"),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
