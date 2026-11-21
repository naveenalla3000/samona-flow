// Shared between reminder server actions and client forms. The form works with
// the pre-transform (input) shape; the Zod resolver normalizes on submit.
import type { z } from "zod";
import type { createReminderSchema, updateReminderSchema } from "@/lib/validations/reminder";

export type ReminderFormValues = z.input<typeof createReminderSchema>;
export type ReminderEditValues = z.input<typeof updateReminderSchema>;

export type ReminderFormState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
};

export const initialReminderFormState: ReminderFormState = { status: "idle" };
