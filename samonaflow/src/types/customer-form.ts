// Shared between customer server actions and client forms.
import type { z } from "zod";
import type { createCustomerSchema } from "@/lib/validations/customer";

// The form works with the pre-transform (input) shape; the Zod resolver
// converts empty strings to null on submit.
export type CustomerFormValues = z.input<typeof createCustomerSchema>;

export type CustomerFormState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
};

export const initialCustomerFormState: CustomerFormState = { status: "idle" };
