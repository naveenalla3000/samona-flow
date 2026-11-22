import Link from "next/link";
import type { CustomerListItem } from "@/types/customer";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function CustomerList({ customers }: { customers: CustomerListItem[] }) {
  if (customers.length === 0) {
    return (
      <div className="mt-6 rounded-lg border border-dashed border-neutral-300 p-10 text-center">
        <h2 className="text-lg font-medium">No customers found</h2>
        <p className="mt-2 text-sm text-neutral-500">
          Try a different search, or add your first customer to get started.
        </p>
        <Link
          href="/dashboard/customers/new"
          className="mt-4 inline-block rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
        >
          Add customer
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-white text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">Customer</th>
            <th scope="col" className="px-4 py-3 font-medium">Contact</th>
            <th scope="col" className="px-4 py-3 font-medium">Invoices</th>
            <th scope="col" className="px-4 py-3 font-medium">Status</th>
            <th scope="col" className="px-4 py-3 font-medium">Created</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200">
          {customers.map((customer) => (
            <tr key={customer.id} className="hover:bg-white">
              <td className="px-4 py-3">
                <Link
                  href={`/dashboard/customers/${customer.id}`}
                  className="font-medium text-neutral-900 hover:underline"
                >
                  {customer.name}
                </Link>
                {customer.companyName ? (
                  <p className="text-xs text-neutral-500">{customer.companyName}</p>
                ) : null}
              </td>
              <td className="px-4 py-3 text-neutral-600">
                <span className="block">{customer.email ?? "—"}</span>
                <span className="block text-xs">{customer.phone ?? ""}</span>
              </td>
              <td className="px-4 py-3">{customer.invoiceCount}</td>
              <td className="px-4 py-3">
                {customer.archivedAt ? (
                  <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs text-neutral-700">
                    Archived
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                    Active
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-neutral-500">{formatDate(customer.createdAt)}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap justify-end gap-2 sm:gap-3">
                  <Link href={`/dashboard/customers/${customer.id}`} className="text-sm hover:underline">
                    View
                  </Link>
                  <Link href={`/dashboard/customers/${customer.id}/edit`} className="text-sm hover:underline">
                    Edit
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
