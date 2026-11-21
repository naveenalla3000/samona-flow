// Wires the Forecast controller to the real auth guard and service. Only API
// Route Handlers import this module; tests inject doubles into the controller.
import { requireApiUser } from "@/server/auth/api-auth";
import { forecastService } from "@/server/services/forecast-service";
import { createForecastController } from "./forecast-controller";

export const forecastApi = createForecastController({
  authenticate: requireApiUser,
  service: forecastService,
});
