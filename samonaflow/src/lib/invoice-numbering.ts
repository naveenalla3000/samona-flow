// Pure helpers for human-readable, per-business invoice numbers.
//
// PRD requires only "unique per business" and gives no format. We use
// `INV-<YYYY>-<NNNN>` where YYYY is the issue-date year and NNNN is a
// per-business, per-year sequence. The database unique index
// `@@unique([businessId, invoiceNumber])` is the final arbiter; the repository
// generates the next value inside a transaction and retries on a unique
// violation so concurrent requests cannot produce duplicates.

const PREFIX = "INV";

export function invoiceNumberPrefix(issueDate: string): string {
  const year = issueDate.slice(0, 4);
  if (!/^\d{4}$/.test(year)) {
    throw new Error(`Invalid issue date for invoice numbering: ${issueDate}`);
  }
  return `${PREFIX}-${year}-`;
}

/**
 * Given the prefix and the existing numbers for that business/prefix, return
 * the next sequence number. Gaps are ignored: the highest suffix wins, which
 * keeps numbering monotonic even if a draft creation was rolled back.
 */
export function nextInvoiceNumber(prefix: string, existingNumbers: readonly string[]): string {
  let highest = 0;
  for (const value of existingNumbers) {
    if (!value.startsWith(prefix)) continue;
    const suffix = value.slice(prefix.length);
    if (!/^\d{4,}$/.test(suffix)) continue;
    const parsed = Number(suffix);
    if (Number.isSafeInteger(parsed) && parsed > highest) highest = parsed;
  }
  return `${prefix}${String(highest + 1).padStart(4, "0")}`;
}
