"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CancelBookingButton({ reference }: { reference: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function handleCancel() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${reference}/cancel`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setError(
          res.status === 409
            ? "This booking was already cancelled."
            : (body.error ?? "Could not cancel this booking, please try again.")
        );
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--panel-dark-fg)]">
        <span>Cancel this booking? Seats will be released.</span>
        <button
          onClick={handleCancel}
          disabled={busy}
          className="rounded-lg bg-red-500 px-3 py-1 font-semibold text-white transition-transform active:translate-y-px disabled:opacity-50"
        >
          {busy ? "Cancelling..." : "Yes, cancel"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="rounded-lg border border-white/20 px-3 py-1 transition-transform active:translate-y-px"
        >
          Keep booking
        </button>
        {error && <p className="w-full text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="rounded-lg border border-red-400/40 px-3 py-1.5 text-sm text-red-400 transition-transform active:translate-y-px"
    >
      Cancel booking
    </button>
  );
}
