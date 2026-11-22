import { EXPENSE_CATEGORY_LABELS } from "@/lib/expense-status";
import type {
  ForecastIncomingItem,
  ForecastOutgoingItem,
} from "@/types/forecast";
import { Money } from "./forecast-layout";

const TABLE_CLASS =
  "w-full min-w-[640px] text-left text-sm";
const HEAD_CLASS =
  "bg-white text-xs uppercase tracking-wide text-neutral-500";
const CELL_CLASS = "px-3 py-2";

function OverdueBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
      Overdue
    </span>
  );
}

export function ForecastIncomingBreakdown({
  currency,
  items,
}: {
  currency: string;
  items: ForecastIncomingItem[];
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
        No eligible outstanding invoices in this horizon.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200">
      <table className={TABLE_CLASS}>
        <thead className={HEAD_CLASS}>
          <tr>
            <th scope="col" className={`${CELL_CLASS} font-medium`}>Invoice</th>
            <th scope="col" className={`${CELL_CLASS} font-medium`}>Customer</th>
            <th scope="col" className={`${CELL_CLASS} font-medium`}>Expected date</th>
            <th scope="col" className={`${CELL_CLASS} font-medium`}>Due date</th>
            <th scope="col" className={`${CELL_CLASS} text-right font-medium`}>Outstanding</th>
            <th scope="col" className={`${CELL_CLASS} font-medium`}>Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200">
          {items.map((item) => (
            <tr key={item.invoiceId}>
              <td className={`${CELL_CLASS} font-medium`}>{item.invoiceNumber}</td>
              <td className={CELL_CLASS}>{item.customerName}</td>
              <td className={`${CELL_CLASS} tabular-nums`}>{item.scheduledDate}</td>
              <td className={`${CELL_CLASS} tabular-nums text-neutral-500`}>{item.dueDate}</td>
              <td className={`${CELL_CLASS} text-right`}>
                <Money currency={currency} value={item.amount} />
              </td>
              <td className={CELL_CLASS}>
                <OverdueBadge show={item.isOverdue} />
                {!item.isOverdue ? (
                  <span className="text-xs text-neutral-500">{item.status}</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ForecastOutgoingBreakdown({
  currency,
  items,
}: {
  currency: string;
  items: ForecastOutgoingItem[];
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
        No unpaid expenses in this horizon.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200">
      <table className={TABLE_CLASS}>
        <thead className={HEAD_CLASS}>
          <tr>
            <th scope="col" className={`${CELL_CLASS} font-medium`}>Expense</th>
            <th scope="col" className={`${CELL_CLASS} font-medium`}>Category</th>
            <th scope="col" className={`${CELL_CLASS} font-medium`}>Scheduled date</th>
            <th scope="col" className={`${CELL_CLASS} font-medium`}>Due date</th>
            <th scope="col" className={`${CELL_CLASS} text-right font-medium`}>Amount</th>
            <th scope="col" className={`${CELL_CLASS} font-medium`}>Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200">
          {items.map((item) => (
            <tr key={item.expenseId}>
              <td className={`${CELL_CLASS} font-medium`}>{item.title}</td>
              <td className={`${CELL_CLASS} text-neutral-500`}>
                {EXPENSE_CATEGORY_LABELS[item.category]}
              </td>
              <td className={`${CELL_CLASS} tabular-nums`}>{item.scheduledDate}</td>
              <td className={`${CELL_CLASS} tabular-nums text-neutral-500`}>{item.dueDate}</td>
              <td className={`${CELL_CLASS} text-right`}>
                <Money currency={currency} value={item.amount} />
              </td>
              <td className={CELL_CLASS}>
                <OverdueBadge show={item.isOverdue} />
                {!item.isOverdue ? (
                  <span className="text-xs text-neutral-500">{item.status}</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
