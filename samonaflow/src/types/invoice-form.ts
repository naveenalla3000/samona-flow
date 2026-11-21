// Shared between invoice server actions and the client draft form.
import type { z } from "zod";
import type { createInvoiceSchema } from "@/lib/validations/invoice";

// The form works with the pre-transform (raw string) shape.
export type InvoiceFormValues = z.input<typeof createInvoiceSchema>;

export type InvoiceFormState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
};

export const initialInvoiceFormState: InvoiceFormState = { status: "idle" };
