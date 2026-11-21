// Wires the Invoice controller to the real auth guard and service. Only API
// Route Handlers import this module; tests inject doubles into the controller.
import { requireApiUser } from "@/server/auth/api-auth";
import { invoiceService } from "@/server/services/invoice-service";
import { createInvoiceController } from "./invoice-controller";

export const invoiceApi = createInvoiceController({
  authenticate: requireApiUser,
  service: invoiceService,
});
