// Wires the Smart Alerts controller to the real auth guard and service. Only
// API Route Handlers import this module; tests inject doubles into the
// controller.
import { requireApiUser } from "@/server/auth/api-auth";
import { alertService } from "@/server/services/alert-service";
import { createAlertController } from "./alert-controller";

export const alertApi = createAlertController({
  authenticate: requireApiUser,
  service: alertService,
});
