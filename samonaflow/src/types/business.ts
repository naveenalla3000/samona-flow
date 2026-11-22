export type BusinessRoleValue = "OWNER" | "STAFF";

/** Serializable business profile. Money is a canonical 2dp decimal string. */
export type BusinessRecord = {
  id: string;
  ownerId: string;
  name: string;
  ownerName: string;
  email: string;
  phone: string | null;
  businessType: string;
  currency: string;
  timezone: string;
  openingBalance: string;
  openingBalanceDate: string;
  role: BusinessRoleValue;
  createdAt: string;
  updatedAt: string;
};

/** Lightweight shape used by the dashboard shell and business switcher. */
export type BusinessSummary = {
  id: string;
  name: string;
  role: BusinessRoleValue;
  currency: string;
  timezone: string;
};
