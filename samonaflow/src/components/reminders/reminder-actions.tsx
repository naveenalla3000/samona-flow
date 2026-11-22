"use client";

import { useActionState, useState, useTransition } from "react";
import {
  markReminderSentAction,
  recordWhatsappOpenedAction,
} from "@/server/actions/reminder-actions";
import type { ReminderFormState } from "@/types/reminder-form";
import type { ReminderRecord } from "@/types/reminder";

export function CopyReminderButton({ message }: { message: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(message);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
      className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:border-neutral-700 dark:hover:bg-neutral-800"
    >
      {copied ? "Copied" : "Copy text"}
    </button>
  );
}

export function ReminderActions({ reminder }: { reminder: ReminderRecord }) {
  const [, startTransition] = useTransition();
  const [state, formAction, pending] = useActionState<ReminderFormState, FormData>(
    markReminderSentAction.bind(null, reminder.id),
    { status: "idle" },
  );
  const sent = reminder.status === "MARKED_SENT";

  function openWhatsapp() {
    if (!reminder.whatsappUrl) return;
    // Opening the link is recorded, but it is not proof of delivery (PRD §FR-07).
    startTransition(() => {
      void recordWhatsappOpenedAction(reminder.id);
    });
    window.open(reminder.whatsappUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <section aria-labelledby="reminder-actions" className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 id="reminder-actions" className="text-sm font-semibold">Share manually</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Copy the text or open WhatsApp with it prefilled. You send the message yourself; the app never claims delivery.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <CopyReminderButton message={reminder.message} />
        {reminder.whatsappUrl && !sent ? (
          <button
            type="button"
            onClick={openWhatsapp}
            disabled={pending}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            Open WhatsApp
          </button>
        ) : null}
        {!reminder.whatsappUrl ? (
          <span className="self-center text-xs text-neutral-500">
            No usable phone number on this customer — copy the text instead.
          </span>
        ) : null}
      </div>

      {!sent ? (
        <form action={formAction} className="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-blue-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60 dark:bg-blue-600 dark:text-white"
          >
            {pending ? "Saving…" : "Mark as sent"}
          </button>
        </form>
      ) : null}
      {state.status === "error" && state.message ? (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{state.message}</p>
      ) : null}
    </section>
  );
}
