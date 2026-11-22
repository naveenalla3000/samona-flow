import { notFound } from "next/navigation";
import { connection } from "next/server";
import { CustomerForm } from "@/components/customers/customer-form";
import { CustomersHeader, NoBusinessState } from "@/components/customers/customer-layout";
import { updateCustomerAction } from "@/server/actions/customer-actions";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { requireUser } from "@/server/auth/require-auth";
import { customerIdSchema } from "@/lib/validations/customer";
import { CustomerServiceError, customerService } from "@/server/services/customer-service";
import type { CustomerDetail } from "@/types/customer";

export const metadata = { title: "Edit customer" };

export const instant = false;

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  await connection();
  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  if (!business.ok) return <NoBusinessState />;

  const { customerId: rawId } = await params;
  const parsedId = customerIdSchema.safeParse(rawId);
  if (!parsedId.success) notFound();

  let customer: CustomerDetail;
  try {
    customer = await customerService.get(user, business.businessId, parsedId.data);
  } catch (error) {
    if (error instanceof CustomerServiceError && error.code === "CUSTOMER_NOT_FOUND") notFound();
    throw error;
  }

  const updateAction = updateCustomerAction.bind(null, customer.id);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <CustomersHeader title="Edit customer" subtitle={customer.name} />
      <CustomerForm
        submitLabel="Save changes"
        action={updateAction}
        cancelHref={`/dashboard/customers/${customer.id}`}
        defaultValues={{
          name: customer.name,
          email: customer.email ?? "",
          phone: customer.phone ?? "",
          companyName: customer.companyName ?? "",
          address: customer.address ?? "",
          notes: customer.notes ?? "",
        }}
      />
    </main>
  );
}
