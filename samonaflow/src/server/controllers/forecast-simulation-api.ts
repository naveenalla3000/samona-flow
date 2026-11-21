// Wires the simulation controller to the real auth guard and service. Only API
// Route Handlers import this module; tests inject doubles into the controller.
import { requireApiUser } from "@/server/auth/api-auth";
import { forecastSimulationService } from "@/server/services/forecast-simulation-service";
import { createForecastSimulationController } from "./forecast-simulation-controller";

export const forecastSimulationApi = createForecastSimulationController({
  authenticate: requireApiUser,
  service: forecastSimulationService,
});
