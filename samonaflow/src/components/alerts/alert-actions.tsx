"use client";

import { useState } from "react";
import {
  dismissAlertAction,
  evaluateAlertsAction,
  markAlertReadAction,
  markAlertUnreadAction,
  type AlertActionState,
} from "@/server/actions/alert-actions";
import type { AlertRecord } from "@/types/alert";

const BUTTON_CLASS =
  "rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:opacity-60 dark:border-neutral-700 dark:hover:bg-neutral-800";

export function EvaluateAlertsButton({
  className = "",
  label = "Evaluate alerts",
}: {
  className?: string;
  label?: string;
}) {
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<AlertActionState | null>(null);

  async function run() {
    setPending(true);
    try {
      setState(await evaluateAlertsAction());
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900 disabled:opacity-60 dark:bg-blue-600 dark:text-white"
      >
        {pending ? "Evaluating…" : label}
      </button>
      {state ? (
        <p
          role={state.ok ? "status" : "alert"}
          className={`mt-2 text-sm ${
            state.ok
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

export function AlertLifecycleActions({ alert }: { alert: AlertRecord }) {
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<AlertActionState | null>(null);

  async function run(action: () => Promise<AlertActionState>) {
    setPending(true);
    try {
      setState(await action());
    } finally {
      setPending(false);
    }
  }

  function dismiss() {
    // Dismissal hides this alert instance until the condition clears. Confirm
    // before performing an action the owner cannot undo directly.
    const confirmed = window.confirm(
      "Dismiss this alert? It stays hidden while the condition persists and is resolved automatically when the condition clears.",
    );
    if (!confirmed) return;
    void run(() => dismissAlertAction(alert.id));
  }

  return (
    <section
      aria-labelledby="alert-actions"
      className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
    >
      <h2 id="alert-actions" className="text-sm font-semibold">
        Alert controls
      </h2>
      <p className="mt-1 text-xs text-neutral-500">
        Read state is personal to this business. Dismissal hides the alert until
        its underlying condition disappears.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        {alert.isRead ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => void run(() => markAlertUnreadAction(alert.id))}
            className={BUTTON_CLASS}
          >
            {pending ? "Saving…" : "Mark unread"}
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => void run(() => markAlertReadAction(alert.id))}
            className={BUTTON_CLASS}
          >
            {pending ? "Saving…" : "Mark read"}
          </button>
        )}
        {alert.status === "ACTIVE" ? (
          <button
            type="button"
            disabled={pending}
            onClick={dismiss}
            className={BUTTON_CLASS}
          >
            {pending ? "Saving…" : "Dismiss"}
          </button>
        ) : null}
      </div>
      {state ? (
        <p
          role={state.ok ? "status" : "alert"}
          className={`mt-2 text-sm ${
            state.ok
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
