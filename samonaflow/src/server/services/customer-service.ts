// Server-only application service for Customer Management.
//
// Authorization is enforced here, on every operation, from the verified
// session identity passed in by the caller. A businessId is never taken from
// client input without a matching membership row, and every repository call
// receives that verified businessId so cross-tenant reads/writes are impossible.
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import {
  prismaBusinessMembershipRepository,
  type BusinessMembershipRepository,
} from "@/server/repositories/business-membership-repository";
import {
  prismaCustomerRepository,
  type CustomerRepository,
} from "@/server/repositories/customer-repository";
import type {
  CreateCustomerInput,
  ListCustomersQuery,
  UpdateCustomerInput,
} from "@/lib/validations/customer";
import type { CustomerDetail, CustomerListResult, CustomerRecord } from "@/types/customer";

export type CustomerServiceErrorCode = "BUSINESS_FORBIDDEN" | "CUSTOMER_NOT_FOUND";

export class CustomerServiceError extends Error {
  readonly code: CustomerServiceErrorCode;

  constructor(code: CustomerServiceErrorCode, message: string) {
    super(message);
    this.name = "CustomerServiceError";
    this.code = code;
  }
}

export interface CustomerService {
  create(
    user: AuthenticatedUser,
    businessId: string,
    input: CreateCustomerInput,
  ): Promise<CustomerRecord>;
  list(
    user: AuthenticatedUser,
    businessId: string,
    query: ListCustomersQuery,
  ): Promise<CustomerListResult>;
  get(
    user: AuthenticatedUser,
    businessId: string,
    customerId: string,
  ): Promise<CustomerDetail>;
  update(
    user: AuthenticatedUser,
    businessId: string,
    customerId: string,
    input: UpdateCustomerInput,
  ): Promise<CustomerRecord>;
  archive(
    user: AuthenticatedUser,
    businessId: string,
    customerId: string,
  ): Promise<CustomerRecord>;
}

export function createCustomerService(dependencies: {
  memberships: BusinessMembershipRepository;
  customers: CustomerRepository;
}): CustomerService {
  const { memberships, customers } = dependencies;

  async function requireMembership(user: AuthenticatedUser, businessId: string) {
    const membership = await memberships.findMembership(user.id, businessId);
    if (!membership) {
      throw new CustomerServiceError(
        "BUSINESS_FORBIDDEN",
        "You do not have access to this business.",
      );
    }
    return membership;
  }

  return {
    async create(user, businessId, input) {
      await requireMembership(user, businessId);
      // businessId comes only from the verified membership path above.
      return customers.create({ ...input, businessId });
    },

    async list(user, businessId, query) {
      await requireMembership(user, businessId);
      return customers.findMany(businessId, query);
    },

    async get(user, businessId, customerId) {
      await requireMembership(user, businessId);
      const customer = await customers.findById(businessId, customerId);
      if (!customer) {
        throw new CustomerServiceError("CUSTOMER_NOT_FOUND", "Customer not found.");
      }
      return customer;
    },

    async update(user, businessId, customerId, input) {
      await requireMembership(user, businessId);
      // The repository scopes the write with both id and businessId; a
      // customer from another business therefore looks like a missing row.
      const customer = await customers.update(businessId, customerId, input);
      if (!customer) {
        throw new CustomerServiceError("CUSTOMER_NOT_FOUND", "Customer not found.");
      }
      return customer;
    },

    async archive(user, businessId, customerId) {
      await requireMembership(user, businessId);
      // Archiving is a status change only. No financial row is touched and no
      // customer is ever deleted.
      const customer = await customers.archive(businessId, customerId);
      if (!customer) {
        throw new CustomerServiceError("CUSTOMER_NOT_FOUND", "Customer not found.");
      }
      return customer;
    },
  };
}

export const customerService = createCustomerService({
  memberships: prismaBusinessMembershipRepository,
  customers: prismaCustomerRepository,
});
