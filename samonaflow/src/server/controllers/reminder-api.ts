// Wires the Reminder controller to the real auth guard and service. Only API
// Route Handlers import this module; tests inject doubles into the controller.
import { requireApiUser } from "@/server/auth/api-auth";
import { reminderService } from "@/server/services/reminder-service";
import { createReminderController } from "./reminder-controller";

export const reminderApi = createReminderController({
  authenticate: requireApiUser,
  service: reminderService,
});
