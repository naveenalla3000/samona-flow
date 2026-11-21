// Server-only application service for the What-If Cash Flow Simulator.
//
// Authorization and data loading are shared with the forecasting service via
// loadForecastInput, so a simulation is calculated from the same business-scoped
// snapshot as the baseline and no query can run without a verified businessId.
// The service performs no writes: the simulator never creates or updates an
// invoice, payment, reversal or expense.
import { simulateForecast, ForecastSimulationValidationError } from "@/lib/forecast-simulation";
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import {
  prismaBusinessMembershipRepository,
} from "@/server/repositories/business-membership-repository";
import { prismaForecastRepository } from "@/server/repositories/forecast-repository";
import {
  ForecastServiceError,
  loadForecastInput,
  type ForecastServiceDependencies,
} from "@/server/services/forecast-service";
import type {
  ForecastSimulationRequest,
  ForecastSimulationResult,
} from "@/types/forecast-simulation";

export type ForecastSimulationServiceErrorCode = "BUSINESS_FORBIDDEN" | "INVALID_REQUEST";

export class ForecastSimulationServiceError extends Error {
  readonly code: ForecastSimulationServiceErrorCode;
  readonly fieldErrors?: Record<string, string>;

  constructor(
    code: ForecastSimulationServiceErrorCode,
    message: string,
    fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "ForecastSimulationServiceError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export interface ForecastSimulationService {
  simulate(
    user: AuthenticatedUser,
    businessId: string,
    request: ForecastSimulationRequest,
  ): Promise<ForecastSimulationResult>;
}

export function createForecastSimulationService(
  dependencies: ForecastServiceDependencies,
): ForecastSimulationService {
  return {
    async simulate(user, businessId, request) {
      let input;
      try {
        input = await loadForecastInput(
          dependencies,
          user,
          businessId,
          request.horizon,
        );
      } catch (error) {
        if (error instanceof ForecastServiceError) {
          throw new ForecastSimulationServiceError(error.code, error.message);
        }
        throw error;
      }

      try {
        return simulateForecast(input, request.adjustments);
      } catch (error) {
        if (error instanceof ForecastSimulationValidationError) {
          throw new ForecastSimulationServiceError(
            "INVALID_REQUEST",
            error.message,
            error.fieldErrors,
          );
        }
        throw error;
      }
    },
  };
}

export const forecastSimulationService: ForecastSimulationService =
  createForecastSimulationService({
    repository: prismaForecastRepository,
    memberships: prismaBusinessMembershipRepository,
  });
