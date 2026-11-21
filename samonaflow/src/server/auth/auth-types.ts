export type AuthenticatedUser = {
  readonly id: string;
  readonly email: string;
};

export type AuthFormState = {
  status: "idle" | "error" | "success" | "needs-verification";
  message?: string;
  fieldErrors?: Partial<Record<"email" | "password" | "confirmPassword", string>>;
};

export const initialAuthFormState: AuthFormState = { status: "idle" };
