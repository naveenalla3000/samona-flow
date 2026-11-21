import { switchBusinessAction } from "@/server/actions/business-actions";
import type { BusinessSummary } from "@/types/business";

type BusinessSwitcherProps = {
  businesses: BusinessSummary[];
  activeBusinessId: string;
};

/**
 * Selects the active business. The action re-verifies membership server-side;
 * the cookie is only a preference, never an authorization claim.
 */
export function BusinessSwitcher({ businesses, activeBusinessId }: BusinessSwitcherProps) {
  const active = businesses.find((business) => business.id === activeBusinessId) ?? businesses[0];

  if (businesses.length <= 1) {
    return (
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">
          {active?.name ?? "Your business"}
        </p>
        <p className="text-xs text-slate-500">
          {active ? `${active.currency} · ${active.timezone}` : "No business selected"}
        </p>
      </div>
    );
  }

  return (
    <form action={switchBusinessAction} className="flex min-w-0 flex-wrap items-end gap-2">
      <div className="min-w-0">
        <label htmlFor="businessId" className="block text-xs font-medium text-slate-500">
          Active business
        </label>
        <select
          id="businessId"
          name="businessId"
          defaultValue={activeBusinessId}
          className="mt-0.5 max-w-56 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-blue-700 focus:ring-2 focus:ring-blue-700/15"
        >
          {businesses.map((business) => (
            <option key={business.id} value={business.id}>
              {business.name} ({business.currency})
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900"
      >
        Switch
      </button>
    </form>
  );
}
