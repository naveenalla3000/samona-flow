// Wires the Customer controller to the real auth guard and service. Only API
// Route Handlers import this module; tests use `createCustomerController`
// directly with injected doubles.
import { requireApiUser } from "@/server/auth/api-auth";
import { customerService } from "@/server/services/customer-service";
import { createCustomerController } from "./customer-controller";

export const customerApi = createCustomerController({
  authenticate: requireApiUser,
  service: customerService,
});
