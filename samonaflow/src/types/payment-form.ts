export type PaymentFormState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
};
