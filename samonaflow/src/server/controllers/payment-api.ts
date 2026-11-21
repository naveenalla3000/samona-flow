// Wires the Payment controller to the real auth guard and service. Only API
// Route Handlers import this module; tests inject doubles into the controller.
import { requireApiUser } from "@/server/auth/api-auth";
import { paymentService } from "@/server/services/payment-service";
import { createPaymentController } from "./payment-controller";

export const paymentApi = createPaymentController({
  authenticate: requireApiUser,
  service: paymentService,
});
