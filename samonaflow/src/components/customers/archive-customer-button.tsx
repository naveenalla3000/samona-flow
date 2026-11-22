"use client";

type ArchiveCustomerButtonProps = {
  customerId: string;
  action: (formData: FormData) => Promise<void>;
};

export function ArchiveCustomerButton({ customerId, action }: ArchiveCustomerButtonProps) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm("Archive this customer? Their invoice history will be kept.")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="customerId" value={customerId} />
      <button
        type="submit"
        className="rounded-md border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
      >
        Archive
      </button>
    </form>
  );
}
