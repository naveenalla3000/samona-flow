// Wires the Dashboard controller to the real auth guard and service. Only API
// Route Handlers import this module; tests inject doubles into the controller.
import { requireApiUser } from "@/server/auth/api-auth";
import { dashboardService } from "@/server/services/dashboard-service";
import { createDashboardController } from "./dashboard-controller";

export const dashboardApi = createDashboardController({
  authenticate: requireApiUser,
  service: dashboardService,
});
