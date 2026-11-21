import type { z } from "zod";
import type { createBusinessSchema } from "@/lib/validations/business";

// The form works with the pre-transform input shape; the Zod resolver
// normalizes currency/opening balance on submit.
export type BusinessFormValues = z.input<typeof createBusinessSchema>;

export type BusinessFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
};

export const initialBusinessFormState: BusinessFormState = { status: "idle" };
