// Server-only bridge from the exact fixed-point strings produced by the invoice
// calculator to Prisma's Decimal type. Using Prisma.Decimal at the persistence
// boundary guarantees the stored CHECK constraints see canonical 2dp values and
// avoids ever handing JavaScript floats to PostgreSQL.
import { Prisma } from "@/generated/prisma/client";

/** Convert a canonical decimal string to a rounded Prisma Decimal(..., 2). */
export function moneyDecimal(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
