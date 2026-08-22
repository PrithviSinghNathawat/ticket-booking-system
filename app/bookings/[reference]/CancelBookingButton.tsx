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
        setError(body.error ?? "Could not cancel this booking");
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
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>Cancel this booking? Seats will be released.</span>
        <button
          onClick={handleCancel}
          disabled={busy}
          className="rounded bg-red-600 px-3 py-1 font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Cancelling..." : "Yes, cancel"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="rounded border border-[var(--border-subtle)] px-3 py-1"
        >
          Keep booking
        </button>
        {error && <p className="text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700"
    >
      Cancel booking
    </button>
  );
}
