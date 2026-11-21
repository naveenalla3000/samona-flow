// Wires the Expense controller to the real auth guard and service. Only API
// Route Handlers import this module; tests inject doubles into the controller.
import { requireApiUser } from "@/server/auth/api-auth";
import { expenseService } from "@/server/services/expense-service";
import { createExpenseController } from "./expense-controller";

export const expenseApi = createExpenseController({
  authenticate: requireApiUser,
  service: expenseService,
});
