import { CustomerForm } from "@/components/customers/customer-form";
import { CustomersHeader, NoBusinessState } from "@/components/customers/customer-layout";
import { createCustomerAction } from "@/server/actions/customer-actions";
import { resolveCurrentBusiness } from "@/server/auth/require-business";
import { requireUser } from "@/server/auth/require-auth";
import type { CustomerFormValues } from "@/types/customer-form";

export const metadata = { title: "New customer" };

export const instant = false;

const EMPTY_VALUES: CustomerFormValues = {
  name: "",
  email: "",
  phone: "",
  companyName: "",
  address: "",
  notes: "",
};

export default async function NewCustomerPage() {
  const user = await requireUser();
  const business = await resolveCurrentBusiness(user);
  if (!business.ok) return <NoBusinessState />;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <CustomersHeader
        title="Add customer"
        subtitle="Contact details are optional apart from the customer name."
      />
      <CustomerForm
        submitLabel="Create customer"
        defaultValues={EMPTY_VALUES}
        action={createCustomerAction}
        cancelHref="/dashboard/customers"
      />
    </main>
  );
}
