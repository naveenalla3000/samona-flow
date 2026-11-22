"use client";

type InvoiceActionButtonsProps = {
  invoiceId: string;
  editable: boolean;
  voidable: boolean;
  sendAction: (formData: FormData) => Promise<void>;
  voidAction: (formData: FormData) => Promise<void>;
};

export function InvoiceActionButtons({
  invoiceId,
  editable,
  voidable,
  sendAction,
  voidAction,
}: InvoiceActionButtonsProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {editable ? (
        <form
          action={sendAction}
          onSubmit={(event) => {
            if (!window.confirm("Mark this invoice as sent? It can no longer be edited.")) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <button
            type="submit"
            className="rounded-md bg-blue-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900"
          >
            Mark as sent
          </button>
        </form>
      ) : null}
      {voidable ? (
        <form
          action={voidAction}
          onSubmit={(event) => {
            if (!window.confirm("Void this invoice? Its history will be kept but it will be excluded from financials.")) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <button
            type="submit"
            className="rounded-md border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
          >
            Void invoice
          </button>
        </form>
      ) : null}
    </div>
  );
}
